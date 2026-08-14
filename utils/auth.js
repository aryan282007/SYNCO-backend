const admin = require('firebase-admin');

/**
 * Middleware utility to verify Firebase ID Token from the Authorization header.
 * @param {object} req - The Vercel incoming request object
 * @returns {Promise<string>} The authenticated user's Firebase UID.
 * @throws Error if token is missing, invalid, or forged.
 */
async function verifyFirebaseToken(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized: Missing or invalid Authorization Bearer token.');
  }

  const token = authHeader.split('Bearer ')[1].trim();

  // Development/Testing bypass so our local test scripts don't break without real Google tokens
  if (process.env.VERCEL_ENV !== 'production' && process.env.VERCEL_ENV !== 'preview' && token === 'TEST_TOKEN') {
    return req.body.userId || req.body.authorId || req.body.patientId || "test_user_id";
  }

  // Ensure Firebase Admin is initialized before verification
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

  try {
    // Cryptographically verify the token was issued by Google/Firebase for our project
    const decodedToken = await admin.auth().verifyIdToken(token);
    return decodedToken.uid;
  } catch (error) {
    console.error('Firebase Auth Verification Error:', error);
    throw new Error('Unauthorized: Invalid or expired token.');
  }
}

module.exports = { verifyFirebaseToken };
