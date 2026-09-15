# IleraPoint Ethics, Safety, Inclusion, and Privacy Report

Version: 2026-09-15  
Scope: V3 kiosk, clinician workspace, speech/LLM processing, video, vitals, prescribing, and benchmarks.

## Executive decision

This release adds technical controls for informed consent, purpose separation, patient lookup, capability-token security, retention, auditability, language-performance disclosure, and accessible recovery. It does **not** certify IleraPoint as a medical device, prove clinical safety, establish legal compliance, or replace independent clinical, security, accessibility, data-protection, and research-ethics review.

The deterministic emergency rule is intentionally unchanged at the product owner's direction. It remains the largest residual clinical-safety limitation.

## Intended use and exclusions

IleraPoint gathers and structures patient-reported primary-care intake for review by an authorised clinician. Gemini may structure text and produce prescription drafts from clinician dictation. Sahara transcribes and speaks. Neither provider is authorised to diagnose, choose treatment, prescribe, approve a consultation, or interpret consultation video.

Excluded uses include autonomous triage, unattended prescribing, emergency-service replacement, definitive vital-sign diagnosis, biometric identity, AI video assessment, and reuse of identifiable clinical encounters as research data.

## Implemented controls

### Purpose limitation and consent

The consent screen now distinguishes short microphone clips processed by Sahara and text structured by Gemini; optional continuous visit video for human clinician review; and optional future consideration of a de-identified copy for approved speech-quality research.

Research is unchecked by default and does not affect care. The server rejects consultations lacking the current consent-notice version and voice-processing consent. `consent_records` stores the notice version, language, choices, capture time, withdrawal field, and retention deadline.

While the result capability is active, the waiting screen lets the patient withdraw optional video and research permission. The backend deletes any stored video, clears both optional flags, timestamps the withdrawal, and audits the action. Requests concerning the retained clinical record still require clinic-assisted identity verification.

The supplied translations are implementation copy, not evidence of linguistic or legal validation. A native-speaking health professional and privacy reviewer must approve each version before deployment.

### Separation of clinical audit and research

`POST /api/prescriptions/parse` no longer writes live clinical dictation into `benchmark_samples`. Mandatory operational evidence is content-minimized in `ai_processing_events`: provider, model, prompt version, purpose, language, validity, error category, and a one-way input hash. The clinical prescription retains its dictated transcript because it forms part of the prescribing audit trail.

`benchmark_samples` is reserved for deliberately imported evaluation data and now carries source, consent, reference-provenance, run, model, and retention fields. Optional research consent is recorded but does not automatically export or duplicate a clinical encounter.

### Identity and access privacy

- Returning-patient lookup requires a complete normalized phone number.
- An optional exact full-name check disambiguates shared numbers.
- Responses mask the phone number.
- Lookup is limited to ten attempts per IP per fifteen minutes by default.
- Clinician routes continue to require an approved account and enforce care tier on individual case access.
- Case-list access, case access, signed-video issuance, escalation, review decisions, prescribing, warning overrides, result collection, and account review create minimized audit events.

The lookup throttle is per Node process. A multi-instance deployment should replace it with a shared Redis or database-backed limiter before public scale.

### Patient result capability

The server returns a 256-bit random capability to the active kiosk but stores only its SHA-256 hash. It expires after four hours and becomes unusable after the finished result is collected. Wrong, expired, consumed, and missing tokens return the same not-found response.

Migration `0010_ethics_privacy.sql` invalidates legacy plaintext tokens. Patients waiting across that deployment must start a new session.

### Retention and deletion

| Data | Default deadline | Enforcement |
|---|---:|---|
| Consultation video | 30 days | Storage object removed, then database path cleared |
| Operational audit events | 365 days | Deletable only after deadline |
| AI processing events | 365 days | Deletable only after deadline |
| Approved benchmark data | 365 days | Deleted after deadline |
| Escalation-call audio and intent | 365 days | Storage object and intent removed after deadline |
| Clinical consultation records | 2,190 days | Reported by cleanup; deletion requires explicit clinic configuration |
| Patient-result capability | 4 hours | Rejected after expiry and consumed after collection |

Run `pnpm privacy:retention` for a dry-run report and `pnpm privacy:retention -- --apply` from an authorised scheduled backend job to apply it. Clinical deletion also requires `RETENTION_DELETE_CLINICAL_RECORDS=1`. The six-year default is a configurable operational starting point, not a legal conclusion; the deploying institution must replace it with its approved records schedule.

### Append-only accountability

Audit and AI-processing tables reject updates. Deletion is rejected until `retention_until`. Audit metadata intentionally excludes names, phones, tokens, transcripts, and prescription content. Audit failure is logged server-side without discarding an already-saved clinical action; production monitoring must alert on `[audit]` errors.

### Prescribing limitations

Speech never writes directly. Static validation rejects missing or unrecognized prescription fields, and clinician confirmation is mandatory. A visit-specific patient profile records explicit age, pediatric weight, sex recorded at birth, pregnancy and lactation status, drug-allergy status/reaction, current prescription/OTC/herbal/supplement products, kidney/liver status, and other conditions. Unknown is kept distinct from none; Gemini cannot modify this confirmed profile.

The prescription route refuses incomplete profiles, requires the clinician to confirm reviewing the patient factors, and stores the exact snapshot used. A direct or supported class-level allergy match blocks the write. Dose-relevant uncertainty requires a separate stored acknowledgement. These controls do not calculate or certify dose suitability, and the interface states that the medication matcher remains incomplete. See [`CLINICAL_PRESCRIBING_CONTEXT.md`](CLINICAL_PRESCRIBING_CONTEXT.md) for the evidence and residual limits.

### Inclusion and accessibility

- Non-English speech modes are visibly labelled supervised.
- Patients see each transcript and an editable final summary.
- Clinicians see the source dictation and confirm every prescription field.
- Voice has typed and visible-text alternatives.
- Status is expressed through text/icons as well as colour.
- Touch controls meet the existing 44-pixel minimum design rule.
- Global keyboard focus and reduced-motion behavior remain enabled.
- Consent content is available in English, Yorùbá, Nigerian Pidgin, Hausa, and Igbo.

Required deployment testing remains: 200% zoom, keyboard-only use, screen reader, forced-colour mode, microphone/camera denial, slow/offline network, long translated copy, low-literacy comprehension, and testing with people with visual, hearing, motor, speech, and cognitive disabilities. WCAG 2.2 applies to kiosk interfaces as well as ordinary web pages: <https://www.w3.org/TR/wcag/>.

## Language evidence and release gates

The current 100-clip report is a warning signal, not a validated product claim. Its Nigerian-language slices show high WER and near-total switch-point error. The `whisper_riva` file has incomplete provenance and is not evidence that NVIDIA Riva was run by this repository.

Every language/provider release decision must record consented and de-identified audio provenance; speaker and condition counts; provider, exact model/version, configuration, and run time; failures and timeouts in the denominator; overall WER plus symptom, negation, drug, dose, unit, and abbreviation accuracy; demographic and environment slices; and a clinician-approved threshold and rollback owner.

`DISABLED_LANGUAGE_CODES` provides an operational kill switch. Until thresholds are approved, non-English modes remain supervised and require transcript/summary confirmation.

## Data flow and external processors

| Data | Recipient | Purpose | Stored by IleraPoint |
|---|---|---|---|
| Short voice turn | Sahara | Speech-to-text | Transcript in consultation; raw turn audio is not separately stored |
| Question/summary text | Sahara | Text-to-speech | Only transient cache/process memory |
| Transcript and session memory | Gemini | Structured intake | Structured record and turns |
| Clinician dictation text | Gemini | Prescription draft extraction | Prescription audit transcript and hashed AI event |
| Optional full video | Supabase private Storage | Human clinician assessment | Until video retention deadline |
| Patient/clinical records | Supabase | Clinical workflow | Until approved clinical retention deadline |
| Visit-specific prescribing context | Supabase | Clinician review and prescription audit | Within the consultation and prescription snapshot until the clinical retention deadline |

The controller must document provider locations, processor terms, sub-processors, security measures, lawful basis, and cross-border transfer mechanism. The Nigeria Data Protection Commission explains that the NDP Act covers processing in Nigeria and processing of Nigerian data subjects, and that overseas transfers require adequate protection or another lawful basis: <https://ndpc.gov.ng/faqs/>.

## Governance before deployment

1. Name a clinical safety officer, data-protection lead, security owner, accessibility owner, and incident commander.
2. Complete and approve a DPIA covering sensitive health data, AI providers, video, shared kiosks, monitoring, and cross-border processing.
3. Clinically review the formulary, medication rules, care routing, escalation, sensor calibration, and all patient-facing claims.
4. Validate every translation through native-speaking clinicians and comprehension testing with intended users.
5. Run a threat model and penetration test, including enumeration, token theft, signed URLs, service-role exposure, and kiosk reset behavior.
6. Establish an adverse-event channel. Freeze affected models/languages, preserve audit evidence, notify accountable staff, assess patient impact, and document corrective action.
7. Obtain ethics approval before research involving human recordings. Nigeria's NHREC identifies informed consent, data privacy, participant rights, and scientific validity as core review concerns: <https://nhrec.gov.ng/>.
8. Re-run clinical and inclusion validation after any model, prompt, provider, microphone, sensor, language-copy, or threshold change.

WHO recommends lifecycle documentation, clear intended use, human intervention, external validation, data quality, cybersecurity, transparency, and accountability for AI used in health: <https://www.who.int/news/item/19-10-2023-who-outlines-considerations-for-regulation-of-artificial-intelligence-for-health>.

## Residual risks

- The unchanged exact-match red-flag mechanism can miss emergencies.
- Patient identity is still knowledge-based rather than strong authentication.
- In-process lookup throttling is not distributed.
- Third-party provider behavior, retention, and model updates remain external dependencies.
- Translated privacy copy and language quality are not yet independently validated.
- The medication check is deliberately incomplete.
- The structured prescribing context improves completeness but does not replace diagnosis-specific assessment, current drug monographs, renal/hepatic measurements, laboratory data, or pharmacist review.
- No software control can establish sensor clinical validity without reference-device studies.

These limitations must remain visible in demonstrations, evaluations, funding submissions, and deployment decisions.
