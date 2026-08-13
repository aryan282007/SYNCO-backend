const { exec } = require('child_process');
const http = require('http');

function checkServer() {
  http.get('http://localhost:3000', (res) => {
    console.log("Server is up! Running tests...");
    exec('node test-all-apis.js', (err, stdout, stderr) => {
      console.log(stdout);
      if (stderr) console.error(stderr);
    });
  }).on('error', () => {
    console.log("Waiting for Vercel dev server to start...");
    setTimeout(checkServer, 2000);
  });
}

checkServer();
