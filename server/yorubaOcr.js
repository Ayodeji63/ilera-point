const OCR_SCHEMA = {
  type: "OBJECT",
  properties: {
    text: { type: "STRING" },
  },
  required: ["text"],
};

export async function extractYorubaText({ image, mimeType, apiKey, model = "gemini-2.5-flash-lite", signal, fetchImpl = fetch }) {
  const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [
          { inline_data: { mime_type: mimeType, data: image.toString("base64") } },
          { text: "Transcribe every readable Yoruba and English word in this image exactly in natural reading order. Preserve Yoruba tone marks, underdots, capitalization, punctuation, paragraph breaks, names, and numbers. For a screenplay, keep every character heading and its dialogue on separate lines. Do not translate, summarize, explain, correct, or add missing words. If there is no readable text, return an empty text value." },
        ],
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: OCR_SCHEMA,
        temperature: 0,
        maxOutputTokens: 4096,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
    signal,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || "Yoruba text extraction failed.");
  const raw = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new Error("No text result was returned from the image.");
  const result = JSON.parse(raw);
  return { text: typeof result.text === "string" ? result.text.trim() : "", model };
}
