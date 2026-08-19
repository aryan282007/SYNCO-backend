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

  // 1. Enforce POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    // 2. Initialize Firebase Admin SDK safely (Singleton pattern)
    if (!admin.apps.length) {
      const credentialConfig = process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_PROJECT_ID
        ? {
            credential: admin.credential.cert({
              projectId: process.env.FIREBASE_PROJECT_ID,
              clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
              // Force replace literal backslash-n sequences with actual newlines for PEM decoding
              privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            })
          }
        : undefined;

      admin.initializeApp(credentialConfig);
    }
    const db = admin.firestore();

    // 3. Accept userId from the request body
    // Authenticate the request securely
    let authenticatedUserId;
    try {
      authenticatedUserId = await verifyFirebaseToken(req);
    } catch (authError) {
      return res.status(401).json({ error: authError.message });
    }

    const userId = authenticatedUserId;

    // 4. Fetch logs and sort in memory to prevent dropping logs without a timestamp field
    const logsSnapshot = await db.collection("users").doc(userId)
      .collection("daily_logs")
      .get();

    let logs = [];
    logsSnapshot.forEach(doc => {
      logs.push({ id: doc.id, data: doc.data() });
    });

    // Sort descending by timestamp or document ID (which is usually a date string)
    logs.sort((a, b) => {
      const timeA = a.data.timestamp ? a.data.timestamp.toDate().getTime() : new Date(a.id).getTime();
      const timeB = b.data.timestamp ? b.data.timestamp.toDate().getTime() : new Date(b.id).getTime();
      return timeB - timeA;
    });

    // Keep the most recent 21 logs, then reverse to ascending order for temporal AI analysis
    logs = logs.slice(0, 21).reverse();

    if (logs.length === 0) {
      return res.status(200).json({ success: true, response: "Not enough data yet to detect patterns. Keep logging!" });
    }

    let healthContextStr = "User Health Data (Chronological over up to 21 days):\n";
    logs.forEach(log => {
      healthContextStr += `Date: ${log.id}, Data: ${JSON.stringify(log.data)}\n`;
    });

    // 5. Initialize Gemini AI
    const apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : "";
    if (!apiKey) {
      throw new Error("Missing GEMINI_API_KEY environment variable.");
    }
    const ai = new GoogleGenAI({ apiKey });

    // 6. Define the strict Pattern Detection system instruction
    const systemInstruction = `
      You are an advanced medical pattern detection AI for a PCOS/PCOD women's health platform.
      Analyze the provided longitudinal health data (up to 21 days).
      Identify correlations and patterns between sleep, water intake, mood, steps, cravings, stress, energy levels, meals, weight, and any other logged symptoms.
      For example, notice if high stress correlates with increased cravings, or if poor sleep affects energy levels.
      Provide a highly structured summary of 2-3 key insights.
      Do NOT provide medical diagnosis. Always recommend discussing patterns with a doctor.
    `;

    const combinedPrompt = `${systemInstruction}\n\n${healthContextStr}\n\nDetect the primary patterns and correlations in this data.`;

    // 7. Call Gemini API
    console.log("Calling Gemini API with pattern detection prompt...");
    const interaction = await ai.interactions.create({
      model: "gemini-3.6-flash",
      input: combinedPrompt
    });

    const aiText = interaction.output_text;

    // 8. Return response
    return res.status(200).json({ 
      success: true, 
      response: aiText 
    });

  } catch (error) {
    console.error("Error in Pattern Detection API:", error);
    return res.status(500).json({ 
      error: "An internal server error occurred.", 
      details: error.message 
    });
  }
};
