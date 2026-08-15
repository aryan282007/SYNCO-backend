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
    if (!admin.apps.length) {
      const credentialConfig = process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_PROJECT_ID
        ? {
            credential: admin.credential.cert({
              projectId: process.env.FIREBASE_PROJECT_ID,
              clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
              privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            })
          }
        : undefined;

      admin.initializeApp(credentialConfig);
    }
    const db = admin.firestore();

    // Authenticate the request securely
    let authenticatedUserId;
    try {
      authenticatedUserId = await verifyFirebaseToken(req);
    } catch (authError) {
      return res.status(401).json({ error: authError.message });
    }

    const { userId, bookingId } = req.body;
    if (!userId || !bookingId) {
      return res.status(400).json({ error: "Missing userId or bookingId" });
    }

    // 1. Fetch Patient Profile & Logs
    const patientDoc = await db.collection("users").doc(userId).get();
    if (!patientDoc.exists) {
      return res.status(404).json({ error: "Patient not found" });
    }
    
    // Fetch last 14 days of logs
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const logsSnapshot = await db.collection("users").doc(userId)
      .collection("daily_logs")
      .where("timestamp", ">=", admin.firestore.Timestamp.fromDate(fourteenDaysAgo))
      .orderBy("timestamp", "asc")
      .get();

    let logsStr = "Last 14 Days Logs:\n";
    logsSnapshot.forEach(doc => { logsStr += `Date: ${doc.id}, Data: ${JSON.stringify(doc.data())}\n`; });

    // 2. Query Gemini AI for structured summary
    const apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : "";
    const ai = new GoogleGenAI({ apiKey });

    const systemInstruction = `
      You are a medical summarization AI. Analyze the patient profile and daily logs.
      Generate a professional, structured JSON summary for a doctor.
      Return ONLY valid JSON with this exact structure:
      {
        "period_trends": "string summary",
        "primary_symptoms": ["list", "of", "symptoms"],
        "lifestyle_factors": "summary of sleep/water/mood",
        "recommended_doctor_questions": ["q1", "q2"]
      }
    `;

    const prompt = `Patient Profile: ${JSON.stringify(patientDoc.data())}\n\n${logsStr}`;
    const interaction = await ai.interactions.create({
      model: "gemini-3.6-flash",
      input: `${systemInstruction}\n\n${prompt}`
    });

    let rawOutput = interaction.output_text;
    // Strip markdown code blocks if Gemini returns them
    rawOutput = rawOutput.replace(/```json/g, '').replace(/```/g, '').trim();
    const structuredSummary = JSON.parse(rawOutput);

    // 3. Save Summary to Firestore
    const summaryRef = db.collection("users").doc(userId).collection("health_summaries").doc(bookingId);
    await summaryRef.set({
      ...structuredSummary,
      bookingId: bookingId,
      generatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 4. Link Summary to Appointment
    await db.collection("bookings").doc(bookingId).update({
      summaryId: bookingId, // using bookingId as the summaryId for 1:1 mapping
      status: "ready_for_review"
    });

    return res.status(200).json({ success: true, summary: structuredSummary });

  } catch (error) {
    console.error("Error in Health Summary API:", error);
    return res.status(500).json({ error: error.message });
  }
};
