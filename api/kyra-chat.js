const admin = require("firebase-admin");
const { GoogleGenAI } = require("@google/genai");
const { verifyFirebaseToken } = require("../utils/auth");

// Automatically route Firestore to the local emulator when running `vercel dev`
if (process.env.VERCEL_ENV !== 'production' && process.env.VERCEL_ENV !== 'preview') {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
}

// Vercel Serverless Function Handler (Node.js runtime, NOT Edge, because we need Firestore Native Admin SDK)
module.exports = async (req, res) => {
  // Robust CORS configuration for Flutter Web
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    // 1. Initialize Firebase Admin SDK safely (Singleton pattern)
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
    
    // 3. Authenticate the request securely
    let userId;
    try {
      userId = await verifyFirebaseToken(req);
    } catch (authError) {
      return res.status(401).json({ error: authError.message });
    }

    const { prompt, imageBase64, fileBase64, isPdf } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Missing required field: prompt." });
    }

    // Initialize Google Gen AI SDK
    const apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : "";
    if (!apiKey || apiKey === "your_gemini_api_key_here") {
      throw new Error("GEMINI_API_KEY is missing from environment variables.");
    }
    const ai = new GoogleGenAI({ apiKey });

    // ==========================================
    // PHASE A: Embed the User Query
    // ==========================================
    console.log("Generating embedding for query...");
    const embedResponse = await ai.models.embedContent({
      model: 'text-embedding-004',
      contents: prompt
    });
    const queryVector = embedResponse.embeddings[0].values;

    // ==========================================
    // PHASE B: Retrieve Semantically Similar Chunks
    // ==========================================
    console.log("Searching Firestore knowledge_base...");
    const vectorQuerySnapshot = await db.collection('knowledge_base')
      .findNearest('embedding', admin.firestore.FieldValue.vector(queryVector), {
        limit: 3,
        distanceMeasure: 'COSINE'
      })
      .get();

    let knowledgeContext = "";
    if (!vectorQuerySnapshot.empty) {
      vectorQuerySnapshot.forEach(doc => {
        knowledgeContext += `- ${doc.data().content}\n`;
      });
    } else {
      knowledgeContext = "No specific knowledge base context found.";
    }

    // ==========================================
    // Fetch user's health logs (existing logic)
    // ==========================================
    const logsSnapshot = await db.collection("users")
      .doc(userId)
      .collection("daily_logs")
      .get();

    let logs = [];
    logsSnapshot.forEach(doc => {
      logs.push({ id: doc.id, data: doc.data() });
    });

    logs.sort((a, b) => {
      const timeA = a.data.timestamp ? a.data.timestamp.toDate().getTime() : new Date(a.id).getTime();
      const timeB = b.data.timestamp ? b.data.timestamp.toDate().getTime() : new Date(b.id).getTime();
      return timeB - timeA;
    });

    logs = logs.slice(0, 7);

    let healthContextStr = "User Health Data (Last 7 Days):\n";
    if (logs.length === 0) {
      healthContextStr += "No recent health logs available.\n";
    } else {
      logs.forEach(log => {
        const data = log.data;
        const date = data.timestamp ? data.timestamp.toDate().toLocaleDateString() : log.id;
        healthContextStr += `- Date: ${date} | Sleep: ${data.sleep_hours?.toFixed(1) || 'N/A'} hrs | Water: ${data.water_cups || 'N/A'} cups | Mood: ${data.mood || 'N/A'} | Steps: ${data.steps || 'N/A'}\n`;
      });
    }

    // ==========================================
    // PHASE C: Augment & Generate
    // ==========================================
    const systemInstruction = `You are Kyra, a supportive AI assistant for the SYNCO women's health platform. 
Use the following trusted knowledge context to answer the user's question, and use their health context for personalization. Do not provide clinical medical diagnoses.

TRUSTED KNOWLEDGE CONTEXT:
${knowledgeContext}

${healthContextStr}`;

    const combinedPrompt = `${systemInstruction}\n\nUser Question: ${prompt}`;
    
    let inputPayload;
    if (imageBase64) {
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      inputPayload = [
        { type: 'text', text: combinedPrompt },
        { type: 'image', data: cleanBase64, mime_type: "image/jpeg" }
      ];
    } else if (fileBase64 && isPdf) {
      const cleanBase64 = fileBase64.replace(/^data:[^;]+;base64,/, '');
      inputPayload = [
        { type: 'text', text: combinedPrompt },
        { type: 'document', data: cleanBase64, mime_type: "application/pdf" }
      ];
    } else {
      inputPayload = { type: 'text', text: combinedPrompt };
    }

    console.log("Calling Gemini API with interactions.create (RAG augmented)...");
    
    // Strict constraints: Preserve gemini-3.6-flash and interactions.create.
    // Add Vercel timeout protection with generation_config.max_output_tokens
    const interaction = await ai.interactions.create({
      model: "gemini-3.6-flash",
      input: inputPayload,
      generation_config: {
        max_output_tokens: 250
      }
    });

    const aiText = interaction.output_text;

    return res.status(200).json({ 
      success: true, 
      response: aiText 
    });

  } catch (error) {
    console.error("Error in Kyra RAG Chat Endpoint:", error);
    return res.status(500).json({ 
      error: "An internal server error occurred while processing the request.", 
      details: error.message
    });
  }
};
