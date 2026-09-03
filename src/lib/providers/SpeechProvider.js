function splitText(text, max = 96) {
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
  if (chunks.length > 1 && chunks.at(-1).length < 10) {
    chunks[chunks.length - 2] += ` ${chunks.pop()}`;
  }
  return chunks;
}

const synthesizedSpeech = new Map();
const speechRequests = new Map();

function speechKey(text, voiceAccent, voiceGender, language) {
  return JSON.stringify([text.trim(), voiceAccent, voiceGender, language]);
}

async function requestSpeech(text, voiceAccent, voiceGender, language, signal) {
  const response = await fetch("/api/speech/synthesize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chunks: splitText(text), voiceAccent, voiceGender, language }),
    signal,
  });
  if (!response.ok) {
    const body = await response.json();
    throw new Error(body.error || "Speech playback failed.");
  }
  return response.blob();
}

export class SpeechProvider {
  async transcribe(_audio, _languageCode) { throw new Error("transcribe() must be implemented"); }
  async synthesize(_text, _voiceAccent, _voiceGender, _language = "en") { throw new Error("synthesize() must be implemented"); }
}

export class SaharaSpeechProvider extends SpeechProvider {
  async transcribe(audio, languageCode, diagnosticMode = "standard", signal) {
    const form = new FormData();
    const extension = audio.type.includes("ogg") ? "ogg" : "webm";
    form.append("audio", audio, `patient-turn.${extension}`);
    form.append("languageCode", languageCode);
    form.append("diagnosticMode", diagnosticMode);
    const response = await fetch("/api/speech/transcribe", { method: "POST", body: form, signal });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Transcription failed. Please try again.");
    return body;
  }

  async synthesize(text, voiceAccent, voiceGender, language = "en", signal) {
    const key = speechKey(text, voiceAccent, voiceGender, language);
    if (synthesizedSpeech.has(key)) return synthesizedSpeech.get(key);
    let request = speechRequests.get(key);
    if (!request) {
      request = requestSpeech(text, voiceAccent, voiceGender, language, signal);
      speechRequests.set(key, request);
    }
    try {
      const audio = await request;
      if (synthesizedSpeech.size >= 12) synthesizedSpeech.delete(synthesizedSpeech.keys().next().value);
      synthesizedSpeech.set(key, audio);
      return audio;
    } finally {
      speechRequests.delete(key);
    }
  }

  preload(text, voiceAccent, voiceGender, language = "en") {
    return this.synthesize(text, voiceAccent, voiceGender, language).catch(() => null);
  }
}

export const speechProvider = new SaharaSpeechProvider();
