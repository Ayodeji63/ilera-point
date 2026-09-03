import "dotenv/config";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

const audioPath = process.argv[2];
const reference = process.argv.slice(3).join(" ").trim();
if (!audioPath) {
  console.error('Usage: npm run benchmark:hausa -- ./clip.webm "expected Hausa transcript"');
  process.exit(1);
}
if (!process.env.SAHARA_API_KEY) {
  console.error("SAHARA_API_KEY is required in .env.");
  process.exit(1);
}

const mimeByExtension = { ".wav": "audio/wav", ".mp3": "audio/mpeg", ".mp4": "audio/mp4", ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".webm": "audio/webm", ".flac": "audio/flac" };
const audio = await readFile(audioPath);
const mimeType = mimeByExtension[extname(audioPath).toLowerCase()] || "application/octet-stream";

async function poll(fileId) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const response = await fetch(`https://infer.voice.intron.io/file/v1/status/${encodeURIComponent(fileId)}`, { headers: { Authorization: `Bearer ${process.env.SAHARA_API_KEY}` } });
    const body = await response.json();
    if (body.data?.processing_status === "FILE_TRANSCRIBED") return body.data;
    if (!response.ok || body.data?.processing_status === "FILE_PROCESSING_FAILED") throw new Error(body.message || "Transcription failed");
  }
  throw new Error("Transcription timed out");
}

async function transcribe({ name, category, disableCorrections }) {
  const form = new FormData();
  form.append("audio_file_name", `hausa-${name}-${Date.now()}`);
  form.append("audio_file_blob", new Blob([audio], { type: mimeType }), basename(audioPath));
  form.append("use_language_asr_input", "ha");
  form.append("use_category", category);
  if (disableCorrections) form.append("use_disable_llm_corrections", "TRUE");
  const response = await fetch("https://infer.voice.intron.io/file/v1/upload/sync", { method: "POST", headers: { Authorization: `Bearer ${process.env.SAHARA_API_KEY}` }, body: form });
  const body = await response.json();
  const data = response.status === 503 && body.data?.file_id ? await poll(body.data.file_id) : body.data;
  if (!response.ok && response.status !== 503) throw new Error(body.message || `${name} transcription failed`);
  return { mode: name, languageCode: "ha", category, disableCorrections, transcript: data.audio_transcript, fileId: data.file_id };
}

function wordErrorRate(expected, actual) {
  const a = expected.toLowerCase().trim().split(/\s+/);
  const b = actual.toLowerCase().trim().split(/\s+/);
  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) for (let j = 1; j <= b.length; j += 1) matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return Number((matrix[a.length][b.length] / Math.max(1, a.length)).toFixed(3));
}

const modes = [
  { name: "telehealth", category: "file_category_telehealth", disableCorrections: false },
  { name: "general", category: "file_category_general", disableCorrections: false },
  { name: "corrections-disabled", category: "file_category_telehealth", disableCorrections: true },
];

const results = [];
for (const mode of modes) {
  const result = await transcribe(mode);
  results.push({ ...result, ...(reference ? { wordErrorRate: wordErrorRate(reference, result.transcript) } : {}) });
}
console.log(JSON.stringify({ audioPath, reference: reference || null, results }, null, 2));
