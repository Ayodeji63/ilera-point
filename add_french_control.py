#!/usr/bin/env python3
"""
add_french_control.py - append the 25 French phrasebook sentences to an existing
manifest as a MONOLINGUAL CONTROL arm.

These sentences contain no code-switching. That is deliberate: the control lets
you separate "this model is weak in this language" from "this model is weak at
switching between languages". Without it, a high WER on Yoruba-English is
ambiguous between the two.

Consequences for scoring, which you should state in the write-up:
  - switch_point_error_rate is undefined (no switches) and reports as "-"
  - segment loss collapses onto transcript loss, since each utterance is one span
  - cross_lang_sub_rate is not meaningful
  - WER, CER, accuracy, transcript loss and hallucination all work normally

Usage:
    python add_french_control.py --manifest manifest.csv
    python add_french_control.py --manifest manifest.csv --audio-dir audio_fr
"""

import argparse
import csv
import os
import sys

# (n, slug, category, urgent, french, english gloss)
PHRASES = [
    (1, "paludisme_fievre", "Fever/Malaria", False,
     "J'ai une forte fièvre et des frissons depuis hier soir.",
     "I have a high fever and chills since last night."),
    (2, "mal_de_tete", "Headache", False,
     "J'ai un mal de tête terrible qui ne passe pas.",
     "I have a terrible headache that won't go away."),
    (3, "maux_de_ventre", "Stomachache", False,
     "J'ai des douleurs au ventre, surtout après avoir mangé.",
     "I have stomach pains, especially after eating."),
    (4, "diarrhee", "Diarrhea", False,
     "J'ai la diarrhée et je me sens très déshydraté.",
     "I have diarrhea and I feel very dehydrated."),
    (5, "vomissements", "Vomiting", False,
     "Je n'arrête pas de vomir tout ce que je bois ou mange.",
     "I keep vomiting everything I drink or eat."),
    (6, "toux", "Cough", False,
     "Je tousse beaucoup, surtout la nuit, avec des crachats.",
     "I cough a lot, especially at night, with phlegm."),
    (7, "rhume", "Cold", False,
     "J'ai le nez complètement bouché et je n'arrive pas à respirer par le nez.",
     "My nose is completely blocked and I can't breathe through my nose."),
    (8, "douleur_thoracique", "Chest pain", True,
     "Je ressens une douleur aiguë dans la poitrine quand je respire profondément.",
     "I feel a sharp pain in my chest when I breathe deeply."),
    (9, "respiration", "Breathing", True,
     "J'ai beaucoup de mal à respirer, c'est comme si je manquais d'air.",
     "I have a lot of trouble breathing, it's as if I'm running out of air."),
    (10, "saignement", "Bleeding", True,
     "Je me suis coupé profondément et le saignement ne s'arrête pas.",
     "I cut myself deeply and the bleeding won't stop."),
    (11, "douleur_articulaire", "Joint pain", False,
     "J'ai très mal aux articulations, surtout le matin au réveil.",
     "My joints hurt a lot, especially in the morning when waking up."),
    (12, "mal_de_dos", "Back pain", False,
     "J'ai une douleur intense et persistante dans le bas du dos.",
     "I have an intense and persistent pain in my lower back."),
    (13, "grossesse", "Pregnancy", False,
     "Je suis enceinte de quatre mois et je ressens des crampes inhabituelles.",
     "I am four months pregnant and I feel unusual cramps."),
    (14, "rougeur_oculaire", "Eye issue", False,
     "Mon œil est très rouge, gonflé et me démange énormément.",
     "My eye is very red, swollen, and itches incredibly."),
    (15, "fievre_pediatrique", "Pediatric fever", False,
     "Mon enfant est très chaud, sa température ne descend pas.",
     "My child is very hot, their temperature is not going down."),
    (16, "miction_douloureuse", "Painful urination", False,
     "Ça me brûle beaucoup quand je vais aux toilettes pour uriner.",
     "It burns a lot when I go to the bathroom to urinate."),
    (17, "vertiges", "Dizziness", False,
     "J'ai des vertiges et la tête qui tourne chaque fois que je me lève.",
     "I have dizziness and my head spins every time I stand up."),
    (18, "mal_de_dents", "Toothache", False,
     "J'ai une douleur insupportable à la dent depuis deux jours.",
     "I have had an unbearable toothache for two days."),
    (19, "eruption_cutanee", "Rash", False,
     "J'ai des boutons partout sur le corps et ça gratte énormément.",
     "I have spots all over my body and it itches incredibly."),
    (20, "mal_de_gorge", "Sore throat", False,
     "J'ai très mal à la gorge, je n'arrive même plus à avaler ma salive.",
     "My throat hurts a lot, I can't even swallow my saliva anymore."),
    (21, "fatigue_faiblesse", "Fatigue", False,
     "Je me sens extrêmement fatigué et faible depuis quelques jours.",
     "I feel extremely tired and weak for the past few days."),
    (22, "historique_medical", "Medical history", False,
     "J'ai pris des comprimés contre la douleur, mais ça n'a rien changé.",
     "I took some painkillers, but it didn't change anything."),
    (23, "douleur_oreilles", "Earache", False,
     "J'ai très mal à l'oreille gauche et j'entends un sifflement.",
     "My left ear hurts a lot and I hear a ringing."),
    (24, "blessure_entorse", "Injury", False,
     "Je suis tombé et ma cheville est enflée et douloureuse.",
     "I fell and my ankle is swollen and painful."),
    (25, "palpitations", "Palpitations", False,
     "Mon cœur bat très fort et très vite sans aucune raison.",
     "My heart is beating very hard and very fast for no reason."),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--audio-dir", default="audio",
                    help="Where the French wavs will live after linking.")
    ap.add_argument("--filename-pattern", default="{n:02d}_{slug}.wav",
                    help="Matches the recorded filenames, so audio_path is "
                         "prefilled and you can skip link_audio.py for French.")
    args = ap.parse_args()

    with open(args.manifest, encoding="utf-8-sig", newline="") as f:
        existing = list(csv.DictReader(f))
    if not existing:
        sys.exit("empty manifest: %s" % args.manifest)
    cols = list(existing[0].keys())

    if any(r.get("matrix_lang", "").strip() == "fr" for r in existing):
        sys.exit("manifest already contains French rows - nothing to do")

    new = []
    for n, slug, cat, urgent, fr, en in PHRASES:
        aid = "fr_%02d" % n
        toks = fr.split()
        row = dict.fromkeys(cols, "")
        row.update({
            "audio_id": aid,
            "sentence_id": aid,
            "audio_path": os.path.join(
                args.audio_dir, args.filename_pattern.format(n=n, slug=slug)),
            "ref": fr,
            # every token is French: this arm has no code-switching by design
            "ref_lang": " ".join(["fr"] * len(toks)),
            "matrix_lang": "fr",
            "language_pair": "fr-monolingual",
            "domain": "health",
            "category": cat,
            "is_emergency": "yes" if urgent else "no",
            "accent": "",
            "gloss_en": en,
        })
        new.append({k: row.get(k, "") for k in cols})

    with open(args.manifest, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(existing + new)

    print("Added %d French control row(s) to %s (now %d rows)."
          % (len(new), args.manifest, len(existing) + len(new)))
    print("audio_path prefilled as e.g. %s" % new[0]["audio_path"])
    print("\nCopy the recordings into %s keeping their current names, then "
          "carry on with prepare_audio.py." % args.audio_dir)
    print("\nNote: language_pair is 'fr-monolingual'. Switch-point error and "
          "cross-language substitution will show '-' for these rows - that is "
          "correct, there are no switches to get wrong.")


if __name__ == "__main__":
    main()