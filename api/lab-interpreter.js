const { GoogleGenAI } = require("@google/genai");
const { verifyFirebaseToken } = require("../utils/auth");

// Helper function to fetch an image or PDF URL and convert it to Google GenAI's inlineData format
async function fetchFileAsInlineData(url) {
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (e) {
    throw new Error('Invalid URL provided.');
  }
  
  if (parsedUrl.hostname !== 'firebasestorage.googleapis.com') {
    throw new Error('SSRF Protection: Fetching from unauthorized domains is blocked.');
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  // Default to application/pdf if content-type is missing and we assume lab reports are often PDFs
  const mimeType = response.headers.get('content-type') || 'application/pdf';
  
  return {
    type: 'image', // The API usually treats PDFs as image pages or documents; type 'image' with correct mime_type works or type 'document'. The SDK accepts type: 'image' for base64.
    data: buffer.toString('base64'),
    mime_type: mimeType
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 1. Enforce POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    // Authenticate the request securely
    let authenticatedUserId;
    try {
      authenticatedUserId = await verifyFirebaseToken(req);
    } catch (authError) {
      return res.status(401).json({ error: authError.message });
    }

    const { documentUrl } = req.body;

    if (!documentUrl) {
      return res.status(400).json({ error: "Missing documentUrl in request body." });
    }

    // 2. Initialize Gemini AI
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing GEMINI_API_KEY environment variable.");
    }
    const ai = new GoogleGenAI({ apiKey });

    // 3. Download the document and convert to Base64
    console.log(`Fetching lab report from: ${documentUrl}`);
    const documentPart = await fetchFileAsInlineData(documentUrl);

    // 4. Construct the prompt
    const prompt = `
      You are a specialized medical interpreter AI for a PCOS/PCOD women's health platform.
      Analyze the attached lab report or medical document.
      Please provide:
      1. Extracted key test values.
      2. Comparison of these values with standard reference ranges.
      3. Simplified explanations of what these results might indicate, using easy-to-understand terminology.
      4. A list of specific, important questions the patient should ask their doctor based on these results.
      
      DISCLAIMER RULE: You must strongly state that you are an AI assistant and this is not a medical diagnosis, and the user must consult a verified doctor.
    `;

    // 5. Call Gemini Multimodal
    console.log("Calling Gemini API with Interactions API...");
    const interaction = await ai.interactions.create({
      model: "gemini-3.6-flash",
      input: [
        documentPart,
        { type: 'text', text: prompt }
      ]
    });

    const aiText = interaction.output_text;

    // 6. Return response
    return res.status(200).json({ 
      success: true, 
      response: aiText 
    });

  } catch (error) {
    console.error("Error in Lab Interpreter API:", error);
    return res.status(500).json({ 
      error: "An internal server error occurred.", 
      details: error.message 
    });
  }
};
