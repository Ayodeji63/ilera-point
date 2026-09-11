import { buildSpeechPlan } from "../yorubaImageSpeech";

const synthesizedSpeech = new Map();
const synthesizedParts = new Map();
const speechRequests = new Map();

function speechKey(text, voiceAccent, voiceGender, language) {
  return JSON.stringify([text.trim(), voiceAccent, voiceGender, language]);
}

function synthesizeBody(text, voiceAccent, voiceGender, language, progressive) {
  const { chunks, pausesMs } = buildSpeechPlan(text);
  return JSON.stringify({ chunks, pausesMs, voiceAccent, voiceGender, language, requireSahara: true, mode: "kiosk", ...(progressive ? { progressive: true } : {}) });
}

async function requestSpeech(text, voiceAccent, voiceGender, language, signal) {
  const response = await fetch("/api/speech/synthesize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: synthesizeBody(text, voiceAccent, voiceGender, language, false),
    signal,
  });
  if (!response.ok) {
    const body = await response.json();
    throw new Error(body.error || "Speech playback failed.");
  }
  return response.blob();
}

function wavBlob(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: "audio/wav" });
}

// The server writes one JSON line per sentence chunk as Sahara finishes it.
// Chunks are generated in parallel, so they can arrive out of order — hold them
// until the previous one is available and hand them over in reading order.
async function* readSpeechParts(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const pending = new Map();
  let buffer = "";
  let next = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      if (!line) continue;
      const payload = JSON.parse(line);
      if (payload.error) throw new Error(payload.error);
      pending.set(payload.index, payload);
      while (pending.has(next)) {
        const part = pending.get(next);
        pending.delete(next);
        next += 1;
        yield { pauseMs: part.pauseMs || 0, blob: wavBlob(part.audioBase64) };
      }
    }
  }
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

  // Yields playable parts as they arrive so the kiosk can start speaking after
  // the first chunk instead of waiting for the whole question to render.
  async *stream(text, voiceAccent, voiceGender, language = "en", signal) {
    const key = speechKey(text, voiceAccent, voiceGender, language);
    const parts = synthesizedParts.get(key);
    if (parts) { yield* parts; return; }
    const merged = synthesizedSpeech.get(key);
    if (merged) { yield { pauseMs: 0, blob: merged }; return; }

    const collected = [];
    try {
      const response = await fetch("/api/speech/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: synthesizeBody(text, voiceAccent, voiceGender, language, true),
        signal,
      });
      if (!response.ok) throw new Error((await response.json()).error || "Speech playback failed.");
      if (!response.body) throw new Error("This browser cannot stream speech.");
      for await (const part of readSpeechParts(response)) {
        collected.push(part);
        yield part;
      }
    } catch (error) {
      // Once audio is playing there is nothing to fall back to, and a cancelled
      // request must stay cancelled.
      if (collected.length || signal?.aborted) throw error;
      const part = { pauseMs: 0, blob: await requestSpeech(text, voiceAccent, voiceGender, language, signal) };
      collected.push(part);
      yield part;
    }
    if (synthesizedParts.size >= 12) synthesizedParts.delete(synthesizedParts.keys().next().value);
    synthesizedParts.set(key, collected);
  }

  preload(text, voiceAccent, voiceGender, language = "en") {
    return this.synthesize(text, voiceAccent, voiceGender, language).catch(() => null);
  }
}

export const speechProvider = new SaharaSpeechProvider();
