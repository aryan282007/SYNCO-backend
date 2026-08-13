const admin = require("firebase-admin");
const { GoogleGenAI } = require("@google/genai");
const pdfParse = require("pdf-parse");
const { sanitizeMedicalText } = require("../utils/piiSanitizer");

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
      // Deduce the default bucket name if FIREBASE_STORAGE_BUCKET is not explicitly set
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

    // 2. Extract request payload
    const { filePath, userId } = req.body;
    if (!filePath || !userId) {
      return res.status(400).json({ error: "Missing required fields: filePath, userId" });
    }

    // 3. Download the PDF file directly into Vercel memory
    console.log(`Downloading secure file from storage: ${filePath}`);
    const file = bucket.file(filePath);
    const [fileBuffer] = await file.download();

    // 4. Parse the PDF to extract raw text
    console.log("Parsing PDF data...");
    const pdfData = await pdfParse(fileBuffer);
    const rawText = pdfData.text;

    if (!rawText) {
      return res.status(400).json({ error: "Could not extract text from the provided PDF." });
    }

    // 5. Sanitize PII
    console.log("Sanitizing PII...");
    const sanitizedText = sanitizeMedicalText(rawText);

    // 6. Query Gemini 3.6 Flash
    console.log("Sending sanitized text to Gemini AI...");
    const apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : "";
    const ai = new GoogleGenAI({ apiKey });

    const systemInstruction = `
      You are a specialized medical translation AI. You will receive a sanitized laboratory report.
      1. Explain the medical terminology in simpler, easy-to-understand language.
      2. Highlight any values that appear outside standard reference ranges.
      3. CRITICAL: Do NOT provide a medical diagnosis. Always instruct the user to consult a doctor.
      4. Generate 2-3 specific questions the patient should ask their doctor based on this report.
    `;

    const interaction = await ai.interactions.create({
      model: "gemini-3.6-flash",
      input: `${systemInstruction}\n\nSanitized Lab Report Data:\n${sanitizedText}`
    });

    const aiExplanation = interaction.output_text;

    // 7. Save to Firestore
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
