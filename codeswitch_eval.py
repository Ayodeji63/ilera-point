#!/usr/bin/env python3
"""
codeswitch_eval.py - evaluation harness for code-switched ASR benchmarking.

Scores N model hypothesis files against a reference manifest and emits
per-utterance metrics, aggregate tables with bootstrap confidence intervals,
paired significance tests between models, and a markdown report.

Designed for African-English code-switched speech (Yoruba/Igbo/Hausa x English),
but the language tagging is data-driven, so it generalises.

Usage:
    python codeswitch_eval.py \
        --manifest manifest.csv \
        --hyp sahara=hyps/sahara.csv \
        --hyp whisper_lv3=hyps/whisper.csv \
        --hyp gemini=hyps/gemini.csv \
        --hyp seamless=hyps/seamless.csv \
        --outdir results

Manifest columns (required): audio_id, ref, matrix_lang
Manifest columns (optional): ref_lang, language_pair, domain, accent, country,
    device_type, noise_condition, snr_db, speaker_id, duration_s, audio_path

Hypothesis CSV columns (required): audio_id, hyp

No third-party dependencies. Python 3.8+.
"""

import argparse
import csv
import json
import os
import random
import re
import statistics
import sys
import unicodedata
from collections import Counter, defaultdict

# --------------------------------------------------------------------------
# Text normalisation
# --------------------------------------------------------------------------

# Characters that carry meaning in Yoruba/Igbo/Hausa orthography and that we
# must NOT silently destroy in the primary normalisation pass.
HAUSA_HOOKS = {"\u0253": "b", "\u0257": "d", "\u0199": "k", "\u01b4": "y"}  # b d k y with hook

APOSTROPHES = {
    ord("\u2018"): "'", ord("\u2019"): "'", ord("\u02bc"): "'", ord("\u02bb"): "'",
    ord("\u00b4"): "'", ord("\u0060"): "'",
}
DASHES = {ord("\u2013"): "-", ord("\u2014"): "-", ord("\u2212"): "-"}

# Keep letters, digits, whitespace, apostrophe, and combining marks.
_PUNCT_RE = re.compile(r"[^\w\s'\u0300-\u036f]", re.UNICODE)
_WS_RE = re.compile(r"\s+", re.UNICODE)
_COMBINING_RE = re.compile(r"[\u0300-\u036f]", re.UNICODE)


def norm_strict(s):
    """Unnormalised WER track: NFC + whitespace collapse only. Case and
    punctuation preserved. This is the pessimistic, orthography-faithful number."""
    s = unicodedata.normalize("NFC", str(s))
    return _WS_RE.sub(" ", s).strip()


def norm_standard(s):
    """Primary reporting track: casefold, strip punctuation, normalise quotes
    and dashes. Diacritics and tone marks are PRESERVED - they are phonemic in
    Yoruba and Igbo, so stripping them here would hide real errors."""
    s = unicodedata.normalize("NFC", str(s))
    s = s.translate(APOSTROPHES).translate(DASHES)
    s = s.lower()
    s = _PUNCT_RE.sub(" ", s)
    return _WS_RE.sub(" ", s).strip()


def norm_diacritic_insensitive(s, fold_hooks=True):
    """Supplementary track: standard normalisation plus removal of all combining
    marks (tone marks, dot-below) and optional folding of Hausa hooked letters.

    The GAP between norm_standard WER and this WER is the share of a model's
    error budget that is purely diacritic/tone marking rather than lexical
    recognition. Report both - it is one of the most informative diagnostics
    you can produce for Yoruba in particular."""
    s = norm_standard(s)
    if fold_hooks:
        s = "".join(HAUSA_HOOKS.get(ch, ch) for ch in s)
    s = unicodedata.normalize("NFD", s)
    s = _COMBINING_RE.sub("", s)
    return unicodedata.normalize("NFC", s)


# Thresholds for the Intron metric set. Stated explicitly because every one of
# these is a judgement call and a reader is entitled to see it.
SEGMENT_LOSS_THRESHOLD = 0.5      # >=50% of a language span deleted -> span lost
HALLUCINATION_INSERT_RATIO = 0.5  # insertions >50% of reference length
HALLUCINATION_LENGTH_RATIO = 2.0  # hypothesis >2x reference length

TRACKS = {
    "strict": norm_strict,
    "standard": norm_standard,
    "nodiacritic": norm_diacritic_insensitive,
}

# --------------------------------------------------------------------------
# Language tagging
# --------------------------------------------------------------------------

# High-frequency English tokens. Used only as a fallback when the manifest has
# no gold `ref_lang` column. Gold per-token tags are strongly preferred.
BUILTIN_EN = set("""
a about above after again against all am an and any are aren't as at
be because been before being below between both but by
call called can cannot can't come comes coming could couldn't
did didn't do does doesn't doing don't done down during
each even every
few first for from
get gets getting give given go goes going gone good got
had hadn't has hasn't have haven't having he her here hers him his how
i if in into is isn't it its it's
just
keep know known knows
last let like little long look
made make makes making many may maybe me might money more most much must my
need needs never new next no not now number
of off ok okay old on once one only or other our out over own
part people phone please put
right
said same say says see send sent set she should shouldn't so some soon still such sure
take taken tell than that the their them then there these they thing think this those three through time to today too transfer try two
under until up us use used
very
wait want was wasn't way we week well were what when where which while who why will with without won't work would wouldn't
yes yet you your yours
account balance card cash check code data doctor error fee help hospital
loan message name network number password patient pay payment phone pin price
receipt register report school send service teacher test text time transfer
""".split())


def load_lexicon(path):
    if not path:
        return set(BUILTIN_EN)
    with open(path, encoding="utf-8") as f:
        return {norm_standard(w) for w in f.read().split() if w.strip()}


_AFRICAN_CHAR_RE = re.compile(
    r"[\u1eb9\u1ecd\u1e63\u1ecb\u1ee5\u1e45\u0253\u0257\u0199\u01b4\u0300-\u036f]", re.UNICODE
)


def tag_tokens(tokens, matrix_lang, en_lex):
    """Heuristic per-token language ID: English lexicon hit -> 'en';
    African-specific orthography -> matrix; otherwise matrix (conservative,
    because the matrix language is by definition the majority language)."""
    tags = []
    for t in tokens:
        if _AFRICAN_CHAR_RE.search(t):
            tags.append(matrix_lang)
        elif t in en_lex:
            tags.append("en")
        else:
            tags.append(matrix_lang)
    return tags


# --------------------------------------------------------------------------
# Alignment
# --------------------------------------------------------------------------

def align(ref, hyp):
    """Levenshtein alignment with backpointers.
    Returns a list of (op, ref_idx|None, hyp_idx|None) with op in C/S/D/I."""
    n, m = len(ref), len(hyp)
    d = [[0] * (m + 1) for _ in range(n + 1)]
    bp = [[None] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        d[i][0] = i
        bp[i][0] = "D"
    for j in range(1, m + 1):
        d[0][j] = j
        bp[0][j] = "I"
    for i in range(1, n + 1):
        ri = ref[i - 1]
        for j in range(1, m + 1):
            if ri == hyp[j - 1]:
                diag, dop = d[i - 1][j - 1], "C"
            else:
                diag, dop = d[i - 1][j - 1] + 1, "S"
            dele = d[i - 1][j] + 1
            ins = d[i][j - 1] + 1
            best = min(diag, dele, ins)
            if best == diag:
                d[i][j], bp[i][j] = diag, dop
            elif best == dele:
                d[i][j], bp[i][j] = dele, "D"
            else:
                d[i][j], bp[i][j] = ins, "I"
    ops = []
    i, j = n, m
    while i > 0 or j > 0:
        op = bp[i][j]
        if op in ("C", "S"):
            ops.append((op, i - 1, j - 1))
            i -= 1
            j -= 1
        elif op == "D":
            ops.append(("D", i - 1, None))
            i -= 1
        else:
            ops.append(("I", None, j - 1))
            j -= 1
    ops.reverse()
    return ops


def char_counts(ref_s, hyp_s):
    """Character-level S/D/I. Spaces retained (standard CER convention)."""
    ops = align(list(ref_s), list(hyp_s))
    c = Counter(op for op, _, _ in ops)
    return c["S"], c["D"], c["I"], len(ref_s)


# --------------------------------------------------------------------------
# Per-utterance scoring
# --------------------------------------------------------------------------

def score_utterance(ref_text, hyp_text, ref_tags, matrix_lang, en_lex):
    """Returns a dict of raw counts (not rates) so they can be aggregated
    micro-averaged across the corpus."""
    ref = ref_text.split()
    hyp = hyp_text.split()
    # defensive: a tag list out of step with the tokens must not crash scoring
    if len(ref_tags) != len(ref):
        ref_tags = (list(ref_tags) + [matrix_lang] * len(ref))[:len(ref)]
    ops = align(ref, hyp)

    S = D = I = C = 0
    cls_n = Counter()
    cls_err = Counter()
    cross_lang_sub = 0
    total_sub = 0

    hyp_tags = tag_tokens(hyp, matrix_lang, en_lex)
    for t in ref_tags:
        cls_n[t] += 1

    last_ref_class = ref_tags[0] if ref_tags else matrix_lang
    for op, ri, hi in ops:
        if op == "C":
            C += 1
            last_ref_class = ref_tags[ri]
        elif op == "S":
            S += 1
            total_sub += 1
            cls_err[ref_tags[ri]] += 1
            last_ref_class = ref_tags[ri]
            if hyp_tags[hi] != ref_tags[ri]:
                cross_lang_sub += 1
        elif op == "D":
            D += 1
            cls_err[ref_tags[ri]] += 1
            last_ref_class = ref_tags[ri]
        else:  # insertion, attributed to the class of the preceding ref token
            I += 1
            cls_err[last_ref_class] += 1

    # switch-point preservation
    correct_map = {ri: hi for op, ri, hi in ops if op == "C"}
    sw_total = sw_ok = 0
    for k in range(len(ref_tags) - 1):
        if ref_tags[k] != ref_tags[k + 1]:
            sw_total += 1
            a, b = correct_map.get(k), correct_map.get(k + 1)
            if a is not None and b is not None and b == a + 1:
                sw_ok += 1

    cS, cD, cI, cN = char_counts(ref_text, hyp_text)

    # code-mixing index of the reference utterance
    n_tok = len(ref_tags)
    cmi = 0.0
    if n_tok > 0:
        top = max(Counter(ref_tags).values())
        cmi = 100.0 * (n_tok - top) / n_tok

    # ---- Intron metric set -------------------------------------------------
    # Segment loss: a contiguous run of same-language reference tokens that the
    # model dropped. This is the canonical code-switching failure - the model
    # transcribes one language and silently discards the span in the other.
    deleted = {ri for op, ri, _ in ops if op == "D"}
    spans = []
    if ref_tags:
        s = 0
        for k in range(1, len(ref_tags) + 1):
            if k == len(ref_tags) or ref_tags[k] != ref_tags[s]:
                spans.append((s, k, ref_tags[s]))
                s = k
    n_spans = n_spans_lost = 0
    n_span_m = n_span_m_lost = n_span_en = n_span_en_lost = 0
    n_first = n_first_lost = n_last = n_last_lost = 0
    n_en_first = n_en_first_lost = n_en_last = n_en_last_lost = 0
    for si, (a, b, tag) in enumerate(spans):
        n_spans += 1
        frac = sum(1 for i in range(a, b) if i in deleted) / float(b - a)
        lost = 1 if frac >= SEGMENT_LOSS_THRESHOLD else 0
        n_spans_lost += lost
        is_first, is_last = si == 0, si == len(spans) - 1
        if is_first:
            n_first += 1
            n_first_lost += lost
        if is_last and not is_first:
            n_last += 1
            n_last_lost += lost
        if tag == "en":
            n_span_en += 1
            n_span_en_lost += lost
            # English split by position: if English is lost even when it comes
            # FIRST, the loss is about language. If only trailing English goes,
            # the model is truncating utterances and language is incidental.
            if is_first:
                n_en_first += 1
                n_en_first_lost += lost
            elif is_last:
                n_en_last += 1
                n_en_last_lost += lost
        else:
            n_span_m += 1
            n_span_m_lost += lost

    # Transcript loss: the model returned nothing usable for the whole utterance.
    n_ref, n_hyp = len(ref), len(hyp)
    transcript_loss = 1 if (n_hyp == 0 or (n_ref and n_hyp < 0.10 * n_ref)) else 0

    # Hallucination: output with no acoustic basis. Three detectable signatures.
    hall_insert = 1 if (n_ref and I / float(n_ref) > HALLUCINATION_INSERT_RATIO) else 0
    hall_length = 1 if (n_ref and n_hyp > HALLUCINATION_LENGTH_RATIO * n_ref) else 0
    hall_loop = 0
    if n_hyp >= 9:
        for i in range(n_hyp - 8):
            g = tuple(hyp[i:i + 3])
            if g == tuple(hyp[i + 3:i + 6]) == tuple(hyp[i + 6:i + 9]):
                hall_loop = 1
                break
    hallucination = 1 if (hall_insert or hall_length or hall_loop) else 0

    return {
        "n_spans": n_spans, "n_spans_lost": n_spans_lost,
        "n_span_matrix": n_span_m, "n_span_matrix_lost": n_span_m_lost,
        "n_span_en": n_span_en, "n_span_en_lost": n_span_en_lost,
        "n_first": n_first, "n_first_lost": n_first_lost,
        "n_last": n_last, "n_last_lost": n_last_lost,
        "n_en_first": n_en_first, "n_en_first_lost": n_en_first_lost,
        "n_en_last": n_en_last, "n_en_last_lost": n_en_last_lost,
        "transcript_loss": transcript_loss, "hallucination": hallucination,
        "hall_insert": hall_insert, "hall_length": hall_length,
        "hall_loop": hall_loop,
        "N": len(ref), "S": S, "D": D, "I": I, "C": C,
        "cN": cN, "cS": cS, "cD": cD, "cI": cI,
        "n_matrix": cls_n[matrix_lang], "err_matrix": cls_err[matrix_lang],
        "n_en": cls_n["en"], "err_en": cls_err["en"],
        "sw_total": sw_total, "sw_ok": sw_ok,
        "cross_lang_sub": cross_lang_sub, "total_sub": total_sub,
        "cmi": cmi,
    }


# --------------------------------------------------------------------------
# Aggregation
# --------------------------------------------------------------------------

def _rate(num, den):
    return float(num) / den if den else float("nan")


def aggregate(rows):
    """Micro-average a list of per-utterance count dicts."""
    if not rows:
        return {}
    tot = defaultdict(float)
    for r in rows:
        for k, v in r.items():
            if k != "cmi":
                tot[k] += v
    return {
        "n_utts": len(rows),
        "n_ref_words": int(tot["N"]),
        "wer": _rate(tot["S"] + tot["D"] + tot["I"], tot["N"]),
        "cer": _rate(tot["cS"] + tot["cD"] + tot["cI"], tot["cN"]),
        "sub_rate": _rate(tot["S"], tot["N"]),
        "del_rate": _rate(tot["D"], tot["N"]),
        "ins_rate": _rate(tot["I"], tot["N"]),
        "wer_matrix": _rate(tot["err_matrix"], tot["n_matrix"]),
        "wer_embedded_en": _rate(tot["err_en"], tot["n_en"]),
        "switch_point_error_rate": 1.0 - _rate(tot["sw_ok"], tot["sw_total"])
        if tot["sw_total"] else float("nan"),
        "cross_lang_sub_rate": _rate(tot["cross_lang_sub"], tot["total_sub"]),
        "mean_cmi": statistics.mean(r["cmi"] for r in rows),
        # Intron metric set
        "accuracy": max(0.0, 1.0 - _rate(tot["S"] + tot["D"] + tot["I"], tot["N"])),
        "segment_loss_rate": _rate(tot["n_spans_lost"], tot["n_spans"]),
        "segment_loss_matrix": _rate(tot["n_span_matrix_lost"], tot["n_span_matrix"]),
        "segment_loss_en": _rate(tot["n_span_en_lost"], tot["n_span_en"]),
        "transcript_loss_rate": _rate(tot["transcript_loss"], len(rows)),
        "hallucination_rate": _rate(tot["hallucination"], len(rows)),
        "hall_by_insertion": _rate(tot["hall_insert"], len(rows)),
        "hall_by_length": _rate(tot["hall_length"], len(rows)),
        "hall_by_loop": _rate(tot["hall_loop"], len(rows)),
        "segment_loss_first_span": _rate(tot["n_first_lost"], tot["n_first"]),
        "segment_loss_last_span": _rate(tot["n_last_lost"], tot["n_last"]),
        "segment_loss_en_when_first": _rate(tot["n_en_first_lost"], tot["n_en_first"]),
        "segment_loss_en_when_last": _rate(tot["n_en_last_lost"], tot["n_en_last"]),
        "n_en_first_spans": tot["n_en_first"], "n_en_last_spans": tot["n_en_last"],
    }


def bootstrap_ci(groups, key="wer", reps=2000, seed=13, alpha=0.05):
    """Cluster bootstrap CI for a micro-averaged rate.

    `groups` is a list of clusters, each a list of per-utterance count dicts.
    Resampling happens at the CLUSTER level. When several speakers read the same
    sentence, those recordings share their content and are not independent
    observations - resampling them separately reports an interval narrower than
    the data supports. With one recording per sentence each cluster has size 1
    and this reduces to the ordinary utterance bootstrap."""
    if not groups:
        return (float("nan"), float("nan"))
    rng = random.Random(seed)
    n = len(groups)
    vals = []
    for _ in range(reps):
        sample = []
        for _ in range(n):
            sample.extend(groups[rng.randrange(n)])
        v = aggregate(sample).get(key, float("nan"))
        if v == v:
            vals.append(v)
    if not vals:
        return (float("nan"), float("nan"))
    vals.sort()
    lo = vals[int(alpha / 2 * len(vals))]
    hi = vals[min(len(vals) - 1, int((1 - alpha / 2) * len(vals)))]
    return (lo, hi)


def paired_bootstrap(groups_a, groups_b, key="wer", reps=2000, seed=13):
    """Two-sided paired cluster bootstrap for (A - B) over the same clusters."""
    n = len(groups_a)
    if n == 0 or n != len(groups_b):
        return float("nan"), float("nan")
    obs = (aggregate([r for g in groups_a for r in g])[key]
           - aggregate([r for g in groups_b for r in g])[key])
    rng = random.Random(seed)
    count = used = 0
    for _ in range(reps):
        idx = [rng.randrange(n) for _ in range(n)]
        d = (aggregate([r for i in idx for r in groups_a[i]])[key]
             - aggregate([r for i in idx for r in groups_b[i]])[key])
        if d != d:
            continue
        used += 1
        # centred two-sided bootstrap: how often a resample, recentred on the
        # null of zero difference, still reaches the observed effect size
        if abs(d - obs) >= abs(obs):
            count += 1
    p = float(count) / used if used else float("nan")
    return obs, min(1.0, p)


# --------------------------------------------------------------------------
# IO
# --------------------------------------------------------------------------

REQUIRED_MANIFEST = ["audio_id", "ref", "matrix_lang"]
SLICE_COLS = ["language_pair", "matrix_lang", "domain", "accent", "country",
              "device_type", "noise_condition", "speaker_id"]


def read_csv(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def load_manifest(path):
    rows = read_csv(path)
    if not rows:
        sys.exit("manifest is empty: %s" % path)
    missing = [c for c in REQUIRED_MANIFEST if c not in rows[0]]
    if missing:
        sys.exit("manifest missing required column(s): %s" % ", ".join(missing))
    seen = set()
    for r in rows:
        aid = r["audio_id"].strip()
        if not aid:
            sys.exit("manifest has a row with an empty audio_id")
        if aid in seen:
            sys.exit("duplicate audio_id in manifest: %s" % aid)
        seen.add(aid)
    return rows


def load_hyps(spec):
    """spec is 'name=path'."""
    if "=" not in spec:
        sys.exit("--hyp must be NAME=PATH, got: %s" % spec)
    name, path = spec.split("=", 1)
    rows = read_csv(path)
    if not rows or "audio_id" not in rows[0] or "hyp" not in rows[0]:
        sys.exit("%s must have columns audio_id,hyp" % path)
    return name.strip(), {r["audio_id"].strip(): (r["hyp"] or "") for r in rows}


def snr_bucket(v):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    if x < 5:
        return "snr:<5dB"
    if x < 15:
        return "snr:5-15dB"
    return "snr:>=15dB"


# --------------------------------------------------------------------------
# Report
# --------------------------------------------------------------------------

def fmt(v, nd=3):
    if v is None or v != v:
        return "-"
    return ("%%.%df" % nd) % v


def md_table(headers, rows):
    out = ["| " + " | ".join(headers) + " |",
           "|" + "|".join(["---"] * len(headers)) + "|"]
    for r in rows:
        out.append("| " + " | ".join(str(c) for c in r) + " |")
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--hyp", action="append", required=True,
                    help="NAME=PATH, repeatable. Use one per model.")
    ap.add_argument("--outdir", default="results")
    ap.add_argument("--en-lexicon", default=None,
                    help="Newline/space separated English wordlist for fallback "
                         "token language ID. Ignored where ref_lang is supplied.")
    ap.add_argument("--primary-track", default="standard", choices=list(TRACKS))
    ap.add_argument("--bootstrap-reps", type=int, default=2000)
    ap.add_argument("--cluster-col", default="auto",
                    help="Manifest column that identifies independent content "
                         "for the bootstrap. 'auto' uses sentence_id if present, "
                         "else groups by identical reference text, else treats "
                         "every utterance as independent. Use this when several "
                         "speakers read the same script - those recordings are "
                         "not independent observations.")
    ap.add_argument("--unsupported", action="append", default=[],
                    help="MODEL=lang1,lang2 - declare languages a model does not "
                         "officially support. Those rows are excluded from that "
                         "model's aggregates and shown as '-' rather than as a "
                         "number, because a coverage gap is not a measurement. "
                         "Repeatable. e.g. --unsupported whisper=ig,pcm")
    ap.add_argument("--baseline", default=None,
                    help="Model name to use as the reference in pairwise tests. "
                         "Defaults to the first --hyp.")
    args = ap.parse_args()

    os.makedirs(args.outdir, exist_ok=True)
    manifest = load_manifest(args.manifest)
    en_lex = load_lexicon(args.en_lexicon)
    models = [load_hyps(s) for s in args.hyp]
    model_names = [m[0] for m in models]
    if len(set(model_names)) != len(model_names):
        sys.exit("duplicate model names in --hyp")
    if len(model_names) < 4:
        print("NOTE: %d model(s) supplied. The challenge brief is ambiguous "
              "between 3 and 4 total; run Sahara plus three others to be safe."
              % len(model_names), file=sys.stderr)

    # ---- cluster index for the bootstrap
    if args.cluster_col == "auto":
        ccol = "sentence_id" if "sentence_id" in manifest[0] else "ref"
    else:
        ccol = args.cluster_col
        if ccol not in manifest[0]:
            sys.exit("--cluster-col %s is not a manifest column" % ccol)
    cluster_of, cluster_ids = [], {}
    for row in manifest:
        keyv = (row.get(ccol) or "").strip() or row["audio_id"]
        if keyv not in cluster_ids:
            cluster_ids[keyv] = len(cluster_ids)
        cluster_of.append(cluster_ids[keyv])
    n_clusters = len(cluster_ids)
    if n_clusters < len(manifest):
        print("Bootstrap clusters by `%s`: %d cluster(s) across %d utterance(s). "
              "Confidence intervals account for the repeated content."
              % (ccol, n_clusters, len(manifest)), file=sys.stderr)

    unsupported = {}
    for spec in args.unsupported:
        if "=" not in spec:
            sys.exit("--unsupported must be MODEL=lang1,lang2, got: %s" % spec)
        m, langs = spec.split("=", 1)
        if m.strip() not in model_names:
            sys.exit("--unsupported names unknown model: %s" % m)
        unsupported[m.strip()] = {x.strip() for x in langs.split(",") if x.strip()}
    for m, ls in unsupported.items():
        print("NOTE: %s declared unsupported for %s - those rows are excluded "
              "from its scores." % (m, ", ".join(sorted(ls))), file=sys.stderr)

    row_lang = [(r.get("matrix_lang") or "").strip() for r in manifest]

    def supported(name, i):
        return row_lang[i] not in unsupported.get(name, set())

    gold_tags = "ref_lang" in manifest[0]
    if not gold_tags:
        print("NOTE: no `ref_lang` column found. Falling back to heuristic token "
              "language ID. Hand-tag your 75 references if you can - it takes an "
              "hour and it is what makes the code-switch metrics trustworthy.",
              file=sys.stderr)

    # ---- score every utterance x model x track
    per_utt = []          # flat rows for CSV
    counts = defaultdict(dict)   # counts[track][model] -> list aligned to manifest order
    for track in TRACKS:
        for name in model_names:
            counts[track][name] = []

    missing_report = defaultdict(list)

    for row in manifest:
        aid = row["audio_id"].strip()
        matrix = (row.get("matrix_lang") or "und").strip()
        for track, fn in TRACKS.items():
            ref_t = fn(row["ref"])
            ref_toks = ref_t.split()
            if gold_tags and (row.get("ref_lang") or "").strip():
                tags = (row["ref_lang"]).split()
                if len(tags) != len(ref_toks):
                    # tag/token mismatch after normalisation - fall back for this row
                    tags = tag_tokens(ref_toks, matrix, en_lex)
            else:
                tags = tag_tokens(ref_toks, matrix, en_lex)

            for name, table in models:
                if aid not in table:
                    if track == args.primary_track:
                        missing_report[name].append(aid)
                    hyp_t = ""
                else:
                    hyp_t = fn(table[aid])
                m = score_utterance(ref_t, hyp_t, tags, matrix, en_lex)
                counts[track][name].append(m)
                if track == args.primary_track:
                    rec = {"audio_id": aid, "model": name, "track": track,
                           "matrix_lang": matrix}
                    for c in SLICE_COLS + ["snr_db", "noise_condition"]:
                        if c in row and c not in rec:
                            rec[c] = row.get(c, "")
                    rec.update({
                        "ref": ref_t, "hyp": hyp_t,
                        "wer": _rate(m["S"] + m["D"] + m["I"], m["N"]),
                        "cer": _rate(m["cS"] + m["cD"] + m["cI"], m["cN"]),
                        "wer_matrix": _rate(m["err_matrix"], m["n_matrix"]),
                        "wer_embedded_en": _rate(m["err_en"], m["n_en"]),
                        "hallucination": m["hallucination"],
                        "transcript_loss": m["transcript_loss"],
                        "n_spans": m["n_spans"], "n_spans_lost": m["n_spans_lost"],
                        "switch_points": m["sw_total"],
                        "switch_points_preserved": m["sw_ok"],
                        "cmi": m["cmi"],
                    })
                    per_utt.append(rec)

    for name, ids in missing_report.items():
        print("WARNING: %s produced no hypothesis for %d utterance(s); scored as "
              "empty (full deletion). First few: %s"
              % (name, len(ids), ", ".join(ids[:5])), file=sys.stderr)

    # ---- write per-utterance CSV
    pu_path = os.path.join(args.outdir, "per_utterance.csv")
    if per_utt:
        keys = list(per_utt[0].keys())
        with open(pu_path, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=keys, extrasaction="ignore")
            w.writeheader()
            for r in per_utt:
                w.writerow(r)

    def grouped(flat, name=None, common_with=None):
        """Cluster the per-utterance rows, dropping any language the model (or,
        for a paired test, either model) does not support."""
        g = [[] for _ in range(n_clusters)]
        for i, r in enumerate(flat):
            if name and not supported(name, i):
                continue
            if common_with and not supported(common_with, i):
                continue
            g[cluster_of[i]].append(r)
        return [x for x in g if x]

    def flat_supported(name, flat):
        return [r for i, r in enumerate(flat) if supported(name, i)]

    # ---- overall summary
    summary_rows = []
    for track in ["strict", "standard", "nodiacritic"]:
        for name in model_names:
            a = aggregate(flat_supported(name, counts[track][name]))
            lo, hi = bootstrap_ci(grouped(counts[track][name], name),
                                  "wer", args.bootstrap_reps)
            a.update({"track": track, "model": name, "wer_ci_lo": lo,
                      "wer_ci_hi": hi,
                      "langs_excluded": ",".join(sorted(unsupported.get(name, ())))})
            summary_rows.append(a)

    sum_path = os.path.join(args.outdir, "summary.csv")
    keys = ["track", "model", "n_utts", "n_ref_words", "wer", "wer_ci_lo",
            "wer_ci_hi", "accuracy", "cer", "hallucination_rate",
            "transcript_loss_rate", "segment_loss_rate", "segment_loss_matrix",
            "segment_loss_en", "segment_loss_first_span",
            "segment_loss_last_span", "segment_loss_en_when_first",
            "segment_loss_en_when_last", "n_en_first_spans", "n_en_last_spans",
            "hall_by_insertion", "hall_by_length",
            "hall_by_loop", "sub_rate", "del_rate", "ins_rate", "wer_matrix",
            "wer_embedded_en", "switch_point_error_rate", "cross_lang_sub_rate",
            "mean_cmi", "langs_excluded"]
    with open(sum_path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=keys, extrasaction="ignore")
        w.writeheader()
        for r in summary_rows:
            w.writerow({k: r.get(k, "") for k in keys})

    # ---- slices
    slice_rows = []
    idx_by_key = defaultdict(list)
    for i, row in enumerate(manifest):
        for col in SLICE_COLS:
            if col in row and (row.get(col) or "").strip():
                idx_by_key[(col, row[col].strip())].append(i)
        if "snr_db" in row:
            b = snr_bucket(row.get("snr_db"))
            if b:
                idx_by_key[("snr_db", b)].append(i)
    for (col, val), idxs in sorted(idx_by_key.items()):
        for name in model_names:
            keep = [i for i in idxs if supported(name, i)]
            if not keep:
                slice_rows.append({"slice_col": col, "slice_value": val,
                                   "model": name, "n_utts": 0,
                                   "note": "not supported by this model"})
                continue
            a = aggregate([counts[args.primary_track][name][i] for i in keep])
            a.update({"slice_col": col, "slice_value": val, "model": name,
                      "note": ""})
            slice_rows.append(a)
    sl_path = os.path.join(args.outdir, "slices.csv")
    skeys = ["slice_col", "slice_value", "model", "n_utts", "n_ref_words", "wer",
             "accuracy", "cer", "hallucination_rate", "transcript_loss_rate",
             "segment_loss_rate", "segment_loss_matrix", "segment_loss_en",
             "wer_matrix", "wer_embedded_en", "switch_point_error_rate",
             "cross_lang_sub_rate", "mean_cmi", "note"]
    with open(sl_path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=skeys, extrasaction="ignore")
        w.writeheader()
        for r in slice_rows:
            w.writerow({k: r.get(k, "") for k in skeys})

    # ---- pairwise significance vs baseline
    base = args.baseline or model_names[0]
    if base not in model_names:
        sys.exit("--baseline %s is not among the supplied models" % base)
    pw = []
    for name in model_names:
        if name == base:
            continue
        for key in ("wer", "cer"):
            ga = grouped(counts[args.primary_track][name], name, base)
            gb = grouped(counts[args.primary_track][base], base, name)
            delta, p = paired_bootstrap(ga, gb, key, args.bootstrap_reps)
            pw.append({"metric": key, "model": name, "baseline": base,
                       "n_clusters_compared": len(ga),
                       "delta_vs_baseline": delta, "p_value": p,
                       "significant_at_0.05": "yes" if (p == p and p < 0.05) else "no"})
    pw_path = os.path.join(args.outdir, "pairwise_vs_baseline.csv")
    with open(pw_path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(pw[0].keys()) if pw else
                           ["metric", "model", "baseline", "delta_vs_baseline",
                            "p_value", "significant_at_0.05"])
        w.writeheader()
        for r in pw:
            w.writerow(r)

    # ---- markdown report
    lines = ["# Code-switched ASR benchmark", ""]
    lines.append("Utterances: %d. Models: %s. Primary normalisation track: `%s`."
                 % (len(manifest), ", ".join(model_names), args.primary_track))
    lines.append("")
    lines.append("## Headline (primary track)")
    lines.append("")
    hdr = ["Model", "WER", "WER 95% CI", "Accuracy", "Hallucination",
           "Transcript loss", "Segment loss"]
    prim = sorted([x for x in summary_rows if x["track"] == args.primary_track],
                  key=lambda x: (x["wer"] if x["wer"] == x["wer"] else 9e9))
    body = []
    for r in prim:
        body.append([r["model"], fmt(r["wer"]),
                     "%s-%s" % (fmt(r["wer_ci_lo"]), fmt(r["wer_ci_hi"])),
                     fmt(r["accuracy"]), fmt(r["hallucination_rate"]),
                     fmt(r["transcript_loss_rate"]), fmt(r["segment_loss_rate"])])
    lines += [md_table(hdr, body), ""]

    lines.append("## Where the losses fall")
    lines.append("")
    lines.append("Segment loss split by the language of the dropped span, plus "
                 "the signature that triggered each hallucination flag.")
    lines.append("")
    body = [[r["model"], fmt(r["segment_loss_matrix"]), fmt(r["segment_loss_en"]),
             fmt(r["switch_point_error_rate"]), fmt(r["cross_lang_sub_rate"]),
             fmt(r["hall_by_insertion"]), fmt(r["hall_by_length"]),
             fmt(r["hall_by_loop"])] for r in prim]
    lines += [md_table(["Model", "Seg loss (local lang)", "Seg loss (English)",
                        "Switch-pt err", "Cross-lang sub", "Hall: insert",
                        "Hall: length", "Hall: loop"], body), ""]

    lines.append("## Normalisation sensitivity")
    lines.append("")
    lines.append("`strict` = raw text. `standard` = cased/punctuation stripped, "
                 "diacritics kept. `nodiacritic` = tone marks and dot-below removed. "
                 "The standard-to-nodiacritic gap is the share of error that is "
                 "purely diacritic marking.")
    lines.append("")
    body = []
    for name in model_names:
        vals = {t: aggregate(counts[t][name])["wer"] for t in TRACKS}
        gap = vals["standard"] - vals["nodiacritic"]
        body.append([name, fmt(vals["strict"]), fmt(vals["standard"]),
                     fmt(vals["nodiacritic"]), fmt(gap)])
    lines += [md_table(["Model", "WER strict", "WER standard", "WER nodiacritic",
                        "Diacritic gap"], body), ""]

    lines.append("## Language loss or tail loss?")
    lines.append("")
    lines.append("A model that truncates the end of every utterance will appear "
                 "to drop English whenever English happens to come last. These "
                 "columns separate the two: if English is lost even when it comes "
                 "FIRST, the loss is about language. If only trailing spans go, "
                 "the model is truncating and language is incidental.")
    lines.append("")
    body = [[r["model"], fmt(r["segment_loss_first_span"]),
             fmt(r["segment_loss_last_span"]),
             fmt(r["segment_loss_en_when_first"]),
             fmt(r["segment_loss_en_when_last"]),
             int(r.get("n_en_first_spans") or 0),
             int(r.get("n_en_last_spans") or 0)] for r in prim]
    lines += [md_table(["Model", "Loss: first span", "Loss: last span",
                        "Loss: English first", "Loss: English last",
                        "n(En first)", "n(En last)"], body), ""]

    lines.append("## Significance vs `%s`" % base)
    lines.append("")
    lines.append("Paired utterance-level bootstrap, %d resamples. Negative delta "
                 "means the model has lower error than the baseline."
                 % args.bootstrap_reps)
    lines.append("")
    body = [[r["model"], r["metric"], fmt(r["delta_vs_baseline"]),
             fmt(r["p_value"]), r["significant_at_0.05"]] for r in pw]
    lines += [md_table(["Model", "Metric", "Delta", "p", "Sig."], body), ""]

    if slice_rows:
        lines.append("## Slices (primary track)")
        lines.append("")
        body = [[r["slice_col"], r["slice_value"], r["model"], r.get("n_utts", 0),
                 fmt(r.get("wer")), fmt(r.get("switch_point_error_rate"))]
                for r in slice_rows]
        lines += [md_table(["Dimension", "Value", "Model", "n", "WER",
                            "Switch-pt err"], body), ""]

    lines.append("## Reading notes")
    lines.append("")
    lines.append("- **WER (matrix)** vs **WER (English)**: if English is much lower, "
                 "the model is anchoring on the embedded language and guessing at the "
                 "matrix. That is the classic code-switch failure and it is invisible "
                 "in overall WER.")
    lines.append("- **Switch-point error rate**: share of reference language "
                 "transitions the model failed to reproduce cleanly. This is the "
                 "metric that most directly answers the challenge question.")
    lines.append("- **Cross-lang sub rate**: share of substitutions where the model "
                 "output a token in the wrong language - i.e. it translated or "
                 "language-collapsed instead of transcribing.")
    lines.append("- **CI width**: with ~25 utterances per language the intervals will "
                 "overlap heavily. Report them anyway and say so explicitly; a judged "
                 "benchmark that acknowledges its own noise floor reads far better "
                 "than one that does not.")

    rp_path = os.path.join(args.outdir, "report.md")
    with open(rp_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print("\n".join(lines))
    print("\nWrote: %s" % ", ".join([pu_path, sum_path, sl_path, pw_path, rp_path]),
          file=sys.stderr)


if __name__ == "__main__":
    main()