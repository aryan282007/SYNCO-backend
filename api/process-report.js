const admin = require("firebase-admin");
const { verifyFirebaseToken } = require("../utils/auth");
const { GoogleGenAI } = require("@google/genai");

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

    // 3. Download the PDF/Image file directly into Vercel memory
    console.log(`Downloading secure file from storage: ${filePath}`);
    const file = bucket.file(filePath);
    const [fileBuffer] = await file.download();
    
    // 4. Convert to base64 for Gemini Multimodal
    const base64Data = fileBuffer.toString('base64');
    
    // Determine mimeType heuristically from extension
    let mimeType = "application/pdf";
    if (filePath.toLowerCase().endsWith(".jpg") || filePath.toLowerCase().endsWith(".jpeg")) {
        mimeType = "image/jpeg";
    } else if (filePath.toLowerCase().endsWith(".png")) {
        mimeType = "image/png";
    }

    // 5. Query Gemini Flash natively
    console.log("Sending file to Gemini Multimodal AI...");
    const apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : "";
    const ai = new GoogleGenAI({ apiKey });

    // CRITICAL: Aggressive PII Redaction Instructions
    const systemInstruction = `
      You are a specialized medical translation AI. You will receive a laboratory report or medical document.
      
      CRITICAL PRIVACY DIRECTIVE: You MUST scrub and ignore all Personally Identifiable Information (PII) before processing.
      Do NOT include names, patient IDs, addresses, phone numbers, or dates of birth in your output.
      
      Tasks:
      1. Explain the medical terminology in simpler, easy-to-understand language.
      2. Highlight any values that appear outside standard reference ranges.
      3. CRITICAL: Do NOT provide a medical diagnosis. Always instruct the user to consult a doctor.
      4. Generate 2-3 specific questions the patient should ask their doctor based on this report.
    `;

    const interaction = await ai.interactions.create({
      model: "gemini-3.6-flash",
      input: [
        { type: "text", text: systemInstruction },
        { type: "document", data: base64Data, mime_type: mimeType }
      ]
    });

    const aiExplanation = interaction.output_text;

    // 6. Save to Firestore securely
    const reportRef = db.collection("users").doc(userId).collection("medical_reports").doc();
    await reportRef.set({
      storagePath: filePath,
      simplifiedExplanation: aiExplanation,
      processedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(200).json({ 
      success: true, 
      reportId: reportRef.id,
      explanation: aiExplanation 
    });

  } catch (error) {
    console.error("Error in Process Report API:", error);
    return res.status(500).json({ error: "An internal server error occurred.", details: error.message });
  }
};
