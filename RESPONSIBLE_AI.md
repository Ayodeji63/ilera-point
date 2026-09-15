# Responsible AI and clinical safety

IleraPoint is a clinician-support intake system. It structures patient-reported information and creates reviewable drafts; it does not diagnose, recommend treatment, autonomously prescribe, or replace a clinician. The detailed implementation and residual-risk report is in [`docs/ETHICS_PRIVACY_REPORT.md`](docs/ETHICS_PRIVACY_REPORT.md).

## Human authority

- Patients see and can correct the transcript and structured summary before handoff.
- Speech-derived prescriptions are drafts. A clinician must review every field and explicitly confirm before a database write.
- The formulary and medication-history checks are deterministic, limited reference checks. They are not a complete interaction, allergy, contraindication, pregnancy, renal, hepatic, or dosing system.
- Vitals are measurements for clinician review, not diagnoses. Uncalibrated SpO₂ and corrected body temperature are withheld.

## Known safety limitation

Emergency detection remains a small exact-match deterministic rule at the user's explicit direction. It is not a comprehensive triage screen and may miss synonyms, mistranscriptions, code-switched descriptions, paediatric presentations, pregnancy emergencies, self-harm, and other urgent conditions. It must not be described as an emergency guarantee.

## Privacy controls

- No face, palm, or other biometric identity processing is present.
- Consent separately describes required voice transcription, optional continuous video, and optional future de-identified research consideration. The notice version and choices are stored.
- Consultation videos are private, delivered to authorised clinicians through short-lived signed URLs, and expire from storage under the configured retention policy.
- Patient result capabilities are random, hashed at rest, expire after four hours, and are consumed after successful collection.
- Patient lookup requires a complete normalized phone number, is rate-limited, and masks phone numbers in results.
- Clinical access and safety-relevant actions create append-only, content-minimized audit events.
- Live clinical dictation is not copied into `benchmark_samples`. Evaluation datasets must be imported separately from consented, de-identified recordings.

## Language and inclusion

English is marked supported. Yorùbá-English, Pidgin-English, Hausa-English, and Igbo-English operate in supervised mode because current evidence does not justify unattended acceptance. The UI tells users and clinicians to verify symptoms, medicines, numbers, units, abbreviations, and negations.

The interface provides visible transcripts, typed alternatives, large touch targets, strong focus indicators, live status text, reduced-motion behavior, and non-colour status cues. Native speakers and disability-inclusive participants must validate translated notices and the Raspberry Pi kiosk before clinical deployment.

## Evidence and deployment gate

No provider or language is promoted based on an untraceable result. A benchmark result is publishable only when its audio set, reference source, provider/model, configuration, run date, success/failure denominator, and raw provider output are reproducible. The legacy `whisper_riva` CSV is retained as unverified evidence and is excluded from default claims until its provenance is supplied.

Before clinical use, the deploying institution must complete a DPIA, approve retention periods, execute processor and cross-border-transfer arrangements, validate translations, perform clinical safety review, test accessibility on the actual kiosk, and define an incident owner and escalation channel.
