# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React, Vite, Tailwind CSS, and a thin Node/Express server, as specified by the user. The browser app runs in full-screen Chromium kiosk mode on Raspberry Pi-class hardware.

## Users

Primary users are walk-up patients at Nigerian and African primary-care kiosks. They may have low literacy, may be using the kiosk for the first time, and may naturally code-switch between English, Yoruba, Nigerian Pidgin, Hausa, or Igbo.

Secondary users are authenticated doctors who review the structured intake record, full transcript, and any consented recording before approving, flagging, or prescribing.

## Product Purpose

IleraPoint lets patients find or create a record using their name or phone, offers a short sensor-based temperature and heart-rate check, conducts a voice-led intake, checks deterministic emergency red flags, records the session only with explicit consent, and sends the corrected record to an authenticated doctor for human review and prescribing.

## Positioning

IleraPoint combines code-switched African speech handling, a single-turn-per-response structured interview loop, and a non-LLM red-flag safety layer in a touch-first primary-care kiosk.

## Operating Context

The product is used on a shared full-screen kiosk in a clinic or community health setting. Raspberry Pi-class kiosks can connect to an MLX90614 temperature sensor and MAX30102 pulse sensor through a Python service bound to localhost and proxied by the application server. Patient identity, consultations, consent choices, sensor readings, and prescriptions persist in Supabase. Doctors work in protected routes in the same web application.

## Capabilities and Constraints

- Browser microphone capture, local voice-activity detection, silence-based automatic turn completion, and short-utterance transcription.
- Sahara is the only speech playback provider and its credentials remain server-side; failed generation is disclosed instead of substituting a lower-quality device voice.
- One Gemini structured-output call per patient turn for extraction and the next question.
- Natural completion when required intake information is present, with no fixed seven-question target and a 12-turn internal runaway ceiling.
- History-aware duplicate-question rejection and concise language-matched fallback questions when the model repeats or combines prompts.
- Full visit turn history is supplied to Gemini so later statements can revise earlier facts.
- Deterministic rollback of the most recent answer and direct editing of summary fields.
- Deterministic emergency detection for difficulty breathing, chest pain, loss of consciousness, severe bleeding, and seizure.
- Emergency escalation interrupts the interview immediately.
- Summary speech playback and a separate clinician review route.
- A public, authentication-free Yoruba image-to-speech tool extracts editable text from a JPG, PNG, or WebP image, restores Yoruba orthography without translating code-switched English, assigns editable Sahara voices to screenplay characters, and generates a paced downloadable WAV.
- API credentials remain server-side.
- Returning patients search records by name or phone; new patients register their details before the interview.
- The kiosk performs no biometric identification and captures no photograph during patient record access.
- Continuous 640×480 audio/video recording is opt-in, normalized to `video/webm`, and stored privately for human clinician review only.
- After recording consent and before the voice interview, the kiosk automatically attempts an approximately 10-second MLX90614 temperature and MAX30102 heart-rate capture with live pulse status, progress, signal waveform, positioning guidance, and a visible skip path.
- Unstable or unavailable sensor captures remain recoverable: patients can retry after repositioning or continue without vitals, and skipping never blocks the interview.
- Successful sensor capture is stored inside `structured_record.vitals` as `temperature_c`, `heart_rate_bpm`, `captured_at`, `confidence`, and `sample_quality`; the same temperature and heart-rate readings appear in the patient summary and clinician case review.
- SpO₂ is not displayed, stored, or implied because the available pulse-oximeter path is not calibrated for that measurement.
- Supabase persists patients, consultations, doctors, prescriptions, corrected turn history, and any captured vitals within the structured consultation record.
- Doctors authenticate with email/password, review an oldest-first queue including captured temperature and heart rate when present, approve or flag cases, and issue plain-text prescriptions.
- No AI video analysis, live video calls, drug interaction checks, pharmacy inventory, diagnosis, autonomous prescribing, or dispensing.

## Brand Commitments

The product name is IleraPoint. Copy must be calm, direct, respectful, and understandable to first-time and low-literacy users. Core welcome guidance is provided in English, Yoruba, and Nigerian Pidgin.

## Evidence on Hand

The user supplied the architecture, state shape, safety function, Sahara endpoint contracts, provider interface, screen list, and technical stack. No logo, photography, testimonials, clinical validation claims, or existing brand system were supplied; future work must not fabricate them.

## Product Principles

- Safety decisions that can be deterministic must remain outside the LLM.
- Every screen should make the next physical action obvious.
- Voice is primary; visible text and touch controls provide reassurance and recovery.
- The experience should stay calm and human even when escalating urgency.
- Corrections must have a deterministic path that does not depend on speech or model quality.

## Accessibility & Inclusion

Use large touch targets, strong contrast, plain language, visible system status, captions/transcripts for voice content, keyboard operability, reduced-motion support, and layouts readable at kiosk distance. Multilingual guidance must remain present without forcing users through a dense language-selection flow.
