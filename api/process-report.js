const admin = require("firebase-admin");
const { verifyFirebaseToken } = require("../utils/auth");
const { sanitizeMedicalText } = require("../utils/piiSanitizer");
const { GoogleGenAI } = require("@google/genai");
const pdfParse = require("pdf-parse");

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    // 1. Initialize Firebase Admin SDK
    if (!admin.apps.length) {
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`;

      const credentialConfig = process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY && projectId
        ? {
            credential: admin.credential.cert({
              projectId: projectId,
              clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
              privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            }),
            storageBucket: storageBucket
          }
        : undefined;

      admin.initializeApp(credentialConfig);
    }
    const db = admin.firestore();
    const bucket = admin.storage().bucket();

    // 2. Extract request payload & Patch IDOR
    let authenticatedUserId;
    try {
      authenticatedUserId = await verifyFirebaseToken(req);
    } catch (authError) {
      return res.status(401).json({ error: authError.message });
    }

    const { filePath } = req.body;
    const userId = authenticatedUserId; // IDOR PATCH: strict ownership

    if (!filePath) {
      return res.status(400).json({ error: "Missing required field: filePath" });
    }

    // Security: Verify the path belongs to this user
    if (!filePath.startsWith(`uploads/${userId}/`)) {
        return res.status(403).json({ error: "Unauthorized access to file." });
    }

    // 3. Download the PDF/Image file directly into Vercel memory
    console.log(`Downloading secure file from storage: ${filePath}`);
    const file = bucket.file(filePath);
    
    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).json({ error: "File not found." });
    }
    
    const [fileBuffer] = await file.download();

    // Validate size (10MB max)
    if (fileBuffer.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: "File too large. Maximum size is 10MB." });
    }
    
    // Determine mimeType heuristically from extension
    let mimeType = null;
    const lowerPath = filePath.toLowerCase();
    if (lowerPath.endsWith(".jpg") || lowerPath.endsWith(".jpeg")) {
        mimeType = "image/jpeg";
    } else if (lowerPath.endsWith(".png")) {
        mimeType = "image/png";
    } else if (lowerPath.endsWith(".pdf")) {
        mimeType = "application/pdf";
    }

    if (!mimeType) {
      return res.status(400).json({ error: "Unsupported file type. Use JPG, PNG, or PDF." });
    }

    // 4. Extract Text & Sanitize PII
    let processedInputs = [];
    if (mimeType === "application/pdf") {
      try {
        const pdfData = await pdfParse(fileBuffer);
        const extractedText = pdfData.text;
        
        if (!extractedText || extractedText.trim().length < 20) {
          // Likely a scanned PDF with no text layer. Fall back to Gemini Multimodal
          processedInputs.push({ inlineData: { data: fileBuffer.toString('base64'), mimeType: mimeType } });
        } else {
          // Text-based PDF. Sanitize and send as text.
          const sanitizedText = sanitizeMedicalText(extractedText);
          processedInputs.push(sanitizedText);
        }
      } catch (err) {
        return res.status(400).json({ error: "Malformed PDF file." });
      }
    } else {
      // Image: Send to Gemini Multimodal directly
      processedInputs.push({ inlineData: { data: fileBuffer.toString('base64'), mimeType: mimeType } });
    }

    // 5. Query Gemini Flash
    console.log("Sending to Gemini AI...");
    const apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : "";
    const ai = new GoogleGenAI({ apiKey });

    // CRITICAL: Aggressive PII Redaction Instructions
    const systemInstruction = `
      You are a specialized medical translation AI. You will receive a laboratory report or medical document.
      
      CRITICAL PRIVACY DIRECTIVE: You MUST scrub and ignore all Personally Identifiable Information (PII) before processing.
      Do NOT include names, patient IDs, addresses, phone numbers, or dates of birth in your output.
      
      Tasks:
      1. Explain the medical terminology in simpler, easy-to-understand language.
      2. Highlight any values that appear outside standard reference ranges. Preserve original values and units.
      3. CRITICAL: Do NOT provide a medical diagnosis. Always instruct the user to consult a doctor.
      4. Clearly state when information is insufficient.
    `;

    // Define JSON schema for structured response
    const responseSchema = {
      type: "OBJECT",
      properties: {
        summary: { type: "STRING" },
        parameters: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              name: { type: "STRING" },
              value: { type: "STRING" },
              unit: { type: "STRING" },
              referenceRange: { type: "STRING" },
              status: { type: "STRING", enum: ["normal", "high", "low", "unknown"] },
              explanation: { type: "STRING" }
            },
            required: ["name", "value", "status", "explanation"]
          }
        },
        importantFindings: {
          type: "ARRAY",
          items: { type: "STRING" }
        },
        disclaimer: { type: "STRING" }
      },
      required: ["summary", "parameters", "importantFindings", "disclaimer"]
    };

    // Use current SDK method
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: [
        {
          role: "user",
          parts: processedInputs.map(input => (typeof input === "string" ? { text: input } : input))
        }
      ],
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: responseSchema
      }
    });

    const aiExplanationText = response.text;
    
    let structuredExplanation;
    try {
      structuredExplanation = JSON.parse(aiExplanationText);
    } catch (e) {
      return res.status(500).json({ error: "Failed to parse structured response from AI." });
    }

    // 6. Save to Firestore securely
    const reportRef = db.collection("users").doc(userId).collection("medical_reports").doc();
    await reportRef.set({
      storagePath: filePath,
      simplifiedExplanation: structuredExplanation,
      processedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(200).json({ 
      success: true, 
      reportId: reportRef.id,
      explanation: structuredExplanation 
    });

  } catch (error) {
    console.error("Error in Process Report API:", error);
    return res.status(500).json({ error: "An internal server error occurred." }); // DO NOT EXPOSE SECRETS
  }
};
