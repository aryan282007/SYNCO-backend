const url = 'http://localhost:3000/api/food-scanner';

async function testFoodAPI() {
  console.log(`Sending POST request to ${url}...`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'Authorization': 'Bearer TEST_TOKEN',
      },
      body: JSON.stringify({
        // The previous Wikipedia URL was blocked by your network/firewall! 
        // Using a different public food image instead:
        imageUrl: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800",
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

testFoodAPI();
