const url = 'http://localhost:3000/api/pattern-detection';

async function testPatternAPI() {
  console.log(`Sending POST request to ${url}...`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // Using the diagnosed patient we just created via seed.js
      body: JSON.stringify({
        userId: "patient_diag_001",
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

testPatternAPI();
