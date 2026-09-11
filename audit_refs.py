#!/usr/bin/env python3
"""
audit_refs.py - find clips whose audio is too short to contain the reference.

Speech runs roughly 2.5-4 words per second. A clip lasting far less than its
reference implies almost certainly does not contain the whole sentence - which
is what happens when a speaker reads only part of a script, or renders a
code-switched line entirely in one language.

This is a screen, not proof. It tells you which clips to listen to first.

    python audit_refs.py --manifest manifest.csv
    python audit_refs.py --manifest manifest.csv --hyp hyps/sahara.csv
"""

import argparse
import csv
import sys

SEC_PER_WORD_FAST = 0.22   # very fast speech
SEC_PER_WORD_TYPICAL = 0.35


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--hyp", default="",
                    help="Optional hypothesis CSV. Comparing transcript length "
                         "to reference length is a second, independent signal.")
    ap.add_argument("--ratio", type=float, default=0.65,
                    help="Flag when actual duration is below this fraction of "
                         "the fastest plausible duration.")
    args = ap.parse_args()

    with open(args.manifest, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    hyp = {}
    if args.hyp:
        with open(args.hyp, encoding="utf-8-sig", newline="") as f:
            hyp = {r["audio_id"]: r.get("hyp", "") for r in csv.DictReader(f)}

    by_lang = {}
    flagged = []
    for r in rows:
        try:
            dur = float(r.get("duration_s") or 0)
        except ValueError:
            dur = 0.0
        n = len((r.get("ref") or "").split())
        if not dur or not n:
            continue
        floor = n * SEC_PER_WORD_FAST
        ratio = dur / floor if floor else 0
        lang = (r.get("matrix_lang") or "?").strip()
        d = by_lang.setdefault(lang, {"n": 0, "flag": 0, "wps": []})
        d["n"] += 1
        d["wps"].append(n / dur)
        rec = {"audio_id": r["audio_id"], "lang": lang, "words": n,
               "dur": dur, "ratio": ratio,
               "hyp_words": len(hyp.get(r["audio_id"], "").split()) if hyp else None}
        if ratio < args.ratio:
            d["flag"] += 1
            flagged.append(rec)

    print("%-6s %6s %8s %14s   %s" % ("lang", "n", "flagged", "median wd/s",
                                      "reading"))
    for lang, d in sorted(by_lang.items()):
        w = sorted(d["wps"])
        med = w[len(w) // 2]
        note = ("plausible" if med <= 4.5 else
                "TOO FAST - audio likely shorter than the reference text")
        print("%-6s %6d %8d %14.1f   %s" % (lang, d["n"], d["flag"], med, note))

    if flagged:
        print("\n%d clip(s) too short for their reference - listen to these "
              "first:" % len(flagged))
        flagged.sort(key=lambda x: x["ratio"])
        for f_ in flagged[:25]:
            extra = ""
            if f_["hyp_words"] is not None:
                extra = "  transcript %d wd" % f_["hyp_words"]
            print("  %-10s %-4s %2d words in %.2fs  (%.0f%% of the fastest "
                  "plausible time)%s" % (f_["audio_id"], f_["lang"], f_["words"],
                                         f_["dur"], 100 * f_["ratio"], extra))
    else:
        print("\nNo clip is implausibly short for its reference.")

    # ---- reference-independent check -------------------------------------
    # Your references are under suspicion, so compare the MODEL OUTPUT to the
    # audio duration instead. A transcript far too short for the audio means the
    # model dropped content, whatever the reference says.
    if hyp:
        print("\n--- model output vs audio duration (does not use the reference) ---")
        per_lang = {}
        short = []
        for r in rows:
            try:
                dur = float(r.get("duration_s") or 0)
            except ValueError:
                continue
            if not dur:
                continue
            hw = len(hyp.get(r["audio_id"], "").split())
            lang = (r.get("matrix_lang") or "?").strip()
            per_lang.setdefault(lang, []).append(hw / dur)
            if hw / dur < 1.2:
                short.append((r["audio_id"], lang, hw, dur))
        print("%-6s %16s   %s" % ("lang", "median out wd/s", "reading"))
        for lang, v in sorted(per_lang.items()):
            v.sort()
            med = v[len(v) // 2]
            note = ("plausible" if med >= 1.8 else
                    "SPARSE - model is emitting far less than the audio holds")
            print("%-6s %16.1f   %s" % (lang, med, note))
        if short:
            short.sort(key=lambda x: x[2] / x[3])
            print("\n%d clip(s) where the transcript is sparse for the audio:"
                  % len(short))
            for aid, lang, hw, dur in short[:15]:
                print("  %-10s %-4s %2d words for %.2fs of audio"
                      % (aid, lang, hw, dur))

    print("\nA median above ~4.5 words/second means the audio cannot contain "
          "everything the reference claims. Treat that language's references as "
          "unverified until you have listened.")


if __name__ == "__main__":
    main()