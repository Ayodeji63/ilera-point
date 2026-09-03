function splitWords(text, max = 96) {
  const words = text.trim().split(/\s+/);
  const chunks = [];
  let current = "";
  for (const word of words) {
    if (`${current} ${word}`.trim().length > max && current) {
      chunks.push(current);
      current = word;
    } else current = `${current} ${word}`.trim();
  }
  if (current) chunks.push(current);
  return chunks;
}

function pauseAfter(text, lineEnd) {
  if (/!\s*$/.test(text)) return 650;
  if (/\?\s*$/.test(text)) return 550;
  if (/\.\s*$/.test(text)) return 450;
  if (/[;:]\s*$/.test(text)) return 350;
  if (/,\s*$/.test(text)) return 240;
  return lineEnd ? 360 : 140;
}

export function buildSpeechPlan(text, cast = []) {
  const chunks = [];
  const pausesMs = [];
  const voiceGenders = [];
  const castByName = new Map(cast.map((speaker) => [speaker.name.trim().toLocaleUpperCase(), speaker.voiceGender]));
  let voiceGender = "female";
  for (const rawLine of text.replace(/\r/g, "").split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      if (pausesMs.length) pausesMs[pausesMs.length - 1] = Math.max(pausesMs.at(-1), 850);
      continue;
    }
    const selectedVoice = castByName.get(line.toLocaleUpperCase());
    if (selectedVoice) {
      if (pausesMs.length) pausesMs[pausesMs.length - 1] = Math.max(pausesMs.at(-1), 700);
      voiceGender = selectedVoice;
      continue;
    }
    // Keep sentence punctuation and screenplay lines intact wherever Sahara's
    // 100-character streaming limit allows it.
    const phrases = line.match(/[^,.!?;:]+(?:[,.!?;:]+|$)/g)?.map((part) => part.trim()).filter(Boolean) || [line];
    const lineChunks = phrases.flatMap((phrase) => splitWords(phrase));
    lineChunks.forEach((chunk, index) => {
      chunks.push(chunk.length < 10 ? chunk.padEnd(10, " ") : chunk);
      pausesMs.push(pauseAfter(chunk, index === lineChunks.length - 1));
      voiceGenders.push(voiceGender);
    });
  }
  if (pausesMs.length) pausesMs[pausesMs.length - 1] = 0;
  return { chunks, pausesMs, voiceGenders };
}

async function errorMessage(response, fallback) {
  try { return (await response.json()).error || fallback; }
  catch { return fallback; }
}

export async function readYorubaImage(file, signal) {
  const form = new FormData();
  form.append("image", file, file.name);
  const response = await fetch("/api/yoruba-image/transcribe", { method: "POST", body: form, signal });
  if (!response.ok) throw new Error(await errorMessage(response, "Could not read the Yoruba text."));
  return response.json();
}

export async function prepareYorubaScript(text, signal) {
  const response = await fetch("/api/yoruba-script/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!response.ok) throw new Error(await errorMessage(response, "Could not restore the Yoruba screenplay."));
  return response.json();
}

export async function createYorubaSpeech(text, cast, signal) {
  const { chunks, pausesMs, voiceGenders } = buildSpeechPlan(text, cast);
  const response = await fetch("/api/speech/synthesize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chunks, pausesMs, voiceGenders, voiceAccent: "yoruba", voiceGender: "female", language: "yo", requireSahara: true, mode: "document" }),
    signal,
  });
  if (!response.ok) throw new Error(await errorMessage(response, "Sahara could not create the speech."));
  return { audio: await response.blob(), provider: response.headers.get("X-Ilera-Speech-Provider") || "sahara" };
}
