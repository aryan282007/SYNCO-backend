const admin = require("firebase-admin");
const { GoogleGenAI } = require("@google/genai");
require("dotenv").config();

// Initialize Firebase Admin
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

// Initialize Google Gen AI
const apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : "";
if (!apiKey) {
  console.error("Missing GEMINI_API_KEY environment variable.");
  process.exit(1);
}
const ai = new GoogleGenAI({ apiKey });

const sampleKnowledge = [
  "PCOS (Polycystic Ovary Syndrome) is a hormonal disorder common among women of reproductive age.",
  "Common symptoms of PCOS include irregular periods, excess androgen, and polycystic ovaries.",
  "Managing stress, maintaining a healthy diet, and regular exercise are recommended for PCOS.",
  "High sugar cravings and insulin resistance are frequently associated with PCOS.",
  "Adequate hydration (at least 8 cups a day) is important for overall hormonal balance and reducing fatigue."
];

async function seedKnowledge() {
  console.log("Starting knowledge embedding and upload...");

  for (const text of sampleKnowledge) {
    try {
      console.log(`Embedding: "${text.substring(0, 30)}..."`);
      
      const response = await ai.models.embedContent({
        model: 'text-embedding-004',
        contents: text
      });

      // The embedding array from GenAI SDK
      const embeddingArray = response.embeddings[0].values;

      // Ensure dimension is 768
      if (embeddingArray.length !== 768) {
        throw new Error(`Expected 768 dimensions, got ${embeddingArray.length}`);
      }

      await db.collection("knowledge_base").add({
        content: text,
        embedding: admin.firestore.FieldValue.vector(embeddingArray),
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`Successfully saved chunk.`);
    } catch (err) {
      console.error("Error processing chunk:", err);
    }
  }

  console.log("Seeding complete.");
  process.exit(0);
}

seedKnowledge();
