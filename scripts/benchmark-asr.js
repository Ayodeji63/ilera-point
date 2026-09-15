import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { geminiApiKeys, geminiGenerateContent, hasGeminiApiKeys } from "../server/geminiClient.js";

const MIME = { ".wav": "audio/wav", ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".webm": "audio/webm", ".flac": "audio/flac" };

export function words(text) {
  return String(text || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}%]+/gu, " ").trim().split(/\s+/).filter(Boolean);
}

export function wordErrorRate(reference, hypothesis) {
  return tokenErrorRate(words(reference), words(hypothesis));
}

function tokenErrorRate(expected, actual) {
  const matrix = Array.from({ length: expected.length + 1 }, () => Array(actual.length + 1).fill(0));
  for (let row = 0; row <= expected.length; row += 1) matrix[row][0] = row;
  for (let column = 0; column <= actual.length; column += 1) matrix[0][column] = column;
  for (let row = 1; row <= expected.length; row += 1) for (let column = 1; column <= actual.length; column += 1) {
    matrix[row][column] = Math.min(matrix[row - 1][column] + 1, matrix[row][column - 1] + 1, matrix[row - 1][column - 1] + (expected[row - 1] === actual[column - 1] ? 0 : 1));
  }
  return matrix[expected.length][actual.length] / Math.max(1, expected.length);
}

const clinicalWords = (value) => words(value).join(" ").replace(/(\d)\s+(mg|g|mcg|ml|iu)\b/g, "$1$2").split(" ").filter(Boolean);
const compact = (value) => clinicalWords(value).join(" ");
export const phraseAccuracy = (expected, actual) => compact(actual).includes(compact(expected)) ? 1 : 0;
export function phraseWordErrorRate(expected, actual) {
  const reference = clinicalWords(expected); const hypothesis = clinicalWords(actual);
  if (!reference.length) return null;
  if (!hypothesis.length) return 1;
  let best = Number.POSITIVE_INFINITY;
  const minimumLength = Math.max(1, reference.length - 1);
  const maximumLength = Math.min(hypothesis.length, reference.length + 1);
  for (let size = minimumLength; size <= maximumLength; size += 1) {
    for (let start = 0; start + size <= hypothesis.length; start += 1) {
      best = Math.min(best, tokenErrorRate(reference, hypothesis.slice(start, start + size)));
    }
  }
  return Number.isFinite(best) ? best : 1;
}
export function abbreviationAccuracy(expected, actual) {
  if (!expected.length) return null;
  const tokens = new Set(words(actual).map((word) => word.toUpperCase()));
  return expected.filter((abbr) => tokens.has(abbr.toUpperCase())).length / expected.length;
}

async function sahara(sample, audio, mimeType, signal) {
  const form = new FormData();
  form.append("audio_file_name", `clinical-benchmark-${sample.id}-${Date.now()}`);
  form.append("audio_file_blob", new Blob([audio], { type: mimeType }), basename(sample.audio));
  form.append("use_language_asr_input", sample.language);
  form.append("use_category", "file_category_telehealth");
  form.append("use_disable_llm_corrections", "TRUE");
  let response = await fetch("https://infer.voice.intron.io/file/v1/upload/sync", { method: "POST", headers: { Authorization: `Bearer ${process.env.SAHARA_API_KEY}` }, body: form, signal });
  let body = await response.json();
  let data = body.data;
  if (response.status === 503 && data?.file_id) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((done) => setTimeout(done, 1500));
      response = await fetch(`https://infer.voice.intron.io/file/v1/status/${encodeURIComponent(data.file_id)}`, { headers: { Authorization: `Bearer ${process.env.SAHARA_API_KEY}` }, signal });
      body = await response.json(); data = body.data;
      if (data?.processing_status === "FILE_TRANSCRIBED") break;
    }
  }
  if (!data?.audio_transcript) throw new Error(body.message || "Sahara transcription failed.");
  return data.audio_transcript;
}

async function openai(sample, audio, mimeType, signal) {
  const form = new FormData();
  form.append("file", new Blob([audio], { type: mimeType }), basename(sample.audio));
  form.append("model", process.env.OPENAI_ASR_MODEL || "gpt-4o-transcribe");
  form.append("response_format", "json");
  form.append("prompt", "Clinical prescription dictation may code-switch. Preserve drug names, doses, and OD, BD, TDS, QDS, PRN, nocte exactly.");
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form, signal });
  const body = await response.json();
  if (!response.ok || !body.text) throw new Error(body.error?.message || "OpenAI transcription failed.");
  return body.text;
}

async function gemini(sample, audio, mimeType, signal) {
  if (audio.length > 15 * 1024 * 1024) throw new Error("Gemini inline benchmark clips must be under 15 MB.");
  const model = process.env.GEMINI_ASR_MODEL || "gemini-2.5-flash";
  const response = await geminiGenerateContent({ model, apiKeys: geminiApiKeys(), signal, body: { contents: [{ role: "user", parts: [
      { text: "Transcribe this clinical prescription dictation verbatim. Preserve code-switching, medicine names, doses, and abbreviations. Return transcript text only." },
      { inlineData: { mimeType, data: audio.toString("base64") } },
    ] }], generationConfig: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } } } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || "Gemini transcription failed.");
  return body.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() || "";
}

const providers = [
  { name: "Sahara telehealth", key: "SAHARA_API_KEY", run: sahara },
  { name: `OpenAI ${process.env.OPENAI_ASR_MODEL || "gpt-4o-transcribe"}`, key: "OPENAI_API_KEY", run: openai },
  { name: `Gemini ${process.env.GEMINI_ASR_MODEL || "gemini-2.5-flash"}`, key: "GEMINI_API_KEY or GEMINI_API_KEYS", configured: hasGeminiApiKeys, run: gemini },
];

function percent(value) { return value == null ? "—" : `${(value * 100).toFixed(1)}%`; }
function milliseconds(value) { return value == null ? "—" : `${Math.round(value)} ms`; }
function percentile(values, fraction) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.ceil(fraction * ordered.length) - 1)];
}

export function validateBenchmarkManifest(samples, base, { checkFiles = true } = {}) {
  if (!Array.isArray(samples) || !samples.length) throw new Error("The benchmark manifest must contain at least one sample.");
  const ids = new Set(); const supportedLanguages = new Set(["en", "yo", "pcm", "ha", "ig"]); const errors = [];
  samples.forEach((sample, index) => {
    const label = sample?.id || `sample ${index + 1}`;
    if (!sample?.id || ids.has(sample.id)) errors.push(`${label}: id is missing or duplicated`);
    ids.add(sample?.id);
    for (const field of ["audio", "reference", "drug", "dose"]) if (!String(sample?.[field] || "").trim()) errors.push(`${label}: ${field} is required`);
    if (!supportedLanguages.has(sample?.language)) errors.push(`${label}: language must be en, yo, pcm, ha or ig`);
    if (!Array.isArray(sample?.abbreviations)) errors.push(`${label}: abbreviations must be an array`);
    if (checkFiles && sample?.audio && !existsSync(resolve(base, sample.audio))) errors.push(`${label}: missing ${sample.audio}`);
  });
  if (errors.length) throw new Error(`Benchmark manifest is not ready:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  return samples;
}

export async function runBenchmark(manifestPath, { writeResults = true, outputDirectory } = {}) {
  const absoluteManifest = resolve(manifestPath);
  const samples = JSON.parse(await readFile(absoluteManifest, "utf8"));
  const base = resolve(absoluteManifest, "..");
  validateBenchmarkManifest(samples, base);
  for (const provider of providers) if (provider.configured ? !provider.configured() : !process.env[provider.key]) throw new Error(`${provider.key} is required to compare all three ASR providers.`);

  const results = [];
  for (const sample of samples) {
    const path = resolve(base, sample.audio); const audio = await readFile(path); const mimeType = MIME[extname(path).toLowerCase()] || "application/octet-stream";
    const outputs = [];
    for (const provider of providers) {
      const controller = new AbortController();
      const deadline = setTimeout(() => controller.abort(), Number(process.env.ASR_BENCHMARK_TIMEOUT_MS) || 60_000);
      const startedAt = performance.now();
      try { outputs.push({ provider: provider.name, transcript: await provider.run(sample, audio, mimeType, controller.signal), latencyMs: Math.round(performance.now() - startedAt) }); }
      catch (error) { outputs.push({ provider: provider.name, error: error?.name === "AbortError" ? "Timed out" : error.message, transcript: "", latencyMs: Math.round(performance.now() - startedAt) }); }
      finally { clearTimeout(deadline); }
    }
    for (const output of outputs) results.push({
      ...output, sample: sample.id, language: sample.language,
      wer: output.error ? null : wordErrorRate(sample.reference, output.transcript),
      drugWer: output.error ? null : phraseWordErrorRate(sample.drug, output.transcript),
      drug: output.error ? null : phraseAccuracy(sample.drug, output.transcript),
      doseWer: output.error ? null : phraseWordErrorRate(sample.dose, output.transcript),
      dose: output.error ? null : phraseAccuracy(sample.dose, output.transcript),
      abbreviation: output.error ? null : abbreviationAccuracy(sample.abbreviations || [], output.transcript),
    });
  }

  const summarize = (name, language = null) => {
    const attempted = results.filter((result) => result.provider === name && (!language || result.language === language));
    const group = attempted.filter((result) => !result.error);
    const average = (field) => { const scored = group.map((row) => row[field]).filter((value) => value != null); return scored.length ? scored.reduce((sum, value) => sum + value, 0) / scored.length : null; };
    return { provider: name, language, attempted: attempted.length, samples: group.length, success: group.length / Math.max(1, attempted.length), latencyP50: percentile(group.map((row) => row.latencyMs), .5), latencyP95: percentile(group.map((row) => row.latencyMs), .95), wer: average("wer"), drugWer: average("drugWer"), drug: average("drug"), doseWer: average("doseWer"), dose: average("dose"), abbreviation: average("abbreviation") };
  };
  const rows = providers.map(({ name }) => summarize(name));
  const rowText = (row, label = row.provider) => `| ${label} | ${row.samples}/${row.attempted} (${percent(row.success)}) | ${milliseconds(row.latencyP50)} | ${milliseconds(row.latencyP95)} | ${percent(row.wer)} | ${percent(row.drugWer)} | ${percent(row.drug)} | ${percent(row.doseWer)} | ${percent(row.dose)} | ${percent(row.abbreviation)} |`;
  const header = [
    "| ASR model | Success | p50 | p95 | Overall WER ↓ | Drug WER ↓ | Drug exact ↑ | Dose WER ↓ | Dose exact ↑ | Abbreviation ↑ |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  const languages = [...new Set(samples.map((sample) => sample.language))];
  const languageRows = providers.flatMap(({ name }) => languages.map((language) => summarize(name, language)));
  const table = [
    "## Overall",
    "",
    ...header,
    ...rows.map((row) => rowText(row)),
    "",
    "## By language",
    "",
    ...header,
    ...languageRows.map((row) => rowText(row, `${row.provider} — ${row.language}`)),
  ].join("\n");
  const report = { generatedAt: new Date().toISOString(), manifest: absoluteManifest, rows, languageRows, results };
  if (writeResults) {
    const destination = resolve(outputDirectory || base, "results");
    await mkdir(destination, { recursive: true });
    await Promise.all([
      writeFile(resolve(destination, "latest.md"), `${table}\n`, "utf8"),
      writeFile(resolve(destination, "latest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    ]);
  }
  return { table, results, rows, languageRows };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arguments_ = process.argv.slice(2);
  const manifest = arguments_.find((argument) => !argument.startsWith("--")) || "benchmarks/clinical-dictations.json";
  if (arguments_.includes("--validate")) {
    const absolute = resolve(manifest);
    readFile(absolute, "utf8").then((contents) => validateBenchmarkManifest(JSON.parse(contents), resolve(absolute, ".."))).then((samples) => console.log(`Benchmark ready: ${samples.length} audio samples.`)).catch((error) => { console.error(error.message); process.exitCode = 1; });
  } else runBenchmark(manifest).then(({ table }) => console.log(table)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
