#!/usr/bin/env python3
"""
link_audio.py - match a folder of recordings to manifest rows and give them
canonical filenames.

Dry-run by default: it proposes a mapping and writes it to CSV for you to check.
Nothing is renamed or moved until you pass --apply, and even then it COPIES
rather than moves, so the originals stay untouched.

Two matching modes:
  --by name    (default) fuzzy-match the filename against the `category` column
  --by number  use a leading number in the filename as the sentence number

    # look at what it proposes
    python link_audio.py --manifest manifest.csv --audio-dir "Voices/yo_phrases" \\
        --lang yo --map-out yo_mapping.csv

    # check yo_mapping.csv by hand, fix any wrong rows, then
    python link_audio.py --manifest manifest.csv --audio-dir "Voices/yo_phrases" \\
        --lang yo --map-out yo_mapping.csv --apply --out-dir audio \\
        --manifest-out manifest_linked.csv
"""

import argparse
import csv
import difflib
import os
import re
import shutil
import sys

STOP = {"or", "and", "the", "a", "of", "wav", "final", "take", "v1", "v2"}

# Everything ffmpeg can read downstream. Keep in step with prepare_audio.py.
AUDIO_EXT = (".wav", ".flac", ".aiff", ".aif", ".caf",
             ".m4a", ".mp3", ".aac", ".ogg", ".opus", ".wma", ".amr",
             ".3gp", ".mp4", ".mov")


def tokens(s):
    s = re.sub(r"\.wav$", "", s, flags=re.I)
    parts = re.split(r"[^0-9A-Za-z]+", s.lower())
    return {p for p in parts if p and p not in STOP and not p.isdigit()}


def score(fname, category):
    a, b = tokens(fname), tokens(category)
    if not a or not b:
        return 0.0
    jac = len(a & b) / float(len(a | b))
    seq = difflib.SequenceMatcher(None, " ".join(sorted(a)), " ".join(sorted(b))).ratio()
    return 0.7 * jac + 0.3 * seq


def leading_number(fname):
    m = re.match(r"^\s*(\d+)", os.path.basename(fname))
    return int(m.group(1)) if m else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--audio-dir", required=True)
    ap.add_argument("--lang", required=True, help="matrix_lang of the rows to match")
    ap.add_argument("--by", default="name", choices=["name", "number"])
    ap.add_argument("--map-out", required=True)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--out-dir", default="audio")
    ap.add_argument("--manifest-out", default="")
    ap.add_argument("--min-score", type=float, default=0.30)
    args = ap.parse_args()

    with open(args.manifest, encoding="utf-8-sig", newline="") as f:
        manifest = list(csv.DictReader(f))
    targets = [r for r in manifest if r.get("matrix_lang", "").strip() == args.lang]
    if not targets:
        sys.exit("no manifest rows with matrix_lang=%s" % args.lang)

    files = sorted(fn for fn in os.listdir(args.audio_dir)
                   if fn.lower().endswith(AUDIO_EXT))
    if not files:
        sys.exit("no audio files in %s" % args.audio_dir)

    print("%d file(s) vs %d manifest row(s) for '%s'\n" % (len(files), len(targets), args.lang))

    # ---- propose a mapping
    pairs, used = [], set()
    for fn in files:
        best, best_s = None, 0.0
        if args.by == "number":
            num = leading_number(fn)
            for r in targets:
                if num is not None and leading_number(r["audio_id"].split("_", 1)[-1]) == num:
                    best, best_s = r, 1.0
                    break
            if best is None:
                for r in targets:
                    sid = r.get("sentence_id") or r["audio_id"]
                    m = re.search(r"(\d+)", sid)
                    if m and num is not None and int(m.group(1)) == num:
                        best, best_s = r, 1.0
                        break
        else:
            for r in targets:
                s = score(fn, r.get("category", ""))
                if s > best_s:
                    best, best_s = r, s
        pairs.append({"file": fn, "audio_id": best["audio_id"] if best else "",
                      "category": best.get("category", "") if best else "",
                      "score": round(best_s, 3),
                      "status": ""})
        if best:
            used.add(best["audio_id"])

    # ---- flag problems
    seen = {}
    for p in pairs:
        if not p["audio_id"] or p["score"] < args.min_score:
            p["status"] = "NO MATCH - fill in audio_id by hand"
        elif p["audio_id"] in seen:
            p["status"] = "DUPLICATE of %s - one is wrong" % seen[p["audio_id"]]
        else:
            seen[p["audio_id"]] = p["file"]
            p["status"] = "ok" if p["score"] >= 0.6 else "LOW CONFIDENCE - check"

    unmatched = [r["audio_id"] for r in targets if r["audio_id"] not in seen]

    # Only (re)write the proposal when we are NOT about to apply an existing one.
    # Overwriting here would silently discard any audio_id the user edited by
    # hand, which is the whole point of the review step.
    reuse = args.apply and os.path.exists(args.map_out)
    if reuse:
        print("Using the existing %s, including any edits you made. "
              "Delete it to regenerate from scratch.\n" % args.map_out)
    else:
        with open(args.map_out, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=["file", "audio_id", "category",
                                              "score", "status"])
            w.writeheader()
            w.writerows(pairs)

    for p in pairs:
        mark = "  " if p["status"] == "ok" else "! "
        print("%s%-34s -> %-8s %-22s %.2f  %s"
              % (mark, p["file"][:34], p["audio_id"], p["category"][:22],
                 p["score"], "" if p["status"] == "ok" else p["status"]))

    if not reuse:
        print("\nWrote proposed mapping to %s" % args.map_out)
    if unmatched:
        print("\n%d manifest row(s) have NO recording: %s"
              % (len(unmatched), ", ".join(unmatched)))
    bad = [p for p in pairs if p["status"] != "ok"]
    if bad:
        print("%d row(s) need your attention before --apply" % len(bad))

    if not args.apply:
        print("\nDry run. Check the mapping, correct any audio_id by hand, then "
              "re-run with --apply to copy the files into place.")
        return

    # ---- apply, reading back the (possibly hand-corrected) mapping
    with open(args.map_out, encoding="utf-8-sig", newline="") as f:
        approved = {r["file"]: r["audio_id"].strip() for r in csv.DictReader(f)
                    if r["audio_id"].strip()}

    # Two files sharing one audio_id would silently overwrite each other at the
    # same destination path, leaving whichever sorted last and losing the other
    # without a word. Refuse rather than guess.
    owners = {}
    for fn, aid in approved.items():
        owners.setdefault(aid, []).append(fn)
    clashes = {a: fs for a, fs in owners.items() if len(fs) > 1}
    if clashes:
        print("\nREFUSING TO APPLY - %d audio_id(s) claimed by more than one file:"
              % len(clashes))
        for aid, fs in sorted(clashes.items()):
            print("  %s" % aid)
            for fn in fs:
                print("      %s" % fn)
        print("\nOpen %s, blank the audio_id cell on the row(s) you do not want, "
              "then re-run. Nothing has been copied." % args.map_out)
        sys.exit(1)

    os.makedirs(args.out_dir, exist_ok=True)
    copied = {}
    for fn, aid in approved.items():
        src = os.path.join(args.audio_dir, fn)
        dst = os.path.join(args.out_dir, aid + os.path.splitext(fn)[1].lower())
        shutil.copy2(src, dst)          # copy, never move
        copied[aid] = dst
    print("\nCopied %d file(s) into %s (originals untouched)" % (len(copied), args.out_dir))

    if args.manifest_out:
        for r in manifest:
            if r["audio_id"] in copied:
                r["audio_path"] = copied[r["audio_id"]]
        with open(args.manifest_out, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(manifest[0].keys()))
            w.writeheader()
            w.writerows(manifest)
        print("Wrote %s with audio_path filled in." % args.manifest_out)


if __name__ == "__main__":
    main()