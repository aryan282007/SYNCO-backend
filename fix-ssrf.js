const fs = require('fs');
let content = fs.readFileSync('api/lab-interpreter.js', 'utf8');
content = content.replace(
  'async function fetchFileAsInlineData(url) {\n  const response = await fetch(url);',
  `async function fetchFileAsInlineData(url) {
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (e) {
    throw new Error('Invalid URL provided.');
  }
  
  if (parsedUrl.hostname !== 'firebasestorage.googleapis.com') {
    throw new Error('SSRF Protection: Fetching from unauthorized domains is blocked.');
  }

  const response = await fetch(url);`
);
fs.writeFileSync('api/lab-interpreter.js', content);
