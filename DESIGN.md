---
name: IleraPoint
description: A calm identity-to-care route for walk-up patient intake.
colors:
  clinic-green: "#103f33"
  route-green: "#1d6e59"
  sunlit-yellow: "#f2d533"
  chalk-white: "#f4f0e5"
  paper-white: "#ffffff"
  slate-green: "#527269"
  mist-green: "#b8d5cc"
  divider-green: "#d8e1dc"
  field-chalk: "#f1f3ee"
  edit-chalk: "#edf0eb"
  status-green-wash: "#e7f1ed"
  muted-control: "#e3e7e3"
  transcript-ink: "#36564e"
  placeholder-green: "#7f908b"
  manual-placeholder-green: "#45655d"
  future-stop: "#c7c8bc"
  camera-deep-green: "#092c24"
  capture-ready-green: "#55e39b"
  listening-coral: "#ef755f"
  alert-oxblood: "#8e2f24"
  warning-wash: "#fff2c7"
  warning-ink: "#6d5510"
  success-wash: "#dff2e9"
  success-ink: "#155944"
  error-wash: "#fff0e8"
  error-ink: "#8b311f"
  focus-blue: "#0a78ff"
typography:
  display:
    fontFamily: "Atkinson Hyperlegible Next Variable, Segoe UI, sans-serif"
    fontSize: "clamp(3rem, 7vw, 6rem)"
    fontWeight: 900
    lineHeight: 0.92
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Atkinson Hyperlegible Next Variable, Segoe UI, sans-serif"
    fontSize: "clamp(2.4rem, 5vw, 4.8rem)"
    fontWeight: 900
    lineHeight: 1.02
    letterSpacing: "-0.04em"
  title:
    fontFamily: "Atkinson Hyperlegible Next Variable, Segoe UI, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 900
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  compact-title:
    fontFamily: "Atkinson Hyperlegible Next Variable, Segoe UI, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 900
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  body:
    fontFamily: "Atkinson Hyperlegible Next Variable, Segoe UI, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.625
    letterSpacing: "normal"
  label:
    fontFamily: "Atkinson Hyperlegible Next Variable, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 900
    lineHeight: 1.5
    letterSpacing: "0.1em"
rounded:
  compact: "12px"
  control: "14px"
  panel: "16px"
  round: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.clinic-green}"
    textColor: "{colors.paper-white}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "16px 24px"
    height: "64px"
  button-directional:
    backgroundColor: "{colors.sunlit-yellow}"
    textColor: "{colors.clinic-green}"
    typography: "{typography.body}"
    rounded: "{rounded.round}"
    padding: "16px 24px"
    height: "56px"
  button-quiet-on-dark:
    backgroundColor: "rgba(255, 255, 255, 0.10)"
    textColor: "{colors.paper-white}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "16px 24px"
    height: "64px"
  button-recovery:
    backgroundColor: "{colors.status-green-wash}"
    textColor: "{colors.success-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
    height: "48px"
  button-row-action:
    backgroundColor: "{colors.route-green}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.compact}"
    size: "48px"
    height: "48px"
    width: "48px"
  button-row-cancel:
    backgroundColor: "{colors.muted-control}"
    textColor: "{colors.clinic-green}"
    rounded: "{rounded.compact}"
    size: "48px"
    height: "48px"
    width: "48px"
  patient-route-active:
    backgroundColor: "{colors.clinic-green}"
    textColor: "{colors.paper-white}"
    typography: "{typography.body}"
    rounded: "{rounded.compact}"
    padding: "12px"
    height: "48px"
  patient-route-idle:
    backgroundColor: "{colors.edit-chalk}"
    textColor: "{colors.manual-placeholder-green}"
    typography: "{typography.body}"
    rounded: "{rounded.compact}"
    padding: "12px"
    height: "48px"
  button-voice:
    backgroundColor: "{colors.sunlit-yellow}"
    textColor: "{colors.clinic-green}"
    rounded: "{rounded.round}"
    size: "128px"
    height: "128px"
    width: "128px"
  button-voice-recording:
    backgroundColor: "{colors.listening-coral}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.round}"
    size: "128px"
    height: "128px"
    width: "128px"
  field-answer:
    backgroundColor: "{colors.field-chalk}"
    textColor: "{colors.clinic-green}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
    height: "64px"
  field-summary-edit:
    backgroundColor: "{colors.edit-chalk}"
    textColor: "{colors.clinic-green}"
    typography: "{typography.body}"
    rounded: "{rounded.compact}"
    padding: "12px 16px"
    height: "48px"
  field-clinician:
    backgroundColor: "{colors.field-chalk}"
    textColor: "{colors.clinic-green}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
    height: "56px"
  status-recording:
    backgroundColor: "{colors.alert-oxblood}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.round}"
    padding: "8px 16px"
  card-route:
    backgroundColor: "{colors.clinic-green}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.panel}"
    padding: "40px"
  card-notes:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.clinic-green}"
    rounded: "{rounded.panel}"
    padding: "28px"
---

# Design System: IleraPoint

## Overview

**Creative North Star: "The Care Route Board"**

IleraPoint makes a clinical intake feel like following a clear, human route rather than completing a form. Its visual world borrows the certainty of wayfinding: one dominant instruction, visible route choices, seven safety-ceiling stops, oversized directional controls, and high-contrast panels that can be read at kiosk distance. The same board language now spans returning-patient identification, new-patient signup and palm enrollment, informed recording consent, voice intake, the public Yoruba image-to-speech utility, clinician review, and a deliberately separate prescription stage.

The atmosphere is calm but not timid. Deep clinic green provides institutional trust, sunlit yellow identifies the next physical action, and chalk-toned backgrounds keep the environment warm and public-facing. Strong type, sparse choices, and grounded panels prioritize low-literacy clarity without making the experience childish.

**Key Characteristics:**

- Oversized wayfinding copy with one obvious action per stage.
- Clinic green structure, sunlit yellow direction, and chalk-white breathing room.
- Squared route panels softened by modest corners; circles are reserved for voice, status, and compact controls.
- Bold, hyperlegible type designed for standing distance and touch-first use.
- Persistent visible status, saved-answer count, deterministic correction controls, transcription, consent state, and multilingual reassurance.
- A two-route identity board: automatic palm or manual lookup for returning patients, and details-first signup for new patients.
- Local hand tracing and automatic capture with explicit transient-image reassurance and a timed no-palm escape.
- A public, no-auth Yoruba image-to-speech workspace that pairs source imagery with editable text and playable output.
- A denser but visually related doctor workspace with an oldest-first queue, evidence-first case review, and prescription as a separate committing step.

## Colors

The palette pairs deep, dependable greens with a warm yellow route marker; coral and oxblood appear only when the patient state demands a different level of attention.

### Primary

- **Clinic Green:** The structural color for route panels, primary controls, headings, and footer bands.
- **Route Green:** The affirmative accent for completed stops, approval actions, and ready states.

### Secondary

- **Sunlit Yellow:** The directional accent for the next action, active route stop, voice control, and follow-up choice.
- **Listening Coral:** A temporary state color used only while recording.

### Tertiary

- **Alert Oxblood:** A high-attention color for deterministic emergency surfaces and the persistent consented-recording indicator.
- **Focus Blue:** The universal keyboard focus outline; it stays visually distinct from product-state colors.
- **Capture Ready Green:** Confirms that the locally traced palm is correctly framed, open, and steady enough for automatic capture.

### Neutral

- **Chalk White:** The warm patient-facing canvas.
- **Paper White:** Raised notes, record, and compact control surfaces.
- **Slate Green:** Secondary copy and field labels on light surfaces.
- **Mist Green:** Supporting text on dark green route panels.
- **Divider Green:** Quiet row and section separators.
- **Field Chalk:** The inset surface for typed-answer fields.
- **Edit Chalk:** The in-place editing surface for summary rows.
- **Status Green Wash:** The pale-green chip and deterministic recovery-control surface.
- **Muted Control:** The quiet cancel-control surface beside affirmative Save.
- **Transcript Ink:** The readable green-gray used for saved patient speech.
- **Placeholder Green:** The softer green-gray used for empty and placeholder transcript copy.
- **Manual Placeholder Green:** The darker accessible placeholder used on patient name and phone recovery fields.
- **Future Stop:** The muted gray-green for unanswered route positions.
- **Camera Deep Green:** The dark inset backing for the live camera feed and its unavailable-state overlay.
- **Warning Wash / Warning Ink:** A paired notice treatment for missing information.
- **Success Wash / Success Ink:** A paired confirmation treatment for approved records.
- **Error Wash / Error Ink:** A paired, readable treatment for recoverable errors and follow-up states.

**The Yellow Means Go Rule.** Sunlit yellow identifies the action or route position that moves the encounter forward; do not spend it on passive decoration.

**The Oxblood Means Active Attention Rule.** Alert oxblood belongs only to deterministic emergency treatment and the explicit “Visit recording” status. Recoverable errors use the softer error wash and ink pair.

## Typography

**Display Font:** Atkinson Hyperlegible Next Variable (with Segoe UI and sans-serif fallbacks)  
**Body Font:** Atkinson Hyperlegible Next Variable (with Segoe UI and sans-serif fallbacks)

**Character:** One highly legible family carries the entire experience. Heavy weights and tightly tracked headings behave like public wayfinding, while semibold body copy remains open and readable across English and supported African-language text.

### Hierarchy

- **Display** (black, fluid 3–6rem, 0.92 line-height): Welcome, emergency, and summary statements; keep these brief and balanced.
- **Headline** (black, fluid 2.4–4.8rem, 1.02 line-height): The current interview question inside the route panel.
- **Title** (black, 1.875rem, 1.2 line-height): Record and panel headings.
- **Compact Title** (black, 1.5rem, 1.2 line-height): Transcript-card headings where the supporting column is narrow.
- **Body** (semibold, 1.125rem, 1.625 line-height): Reassurance, transcripts, descriptions, and patient-facing guidance.
- **Label** (black, 0.875rem, 0.1em tracking, uppercase): Progress, field names, and compact metadata.

**The Distance Test Rule.** The current question, state, and next action must remain legible from standing kiosk distance; never trade type size or contrast for density.

**The One Family Rule.** Use the hyperlegible family across interface copy. Hierarchy comes from scale, weight, case, and spacing—not a decorative second typeface.

## Layout

Patient screens occupy the full dynamic viewport. Content sits inside centered containers up to 1380px wide with 20px mobile gutters and 40px desktop gutters. The welcome and conversation stages become two-column boards at the medium breakpoint: roughly balanced copy/action on welcome, and a 1.15/0.85 route-panel-to-notes split during the interview. Palm onboarding uses a 1280px 1.08/0.92 camera-to-route split: the stable left panel carries scan guidance and live feedback, while the right panel changes between returning-patient recovery, new-patient details, and details-ready enrollment. Consent narrows to a single 1024px two-column decision board. Summary content narrows to 1024px.

The public Yoruba image-to-speech route uses a 1280px work area and one joined two-panel board. At large widths, the dark upload/preview panel takes 0.9fr and the white transcription/audio panel takes 1.1fr; below the large breakpoint they stack in source-to-output order. Both panels keep a 520px minimum working height on wide layouts, while action buttons stack by default and share a row from the small breakpoint upward. On mobile, both grid children and the image preview explicitly permit shrinking and clip accidental spill; filenames and cast names truncate, capability copy wraps anywhere when necessary, and each voice-control pair remains intact so no content forces horizontal page overflow.

The authenticated doctor workspace increases information density without becoming dashboard chrome. Its queue is a single 1180px chronological list. Case review expands to 1320px with a 1.1/0.9 record-to-evidence split, while the prescription route narrows to 896px and a 0.8/1.2 context-to-form split so prescribing reads as a distinct committing stage rather than another case action.

Spacing follows an 8px-root rhythm, most visibly through 12, 16, 24, 32, and 40px intervals. Panels use generous padding and a minimum 66vh working height during conversation. At 640px and below, the welcome layout compresses deliberately: the action circle reduces to 250px, supporting text tightens, and the two columns stack. Action groups stack on narrow screens and become horizontal when space allows.

**The One Route Rule.** Each patient stage gives the primary instruction and primary physical action the largest share of space; supporting notes remain adjacent or directly below, never competitive.

## Elevation & Depth

Depth is restrained and structural. Dark route panels use a broad green-tinted lift, while white record surfaces and compact controls use lighter ambient shadows. Tonal layering and contrast do most of the separation; shadows never become glossy or ornamental. A large, low-opacity yellow circle behind the kiosk shell acts as environmental light rather than a floating card.

### Shadow Vocabulary

- **Route Lift** (`0 18px 45px rgba(16, 63, 51, 0.12)`): Dark route panels and the welcome action.
- **Panel Lift** (`0 16px 40px rgba(16, 63, 51, 0.08–0.10)`): White notes and clinician record panels.
- **Compact Lift** (`0 8px 22px rgba(16, 63, 51, 0.10)`): Language control.
- **Action Lift** (`0 10px 25px rgba(16, 63, 51, 0.08)`): Secondary white action buttons.

**The Grounded Board Rule.** Shadows establish a readable layer order, not spectacle. Do not stack multiple floating surfaces or add colored glows outside active progress and recording feedback.

## Shapes

The form language is a care board with softened corners. Main panels use gently squared 16px corners; fields, notices, buttons, and the brand tile use 14px corners. Full circles and pills are reserved for microphone actions, route stops, completion marks, language/status chips, and selected directional controls. The palm camera adds one organic silhouette: a 42%-rounded dashed guide inset from the feed, overlaid by a 21-point hand trace. Thin green-gray dividers organize records without turning the interface into a boxed form.

**The Circle Has Meaning Rule.** Use circles for voice, progress, and compact status—not as a generic card silhouette. The contrast between circular actions and squared information panels makes the route scannable.

## Components

### Buttons

- **Shape:** Standard action buttons are squared-soft controls with 14px corners and a 64px minimum height. Read-aloud and compact return actions may use pill geometry with a 56px minimum height.
- **Primary:** Clinic green with white, heavy text; use for committing, continuing, or submitting.
- **Directional:** Sunlit yellow with clinic-green text; use where the route advances or a highlighted choice needs immediate recognition.
- **Quiet on Dark:** A translucent white surface with white text presents an equally valid, lower-emphasis choice on clinic green, including “Continue without video.” It remains full-sized and never looks disabled.
- **Recovery:** Pale success green with deep success ink marks deterministic, non-destructive correction. “Redo my last answer” appears after every saved turn and remains at least 48px high.
- **Row Actions:** Summary Edit controls are labeled and at least 48px high; while editing, Save and Cancel become separate 48px square icon controls with explicit accessible names.
- **Voice:** A 128px circular yellow control with a centered microphone. Recording swaps to listening coral with a stop icon and two expanding white rings.
- **Hover / Focus:** The large welcome action scales to 1.025 on hover and 0.98 on press; ordinary touch controls use restrained press feedback. Every interactive element receives the 4px focus-blue outline with a 4px offset.
- **Disabled:** Preserve the component color but reduce opacity to 40–60%; processing voice controls also show a wait cursor.

### Chips

- **Style:** Status chips are full pills with pale green fill, route-green text, compact horizontal padding, and black-weight labels. The transcript header uses the same treatment for the live “n saved” count.
- **State:** Active progress is yellow with a translucent yellow halo; completed progress is route green; future stops are muted gray-green.

### Cards / Containers

- **Corner Style:** Main route, notes, and record containers use 16px corners.
- **Background:** Clinic green for the active route; paper white for transcript and record surfaces.
- **Shadow Strategy:** Use route or panel lift according to surface role.
- **Border:** Avoid enclosing borders. Use thin divider-green rules between transcript or record rows.
- **Internal Padding:** 20–28px on compact/mobile surfaces and 36–40px on desktop route and record surfaces.

### Inputs / Fields

- **Style:** Typed answers sit on field-chalk with clinic-green semibold text, 14px corners, and a 64px minimum height. The adjacent send control is a square 64px clinic-green button. Summary rows switch in place to a 48px-high, 12px-corner edit field so the record structure does not jump. Doctor login and prescription fields reuse the same chalk inset treatment at a 56px minimum height; prescription instructions use a fixed three-row textarea.
- **Focus:** Use the universal focus-blue outline outside the field; do not rely on a subtle border shift.
- **Error / Disabled:** Recoverable errors appear above the field in error wash with error ink. Disabled send actions reduce opacity to 40%.

### Editable Summary Rows

Each summary fact occupies a divider-separated row with a stable label, a bold patient-readable value, and a visible Edit action. Editing is local to one fact and exposes explicit Save and Cancel controls; Enter saves and Escape cancels. Main concern, onset, other symptoms, symptoms denied, and medicines all use the same correction pattern. The confirmation CTA below the rows reads “Everything is correct — continue” and remains the only dominant route-forward action.

### Navigation

The header is a simple brand-and-utility band: a 44px rounded-square shield tile, heavy wordmark, uppercase descriptor, and an optional white language pill. It has no conventional navigation chrome. On small screens, the “I speak” helper label hides while the native select remains visible and usable.

### Route Progress

Seven 14px circular stops show the safety ceiling rather than implying a required seven-question journey. The active stop is sunlit yellow with a 7px translucent halo; completed stops are route green; upcoming stops are muted gray-green. Pair the dots with the exact “Question n · up to 7” label so color is never the only cue and natural early completion stays clear.

### Palm Onboarding & Manual Recovery

Palm onboarding is a two-panel care board with an explicit segmented choice between **Returning patient** and **I’m a new patient**. The dominant clinic-green panel carries the 4:3 camera feed, a dashed organic palm guide, the live 21-point hand trace, privacy reassurance, and an `aria-live` status row. Yellow means the hand still needs adjustment; capture-ready green means one complete, open palm has remained steady long enough for automatic capture. There is no capture button.

The returning route starts scanning immediately and keeps manual name/phone lookup in the adjacent white panel. A failed match offers three clear outcomes: create a new patient record, retry the automatic scan, or continue using manual search results. The new-patient route reverses the sequence intentionally: collect full name and phone first, confirm those details, then enable palm enrollment. Only after identification or enrollment does the route proceed to recording consent and conversation.

Palm tracing runs locally from packaged MediaPipe assets on the kiosk. The interface states that the captured image is used only during this identity step and is not stored by IleraPoint. Capture itself is automatic: the kiosk checks for one full, centered, open palm, waits for steadiness, samples three frames, and uses the sharpest transient image for identification or enrollment.

No-palm continuation is a first-class recovery path for new patients. **Continue without palm** appears after 12 seconds of active scanning, immediately when camera permission is denied or no camera exists, when the camera or local tracing fails, or after capture processing stops with an error. Camera overlays explain starting, blocked, missing, and failed states and retain a labeled **Retry camera** control.

**The Equal Access Rule.** Palm scanning is the primary identity action, not a gate to care. Returning patients retain manual lookup, and new patients gain a no-palm continuation after the timed or hardware-failure threshold.

**The Details Before Enrollment Rule.** New-patient name and phone must be entered and confirmed before the palm scan can enroll an identity or the patient can continue to conversation.

**The Transient Palm Rule.** Keep local tracing, automatic capture, and non-storage reassurance visible together. Never imply that IleraPoint saves the palm image or requires a person to press a capture control.

### Recording Consent & Indicator

Consent is a dedicated route stage, not a checkbox buried in intake. A clinic-green two-column board explains what is recorded, who can review it, that video receives no AI analysis, and that declining does not affect care. The yellow agreement action and full-size translucent “Continue without video” action make both outcomes explicit without suggesting that consent is required.

When consent is granted, a fixed bottom-left oxblood pill remains visible throughout the conversation with a pulsing white dot, video icon, and the exact label “Visit recording.” The indicator uses status semantics and reduced-motion behavior; it never substitutes for the prior consent decision.

### Yoruba Image-to-Speech Workspace

The public `/yoruba-image-to-speech` route extends the care board into a focused source-to-output utility without requiring authentication. A prominent back action returns to check-in. The dark clinic-green source panel accepts click-to-upload or drag-and-drop JPG, PNG, and WebP images up to 8 MB; its dashed 14px-corner drop zone becomes a camera-deep preview field with a yellow border after selection, then shows the filename, file size, and a 48px remove control.

The paired white output panel keeps extracted Yoruba text editable in a field-chalk textarea with enough height for paragraph review. Copy explicitly asks users to correct words and tone marks before speech generation. Preparation is visibly two-stage: **Reading the image…** preserves screenplay lines and punctuation, then **Restoring written Yorùbá…** restores tone marks and underdots while retaining English dialogue. If restoration fails after OCR succeeds, the raw transcription remains available for manual editing and the error explains that fallback. Once prepared text is present, a persistent capability line identifies **Sahara v2.5**, **Yorùbá ↔ English code-switching**, restored tone marks, and screenplay pacing. Generation changes the primary clinic-green action label to “Creating speech — longer scripts may take a minute…”. Validation and service failures use the established error wash and ink alert. Editing after generation clears stale audio so text and output cannot silently diverge.

When character headings are detected, an editable **Cast voices** section appears between transcription and capability status. Each cast row is a compact edit-chalk container with a truncating character name and an intact Female/Male two-button group. The selected voice uses clinic green with white text; the alternative remains white with slate-green text. Buttons expose pressed state, and changing any assignment clears stale audio. The explanatory copy must state that character names are skipped in the recording and that suggested voices should be checked.

Successful synthesis appears in a success-wash result block with a native audio player and a full-width sunlit-yellow **Download WAV** action. The yellow treatment makes download the directional finish, while **Create Sahara speech** remains the main committing action beforehand and **Start over** stays a pale-green recovery action.

Screenplay structure is part of the audio contract, not incidental whitespace. Character headings remain separate from dialogue, change the active cast voice, produce a deliberate speaker pause, and are omitted from spoken audio. Ordinary line endings add a shorter phrase break; blank lines extend the preceding break; and commas, colons, semicolons, full stops, questions, and exclamations map to progressively explicit timing in the generated WAV. Preserve headings, line breaks, blank lines, and punctuation through both quality stages and editing so the written script’s rhythm survives synthesis.

For a mixed-gender cast, Sahara generation runs the male and female voice groups in parallel. The resulting speech chunks are restored to original screenplay order before pauses are inserted and the final WAV is assembled. The user receives one continuous ordered recording, never separate cast tracks or provider-order output.

**The Source Before Sound Rule.** Preserve the left-to-right and top-to-bottom sequence of image, editable Yoruba transcription, generation, playback, and download; never present generated audio before the user can inspect the extracted text.

**The Script Rhythm Rule.** Treat screenplay headings, line breaks, blank lines, and punctuation as pacing controls. Do not flatten the reviewed transcription before generating its WAV.

**The Cast Is Direction, Not Dialogue Rule.** Display detected character headings as editable voice assignments, but omit those labels from spoken output and always reassemble mixed-gender audio in screenplay order.

**The Public Utility Rule.** Keep the Yoruba converter visibly connected to IleraPoint through the shared header and board system, but do not introduce patient identity, palm, consent, or doctor-workspace controls into this no-auth route.

### Doctor Queue & Case Review

The authenticated clinician workspace keeps the board’s green, chalk, type, radius, and depth vocabulary while allowing denser reading. The queue is an oldest-first, full-width list with patient, time, chief complaint, urgent status, and a clear row arrow; refresh and sign-out remain compact utilities above it. Each case separates patient-reported record and transcript from consented video evidence, repeats emergency status in text, and groups Approve, Flag follow-up, and Continue to prescription in the evidence rail.

**The Evidence Before Action Rule.** Clinician decisions follow the record, transcript, and available recording in reading order. Status and safety information must never rely on color alone.

### Prescription Stage

Prescription is a separate route at `/doctor/case/:id/prescribe`, with its own heading, back-to-case action, patient concern context, and focused form. Drug and dosage share a two-column row at medium widths, instructions occupy the full width, and the single dominant submit action states that saving also completes the consultation.

**The Prescribing Is a Commitment Rule.** Do not collapse prescription fields into the case action rail or style them as a quick inline note. The dedicated stage makes clinician authorship and completion consequence explicit.

## Do's and Don'ts

### Do:

- **Do** make the current instruction and next physical action unmistakable at kiosk distance.
- **Do** use clinic green for structure and sunlit yellow sparingly for route direction.
- **Do** pair color-coded progress and status with explicit text or icons.
- **Do** keep the saved-answer count visible and offer “Redo my last answer” after every saved turn.
- **Do** keep summary editing local, reversible, and touch-safe with 48px Edit, Save, and Cancel controls.
- **Do** keep touch targets at least 44px high, with primary actions typically 56–64px and the voice control 128px.
- **Do** retain the 4px focus-blue outline and reduced-motion fallback.
- **Do** let multilingual reassurance remain visible without creating a dense language-selection step.
- **Do** preserve separate returning- and new-patient routes; collect and confirm new-patient details before palm enrollment and before conversation.
- **Do** keep manual name/phone lookup available throughout the returning-patient route.
- **Do** pair local MediaPipe tracing and automatic capture status with the plain-language promise that palm images are transient and not stored.
- **Do** expose **Continue without palm** after 12 seconds of new-patient scanning and immediately on camera, tracing, or capture failure.
- **Do** present recording consent as a dedicated, balanced choice and keep the consented recording indicator persistent during intake.
- **Do** keep the Yoruba utility’s image source and editable transcription visibly paired, preserving tone marks and line breaks in the review state.
- **Do** reserve sunlit yellow for the ready-state **Download WAV** finish and expose OCR, generation, validation, and service states in text.
- **Do** distinguish image reading from orthography restoration, and retain editable raw OCR when the restoration stage fails.
- **Do** expose detected cast voices as pressed-state Female/Male controls, omit speaker labels from audio, and preserve screenplay order in the assembled WAV.
- **Do** keep the stacked Yoruba workspace free of horizontal overflow by allowing panels and previews to shrink, truncating long names, and wrapping capability text.
- **Do** keep clinician queue order, patient-reported evidence, recording availability, and urgent status explicit in text.
- **Do** preserve prescription as a separate stage with patient context, a clear return path, and one completion action.

### Don't:

- **Don't** turn the patient flow into a dashboard, dense form, or multi-action control panel.
- **Don't** use alert oxblood for ordinary validation, warnings, or decoration; reserve it for emergency treatment and active visit recording.
- **Don't** spend sunlit yellow on passive surfaces that are not directional or active.
- **Don't** introduce decorative type, low-contrast copy, thin body weights, or tiny labels.
- **Don't** replace the route-board contrast with glass effects, gradients, or ornamental shadows.
- **Don't** use circles indiscriminately; preserve them for voice, progress, and status semantics.
- **Don't** make palm capture, video consent, or AI video analysis appear required for receiving care.
- **Don't** merge returning-patient lookup and new-patient signup into one ambiguous form or let a new patient reach conversation before signup.
- **Don't** add a manual palm shutter, hide camera-failure recovery, or suggest that IleraPoint stores the captured palm image.
- **Don't** hide Yoruba transcription behind audio generation, retain stale audio after text edits, or require authentication for the public converter.
- **Don't** flatten screenplay structure, read character headings aloud, split the final result into separate gender tracks, or let cast controls overflow the mobile viewport.
- **Don't** merge clinician review and prescribing into one dense surface or imply that the patient-reported record is a diagnosis.
