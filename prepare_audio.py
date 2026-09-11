#!/usr/bin/env python3
"""
prepare_audio.py - normalise a recording folder into the canonical benchmark
format, QC it, and emit a manifest skeleton.

Converts everything to 16 kHz / mono / 16-bit PCM WAV, then reports duration,
peak level, clipping, and an estimated SNR per file so you can populate the
`snr_db` and `noise_condition` columns honestly instead of guessing.

Requires ffmpeg on PATH. No Python dependencies beyond the standard library.

Usage:
    python prepare_audio.py --in raw/ --out audio/ --manifest manifest_skeleton.csv

Then fill in ref, ref_lang, matrix_lang and the rest by hand.
"""

import argparse
import array
import csv
import math
import os
import shutil
import subprocess
import sys
import wave

TARGET_SR = 16000
FRAME_MS = 20

LOSSY_EXT = {".mp3", ".m4a", ".aac", ".ogg", ".opus", ".wma", ".amr", ".3gp"}
AUDIO_EXT = LOSSY_EXT | {".wav", ".flac", ".aiff", ".aif", ".caf", ".mp4", ".mov"}


def have_ffmpeg():
    return shutil.which("ffmpeg") is not None


def codec_roundtrip(path, spec):
    """Re-encode through a lossy codec and back, so every arm of the corpus has
    the same compression history. Use when one language was recorded as m4a and
    the rest as wav: without this, a cross-language WER gap could be the codec
    rather than the language."""
    codec, _, rate = spec.partition(":")
    rate = rate or "64k"
    tmp = dst_tmp = path + ".tmp." + ("m4a" if codec == "aac" else codec)
    r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", path,
                        "-c:a", {"aac": "aac", "opus": "libopus", "mp3": "libmp3lame"}[codec],
                        "-b:a", rate, tmp], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError("codec encode failed: %s" % r.stderr.strip()[:200])
    r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp,
                        "-ac", "1", "-ar", str(TARGET_SR), "-c:a", "pcm_s16le",
                        "-map_metadata", "-1", path], capture_output=True, text=True)
    os.remove(dst_tmp)
    if r.returncode != 0:
        raise RuntimeError("codec decode failed: %s" % r.stderr.strip()[:200])


def convert(src, dst):
    """Downmix to mono, resample to 16 kHz, write signed 16-bit PCM.
    No filters, no normalisation, no noise reduction - deliberately."""
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", src,
           "-ac", "1", "-ar", str(TARGET_SR), "-c:a", "pcm_s16le",
           "-map_metadata", "-1", dst]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError("ffmpeg failed on %s: %s" % (src, r.stderr.strip()[:300]))


def read_pcm(path):
    with wave.open(path, "rb") as w:
        if w.getsampwidth() != 2 or w.getnchannels() != 1:
            raise RuntimeError("expected mono 16-bit: %s" % path)
        sr = w.getframerate()
        raw = w.readframes(w.getnframes())
    a = array.array("h")
    a.frombytes(raw)
    if sys.byteorder == "big":
        a.byteswap()
    return a, sr


def analyse(samples, sr):
    """Duration, peak dBFS, clipping count, and a percentile-based SNR estimate.

    SNR here is the ratio of the 95th-percentile frame energy (speech) to the
    10th-percentile frame energy (background). It is an estimate, not a
    calibrated measurement - good enough to bucket clips into quiet / moderate /
    noisy, which is all the manifest needs."""
    n = len(samples)
    if n == 0:
        return 0.0, float("-inf"), 0, float("nan")
    dur = n / float(sr)
    peak = max(abs(s) for s in samples)
    clipped = sum(1 for s in samples if abs(s) >= 32700)
    peak_db = 20 * math.log10(peak / 32768.0) if peak else float("-inf")

    fl = int(sr * FRAME_MS / 1000)
    energies = []
    for i in range(0, n - fl + 1, fl):
        acc = 0
        for j in range(i, i + fl):
            acc += samples[j] * samples[j]
        energies.append(acc / float(fl))
    if len(energies) < 10:
        return dur, peak_db, clipped, float("nan")
    energies.sort()
    hi = energies[int(0.95 * (len(energies) - 1))]
    lo = energies[int(0.10 * (len(energies) - 1))]
    if lo <= 0 or hi <= 0:
        return dur, peak_db, clipped, float("nan")
    return dur, peak_db, clipped, 10 * math.log10(hi / lo)


def noise_bucket(snr):
    if snr != snr:
        return ""
    if snr < 10:
        return "noisy"
    if snr < 20:
        return "moderate"
    return "quiet"


MANIFEST_COLS = ["audio_id", "audio_path", "ref", "ref_lang", "matrix_lang",
                 "language_pair", "domain", "accent", "country", "device_type",
                 "noise_condition", "snr_db", "speaker_id", "duration_s"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="indir", required=True)
    ap.add_argument("--out", dest="outdir", default="audio")
    ap.add_argument("--manifest", default="manifest_skeleton.csv",
                    help="Where to write the manifest skeleton (new corpus).")
    ap.add_argument("--update-manifest", default="",
                    help="Existing manifest to UPDATE in place of writing a "
                         "skeleton. Fills audio_path, duration_s, snr_db and "
                         "noise_condition for rows whose audio_id matches, and "
                         "leaves every other column alone.")
    ap.add_argument("--codec-match", default="",
                    help="Put EVERY file through the same lossy round trip, e.g. "
                         "'aac:64k'. Use when one language arrived as m4a and the "
                         "others as wav, so codec history stops being a confound "
                         "in cross-language comparisons.")
    ap.add_argument("--matrix-lang", default="",
                    help="Prefill matrix_lang for every file, e.g. yo. Use one "
                         "run per language folder.")
    args = ap.parse_args()

    if not have_ffmpeg():
        sys.exit("ffmpeg not found on PATH. Install it first "
                 "(apt install ffmpeg / brew install ffmpeg).")

    os.makedirs(args.outdir, exist_ok=True)
    srcs = []
    for root, _, files in os.walk(args.indir):
        for fn in sorted(files):
            if os.path.splitext(fn)[1].lower() in AUDIO_EXT:
                srcs.append(os.path.join(root, fn))
    if not srcs:
        sys.exit("no audio found under %s" % args.indir)

    rows, warnings = [], []
    lossy = 0
    for src in srcs:
        aid = os.path.splitext(os.path.basename(src))[0]
        dst = os.path.join(args.outdir, aid + ".wav")
        ext = os.path.splitext(src)[1].lower()
        if ext in LOSSY_EXT:
            lossy += 1
        try:
            convert(src, dst)
            if args.codec_match:
                codec_roundtrip(dst, args.codec_match)
            samples, sr = read_pcm(dst)
            dur, peak_db, clipped, snr = analyse(samples, sr)
        except RuntimeError as e:
            warnings.append("SKIP  %s: %s" % (aid, e))
            continue

        if clipped > 0:
            warnings.append("CLIP  %s: %d clipped samples - re-record if you can"
                            % (aid, clipped))
        if dur < 1.5:
            warnings.append("SHORT %s: %.1fs - too short to carry a switch point"
                            % (aid, dur))
        if dur > 30:
            warnings.append("LONG  %s: %.1fs - split it; some APIs cap duration"
                            % (aid, dur))
        if peak_db < -30:
            warnings.append("QUIET %s: peak %.1f dBFS - very low level" % (aid, peak_db))

        row = dict.fromkeys(MANIFEST_COLS, "")
        row.update({"audio_id": aid, "audio_path": dst,
                    "matrix_lang": args.matrix_lang,
                    "duration_s": "%.2f" % dur,
                    "snr_db": "" if snr != snr else "%.1f" % snr,
                    "noise_condition": noise_bucket(snr)})
        rows.append(row)

    if args.update_manifest:
        with open(args.update_manifest, encoding="utf-8-sig", newline="") as f:
            existing = list(csv.DictReader(f))
            cols = list(existing[0].keys()) if existing else MANIFEST_COLS
        by_id = {r["audio_id"]: r for r in rows}
        hit = 0
        for r in existing:
            u = by_id.get(r["audio_id"])
            if not u:
                continue
            hit += 1
            for k in ("audio_path", "duration_s", "snr_db", "noise_condition"):
                if k in r:
                    r[k] = u[k]
        with open(args.update_manifest, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
            w.writeheader()
            w.writerows(existing)
        args.manifest = args.update_manifest
        missing = len(existing) - hit
        print("Updated %d row(s) in %s%s" % (hit, args.update_manifest,
              " (%d row still has no audio)" % missing if missing else ""))
    else:
        with open(args.manifest, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=MANIFEST_COLS)
            w.writeheader()
            w.writerows(rows)

    total = sum(float(r["duration_s"]) for r in rows)
    print("Converted %d file(s) to %s (16 kHz mono 16-bit PCM)%s"
          % (len(rows), args.outdir,
             " via %s round trip" % args.codec_match if args.codec_match else ""))
    print("Total audio: %.1f min. Mean clip length: %.1fs"
          % (total / 60.0, total / len(rows) if rows else 0))
    buckets = {}
    for r in rows:
        buckets[r["noise_condition"] or "unknown"] = buckets.get(r["noise_condition"] or "unknown", 0) + 1
    print("Noise conditions: " + ", ".join("%s=%d" % kv for kv in sorted(buckets.items())))
    if lossy:
        print("\nNOTE: %d source file(s) were already lossy (mp3/m4a/opus). The "
              "compression cannot be undone. That is fine if it matches your "
              "deployment channel - label device_type accordingly - but do not "
              "mix lossy and lossless sources within the same condition."
              % lossy)
    if warnings:
        print("\nQC warnings (%d):" % len(warnings))
        for wmsg in warnings:
            print("  " + wmsg)
    if args.update_manifest:
        print("\n%s is ready. Next: correct each `ref` to match what the speaker "
              "actually said, then run run_asr.py." % args.manifest)
    else:
        print("\nWrote %s. Fill in ref, ref_lang, matrix_lang, domain, accent, "
              "country, device_type, speaker_id by hand." % args.manifest)


if __name__ == "__main__":
    main()