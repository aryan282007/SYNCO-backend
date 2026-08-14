const url = 'http://localhost:3000/api/health-summary';

async function testHealthSummary() {
  console.log(`Sending POST request to ${url}...`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'Authorization': 'Bearer TEST_TOKEN',
      },
      body: JSON.stringify({
        // These IDs match the mock data we generated in Phase 2
        patientId: "patient_diag_001",
        appointmentId: "appt_1001",
      }),
    });

    const data = await response.json();
    console.log('\nStatus Code:', response.status);
    console.log('\nResponse Body:');
    console.log(JSON.stringify(data, null, 2));

  } catch (error) {
    console.error('\nError making request:', error);
  }
}

testHealthSummary();
