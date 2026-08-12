const url = "http://localhost:3000/api/kyra";

const data = {
  userId: "test_patient_001",
  prompt: "Based on my recent logs, do you have any tips to improve my sleep?"
};

console.log(`Sending POST request to ${url}...`);

fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify(data)
})
.then(response => {
  console.log(`Status Code: ${response.status}`);
  return response.json();
})
.then(json => {
  console.log("\nResponse Body:");
  console.log(JSON.stringify(json, null, 2));
})
.catch(error => {
  console.error("Error making request:", error);
});
