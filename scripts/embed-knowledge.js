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

const fs = require('fs');
const path = require('path');

async function getKnowledgeChunks() {
  const notebookPath = path.join(process.cwd(), 'pcos-diagnosis.ipynb');
  const notebookContent = fs.readFileSync(notebookPath, 'utf8');
  const notebook = JSON.parse(notebookContent);

  let knowledgeChunks = [];
  for (const cell of notebook.cells) {
    if (cell.cell_type === 'markdown' && cell.source) {
      const text = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
      const cleanText = text
        .replace(/!\[.*?\]\(.*?\)/g, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\n+/g, ' ')
        .trim();
      
      // Filter out overly short structural headers
      if (cleanText.length > 50 && !cleanText.toLowerCase().includes("importing library")) {
        knowledgeChunks.push(cleanText);
      }
    }
  }
  return knowledgeChunks;
}

async function seedKnowledge() {
  console.log("Starting knowledge embedding and upload...");

  const chunks = await getKnowledgeChunks();
  console.log(`Found ${chunks.length} knowledge chunks from dataset.`);

  for (const text of chunks) {
    try {
      console.log(`Embedding: "${text.substring(0, 50)}..."`);
      
      const response = await ai.models.embedContent({
        model: 'text-embedding-004',
        contents: text
      });

      const embeddingArray = response.embeddings[0].values;

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
