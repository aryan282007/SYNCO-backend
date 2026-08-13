async function testAllApis() {
  const baseUrl = 'http://localhost:3000/api';
  console.log("Starting full API check...\n");

  const endpoints = [
    {
      name: "Kyra Chatbot",
      path: "/kyra",
      payload: { userId: "patient_diag_001", prompt: "Hello, how are my symptoms?" }
    },
    {
      name: "Food Scanner",
      path: "/food-scanner",
      payload: { imageUrl: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800" }
    },
    {
      name: "Pattern Detection",
      path: "/pattern-detection",
      payload: { userId: "patient_diag_001" }
    },
    {
      name: "Health Summary",
      path: "/health-summary",
      payload: { patientId: "patient_diag_001", appointmentId: "appt_1001" }
    },
    {
      name: "Whisper Post",
      path: "/whisper-post",
      payload: { authorId: "patient_diag_001", content: "This is a test post.", category: "General", isAnonymous: true }
    },
    {
      name: "Process Report (Expect Storage Error as no file exists)",
      path: "/process-report",
      payload: { filePath: "dummy/path.pdf", userId: "patient_diag_001" }
    }
  ];

  for (const endpoint of endpoints) {
    console.log(`Testing: ${endpoint.name} [POST ${endpoint.path}]`);
    try {
      const response = await fetch(`${baseUrl}${endpoint.path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(endpoint.payload)
      });
      
      const data = await response.json();
      console.log(`Status: ${response.status}`);
      if (response.status === 200) {
        console.log(`✅ Success\n`);
      } else {
        console.log(`⚠️ Expected Error or Issue:`, JSON.stringify(data).substring(0, 100), `\n`);
      }
    } catch (error) {
      console.log(`❌ Connection Failed. Is 'vercel dev' running on localhost:3000? Error: ${error.message}\n`);
      break; // Stop testing if server is down
    }
  }
}

testAllApis();
