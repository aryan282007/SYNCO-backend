const admin = require("firebase-admin");
const { verifyFirebaseToken } = require("../utils/auth");

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

    const { authorId, content, category, isAnonymous } = req.body;
    
    if (!authorId || !content) {
      return res.status(400).json({ error: "Missing required fields: authorId, content" });
    }

    // 1. Process Anonymity
    // By changing the authorId to "anonymous", we ensure the user's identity is completely 
    // stripped from the database, satisfying the strict Phase 6 anonymity requirement.
    // However, they will forfeit their ability to edit/delete the post in the future.
    const finalAuthorId = isAnonymous ? "anonymous" : authorId;

    // 2. Persist to Firestore securely via Admin SDK
    const newPostRef = db.collection("whisper_posts").doc();
    await newPostRef.set({
      authorId: finalAuthorId,
      content: content,
      category: category || "General",
      isAnonymous: isAnonymous || false,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(200).json({ 
      success: true, 
      postId: newPostRef.id,
      message: isAnonymous ? "Posted anonymously!" : "Posted successfully!"
    });

  } catch (error) {
    console.error("Error in Whisper Post API:", error);
    return res.status(500).json({ error: error.message });
  }
};
