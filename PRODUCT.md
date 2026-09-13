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

IleraPoint lets patients find or create a record using their name or phone, conducts a short voice-led intake, checks deterministic emergency red flags, records the session only with explicit consent, and sends the corrected record to an authenticated doctor for human review and prescribing.

## Positioning

IleraPoint combines code-switched African speech handling, a single-turn-per-response structured interview loop, and a non-LLM red-flag safety layer in a touch-first primary-care kiosk.

## Operating Context

The product is used on a shared full-screen kiosk in a clinic or community health setting. Patient identity, consultations, consent choices, and prescriptions persist in Supabase. Doctors work in protected routes in the same web application.

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
- Supabase persists patients, consultations, doctors, prescriptions, and corrected turn history.
- Doctors authenticate with email/password, review an oldest-first queue, approve or flag cases, and issue plain-text prescriptions.
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
