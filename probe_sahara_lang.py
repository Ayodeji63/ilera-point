#!/usr/bin/env python3
"""
probe_sahara_lang.py - find out which parameter value selects Sahara's
code-switched model rather than its monolingual African-language model.

Intron publishes "Language Mixing (code-switched ASR)" and "African Languages
(monolingual ASR)" as separate benchmark tracks, which implies separate models.
If `use_language_asr_input=yo` selects the monolingual Yoruba model, it will
render English spans in Yoruba orthography and your benchmark measures the wrong
system. This script sends ONE file under several candidate settings and prints
what comes back, so you can see which one preserves English.

Pick a clip whose reference contains obvious English words.

    export INTRON_API_KEY=...
    python probe_sahara_lang.py --audio audio/yo_01.wav --lang yo \\
        --expect-english "malaria symptoms"

Read the output: whichever setting returns recognisable English is the
code-switched path. Then set SAHARA_LANG in run_asr.py accordingly.
"""

import argparse
import os
import re
import sys
import time

URL = "https://infer.voice.intron.io/file/v1/upload/sync"


def call(key, path, lang_value, extra_fields, disable_llm=True, retries=4):
    """One request, with retries. BAD_RECORD_MAC is a corrupted TLS record and
    tends to poison a pooled connection, so each attempt opens a fresh session
    and asks the server to close it afterwards rather than reusing it."""
    import requests
    last = ""
    for attempt in range(1, retries + 1):
        form = {
            "audio_file_name": (None, os.path.basename(path)),
            "audio_file_blob": (os.path.basename(path), open(path, "rb"), "audio/wav"),
            "use_language_asr_input": (None, lang_value),
            "use_disable_llm_corrections": (None, "TRUE" if disable_llm else "FALSE"),
        }
        for k, v in (extra_fields or {}).items():
            form[k] = (None, v)
        try:
            with requests.Session() as s:
                r = s.post(URL, headers={"Authorization": "Bearer %s" % key,
                                         "Connection": "close"},
                           files=form, timeout=180)
            if r.status_code >= 400:
                # a 4xx is a real answer about the parameter, not a transport
                # failure - return it rather than burning retries on it
                return None, "HTTP %d: %s" % (r.status_code, r.text[:220])
            try:
                return (r.json().get("data") or {}).get("audio_transcript", ""), ""
            except ValueError:
                return None, "non-JSON response: %s" % r.text[:220]
        except Exception as e:
            last = "%s: %s" % (type(e).__name__, str(e)[:120])
            if attempt < retries:
                time.sleep(2 ** attempt)
    return None, "gave up after %d attempts - %s" % (retries, last)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True)
    ap.add_argument("--lang", required=True, help="base code, e.g. yo")
    ap.add_argument("--expect-english", default="",
                    help="English words you know are in this clip, space separated")
    ap.add_argument("--rate-limit", type=float, default=2.2)
    ap.add_argument("--values", default="",
                    help="Comma-separated language codes to test instead of the "
                         "full sweep, e.g. 'yo-en,yo'. Use to retest a candidate "
                         "that failed on transport rather than being rejected.")
    ap.add_argument("--llm-both", action="store_true",
                    help="Run each value twice, with LLM corrections disabled "
                         "and enabled. The correction layer may be what restores "
                         "code-switched output.")
    ap.add_argument("--repeat", type=int, default=1,
                    help="Attempts per setting. Raise it when the network is "
                         "dropping connections, so one SSL failure is not "
                         "mistaken for a verdict.")
    args = ap.parse_args()

    key = os.environ.get("INTRON_API_KEY")
    if not key:
        sys.exit("set INTRON_API_KEY")
    if not os.path.exists(args.audio):
        sys.exit("no such file: %s" % args.audio)

    L = args.lang
    # Candidate ways an API might express "bilingual with English". No way to
    # know which is real without asking; unrecognised values usually come back
    # as a 4xx naming the valid set, which is itself the answer.
    trials = [
        ("baseline: %s" % L, L, None),
        ("%s-en" % L, "%s-en" % L, None),
        ("%s_en" % L, "%s_en" % L, None),
        ("en-%s" % L, "en-%s" % L, None),
        ("%s+en" % L, "%s+en" % L, None),
        ("cs-%s" % L, "cs-%s" % L, None),
        ("%s, extra flag use_code_switching" % L, L, {"use_code_switching": "TRUE"}),
        ("%s, extra flag use_code_switch" % L, L, {"use_code_switch": "TRUE"}),
        ("%s, second lang field" % L, L, {"use_secondary_language": "en"}),
        ("deliberately invalid (to reveal valid set)", "zzz-invalid", None),
    ]

    if args.values:
        trials = [(v.strip(), v.strip(), None) for v in args.values.split(",") if v.strip()]

    llm_modes = [True, False] if args.llm_both else [True]

    want = [w.lower() for w in args.expect_english.split()]
    print("Probing with %s\n" % os.path.basename(args.audio))
    for label, value, extra in trials:
        for disable_llm in llm_modes:
            tag = "%s%s" % (label, "" if not args.llm_both else
                            ("  [llm off]" if disable_llm else "  [llm ON]"))
            for attempt in range(1, args.repeat + 1):
                t0 = time.time()
                txt, err = call(key, args.audio, value, extra, disable_llm=disable_llm)
                dt = time.time() - t0
                suffix = "" if args.repeat == 1 else "  (try %d/%d)" % (attempt, args.repeat)
                if err:
                    print("  %-44s ERROR  %s%s"
                          % (tag, err.replace("\n", " ")[:130], suffix))
                    # a clean 400 is a verdict; a transport failure is not
                    if err.startswith("HTTP 4"):
                        break
                else:
                    hits = [w for w in want
                            if re.search(r"\b%s\b" % re.escape(w), txt.lower())]
                    mark = "ENGLISH FOUND" if hits else "no english"
                    print("  %-44s %5.1fs  [%s]%s" % (tag, dt, mark, suffix))
                    print("      %s" % txt[:150])
                    break
                time.sleep(args.rate_limit)
            time.sleep(args.rate_limit)

    print("\nWhichever line shows ENGLISH FOUND is the code-switched path.")
    print("If none do, the model really is collapsing English into %s - which is "
          "a legitimate finding, not a bug, and belongs in your report." % L)
    print("Also check the invalid-code line: APIs often list the accepted values "
          "in that error message.")


if __name__ == "__main__":
    main()