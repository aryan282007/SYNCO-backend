const { GoogleGenAI } = require("@google/genai");

// Helper function to fetch an image URL and convert it to Google GenAI's inlineData format
async function fetchImageAsInlineData(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const mimeType = response.headers.get('content-type') || 'image/jpeg';
  
  return {
    type: 'image',
    data: buffer.toString('base64'),
    mime_type: mimeType
  };
}

module.exports = async (req, res) => {
  // 1. Enforce POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: "Missing imageUrl in request body." });
    }

    // 2. Initialize Gemini AI
    const apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : "";
    if (!apiKey) {
      throw new Error("Missing GEMINI_API_KEY environment variable.");
    }
    const ai = new GoogleGenAI({ apiKey });

    // 3. Download the image and convert to Base64
    console.log(`Fetching image from: ${imageUrl}`);
    const imagePart = await fetchImageAsInlineData(imageUrl);

    // 4. Construct the prompt
    const prompt = `
      You are a specialized nutritionist and dietician AI for a PCOS/PCOD women's health platform.
      Analyze the food in the provided image.
      Provide:
      1. Estimated nutritional values (calories, protein, carbs, fats).
      2. Suggestions to make this meal more hormonally balanced.
      3. Budget-friendly or regional alternatives.
    `;

    // 5. Call Gemini Multimodal
    console.log("Calling Gemini API with Interactions API...");
    const interaction = await ai.interactions.create({
      model: "gemini-3.6-flash",
      input: [
        imagePart,
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
    console.error("Error in Food Scanner API:", error);
    return res.status(500).json({ 
      error: "An internal server error occurred.", 
      details: error.message 
    });
  }
};
