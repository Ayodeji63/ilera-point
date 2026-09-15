# Clinical code-switching ASR benchmarks

There are two complementary tracks:

- The existing `manifest.csv` corpus contains 100 recordings: 25 Yorùbá-English, 25 Igbo-English, 25 Hausa-English, and 25 monolingual French controls. It measures general clinical code-switch recognition, segment loss, language-switch preservation, and hallucination.
- `clinical-dictations.json` is the focused prescription-safety extension. It measures whether drug names, doses, and abbreviations survive transcription. The existing symptom corpus cannot answer that question because it does not contain a balanced set of dictated prescriptions and doses.

Both are evaluation tools, not sources of prescriptions or clinical recommendations.

Live patient consultations and clinician prescription requests are never added to these datasets automatically. Benchmark audio must be collected under a separate approved protocol, contain no patient identifiers or real patient histories, and carry documented participant consent, reference provenance, provider/model configuration, and retention dates.

## Existing 100-clip baseline

The audio is stored in the repository's git-ignored root `audio/` directory. Existing provider outputs are under `hyps/`. Audit the recording/reference alignment and regenerate the statistical report with:

```bash
pnpm benchmark:codeswitch:audit
pnpm benchmark:codeswitch
```

The default command includes only the Sahara and Gemini hypothesis files whose adapters and rerun paths exist in this repository. `hyps/whisper_riva.csv` has incomplete provider/run provenance: its filename does **not** prove NVIDIA Riva produced it. It is excluded from default comparisons. `pnpm benchmark:codeswitch:include-unverified` exists only to reproduce the legacy exploratory table and labels that series `unverified_whisper_riva`.

The report is written to `benchmarks/results/codeswitch-baseline/report.md`, with per-utterance scores, slices, bootstrap confidence intervals, and paired significance tests alongside it. `run_asr.py` resumes provider output files without re-running successful rows. Its Gemini adapter accepts the same `GEMINI_API_KEY` / `GEMINI_API_KEYS` pool as the application.

## Prescription-safety extension

## Pilot recording protocol

1. Recruit consenting clinicians or CHEWs who naturally speak the tested language pair. Do not record patient names, histories, or other real clinical data.
2. Use at least three speakers for each language pair in the pilot. Include a mix of accents and voices rather than recording the entire set with one person.
3. Give each speaker the fixed reference sentence. Ask them to read it verbatim but at their normal dictation pace, including the English drug name, number, unit, and abbreviation.
4. Record with the same microphone and Chromium/Raspberry Pi setup used by the kiosk. Keep an untouched recording; do not denoise one provider's input differently from another's.
5. Record a quiet condition first. Add a separately labelled clinic-noise condition only after the quiet baseline works.
6. Listen back once and reject clips that are clipped, inaudible, interrupted, or do not match the reference. Do not alter the reference after seeing provider output.
7. Save each clip under `benchmarks/audio/` and add one manifest row per clip. Use anonymous speaker labels such as `speaker-01`; never use a clinician or patient name.

The five entries in `clinical-dictations.json` are starter prompts, not a statistically meaningful final dataset. For a pilot comparison, expand them to at least 3 speakers per language pair. Report the sample count and speaker count beside every result.

## Manifest fields

- `id`: unique anonymous sample identifier.
- `audio`: path relative to the manifest.
- `language`: `en`, `yo`, `pcm`, `ha`, or `ig`.
- `reference`: fixed verbatim words the speaker was asked to dictate.
- `drug`: exact expected drug phrase.
- `dose`: exact expected number and unit or device dose.
- `abbreviations`: exact expected abbreviations such as `TDS`, `BD`, or `PRN`.
- `speaker`, `condition`, and `device` may be added as metadata and will be preserved in the manifest, although they are not currently aggregation dimensions.

## Run

Keep provider keys in the server-side `.env`, never in a `VITE_` variable.

```bash
pnpm benchmark:asr -- --validate
pnpm benchmark:asr
```

Validation checks the complete manifest and every audio path before making paid API calls. A run invokes providers sequentially for each clip and applies a 60-second per-provider deadline. Override it with `ASR_BENCHMARK_TIMEOUT_MS` if needed.

The Markdown summary is printed and written to `benchmarks/results/latest.md`, both overall and split by language pair. The JSON report at `benchmarks/results/latest.json` retains every provider transcript, error, latency, and sample-level score for audit. The result directory and audio clips are git-ignored.

## Interpretation

- **Overall WER** measures the complete transcript and is sensitive to local-language orthography.
- **Drug WER / Dose WER** compare the expected clinical entity with the closest phrase in the transcript.
- **Drug exact / Dose exact** require the expected normalized phrase to be present.
- **Abbreviation accuracy** checks the exact abbreviation tokens independently.
- **Success** includes failed and timed-out requests in the denominator. Never rank models using only their successful requests.
- **p50/p95** are observed end-to-end provider latency for successful requests. Run on a stable connection and repeat before drawing performance conclusions.

Choose the provider primarily on drug, dose, and abbreviation preservation. Overall WER is supporting evidence, especially for code-switched syntax.
