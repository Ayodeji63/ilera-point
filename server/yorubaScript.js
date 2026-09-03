const SCRIPT_SCHEMA = {
  type: "OBJECT",
  properties: {
    normalizedText: { type: "STRING" },
    speakers: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          suggestedVoiceGender: { type: "STRING", enum: ["male", "female"] },
        },
        required: ["name", "suggestedVoiceGender"],
      },
    },
  },
  required: ["normalizedText", "speakers"],
};

export async function prepareYorubaScreenplay({ text, apiKey, model = "gemini-2.5-flash", signal, fetchImpl = fetch }) {
  const prompt = `Prepare this OCR transcription for accurate Yoruba-English screenplay speech.

Rules:
- Restore standard Yoruba orthography: tone marks and underdots on every Yoruba word.
- Separate Yoruba words that OCR joined together and use the surrounding dialogue to recover tonal spelling.
- Example: "Ore mi kan lo wami wale" becomes "Ọ̀rẹ́ mi kan ló wá mi wálé."
- Preserve English code-switched words in English; do not translate them.
- Correct only obvious OCR spacing, capitalization, and punctuation errors.
- Do not paraphrase, summarize, censor, invent, remove, or reorder dialogue.
- Keep each character heading uppercase on its own line and keep its dialogue on following lines.
- Keep narrative text and meaningful blank lines.
- Return each unique character heading in speakers. Suggest male or female only from an explicit title or clear screenplay context; otherwise alternate suggestions so the user can correct them.

OCR transcription:
${text}`;
  const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: SCRIPT_SCHEMA,
        temperature: 0,
        maxOutputTokens: 8192,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
    signal,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || "Yoruba screenplay preparation failed.");
  const raw = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new Error("No prepared screenplay was returned.");
  const result = JSON.parse(raw);
  const normalizedText = typeof result.normalizedText === "string" ? result.normalizedText.trim() : "";
  const seen = new Set();
  const speakers = Array.isArray(result.speakers) ? result.speakers.flatMap((speaker) => {
    const name = typeof speaker?.name === "string" ? speaker.name.trim().toLocaleUpperCase() : "";
    if (!name || seen.has(name)) return [];
    seen.add(name);
    return [{ name, voiceGender: speaker.suggestedVoiceGender === "male" ? "male" : "female" }];
  }) : [];
  return { normalizedText, speakers, model };
}
