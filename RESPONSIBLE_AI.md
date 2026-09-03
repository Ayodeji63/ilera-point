# Responsible AI note

## Scope

IleraPoint structures patient-reported intake information. It does not diagnose illness, recommend medicine, or replace a clinician. Emergency escalation is a deterministic application rule and does not depend on Gemini classifying urgency.

Consultation video is never sent to Gemini or any other AI model. It exists only for a human doctor's visual assessment after separate, explicit patient consent. Palm images are transient biometric inputs sent to Tencent PalmAI and are not stored by IleraPoint. A palm failure cannot deny access to intake because manual name/phone lookup remains available.

## Language performance

The kiosk supports English, Yorùbá-English, Nigerian Pidgin-English, Hausa-English, and Igbo-English speech. Performance can vary by language, accent, recording quality, background noise, microphone distance, and the amount of code-switching in an utterance.

Hausa is sent to Sahara using the documented `ha` language code. The server rejects unknown language codes rather than silently defaulting to English. This removes a configuration path that could disproportionately degrade one language.

The project includes a matched-clip Hausa diagnostic harness:

```bash
npm run benchmark:hausa -- ./path/to/hausa-clip.webm "expected reference transcript"
```

For the same audio file, the harness compares:

1. Telehealth post-processing.
2. General post-processing.
3. Telehealth transcription with LLM corrections disabled.

When a reference transcript is provided, the harness reports word error rate for each mode. Test clips should be matched across languages for noise, code-switch density, microphone distance, and accent familiarity before drawing comparative conclusions.

No matched Hausa evaluation audio was supplied with V2, so this repository does not claim that the quality difference has been resolved empirically. If matched testing continues to show materially weaker Hausa performance, that result should remain documented and visible rather than being hidden or removing Hausa support.

## Correction and human review

- Gemini receives the full visit conversation so later corrections can replace earlier extracted facts.
- “Redo my last answer” restores the exact record snapshot from before the most recent turn without relying on AI interpretation.
- The patient can edit every patient-facing record field before clinician handoff.
- A clinician must review and approve or flag the resulting record.
- V3 persists corrected consultations and prescriptions in Supabase for authenticated clinician review; biometric images remain transient and video remains in private Storage.
