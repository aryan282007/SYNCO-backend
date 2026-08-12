const admin = require('firebase-admin');
require('dotenv').config(); // Load the secrets from .env

// Initialize with production credentials so it pushes to the live cloud!
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

const db = admin.firestore();

async function seedDatabase() {
  console.log("🌱 Starting expanded database seed (Phase 2)...");

  try {
    // 1. Seed Mock Patient (Diagnosed)
    const diagnosedPatientId = "patient_diag_001";
    console.log(`Using Diagnosed Patient ID: ${diagnosedPatientId}`);
    
    await db.collection("users").doc(diagnosedPatientId).set({
      name: "Emma Diagnosed",
      age: 26,
      role: "patient",
      onboarding: {
        status: "completed",
        isDiagnosed: true,
        diagnosisDate: "2023-05-15",
        primarySymptoms: ["irregular periods", "acne", "fatigue"],
        medications: ["Metformin", "Inositol"],
        exerciseLevel: "moderate",
        sleepQuality: "poor",
        dietType: "balanced"
      }
    });
    console.log("✅ Seeded Diagnosed Patient Profile");

    // 2. Seed Mock Patient (Undiagnosed/Unsure)
    const undiagnosedPatientId = "patient_undiag_002";
    console.log(`Using Undiagnosed Patient ID: ${undiagnosedPatientId}`);
    
    await db.collection("users").doc(undiagnosedPatientId).set({
      name: "Sarah Unsure",
      age: 22,
      role: "patient",
      onboarding: {
        status: "completed",
        isDiagnosed: false,
        riskAssessmentScore: 65,
        reportedSymptoms: ["missed periods", "weight gain"],
        familyHistory: true
      }
    });
    console.log("✅ Seeded Undiagnosed Patient Profile");

    // 3. Seed Mock Doctor
    const doctorId = "dr_smith_001";
    console.log(`Using Doctor ID: ${doctorId}`);
    
    await db.collection("doctors").doc(doctorId).set({
      name: "Dr. Alice Smith",
      specialization: "Endocrinology",
      experienceYears: 12,
      isVerified: true,
      consultationFee: 150.00,
      availability: {
        online: true,
        inPerson: true,
        locations: ["Virtual", "City Health Clinic"]
      }
    });
    console.log("✅ Seeded Doctor Profile");

    // 4. Seed an Appointment
    const appointmentId = "appt_1001";
    await db.collection("appointments").doc(appointmentId).set({
      patientId: diagnosedPatientId,
      doctorId: doctorId,
      type: "online",
      status: "confirmed",
      scheduledDate: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 86400000 * 2)), // 2 days from now
      notes: "Follow up on Metformin dosage.",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log("✅ Seeded Mock Appointment");

    // 5. Seed Real-Time Chat Room
    const chatId = "chat_1001";
    await db.collection("chats").doc(chatId).set({
      appointmentId: appointmentId,
      participants: [diagnosedPatientId, doctorId],
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log("✅ Seeded Active Chat Room");

    // 6. Seed Mock Messages in Subcollection
    const messagesRef = db.collection("chats").doc(chatId).collection("messages");
    await messagesRef.add({
      senderId: diagnosedPatientId,
      text: "Hello Dr. Smith, I have a question about my recent lab results.",
      timestamp: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 300000)) // 5 mins ago
    });
    await messagesRef.add({
      senderId: doctorId,
      text: "Hi Emma! I've reviewed your latest logs. What's your primary concern?",
      timestamp: admin.firestore.FieldValue.serverTimestamp() // just now
    });
    console.log("✅ Seeded Mock Chat Messages");

    console.log("🎉 Database seeding complete!");
    process.exit(0);

  } catch (error) {
    console.error("❌ Error seeding database:", error);
    process.exit(1);
  }
}

seedDatabase();
