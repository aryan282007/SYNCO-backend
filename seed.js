const admin = require('firebase-admin');

// Note: To run this against the local emulator, you must set the FIRESTORE_EMULATOR_HOST environment variable.
// Example: FIRESTORE_EMULATOR_HOST="localhost:8080" node seed.js

admin.initializeApp({
  projectId: "synco-backend" // using the placeholder project id
});

const db = admin.firestore();

async function seedDatabase() {
  console.log("🌱 Starting database seed...");

  try {
    // 1. Seed User Profile
    const userId = "test_patient_001";
    const userRef = db.collection("users").doc(userId);
    
    await userRef.set({
      name: "Jane Doe",
      age: 28,
      role: "patient"
    });
    console.log("✅ Seeded User Profile");

    // 2. Seed Health Logs (Last 3 days)
    const today = new Date();
    for (let i = 0; i < 3; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateString = d.toISOString().split('T')[0]; // YYYY-MM-DD format
      
      await userRef.collection("daily_logs").doc(dateString).set({
        sleep_hours: 7 + (Math.random() * 2), // 7-9 hours
        water_cups: Math.floor(4 + Math.random() * 5), // 4-8 cups
        mood: ["Happy", "Anxious", "Neutral", "Tired"][Math.floor(Math.random() * 4)],
        steps: Math.floor(3000 + Math.random() * 5000),
        timestamp: admin.firestore.Timestamp.fromDate(d)
      });
    }
    console.log("✅ Seeded Health Logs");

    // 3. Seed Whisper Room
    const postId = "post_1001";
    await db.collection("whisper_posts").doc(postId).set({
      authorId: userId,
      content: "Has anyone tried mindfulness for cycle-related anxiety?",
      category: "Mental Health",
      isAnonymous: true,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log("✅ Seeded Whisper Room Posts");

    console.log("🎉 Database seeding complete!");
    process.exit(0);

  } catch (error) {
    console.error("❌ Error seeding database:", error);
    process.exit(1);
  }
}

seedDatabase();
