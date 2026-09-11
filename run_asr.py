#!/usr/bin/env python3
"""
run_asr.py - transcribe the benchmark corpus with one model and write a
hypothesis CSV that codeswitch_eval.py can score.

    python run_asr.py --model sahara   --manifest manifest.csv --out hyps/sahara.csv
    python run_asr.py --model omniasr  --manifest manifest.csv --out hyps/omniasr.csv
    python run_asr.py --model gemini   --manifest manifest.csv --out hyps/gemini.csv
    python run_asr.py --model whisper  --manifest manifest.csv --out hyps/whisper.csv

Output columns: audio_id, hyp, latency_s, error

Resumable: re-running skips rows already present in --out, so an interrupted or
rate-limited run can be restarted without re-spending credits.

Use --model mock first to verify your manifest and paths wire up correctly
before spending anything.

Credentials, via environment variable:
    INTRON_API_KEY   voice.intron.io -> sign in -> Developers tab
    GEMINI_API_KEY   aistudio.google.com
(omniasr and whisper run locally, no key)
"""

import argparse
import base64
import csv
import re
import os
import sys
import time

# ---------------------------------------------------------------------------
# Language code mapping. Each backend names languages differently.
# ---------------------------------------------------------------------------

# Intron Sahara. Per docs.voice.intron.io/docs/stt/supported-languages there are
# exactly 12 code-switched codes, and the code IS the pair: `yo` means
# "Yoruba-English", not monolingual Yoruba. There is no -en suffix form; the API
# rejects one with HTTP 400. Leaving the default ("en") would benchmark the
# English model against code-switched audio.
SAHARA_CODESWITCHED = {"af", "ak", "am", "ha", "ig", "lg",
                       "pcm", "rw", "sw", "wo", "yo", "zu"}
# Monolingual codes are also valid; `fr` is French only (code-switched: x).
SAHARA_LANG = {c: c for c in SAHARA_CODESWITCHED}
SAHARA_LANG.update({"fr": "fr", "en": "en", "ar": "ar", "sn": "sn",
                    "st": "st", "tn": "tn", "tw": "tw", "xh": "xh"})

# Meta Omnilingual ASR uses ISO-639-3 + script. Verify against the package's own
# supported-language list before a full run; it ships a helper for this.
OMNI_LANG = {"yo": "yor_Latn", "ig": "ibo_Latn", "ha": "hau_Latn",
             "pcm": "pcm_Latn", "fr": "fra_Latn", "sw": "swh_Latn"}

# Whisper's language set does NOT include Igbo or Nigerian Pidgin. Passing None
# lets it auto-detect. Do not silently map them to English - the gap is a real
# finding about coverage, and forcing "en" would hide it.
WHISPER_LANG = {"yo": "yo", "ha": "ha", "fr": "fr", "sw": "sw",
                "ig": None, "pcm": None}

VERBATIM_PROMPT = (
    "Transcribe this audio exactly as spoken, word for word. "
    "The speaker mixes two languages within the same sentence. "
    "Write each word in the language it was actually spoken in - "
    "do NOT translate any part into English or into the other language. "
    "Preserve all diacritics and tone marks. "
    "Output only the transcript, with no commentary, labels or quotation marks."
)


# ---------------------------------------------------------------------------
# Adapters. Each returns a transcript string.
# ---------------------------------------------------------------------------

def make_sahara(args):
    import requests
    key = os.environ.get("INTRON_API_KEY")
    if not key:
        sys.exit("set INTRON_API_KEY (voice.intron.io -> Developers tab)")
    url = "https://infer.voice.intron.io/file/v1/upload/sync"

    def run(path, lang):
        form = {
            "audio_file_name": (None, os.path.basename(path)),
            "audio_file_blob": (os.path.basename(path), open(path, "rb"), "audio/wav"),
            "use_language_asr_input": (None, SAHARA_LANG.get(lang, lang)),
            # Off by default in the API. Leaving it off means Sahara's output
            # has had an LLM cleanup pass that the other models' has not.
            "use_disable_llm_corrections": (None, "FALSE" if args.sahara_llm else "TRUE"),
            # The API defaults this to file_category_telehealth. An undeclared
            # domain-specific post-processing category has no place in a
            # benchmark, so state it explicitly.
            "use_category": (None, args.sahara_category),
        }
        # fresh connection per call: a BAD_RECORD_MAC failure can poison a
        # pooled TLS connection and make every later call fail too
        with requests.Session() as s:
            r = s.post(url, headers={"Authorization": "Bearer %s" % key,
                                     "Connection": "close"},
                       files=form, timeout=180)
        if r.status_code == 429:
            raise RuntimeError("rate limited (30 req/min)")
        r.raise_for_status()
        return (r.json().get("data") or {}).get("audio_transcript", "") or ""

    return run


def make_gemini(args):
    import requests
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        sys.exit("set GEMINI_API_KEY (aistudio.google.com)")
    url = ("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent"
           % args.gemini_model)

    def run(path, lang):
        with open(path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode()
        body = {"contents": [{"parts": [
            {"text": VERBATIM_PROMPT},
            {"inline_data": {"mime_type": "audio/wav", "data": b64}}]}],
            "generationConfig": {"temperature": 0}}
        r = requests.post(url, headers={"x-goog-api-key": key,
                                        "Content-Type": "application/json"},
                          json=body, timeout=180)
        r.raise_for_status()
        cands = r.json().get("candidates") or []
        if not cands:
            return ""
        parts = cands[0].get("content", {}).get("parts", [])
        return " ".join(p.get("text", "") for p in parts).strip()

    return run


def make_whisper(args):
    from faster_whisper import WhisperModel
    model = WhisperModel(args.whisper_model, device=args.device,
                         compute_type="float16" if args.device == "cuda" else "int8")

    def run(path, lang):
        segs, _ = model.transcribe(path, language=WHISPER_LANG.get(lang, None),
                                   beam_size=5, vad_filter=False)
        return " ".join(s.text.strip() for s in segs).strip()

    return run


def make_omniasr(args):
    from omnilingual_asr.models.inference.pipeline import ASRInferencePipeline
    pipe = ASRInferencePipeline(model_card=args.omni_model)

    def run(path, lang):
        code = OMNI_LANG.get(lang)
        out = pipe.transcribe([path], lang=[code], batch_size=1)
        return (out[0] if out else "").strip()

    return run


# NaijaVox-V1 is a LoRA fine-tune of whisper-large-v3 on Nigerian languages. It
# extends Whisper's vocabulary with <|ig|> and <|pcm|> tokens, which base Whisper
# does not have, so it covers Igbo and Pidgin where the base model cannot.
NAIJAVOX_TOKEN = {"yo": "<|yo|>", "ha": "<|ha|>", "ig": "<|ig|>",
                  "pcm": "<|pcm|>", "en": "<|en|>"}


def _patch_naijavox_tokenizer(local_dir):
    """NaijaVox ships `extra_special_tokens` as a LIST in tokenizer_config.json.
    transformers expects a dict and calls .keys() on it, so loading crashes with
    AttributeError. Rewrite it as a dict, keeping the tokens themselves. Safe to
    run repeatedly."""
    import json
    cfg_path = os.path.join(local_dir, "tokenizer_config.json")
    if not os.path.exists(cfg_path):
        return
    with open(cfg_path, encoding="utf-8") as f:
        cfg = json.load(f)
    extra = cfg.get("extra_special_tokens")
    if isinstance(extra, list):
        fixed = {}
        for tok in extra:
            name = str(tok).strip("<>|").strip() or "extra_%d" % len(fixed)
            fixed["%s_token" % name] = tok
        cfg["extra_special_tokens"] = fixed
        with open(cfg_path, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
        print("Patched extra_special_tokens in %s (list -> dict): %s"
              % (cfg_path, ", ".join(extra)))


def make_naijavox(args):
    """Open-weight Nigerian fine-tune. Pairs with the base whisper run to
    isolate what local adaptation is worth, architecture held constant."""
    import soundfile as sf
    import torch
    from transformers import WhisperForConditionalGeneration, WhisperProcessor

    local = args.naijavox_local
    if not local:
        from huggingface_hub import snapshot_download
        ignore = [p.strip() for p in args.naijavox_ignore.split(",") if p.strip()]
        local = snapshot_download(args.naijavox_model,
                                  ignore_patterns=ignore or None)
    _patch_naijavox_tokenizer(local)

    try:
        proc = WhisperProcessor.from_pretrained(local)
    except Exception as e:
        # last resort: take the audio front end from base whisper, which is
        # identical, and only the tokenizer from the fine-tune
        print("Processor load failed (%s). Falling back to the base "
              "whisper-large-v3 feature extractor." % str(e)[:120])
        from transformers import WhisperFeatureExtractor, WhisperTokenizerFast
        fe = WhisperFeatureExtractor.from_pretrained("openai/whisper-large-v3")
        tk = WhisperTokenizerFast.from_pretrained(local)
        proc = WhisperProcessor(feature_extractor=fe, tokenizer=tk)

    model = WhisperForConditionalGeneration.from_pretrained(local)
    model.to(args.device).eval()
    transcribe_id = proc.tokenizer.convert_tokens_to_ids("<|transcribe|>")
    nots_id = proc.tokenizer.convert_tokens_to_ids("<|notimestamps|>")
    _warned = set()
    have = [t for t in NAIJAVOX_TOKEN.values()
            if proc.tokenizer.convert_tokens_to_ids(t) not in
            (None, proc.tokenizer.unk_token_id)]
    print("NaijaVox language tokens available: %s" % (", ".join(have) or "NONE"))

    def run(path, lang):
        audio, sr = sf.read(path)
        if sr != 16000:
            raise RuntimeError("expected 16 kHz; run prepare_audio.py first")
        feats = proc(audio, sampling_rate=16000,
                     return_tensors="pt").input_features.to(args.device)
        forced = None
        tok = NAIJAVOX_TOKEN.get(lang)
        if tok:
            tid = proc.tokenizer.convert_tokens_to_ids(tok)
            if tid is not None and tid != proc.tokenizer.unk_token_id:
                forced = [(1, tid), (2, transcribe_id), (3, nots_id)]
            elif tok not in _warned:
                _warned.add(tok)
                print("WARNING: %s is not in this tokenizer - falling back to "
                      "auto-detect for %s. Check you have the right checkpoint."
                      % (tok, lang))
        with torch.no_grad():
            ids = model.generate(feats, forced_decoder_ids=forced, max_new_tokens=200)
        return proc.batch_decode(ids, skip_special_tokens=True)[0].strip()

    return run


def make_naijalingo(args):
    """9jaLingo ASR SDK: pip install naijalingo-asr[audio]"""
    from naijalingo_asr import transcribe as nl_transcribe

    def run(path, lang):
        code = lang if lang in ("yo", "ig", "ha", "en") else "en"
        return (nl_transcribe(path, language=code) or "").strip()

    return run


# NVIDIA NIM serves Whisper behind an OpenAI-compatible transcription endpoint.
# Same weights as --model whisper, but hosted, so no 3 GB download and no local
# GPU. `multi` asks for auto language detection, which is the only option for
# languages outside Whisper's list, such as Igbo.
NIM_LANG = {"yo": "yo", "ha": "ha", "fr": "fr", "sw": "sw",
            "ig": "multi", "pcm": "multi"}


def make_nim(args):
    import requests
    key = os.environ.get("NVIDIA_API_KEY")
    if not key and "://0.0.0.0" not in args.nim_url and "localhost" not in args.nim_url:
        sys.exit("set NVIDIA_API_KEY (build.nvidia.com). Not needed for a "
                 "locally hosted NIM container.")
    headers = {"Authorization": "Bearer %s" % key} if key else {}

    def run(path, lang):
        with open(path, "rb") as f:
            files = {"file": (os.path.basename(path), f, "audio/wav")}
            data = {"language": NIM_LANG.get(lang, "multi")}
            with requests.Session() as s:
                r = s.post(args.nim_url, headers=headers, files=files,
                           data=data, timeout=180)
        if r.status_code >= 400:
            raise RuntimeError("HTTP %d: %s" % (r.status_code, r.text[:200]))
        try:
            j = r.json()
        except ValueError:
            return r.text.strip()
        # OpenAI shape is {"text": ...}; Riva variants nest it differently
        if isinstance(j, dict):
            if "text" in j:
                return (j["text"] or "").strip()
            for k in ("transcript", "transcription"):
                if k in j:
                    return (j[k] or "").strip()
            res = j.get("results") or j.get("data")
            if isinstance(res, list) and res:
                first = res[0]
                if isinstance(first, dict):
                    return (first.get("text") or first.get("transcript") or "").strip()
        raise RuntimeError("unrecognised response shape: %s" % str(j)[:200])

    return run


# NVIDIA's HOSTED speech models (build.nvidia.com) are served over gRPC through
# NVIDIA Cloud Functions, NOT over the REST /v1/audio/transcriptions path. That
# REST path exists only on a self-hosted NIM container - see make_nim above.
# Each model has its own function-id, shown on its API page.
# Riva's Whisper takes bare two-letter codes (en, fr), per the model's API page,
# and follows Whisper's own language set. So yo and ha can be forced explicitly,
# matching the local --model whisper run. Igbo and Pidgin are not in Whisper's
# set at all, so `multi` (auto-detect) is the only option there.
RIVA_LANG = {"yo": "yo", "ha": "ha", "fr": "fr", "en": "en", "sw": "sw",
             "ig": "multi", "pcm": "multi"}


def make_riva(args):
    """Hosted NVIDIA Riva/NVCF ASR.  pip install nvidia-riva-client

    Whisper on Riva takes `multi` for automatic language detection, which is the
    honest setting for African languages here: Riva does not document per-language
    codes for Yoruba, Igbo or Hausa, and inventing one would silently fall back to
    something else. Override with --riva-language if their docs say otherwise.
    """
    fid = args.riva_function_id.strip()
    if not re.fullmatch(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}"
                        r"-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", fid):
        sys.exit("--riva-function-id must be a UUID like "
                 "c367545c-964a-42b1-b16f-40c262ae3646, got %r.\n"
                 "Open the model on build.nvidia.com, click API Reference, and "
                 "copy the value after --metadata function-id in the sample "
                 "command." % (fid or "<empty>"))
    args.riva_function_id = fid

    import riva.client
    key = os.environ.get("NVIDIA_API_KEY")
    meta = [["function-id", args.riva_function_id]]
    if key:
        meta.append(["authorization", "Bearer %s" % key])
    elif "nvcf" in args.riva_server:
        sys.exit("set NVIDIA_API_KEY for the hosted endpoint")

    auth = riva.client.Auth(uri=args.riva_server,
                            use_ssl=not args.riva_no_ssl,
                            metadata_args=meta)
    service = riva.client.ASRService(auth)

    def run(path, lang):
        with open(path, "rb") as f:
            audio = f.read()
        code = args.riva_language or RIVA_LANG.get(lang, "multi")
        cfg = riva.client.RecognitionConfig(
            language_code=code,
            max_alternatives=1,
            enable_automatic_punctuation=True,
        )
        resp = service.offline_recognize(audio, cfg)
        parts = [r.alternatives[0].transcript
                 for r in resp.results if r.alternatives]
        return " ".join(p.strip() for p in parts).strip()

    return run


def make_mock(args):
    def run(path, lang):
        return "mock transcript for %s in %s" % (os.path.basename(path), lang)
    return run


ADAPTERS = {"sahara": make_sahara, "gemini": make_gemini,
            "whisper": make_whisper, "omniasr": make_omniasr,
            "naijavox": make_naijavox, "naijalingo": make_naijalingo,
            "nim": make_nim, "riva": make_riva,
            "mock": make_mock}


# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True, choices=sorted(ADAPTERS))
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--rate-limit", type=float, default=0.0,
                    help="Minimum seconds between calls. Sahara caps at 30/min, "
                         "so use 2.1 there.")
    ap.add_argument("--retries", type=int, default=3)
    ap.add_argument("--limit", type=int, default=0, help="Stop after N files (smoke test).")
    ap.add_argument("--sahara-llm", action="store_true",
                    help="Leave Sahara's LLM post-correction ON. Off by default "
                         "so the comparison is raw ASR against raw ASR.")
    ap.add_argument("--sahara-category", default="file_category_general",
                    help="Sahara post-processing category. The API defaults to "
                         "file_category_telehealth; general is the neutral choice "
                         "for a benchmark.")
    ap.add_argument("--gemini-model", default="gemini-2.5-flash")
    ap.add_argument("--whisper-model", default="large-v3")
    ap.add_argument("--riva-server", default="grpc.nvcf.nvidia.com:443",
                    help="Hosted default. Use 0.0.0.0:50051 for a local NIM.")
    ap.add_argument("--riva-function-id", default="",
                    help="Per-model UUID from the model's API Reference page.")
    ap.add_argument("--riva-language", default="",
                    help="Force one Riva language code for every row, e.g. multi.")
    ap.add_argument("--riva-no-ssl", action="store_true",
                    help="For a local NIM container without TLS.")
    ap.add_argument("--nim-url",
                    default="http://0.0.0.0:9000/v1/audio/transcriptions",
                    help="NIM transcription endpoint. Default is a locally "
                         "hosted container. For the build.nvidia.com hosted "
                         "endpoint, take the URL from that model page's API "
                         "Reference tab.")
    ap.add_argument("--omni-model", default="omniASR_LLM_1B")
    ap.add_argument("--naijavox-model", default="Axiveri/NaijaVox-V1")
    ap.add_argument("--naijavox-ignore",
                    default="audio_samples/*,*.png,*.jpg,*.gif",
                    help="Comma-separated glob patterns to skip when downloading. "
                         "Add whisper-finetune/* if the root holds a merged model, "
                         "to avoid pulling redundant LoRA weights. Empty string "
                         "downloads everything.")
    ap.add_argument("--naijavox-local", default="",
                    help="Path to an already-downloaded checkpoint directory, "
                         "to skip the hub download.")
    ap.add_argument("--device", default="cpu", choices=["cpu", "cuda"])
    args = ap.parse_args()

    if args.model == "sahara":
        langs = {r.get("matrix_lang", "").strip() for r in
                 __import__("csv").DictReader(open(args.manifest, encoding="utf-8-sig"))}
        mono = sorted(l for l in langs if l and l not in SAHARA_CODESWITCHED)
        if mono:
            print("NOTE: %s not on Sahara's code-switched list - those rows are "
                  "transcribed by a monolingual model. Expected for a control "
                  "arm; check it is what you intended." % ", ".join(mono))
    if args.model == "sahara" and args.rate_limit == 0.0:
        args.rate_limit = 2.1
        print("Sahara caps at 30 req/min - throttling to one call every 2.1s.")

    with open(args.manifest, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        sys.exit("empty manifest")

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    done = {}
    if os.path.exists(args.out):
        with open(args.out, encoding="utf-8-sig", newline="") as f:
            for r in csv.DictReader(f):
                if not (r.get("error") or "").strip():
                    done[r["audio_id"]] = r
        print("Resuming: %d row(s) already transcribed in %s" % (len(done), args.out))

    todo = [r for r in rows if r["audio_id"] not in done]
    if args.limit:
        todo = todo[:args.limit]
    if not todo:
        print("Nothing to do.")
        return

    transcribe = ADAPTERS[args.model](args)
    results = dict(done)
    last = 0.0
    t_start = time.time()

    def save():
        with open(args.out, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=["audio_id", "hyp", "latency_s", "error"])
            w.writeheader()
            for r in rows:
                if r["audio_id"] in results:
                    w.writerow(results[r["audio_id"]])

    for i, row in enumerate(todo, 1):
        aid, path = row["audio_id"], row["audio_path"]
        lang = row.get("matrix_lang", "").strip()
        if not os.path.exists(path):
            results[aid] = {"audio_id": aid, "hyp": "", "latency_s": "",
                            "error": "missing audio: %s" % path}
            print("[%d/%d] %s  MISSING %s" % (i, len(todo), aid, path))
            continue

        hyp, err, lat = "", "", ""
        for attempt in range(1, args.retries + 1):
            wait = args.rate_limit - (time.time() - last)
            if wait > 0:
                time.sleep(wait)
            t0 = time.time()
            try:
                hyp = transcribe(path, lang)
                lat = "%.2f" % (time.time() - t0)
                last = time.time()
                err = ""
                break
            except Exception as e:
                last = time.time()
                err = "%s: %s" % (type(e).__name__, str(e)[:200])
                if attempt < args.retries:
                    back = 2 ** attempt
                    print("    retry %d/%d in %ds (%s)" % (attempt, args.retries, back, err))
                    time.sleep(back)

        results[aid] = {"audio_id": aid, "hyp": hyp, "latency_s": lat, "error": err}
        flag = "ERR " if err else "    "
        print("[%d/%d] %s%s  %ss  %s" % (i, len(todo), flag, aid, lat or "-", hyp[:60]))

        if i % 10 == 0:
            save()

    save()

    lats = [float(r["latency_s"]) for r in results.values() if r.get("latency_s")]
    errs = [r for r in results.values() if r.get("error")]
    print("\n%s: %d/%d transcribed in %.0fs" % (args.model, len(results) - len(errs),
                                                len(rows), time.time() - t_start))
    if lats:
        lats.sort()
        print("Latency: median %.2fs, p95 %.2fs" % (lats[len(lats)//2],
                                                    lats[int(0.95*(len(lats)-1))]))
    if errs:
        print("%d row(s) still failing - re-run to retry just those:" % len(errs))
        for r in errs[:5]:
            print("  %s  %s" % (r["audio_id"], r["error"]))


if __name__ == "__main__":
    main()