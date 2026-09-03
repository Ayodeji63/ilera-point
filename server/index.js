import "dotenv/config";
import cors from "cors";
import express from "express";
import multer from "multer";
import { MAX_INTERVIEW_TURNS, shouldCompleteInterview } from "./interviewPolicy.js";
import { synthesizeWithSahara } from "./saharaTts.js";
import { synthesizeWithDeviceVoice } from "./deviceTts.js";
import { extractYorubaText } from "./yorubaOcr.js";
import { prepareYorubaScreenplay } from "./yorubaScript.js";
import { mergeWavBuffers } from "./wav.js";
import { resolveSessionVoiceGender } from "./speechVoices.js";
import { palmRouter } from "./routes/palm.js";
import { consultationsRouter } from "./routes/consultations.js";
import { prescriptionsRouter } from "./routes/prescriptions.js";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const port = process.env.PORT || 8787;
const SUPPORTED_LANGUAGE_CODES = new Set(["en", "yo", "pcm", "ha", "ig"]);

app.use(cors());
app.use(express.json({ limit: "12mb" }));
app.use("/api/palm", palmRouter);
app.use("/api/consultations", consultationsRouter);
app.use("/api/prescriptions", prescriptionsRouter);

const YORUBA_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

app.post("/api/yoruba-image/transcribe", upload.single("image"), async (req, res) => {
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: "GEMINI_API_KEY is not configured." });
  if (!req.file) return res.status(400).json({ error: "Choose an image containing Yoruba text." });
  if (!YORUBA_IMAGE_TYPES.has(req.file.mimetype)) return res.status(415).json({ error: "Use a JPG, PNG, or WebP image." });
  if (req.file.size > 8 * 1024 * 1024) return res.status(413).json({ error: "The image must be 8 MB or smaller." });
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 20000);
  const cancelOnDisconnect = () => { if (!res.writableEnded) controller.abort(); };
  req.once("aborted", cancelOnDisconnect); res.once("close", cancelOnDisconnect);
  const startedAt = performance.now();
  try {
    const result = await extractYorubaText({
      image: req.file.buffer,
      mimeType: req.file.mimetype,
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_VISION_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
      signal: controller.signal,
    });
    if (!result.text) return res.status(422).json({ error: "No readable Yoruba text was found. Try a sharper, well-lit image." });
    const duration = Math.round(performance.now() - startedAt);
    res.set("Server-Timing", `gemini-ocr;dur=${duration}`);
    console.info("[latency] yoruba-ocr", { durationMs: duration, model: result.model, imageBytes: req.file.size });
    return res.json({ text: result.text });
  } catch (error) {
    if (controller.signal.aborted && !res.writableEnded) return res.status(504).json({ error: "Image reading took too long. Please try again." });
    if (!res.writableEnded) return res.status(502).json({ error: error.message || "Could not read the Yoruba text." });
  } finally {
    clearTimeout(deadline);
  }
});

app.post("/api/yoruba-script/prepare", async (req, res) => {
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: "GEMINI_API_KEY is not configured." });
  const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
  if (!text) return res.status(400).json({ error: "Script text is required." });
  if (text.length > 4096) return res.status(400).json({ error: "The script cannot exceed 4096 characters." });
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 30000);
  const cancelOnDisconnect = () => { if (!res.writableEnded) controller.abort(); };
  req.once("aborted", cancelOnDisconnect); res.once("close", cancelOnDisconnect);
  const startedAt = performance.now();
  try {
    const result = await prepareYorubaScreenplay({
      text,
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_SCRIPT_MODEL || "gemini-2.5-flash",
      signal: controller.signal,
    });
    if (!result.normalizedText) return res.status(422).json({ error: "The screenplay could not be prepared." });
    const duration = Math.round(performance.now() - startedAt);
    console.info("[latency] yoruba-script", { durationMs: duration, model: result.model, speakers: result.speakers.length });
    return res.json({ text: result.normalizedText, speakers: result.speakers });
  } catch (error) {
    if (controller.signal.aborted && !res.writableEnded) return res.status(504).json({ error: "Yoruba restoration took too long. The raw transcription is still available." });
    if (!res.writableEnded) return res.status(502).json({ error: error.message || "Could not restore the Yoruba screenplay." });
  } finally {
    clearTimeout(deadline);
  }
});

const interviewSchema = {
  type: "OBJECT",
  properties: {
    record: {
      type: "OBJECT",
      properties: {
        chief_complaints: { type: "ARRAY", items: { type: "STRING" } },
        onset: { type: "STRING" },
        associated_symptoms: { type: "ARRAY", items: { type: "STRING" } },
        negative_symptoms_checked: { type: "ARRAY", items: { type: "STRING" } },
        medication_history: { type: "STRING" },
        still_missing: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["chief_complaints", "onset", "associated_symptoms", "negative_symptoms_checked", "medication_history", "still_missing"],
    },
    next_question: { type: "STRING" },
    interview_complete: { type: "BOOLEAN" },
  },
  required: ["record", "next_question", "interview_complete"],
};

app.post("/api/interview", async (req, res) => {
  const { turns, record, languageCode = "en" } = req.body;
  if (!record || !Array.isArray(turns) || turns.length === 0) return res.status(400).json({ error: "Conversation history and the current record are required." });
  if (turns.length > MAX_INTERVIEW_TURNS) return res.status(400).json({ error: `The interview cannot exceed ${MAX_INTERVIEW_TURNS} turns.` });
  if (!SUPPORTED_LANGUAGE_CODES.has(languageCode)) return res.status(400).json({ error: `Unsupported language code: ${languageCode}.` });
  const invalidTurn = turns.some((turn, index) => turn.turn_number !== index + 1 || !turn.question_asked?.trim() || !turn.transcript?.trim() || !turn.timestamp);
  if (invalidTurn) return res.status(400).json({ error: "Conversation history contains an invalid turn." });
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: "GEMINI_API_KEY is not configured." });
  const nextTurn = turns.length;
  const systemInstruction = `You conduct a brief, warm primary-care intake. Never diagnose and never suggest medication or treatment. Only extract patient-reported information into the supplied record and decide what intake detail is still missing. Preserve clinically meaningful symptom phrases in simple English in record arrays so deterministic safety rules can match them. Put symptoms the patient explicitly denies only in negative_symptoms_checked. Ask in the patient's language where possible (language code: ${languageCode}). You will receive the full conversation history for this visit, not just the latest statement. If the patient's most recent statement revises, corrects, or contradicts something said in an earlier turn, update the relevant field or fields to reflect the correction; do not append a duplicate or conflicting value. You may briefly acknowledge a correction. When more information is needed, next_question must be one warm sentence that briefly acknowledges what the patient said and asks exactly one concise next question, for example: "I hear that — how long has this been going on?" Keep the visit efficient and do not mark the interview complete before two accepted turns. This is accepted turn ${nextTurn}; the safety ceiling is ${MAX_INTERVIEW_TURNS} turns.`;
  const startedAt = performance.now(); const controller = new AbortController(); const deadline = setTimeout(() => controller.abort(), 10000);
  try {
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: `Full conversation history:\n${JSON.stringify(turns)}\n\nCurrent record before applying the latest turn:\n${JSON.stringify(record)}` }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: interviewSchema, temperature: 0.1, maxOutputTokens: 700, thinkingConfig: { thinkingBudget: 0 } },
      }),
      signal: controller.signal,
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message || "Gemini request failed");
    const result = JSON.parse(body.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
    const missing = Array.isArray(result.record?.still_missing) ? result.record.still_missing : [];
    result.interview_complete = shouldCompleteInterview(nextTurn, missing);
    if (result.interview_complete) result.next_question = "";
    else if (!result.next_question?.trim()) result.next_question = nextTurn === 1
      ? "Thank you — is there anything else about this problem you want the clinician to know?"
      : "I hear you — what else should the clinician know about this problem?";
    const duration = Math.round(performance.now() - startedAt); res.set("Server-Timing", `gemini;dur=${duration}`); console.info("[latency] interview", { durationMs: duration, model, turn: nextTurn });
    res.json(result);
  } catch (error) { res.status(502).json({ error: error.name === "AbortError" ? "The interview response timed out. Your transcript is preserved; tap send to retry." : `Interview service error: ${error.message}` }); }
  finally { clearTimeout(deadline); }
});

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function pollTranscription(fileId, apiKey, signal) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await wait(attempt === 0 ? 900 : 1050);
    const response = await fetch(`https://infer.voice.intron.io/file/v1/status/${encodeURIComponent(fileId)}`, { headers: { Authorization: `Bearer ${apiKey}` }, signal });
    const body = await response.json();
    if (response.status === 429 || /rate.?limit/i.test(body.message || body.error || "")) {
      const retryAfter = Math.max(1, Number(response.headers.get("retry-after")) || 1);
      await wait(retryAfter * 1000);
      continue;
    }
    if (!response.ok) throw new Error(body.message || "Could not check transcription status");
    if (body.data?.processing_status === "FILE_TRANSCRIBED") return body.data;
    if (body.data?.processing_status === "FILE_PROCESSING_FAILED") throw new Error("Transcription processing failed");
  }
  throw new Error("Transcription took longer than 12 seconds. Please try again or type your answer.");
}

app.post("/api/speech/transcribe", upload.single("audio"), async (req, res) => {
  if (!process.env.SAHARA_API_KEY) return res.status(503).json({ error: "SAHARA_API_KEY is not configured." });
  if (!req.file) return res.status(400).json({ error: "No audio was received." });
  const languageCode = req.body.languageCode;
  const diagnosticMode = req.body.diagnosticMode || "standard";
  if (!SUPPORTED_LANGUAGE_CODES.has(languageCode)) return res.status(400).json({ error: `Unsupported language code: ${languageCode}.` });
  if (!["standard", "general", "raw"].includes(diagnosticMode)) return res.status(400).json({ error: "Unsupported transcription diagnostic mode." });
  if (languageCode !== "ha" && diagnosticMode !== "standard") return res.status(400).json({ error: "Diagnostic transcription modes are restricted to Hausa testing." });
  const startedAt = performance.now(); const controller = new AbortController(); const deadline = setTimeout(() => controller.abort(), 15000);
  const cancelOnDisconnect = () => { if (!res.writableEnded) controller.abort(); };
  req.once("aborted", cancelOnDisconnect); res.once("close", cancelOnDisconnect);
  try {
    const form = new FormData();
    form.append("audio_file_name", `ilera-turn-${Date.now()}`);
    form.append("audio_file_blob", new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname);
    form.append("use_language_asr_input", languageCode);
    form.append("use_category", diagnosticMode === "general" ? "file_category_general" : "file_category_telehealth");
    form.append("use_disable_llm_corrections", "TRUE");
    const response = await fetch("https://infer.voice.intron.io/file/v1/upload", { method: "POST", headers: { Authorization: `Bearer ${process.env.SAHARA_API_KEY}` }, body: form, signal: controller.signal });
    const body = await response.json();
    let data = body.data;
    if (!response.ok) throw new Error(body.message || "Sahara transcription failed");
    if (data?.processing_status !== "FILE_TRANSCRIBED" && data?.file_id) data = await pollTranscription(data.file_id, process.env.SAHARA_API_KEY, controller.signal);
    if (!data?.audio_transcript?.trim()) throw new Error("No speech was detected. Please try again or type your answer.");
    const duration = Math.round(performance.now() - startedAt); res.set("Server-Timing", `sahara;dur=${duration}`); console.info("[latency] transcription", { durationMs: duration, languageCode });
    res.json({ transcript: data.audio_transcript, fileId: data.file_id, languageCode, diagnosticMode });
  } catch (error) { res.status(502).json({ error: error.name === "AbortError" ? "Transcription timed out. Please try again or type your answer." : error.message }); }
  finally { clearTimeout(deadline); }
});

const ttsCache = new Map();
const ttsInFlight = new Map();
const SAHARA_COOLDOWN_MS = 60000;
let saharaUnavailableUntil = 0;

async function synthesizeWithRetry(options) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await synthesizeWithSahara({ ...options, readyTimeoutMs: options.readyTimeoutMs ?? 14000 });
    } catch (error) {
      lastError = error;
      if (options.signal.aborted) throw error;
      const nonRetryable = /(authentication|permission|quota|credit|invalid|unsupported|chunk.*size)/i.test(error.message);
      const reconnectable = /(socket hang up|ECONNRESET|EPIPE|ETIMEDOUT|connection closed|opening handshake|unexpected server response|invalid WebSocket frame|speech session timed out)/i.test(error.message);
      if (nonRetryable || !reconnectable || attempt === 2) throw error;
      console.warn("[Sahara TTS] transient session failure; reconnecting", { attempt, message: error.message });
      await wait(attempt * 300);
    }
  }
  throw lastError;
}

async function synthesizeResiliently(options) {
  if (Date.now() < saharaUnavailableUntil) {
    return { audio: await synthesizeWithDeviceVoice(options.chunks.join(" "), options.signal), provider: "device" };
  }
  const saharaController = new AbortController();
  const stopSahara = () => saharaController.abort();
  options.signal.addEventListener("abort", stopSahara, { once: true });
  const saharaSignal = AbortSignal.any([saharaController.signal, AbortSignal.timeout(6500)]);
  try {
    const audio = await synthesizeWithRetry({ ...options, signal: saharaSignal });
    saharaUnavailableUntil = 0;
    return { audio, provider: "sahara" };
  } catch (error) {
    if (options.signal.aborted) throw error;
    saharaUnavailableUntil = Date.now() + SAHARA_COOLDOWN_MS;
    console.warn("[Sahara TTS] unavailable; using kiosk device voice", { message: error.message });
    return { audio: await synthesizeWithDeviceVoice(options.chunks.join(" "), options.signal), provider: "device" };
  } finally {
    saharaController.abort();
    options.signal.removeEventListener("abort", stopSahara);
  }
}

app.post("/api/speech/synthesize", async (req, res) => {
  if (!process.env.SAHARA_API_KEY) return res.status(503).json({ error: "SAHARA_API_KEY is not configured." });
  const { chunks, pausesMs = [], voiceGenders = [], voiceAccent, voiceGender, language = "en", requireSahara = false, mode = "kiosk" } = req.body;
  if (!Array.isArray(chunks) || !chunks.length) return res.status(400).json({ error: "Text to speak is required." });
  if (chunks.some((chunk) => typeof chunk !== "string" || chunk.length < 10 || chunk.length > 100)) return res.status(400).json({ error: "Each speech chunk must contain 10 to 100 characters." });
  if (chunks.join(" ").length > 4096) return res.status(400).json({ error: "Speech text cannot exceed 4096 characters." });
  if (!Array.isArray(pausesMs) || (pausesMs.length && pausesMs.length !== chunks.length) || pausesMs.some((pause) => !Number.isInteger(pause) || pause < 0 || pause > 2000)) return res.status(400).json({ error: "Speech pauses must match the text chunks and be between 0 and 2000 milliseconds." });
  if (!Array.isArray(voiceGenders) || (voiceGenders.length && voiceGenders.length !== chunks.length) || voiceGenders.some((gender) => !["male", "female"].includes(gender))) return res.status(400).json({ error: "Character voices must match the speech chunks." });
  if (!voiceAccent || !["male", "female"].includes(voiceGender) || !SUPPORTED_LANGUAGE_CODES.has(language)) return res.status(400).json({ error: "The requested speech voice is invalid." });
  if (typeof requireSahara !== "boolean") return res.status(400).json({ error: "The Sahara requirement must be a boolean." });
  if (!["kiosk", "document"].includes(mode)) return res.status(400).json({ error: "The requested speech mode is invalid." });
  const documentMode = mode === "document" && requireSahara;
  const providerDeadlineMs = documentMode ? 90000 : 18000;
  const readyTimeoutMs = documentMode ? 75000 : 14000;
  const cacheKey = JSON.stringify([chunks, pausesMs, voiceGenders, voiceAccent, voiceGender, language, requireSahara, mode]); const cached = ttsCache.get(cacheKey);
  if (cached) return res.set("X-Ilera-TTS-Cache", "HIT").set("X-Ilera-Speech-Provider", cached.provider).type("audio/wav").send(cached.audio);

  const requestController = new AbortController();
  const providerDeadline = AbortSignal.timeout(providerDeadlineMs);
  const requestSignal = AbortSignal.any([requestController.signal, providerDeadline]);
  const cancelOnDisconnect = () => { if (!res.writableEnded) requestController.abort(); };
  req.once("aborted", cancelOnDisconnect); res.once("close", cancelOnDisconnect);
  const startedAt = performance.now();
  try {
    let audioPromise = ttsInFlight.get(cacheKey);
    if (!audioPromise) {
      const options = { chunks, pausesMs, voiceAccent, voiceGender, language, apiKey: process.env.SAHARA_API_KEY, signal: requestSignal, readyTimeoutMs };
      const castGenders = voiceGenders.length ? [...new Set(voiceGenders)] : [];
      const singleVoiceOptions = { ...options, voiceGender: resolveSessionVoiceGender(voiceGenders, voiceGender) };
      audioPromise = requireSahara && castGenders.length > 1
        ? Promise.all(castGenders.map(async (gender) => {
          const indexes = voiceGenders.flatMap((value, index) => value === gender ? [index] : []);
          const audioChunks = await synthesizeWithRetry({ ...options, chunks: indexes.map((index) => chunks[index]), pausesMs: [], voiceGender: gender, returnChunks: true });
          return { indexes, audioChunks };
        })).then((groups) => {
          const ordered = new Array(chunks.length);
          groups.forEach(({ indexes, audioChunks }) => indexes.forEach((sourceIndex, groupIndex) => { ordered[sourceIndex] = audioChunks[groupIndex]; }));
          return { audio: mergeWavBuffers(ordered, pausesMs), provider: "sahara" };
        })
        : requireSahara
          ? synthesizeWithRetry(singleVoiceOptions).then((audio) => ({ audio, provider: "sahara" }))
          : synthesizeResiliently(options);
      ttsInFlight.set(cacheKey, audioPromise);
    }
    const { audio, provider } = await audioPromise;
    if (ttsCache.size >= 20) ttsCache.delete(ttsCache.keys().next().value);
    ttsCache.set(cacheKey, { audio, provider });
    const duration = Math.round(performance.now() - startedAt);
    res.set("Server-Timing", `sahara-tts;dur=${duration}`);
    res.set("X-Ilera-Speech-Provider", provider);
    console.info("[latency] speech", { durationMs: duration, language, provider, cached: false });
    return res.type("audio/wav").send(audio);
  } catch (error) {
    if (requestController.signal.aborted) return;
    const message = providerDeadline.aborted ? `Sahara speech generation took longer than ${providerDeadlineMs / 1000} seconds. Please try again.` : (error?.message || "Sahara speech generation failed. Please try again.");
    console.error(`[Sahara TTS] ${message}`);
    return res.status(502).json({ error: message });
  } finally {
    ttsInFlight.delete(cacheKey);
  }
});

app.get("/api/health", (_req, res) => {
  const missing = [!process.env.SAHARA_API_KEY && "SAHARA_API_KEY", !process.env.GEMINI_API_KEY && "GEMINI_API_KEY", !process.env.TENCENT_PALM_API_KEY && "TENCENT_PALM_API_KEY", !process.env.SUPABASE_URL && "SUPABASE_URL", !process.env.SUPABASE_SERVICE_ROLE_KEY && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean);
  res.status(missing.length ? 503 : 200).json({ ok: missing.length === 0, speech: "sahara", interview: "gemini", palm: "tencent", persistence: "supabase", missing });
});

app.listen(port, () => console.log(`IleraPoint API listening on http://localhost:${port}`));
