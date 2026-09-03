# IleraPoint V1

IleraPoint V1 is a browser-based, voice-driven patient intake and triage kiosk for Nigerian and African primary-care settings. It is designed for patients who may naturally mix English with Yorùbá, Nigerian Pidgin, Hausa, or Igbo while speaking.

V1 provides a complete four-turn intake flow, creates a structured patient record with Gemini, checks emergency symptoms using deterministic application code, reads the summary back through Sahara TTS, and hands the result to a clinician review screen.

## V1 status

Implemented:

- Full-screen, touch-friendly React kiosk interface.
- English, Yorùbá-English, Pidgin-English, Hausa-English, and Igbo-English language options.
- Browser microphone recording with `MediaRecorder`.
- Sahara sync file-upload speech-to-text.
- Sahara transcription polling when the sync endpoint returns HTTP 503.
- Sahara streaming text-to-speech through the server.
- One Gemini structured-output request per interview turn.
- Hard interview limit of four patient turns.
- Deterministic red-flag checking after every turn.
- Immediate, non-dismissible emergency screen for detected red flags.
- Plain-language patient summary with speech playback.
- Separate clinician review view with Approve and Flag for follow-up actions.
- Typed-answer fallback for accessibility and demonstrations; typed answers still require Gemini.
- Responsive kiosk and mobile layouts, keyboard focus states, reduced-motion support, and locally bundled hyperlegible typography.

V1 uses the real Sahara and Gemini integrations. There is no mock speech provider or mock interview fallback; current kiosk builds use FFmpeg's local `flite` voice only when Sahara TTS is unavailable.

## Patient flow

1. The patient chooses a language and starts the check-in.
2. The app reads the first question aloud.
3. The patient records a short answer or types it.
4. Sahara transcribes recorded audio.
5. Gemini receives the transcript and current record in one request, then returns:
   - the updated structured record;
   - the next question;
   - whether the interview is complete.
6. The application runs its own deterministic red-flag check.
7. A red flag immediately opens the emergency screen. Otherwise, the interview continues for no more than four turns.
8. Sahara reads the completed summary aloud.
9. The clinician reviews and approves or flags the record.

## Safety behavior

The following symptoms trigger the emergency screen when they appear in the chief complaint or associated symptoms:

- Difficulty breathing
- Chest pain
- Loss of consciousness
- Severe bleeding
- Seizure

This check is implemented in [`src/lib/safety/redFlags.js`](src/lib/safety/redFlags.js) and does not depend on Gemini deciding whether a case is urgent.

Symptoms explicitly denied by the patient are stored separately in `negative_symptoms_checked`. The summary labels these as denied symptoms so they cannot be mistaken for active complaints.

The emergency screen is visible on the kiosk and instructs the patient to call a health worker. V1 does not send an external SMS, pager, email, or staff notification.

## Technical architecture

```text
Patient speech
    ↓
Browser MediaRecorder
    ↓
Express API
    ↓
Sahara STT sync upload ── 503 fallback → Sahara status polling
    ↓
Gemini structured interview turn
    ↓
Updated patient record
    ↓
Deterministic red-flag check
    ├── emergency → Emergency screen
    └── complete  → Sahara streaming TTS → Summary → Clinician review
```

### Frontend

- React
- Vite
- Tailwind CSS
- Plain React component state
- Lucide icons
- Atkinson Hyperlegible Next variable font

### Backend

- Node.js and Express
- Multer for in-memory audio uploads
- `ws` for the Sahara TTS WebSocket connection
- Server-side Sahara and Gemini credentials

### External services

- Sahara STT: `POST https://infer.voice.intron.io/file/v1/upload/sync`
- Sahara STT status: `https://infer.voice.intron.io/file/v1/status/{file_id}`
- Sahara TTS: `wss://infer.voice.intron.io/tts/v1/stream`
- Gemini: structured JSON generation through the Gemini API

## Structured record

Each visit uses this in-memory shape:

```json
{
  "chief_complaints": ["fever", "headache"],
  "onset": "yesterday evening",
  "associated_symptoms": ["chills", "body aches"],
  "negative_symptoms_checked": ["difficulty breathing", "chest pain"],
  "still_missing": ["medication history"],
  "turn_count": 2
}
```

The session is held only in React memory. V1 does not store patient history in a database.

## Project structure

```text
server/
  index.js                         Sahara and Gemini API routes
src/
  components/
    BrandHeader.jsx
    WelcomeScreen.jsx
    ConversationScreen.jsx
    EmergencyScreen.jsx
    SummaryScreen.jsx
    ReviewScreen.jsx
  lib/
    providers/SpeechProvider.js   Sahara speech provider
    llm/interviewTurn.js          Browser-to-server interview request
    safety/redFlags.js            Deterministic emergency check
  App.jsx                         Interview state and screen flow
  main.jsx
  styles.css
.env.example
PRODUCT.md                        Product requirements and constraints
DESIGN.md                         V1 visual system
```

## Local setup

Requirements:

- A recent Node.js version
- A Sahara API key
- A Gemini API key
- A browser with `MediaRecorder` and microphone support

Install and configure:

```bash
npm install
cp .env.example .env
```

Add credentials to `.env`:

```env
SAHARA_API_KEY=your_sahara_api_key
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash-lite
PORT=8787
```

Start the frontend and API server:

```bash
npm run dev
```

Open `http://localhost:5173` and grant microphone permission.

The API server runs at `http://localhost:8787`; Vite proxies browser `/api` requests to it. Neither API key is included in browser JavaScript.

## Available routes

- `/` — patient kiosk flow
- `/review` — clinician review view
- `/api/health` — confirms whether both required server credentials are configured
- `/api/interview` — Gemini interview turn
- `/api/speech/transcribe` — Sahara STT proxy
- `/api/speech/synthesize` — Sahara streaming TTS proxy

## Verification completed

```bash
npm test
npm run build
```

Current automated verification:

- Deterministic red-flag unit tests: passing
- Production Vite build: passing
- Dependency audit: no known vulnerabilities at the time of the V1 build
- UI design detector: no findings
- Independent UI finish review: pass

The live Sahara and Gemini requests require valid user credentials and have not been claimed as verified without those credentials.

## V1 limitations

- No database or patient history.
- No authentication or clinician accounts.
- No real external emergency notification.
- No ESP32 or vitals-hardware integration.
- No medicine dispensing.
- No diagnosis, treatment advice, or medication recommendations.
- A record is available to the clinician route only while the current browser session remains in memory.
- Deployment hardening, clinical validation, consent language, audit logs, monitoring, and production privacy controls remain future work.

## Raspberry Pi kiosk deployment

Serve the production build and open it in Chromium with microphone permission. Chromium can then be launched using kiosk mode:

```bash
chromium --kiosk https://your-ilera-point-url
```

Production deployment should use HTTPS because browsers generally require a secure context for microphone access.
