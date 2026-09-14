import { useEffect, useRef, useState } from "react";
import WelcomeScreen from "./components/WelcomeScreen";
import PatientAccessScreen from "./components/PatientAccessScreen";
import VideoConsentScreen from "./components/VideoConsentScreen";
import VitalsScreen from "./components/VitalsScreen";
import TemperatureScreen from "./components/TemperatureScreen";
import ConversationScreen from "./components/ConversationScreen";
import EmergencyScreen from "./components/EmergencyScreen";
import SummaryScreen from "./components/SummaryScreen";
import RecordingIndicator from "./components/RecordingIndicator";
import PatientCompleteScreen from "./components/PatientCompleteScreen";
import DoctorLoginScreen from "./components/DoctorLoginScreen";
import DoctorSignupScreen from "./components/DoctorSignupScreen";
import DoctorOnboardingScreen from "./components/DoctorOnboardingScreen";
import DoctorPendingScreen from "./components/DoctorPendingScreen";
import DoctorAdminScreen from "./components/DoctorAdminScreen";
import DoctorQueueScreen from "./components/DoctorQueueScreen";
import CaseDetailScreen from "./components/CaseDetailScreen";
import YorubaImageSpeechScreen from "./components/YorubaImageSpeechScreen";
import { speechProvider } from "./lib/providers/SpeechProvider";
import { interviewTurn } from "./lib/llm/interviewTurn";
import { checkRedFlags } from "./lib/safety/redFlags";
import {
  commitInterviewTurn,
  createInterviewSession,
  createTurn,
  rollbackLastTurn,
  updateSessionRecord,
} from "./lib/interview/session";
import { SessionRecorder } from "./lib/media/sessionRecorder";
import { TurnTranscriber } from "./lib/media/pcmStream";
import { transcribeTurn } from "./lib/media/transcribeTurn";
import { getConsultationResult, saveConsultation } from "./lib/consultations";
import { getDoctorAccount } from "./lib/doctors";

const FIRST_QUESTIONS = {
  en: "What is the main health problem bringing you here today?",
  yo: "Kí ni ìṣòro àìlera pàtàkì tó mú ọ wá lónìí?",
  pcm: "Wetin dey worry you pass today?",
  ha: "Mene ne babban matsalar lafiyar da ta kawo ka yau?",
  ig: "Gịnị bụ isi nsogbu ahụike wetara gị taa?",
};
const ACCENTS = {
  en: "yoruba",
  yo: "yoruba",
  pcm: "pidgin",
  ha: "hausa",
  ig: "igbo",
};
const ACKNOWLEDGEMENTS = {
  en: ["Mm, I hear you.", "Thank you, I understand."],
  yo: ["Mm, mo gbọ́ ọ.", "Ẹ ṣé, ó yé mi."],
  pcm: ["Mm, I hear you.", "Thank you, I understand."],
  ha: ["Toh, na ji ka.", "Na gode, na fahimta."],
  ig: ["Mm, a na m anụ gị.", "Daalụ, aghọtara m."],
};
const SAHARA_PLAYBACK_DEADLINE_MS = 28000;

function routeFromPath() {
  if (location.pathname === "/yoruba-image-to-speech")
    return { screen: "yoruba-image-speech" };
  if (location.pathname === "/doctor/login") return { screen: "doctor-login" };
  if (location.pathname === "/doctor/signup") return { screen: "doctor-signup" };
  if (location.pathname === "/doctor/admin") return { screen: "doctor-admin" };
  if (location.pathname === "/doctor/queue") return { screen: "doctor-queue" };
  const match = location.pathname.match(
    /^\/doctor\/case\/([^/]+)(?:\/prescribe)?$/,
  );
  return match
    ? {
        screen: "doctor-case",
        caseId: match[1],
        prescribeMode: location.pathname.endsWith("/prescribe"),
      }
    : { screen: "welcome" };
}
const COLLECTION_POLL_MS = 5000;
const LONG_WAIT_MS = 15 * 60 * 1000;

// Read in the patient's language, but never translate the medicine itself: the
// drug name and dose are the clinician's words and are spoken as written.
const PRESCRIPTION_INTRO = {
  en: "The doctor has prescribed medicine for you.",
  yo: "Dókítà ti kọ oògùn fún ọ.",
  pcm: "The doctor don write medicine for you.",
  ha: "Likita ya rubuta maka magani.",
  ig: "Dọkịta edeela gị ọgwụ.",
};
function prescriptionSpeech(prescription, languageCode) {
  const intro = PRESCRIPTION_INTRO[languageCode] || PRESCRIPTION_INTRO.en;
  return [intro, prescription.drug, prescription.dosage, prescription.instructions].filter(Boolean).join(". ");
}

function summaryText(record) {
  const measurements = record.vitals ? [
    record.vitals.temperature_c != null ? `your measured temperature was ${record.vitals.temperature_c} degrees Celsius` : "",
    record.vitals.temperature_c == null && record.vitals.temperature_surface_c != null ? `an uncalibrated skin surface reading of ${record.vitals.temperature_surface_c} degrees Celsius was captured` : "",
    record.vitals.heart_rate_bpm != null ? `your heart rate was ${record.vitals.heart_rate_bpm} beats per minute` : "",
    record.vitals.spo2_percent != null ? `your oxygen saturation was ${record.vitals.spo2_percent} percent` : "",
  ].filter(Boolean) : [];
  const vitals = measurements.length ? `${measurements.join(" and ")}.` : "No sensor measurements were captured.";
  return `Here is what we heard. Your main concern is ${record.chief_complaints.join(", ") || "not recorded"}. It started ${record.onset || "at an unspecified time"}. Other symptoms are ${record.associated_symptoms.join(", ") || "not recorded"}. Your medication history is ${record.medication_history || "not recorded"}. ${vitals} A clinician will review this information.`;
}

export default function App() {
  const initialRoute = routeFromPath();
  const [screen, setScreen] = useState(initialRoute.screen);
  const [caseId, setCaseId] = useState(initialRoute.caseId || "");
  const [prescribeMode, setPrescribeMode] = useState(
    Boolean(initialRoute.prescribeMode),
  );
  const [language, setLanguage] = useState("en");
  const [patient, setPatient] = useState(null);
  const [videoConsent, setVideoConsent] = useState(false);
  const [pulseVitals, setPulseVitals] = useState(null);
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [typedAnswer, setTypedAnswer] = useState("");
  const [triggers, setTriggers] = useState([]);
  const [consultation, setConsultation] = useState(null);
  const [doctorAccount, setDoctorAccount] = useState(null);
  const [doctorError, setDoctorError] = useState("");
  const [collection, setCollection] = useState(null);
  const [waitedTooLong, setWaitedTooLong] = useState(false);
  const media = useRef(new SessionRecorder());
  const currentAudio = useRef(null);
  const audioContext = useRef(null);
  const audioSource = useRef(null);
  const speechAbort = useRef(null);
  const speechTimer = useRef(null);
  const autoListenTimer = useRef(null);
  const speechRun = useRef(0);
  const turnAbort = useRef(null);
  const turnCancelled = useRef(false);
  const videoBlob = useRef(null);
  const saving = useRef(false);
  const listening = useRef(false);
  const liveTranscriber = useRef(null);
  const spokenFor = useRef(null);
  // Speech, auto-listen, and turn processing all run from timers, so they read
  // the session that existed when their closure was created. The ref carries the
  // live session into those chains.
  const sessionRef = useRef(null);

  const applySession = (next) => {
    sessionRef.current = next;
    setSession(next);
  };

  const navigate = (path, nextScreen, id = "") => {
    history.pushState({}, "", path);
    setScreen(nextScreen);
    setCaseId(id);
    setPrescribeMode(path.endsWith("/prescribe"));
  };
  useEffect(() => {
    const pop = () => {
      const route = routeFromPath();
      setScreen(route.screen);
      setCaseId(route.caseId || "");
      setPrescribeMode(Boolean(route.prescribeMode));
    };
    addEventListener("popstate", pop);
    return () => removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

  useEffect(
    () => () => {
      media.current.destroy();
      liveTranscriber.current?.close();
      speechAbort.current?.abort();
      turnAbort.current?.abort();
      clearTimeout(autoListenTimer.current);
      try {
        audioSource.current?.stop();
      } catch {}
      currentAudio.current?.pause();
      audioContext.current?.close();
    },
    [],
  );
  useEffect(() => {
    // Opening a doctor URL directly still has to be resolved against the server;
    // the browser never decides on its own that an account is approved.
    if (["doctor-queue", "doctor-admin", "doctor-case"].includes(initialRoute.screen)) routeDoctor({ keepRoute: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The patient waits at the kiosk while the clinician reviews. Poll their own
  // result until it is finished, then read the prescription aloud once.
  useEffect(() => {
    if (screen !== "complete" || !consultation?.id || !consultation?.patient_token) return undefined;
    if (collection?.finished) return undefined;
    let stopped = false;
    const startedAt = Date.now();
    const check = async () => {
      try {
        const result = await getConsultationResult(consultation.id, consultation.patient_token);
        if (stopped || !result) return;
        setWaitedTooLong(Date.now() - startedAt > LONG_WAIT_MS);
        setCollection(result);
        // Read it out once. Without the guard a poll landing before React tears
        // the interval down would start a second reading over the first.
        if (result.finished && result.prescription && spokenFor.current !== consultation.id) {
          spokenFor.current = consultation.id;
          speak(prescriptionSpeech(result.prescription, language));
        }
      } catch {
        // A failed poll is not worth alarming a waiting patient about; the next
        // one in five seconds will usually succeed.
        if (!stopped) setWaitedTooLong(Date.now() - startedAt > LONG_WAIT_MS);
      }
    };
    check();
    const timer = setInterval(check, COLLECTION_POLL_MS);
    return () => { stopped = true; clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, consultation, collection?.finished]);
  useEffect(() => {
    let cancelled = false;
    const preloadSpeech = async () => {
      await speechProvider.preload(FIRST_QUESTIONS[language], ACCENTS[language], "female", language);
      for (const acknowledgement of ACKNOWLEDGEMENTS[language]) {
        if (cancelled) break;
        await speechProvider.preload(acknowledgement, ACCENTS[language], "female", language);
      }
    };
    preloadSpeech();
    return () => { cancelled = true; };
  }, [language]);
  const stopAudio = () => {
    speechRun.current += 1;
    clearTimeout(speechTimer.current);
    clearTimeout(autoListenTimer.current);
    speechAbort.current?.abort();
    speechAbort.current = null;
    try {
      audioSource.current?.stop();
    } catch {}
    audioSource.current = null;
    currentAudio.current?.pause();
    currentAudio.current = null;
    window.speechSynthesis?.cancel();
  };
  const unlockAudio = async () => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioContext.current) audioContext.current = new AudioContextClass();
    if (audioContext.current.state === "suspended")
      await audioContext.current.resume();
  };
  const playBlob = async (blob, run) => {
    if (audioContext.current) {
      if (audioContext.current.state === "suspended") {
        try {
          await audioContext.current.resume();
        } catch {}
      }
      const buffer = await audioContext.current.decodeAudioData(
        await blob.arrayBuffer(),
      );
      if (run !== speechRun.current) return;
      const source = audioContext.current.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.current.destination);
      audioSource.current = source;
      // Watchdog: if onended never fires (suspended context, device change),
      // resolve anyway so the interview can continue instead of freezing.
      await new Promise((resolve) => {
        const watchdog = setTimeout(
          resolve,
          Math.ceil(buffer.duration * 1000) + 1500,
        );
        source.onended = () => {
          clearTimeout(watchdog);
          resolve();
        };
        source.start();
      });
      audioSource.current = null;
      return;
    }
    if (run !== speechRun.current) return;
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio.current = audio;
    try {
      await new Promise((resolve, reject) => {
        audio.onended = resolve;
        audio.onerror = () =>
          reject(new Error("The audio could not be played."));
        audio.play().catch(reject);
      });
    } finally {
      URL.revokeObjectURL(url);
      currentAudio.current = null;
    }
  };
  const pause = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));
  const playParts = async (parts, run, onFirstPart = () => {}) => {
    let played = 0;
    for await (const part of parts) {
      if (run !== speechRun.current) return played;
      if (!played) onFirstPart();
      await playBlob(part.blob, run);
      played += 1;
      if (run !== speechRun.current) return played;
      if (part.pauseMs) await pause(part.pauseMs);
    }
    return played;
  };
  const speak = async (text, listenAfter = false) => {
    stopAudio();
    const run = speechRun.current;
    const controller = new AbortController();
    speechAbort.current = controller;
    let timedOut = false;
    // The deadline covers the wait for the first audio only. Once the kiosk is
    // speaking, the request stays open to deliver the rest of the sentence.
    const deadline = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, SAHARA_PLAYBACK_DEADLINE_MS);
    try {
      setError("");
      setStatus("loading-speech");
      const parts = speechProvider.stream(
        text,
        ACCENTS[language],
        "female",
        language,
        controller.signal,
      );
      const played = await playParts(parts, run, () => {
        clearTimeout(deadline);
        setStatus("speaking");
      });
      if (!played && run === speechRun.current) throw new Error("Sahara returned no audio.");
    } catch (error) {
      if (
        run === speechRun.current &&
        (timedOut || error.name !== "AbortError")
      )
        setError(
          `Question audio unavailable: ${timedOut ? "Speech took too long." : error.message} You can answer by voice or typing.`,
        );
    } finally {
      clearTimeout(deadline);
      if (run === speechRun.current) {
        speechAbort.current = null;
        setStatus("idle");
        if (listenAfter) autoListenTimer.current = setTimeout(() => startRecording(), 600);
      }
    }
  };
  const scheduleSpeech = (text, listenAfter = false) => {
    clearTimeout(speechTimer.current);
    speechTimer.current = setTimeout(() => speak(text, listenAfter), 250);
  };
  const playAcknowledgement = async (turnNumber) => {
    stopAudio();
    const run = speechRun.current;
    const controller = new AbortController();
    speechAbort.current = controller;
    const options = ACKNOWLEDGEMENTS[language];
    const text = options[turnNumber % options.length];
    try {
      await playParts(speechProvider.stream(text, ACCENTS[language], "female", language, controller.signal), run);
    } catch {
      // This is optional feedback. The interview must continue if it is absent.
    } finally {
      if (speechAbort.current === controller) speechAbort.current = null;
    }
  };

  const beginInterview = async (consent) => {
    setError("");
    setStatus("starting-media");
    try {
      await unlockAudio();
      await media.current.start(consent);
      setVideoConsent(consent);
      const question = FIRST_QUESTIONS[language];
      applySession(createInterviewSession(question));
      setTypedAnswer("");
      setPulseVitals(null);
      setScreen("vitals-pulse");
    } catch (e) {
      setError(e.message || "Camera or microphone access was blocked.");
    } finally {
      setStatus("idle");
    }
  };
  const continueFromPulse = (vitals) => {
    stopAudio();
    setPulseVitals(vitals);
    setScreen("vitals-temperature");
  };
  const continueFromTemperature = (temperatureVitals) => {
    stopAudio();
    const current = sessionRef.current;
    if (!current) return;
    const combined = pulseVitals || temperatureVitals ? { ...(pulseVitals || {}), ...(temperatureVitals || {}) } : null;
    const next = { ...current, record: { ...current.record, vitals: combined } };
    applySession(next);
    setScreen("conversation");
    scheduleSpeech(next.current_question, true);
  };
  const stopSessionRecording = async () => {
    if (media.current.stream) videoBlob.current = await media.current.finish();
    return videoBlob.current;
  };
  const consultationPayload = (
    currentSession,
    safety = { emergency: false, triggers: [] },
  ) => ({
    patient_id: patient.id,
    language_pair: language,
    turns: currentSession.turns,
    structured_record: currentSession.record,
    red_flag_status: safety,
    video_consent: videoConsent,
  });
  const persist = async (currentSession, safety) => {
    if (saving.current) return null;
    saving.current = true;
    setStatus("saving");
    try {
      const video = await stopSessionRecording();
      const saved = await saveConsultation(
        consultationPayload(currentSession, safety),
        video,
      );
      setConsultation(saved);
      return saved;
    } finally {
      saving.current = false;
      setStatus("idle");
    }
  };

  const processTranscript = async (transcript, acknowledged = false) => {
    // Read the live session, not this closure's copy: the auto-listen chain
    // reaches here from a timer created before the session existed.
    const current = sessionRef.current;
    if (!current) {
      setError("The visit is no longer active. Please start again.");
      setStatus("idle");
      return false;
    }
    if (!transcript.trim()) {
      setStatus("idle");
      return false;
    }
    turnCancelled.current = false;
    setStatus("processing");
    setError("");
    if (!acknowledged) void playAcknowledgement(current.turn_count);
    const turn = createTurn(current, transcript);
    const controller = new AbortController();
    turnAbort.current = controller;
    const deadline = setTimeout(() => controller.abort(), 11000);
    try {
      const result = await interviewTurn(
        [...current.turns, turn],
        current.record,
        language,
        controller.signal,
      );
      const next = commitInterviewTurn(current, turn, result);
      const safety = checkRedFlags(next.record);
      applySession(next);
      if (safety.emergency) {
        stopAudio();
        setTriggers(safety.triggers);
        setScreen("emergency");
        try {
          await persist(next, safety);
        } catch (e) {
          setError(e.message);
        }
        return true;
      }
      if (result.interview_complete) {
        await stopSessionRecording();
        setScreen("summary");
        scheduleSpeech(summaryText(next.record));
        return true;
      }
      scheduleSpeech(result.next_question, true);
      return true;
    } catch (e) {
      if (!turnCancelled.current)
        setError(
          e.name === "AbortError"
            ? "The interview response timed out. Your answer is preserved below; tap send to retry."
            : e.message,
        );
      return false;
    } finally {
      clearTimeout(deadline);
      if (turnAbort.current === controller) turnAbort.current = null;
      setStatus("idle");
    }
  };
  const startRecording = async () => {
    if (listening.current) return;
    listening.current = true;
    await unlockAudio().catch(() => {});
    setError("");
    turnCancelled.current = false;
    stopAudio();
    let transcriber = null;
    try {
      const finished = media.current.recordTurnUntilSilence({
        onState: (state) => setStatus(state === "waiting" ? "waiting-for-speech" : state === "speaking" ? "recording" : "finishing-recording"),
        onAudio: (context, source) => {
          // Live transcription is an optimisation: if it cannot start, the
          // recorded blob still goes to the file upload route below.
          if (!TurnTranscriber.supported(context)) return;
          const live = new TurnTranscriber(language);
          transcriber = live;
          liveTranscriber.current = live;
          // open() first: it claims the socket synchronously, so the worklet
          // attached alongside it knows to buffer until the connection is ready.
          Promise.all([live.open(context.sampleRate), live.attach(context, source)])
            .catch(() => { if (transcriber === live) transcriber = null; live.close(); });
        },
      });
      const blob = await finished;
      console.info("[turn] recording finished", { bytes: blob.size, type: blob.type });
      if (turnCancelled.current) return;
      if (!blob.size) throw new Error("I did not hear an answer. Speak a little closer to the microphone or type below.");
      setStatus("transcribing");
      // The cached acknowledgement plays over the transcription wait instead of
      // after it, so the patient is not left in silence while Sahara works.
      void playAcknowledgement(sessionRef.current?.turn_count ?? 0);
      const controller = new AbortController();
      turnAbort.current = controller;
      // Covers live transcription plus, if it fails, the file upload behind it.
      // "Cancel and type instead" stays on screen throughout, so a slow provider
      // never traps the patient.
      const deadline = setTimeout(() => {
        console.warn("[turn] transcribe deadline fired");
        controller.abort();
      }, 28000);
      let transcript;
      try {
        transcript = await transcribeTurn({
          transcriber, blob, language, signal: controller.signal,
          upload: (...args) => speechProvider.transcribe(...args),
          onFallback: (message) => console.warn("[turn] live transcription unavailable; uploading the recording", message),
        });
        console.info("[turn] transcribe resolved", { transcript });
      } finally {
        clearTimeout(deadline);
        if (turnAbort.current === controller) turnAbort.current = null;
      }
      setTypedAnswer(transcript);
      const saved = await processTranscript(transcript, true);
      if (saved) setTypedAnswer("");
    } catch (e) {
      if (!turnCancelled.current)
        setError(
          e.name === "AbortError"
            ? "Transcription timed out. Please try again or type your answer."
            : e.message,
        );
      setStatus("idle");
    } finally {
      listening.current = false;
      transcriber?.close();
      liveTranscriber.current = null;
      // A busy status must never outlive the work that set it, or the patient is
      // left with no visible progress and a disabled "type your answer" button.
      setStatus((current) => (current === "transcribing" ? "idle" : current));
    }
  };
  const cancelTurn = () => {
    turnCancelled.current = true;
    media.current.stopTurn();
    // Closing the live socket settles the pending commit immediately; without it
    // the microphone stays locked until the provider's own timeout expires.
    liveTranscriber.current?.close();
    liveTranscriber.current = null;
    turnAbort.current?.abort();
    turnAbort.current = null;
    setStatus("idle");
  };
  const submitTyped = async (e) => {
    e.preventDefault();
    stopAudio();
    const saved = await processTranscript(typedAnswer);
    if (saved) setTypedAnswer("");
  };
  const editRecord = (field, value) => {
    const next = updateSessionRecord(sessionRef.current, field, value);
    const safety = checkRedFlags(next.record);
    applySession(next);
    if (safety.emergency) {
      setTriggers(safety.triggers);
      setScreen("emergency");
      persist(next, safety).catch((e) => setError(e.message));
    }
  };
  const submitForReview = async () => {
    setError("");
    try {
      const saved = await persist(session, { emergency: false, triggers: [] });
      if (saved) setScreen("complete");
    } catch (e) {
      setError(e.message);
    }
  };
  // Where a signed-in account lands is the server's decision, not the browser's:
  // it reports whether this doctor has applied and been approved.
  const routeDoctor = async ({ keepRoute = false } = {}) => {
    try {
      const account = await getDoctorAccount();
      setDoctorAccount(account);
      if (account.approved) return keepRoute ? account : navigate("/doctor/queue", "doctor-queue");
      if (account.status === "unregistered") return setScreen("doctor-onboarding");
      return setScreen("doctor-pending");
    } catch (e) {
      // Back to sign-in, carrying the reason: a server-side problem such as a
      // missing migration is otherwise invisible except in the network tab.
      setDoctorAccount(null);
      setDoctorError(e.message);
      return navigate("/doctor/login", "doctor-login");
    }
  };
  const signOutDoctor = () => {
    setDoctorAccount(null);
    navigate("/doctor/login", "doctor-login");
  };
  const reset = () => {
    stopAudio();
    media.current.destroy();
    videoBlob.current = null;
    saving.current = false;
    history.pushState({}, "", "/");
    setPatient(null);
    setPulseVitals(null);
    applySession(null);
    // The capability token dies with the visit: nothing about this patient stays
    // readable on a shared kiosk after they walk away.
    setConsultation(null);
    setCollection(null);
    setWaitedTooLong(false);
    spokenFor.current = null;
    setError("");
    setStatus("idle");
    setScreen("welcome");
  };

  if (screen === "doctor-signup")
    return <DoctorSignupScreen onSignIn={() => navigate("/doctor/login", "doctor-login")} />;
  if (screen === "doctor-login")
    return (
      <DoctorLoginScreen
        notice={doctorError}
        onSignedIn={routeDoctor}
        onSignUp={() => navigate("/doctor/signup", "doctor-signup")}
      />
    );
  if (screen === "doctor-onboarding")
    return (
      <DoctorOnboardingScreen
        email={doctorAccount?.email || ""}
        onApplied={routeDoctor}
        onLogout={signOutDoctor}
      />
    );
  if (screen === "doctor-pending")
    return (
      <DoctorPendingScreen
        status={doctorAccount?.status || "pending"}
        email={doctorAccount?.email || ""}
        onRecheck={routeDoctor}
        onLogout={signOutDoctor}
      />
    );
  if (screen === "doctor-admin")
    return <DoctorAdminScreen onBack={() => navigate("/doctor/queue", "doctor-queue")} />;
  if (screen === "doctor-queue")
    return (
      <DoctorQueueScreen
        isAdmin={doctorAccount?.role === "admin"}
        onOpen={(id) => navigate(`/doctor/case/${id}`, "doctor-case", id)}
        onReviewApplications={() => navigate("/doctor/admin", "doctor-admin")}
        onLogout={signOutDoctor}
      />
    );
  if (screen === "doctor-case")
    return (
      <CaseDetailScreen
        id={caseId}
        prescribeMode={prescribeMode}
        onBack={() =>
          prescribeMode
            ? navigate(`/doctor/case/${caseId}`, "doctor-case", caseId)
            : navigate("/doctor/queue", "doctor-queue")
        }
        onPrescribe={() =>
          navigate(`/doctor/case/${caseId}/prescribe`, "doctor-case", caseId)
        }
        onComplete={() => navigate("/doctor/queue", "doctor-queue")}
      />
    );
  if (screen === "yoruba-image-speech")
    return <YorubaImageSpeechScreen onBack={() => navigate("/", "welcome")} />;
  if (screen === "patient-access")
    return (
      <PatientAccessScreen
        onBack={() => setScreen("welcome")}
        onPatient={(found) => {
          setPatient(found);
          setError("");
          setScreen("consent");
        }}
      />
    );
  if (screen === "consent")
    return (
      <VideoConsentScreen
        patient={patient}
        busy={status === "starting-media"}
        error={error}
        onChoice={beginInterview}
      />
    );
  if (screen === "vitals-pulse" && session)
    return <VitalsScreen patient={patient} language={language} speaking={status === "speaking" || status === "loading-speech"} onSpeak={speak} onStopSpeech={stopAudio} onContinue={continueFromPulse} />;
  if (screen === "vitals-temperature" && session)
    return <TemperatureScreen patient={patient} language={language} pulseResult={pulseVitals} speaking={status === "speaking" || status === "loading-speech"} onSpeak={speak} onStopSpeech={stopAudio} onContinue={continueFromTemperature} />;
  if (screen === "emergency")
    return (
      <EmergencyScreen triggers={triggers} status={status} error={error} />
    );
  if (screen === "summary" && session)
    return (
      <SummaryScreen
        record={session.record}
        onUpdateRecord={editRecord}
        onSpeak={() => speak(summaryText(session.record))}
        speaking={status === "speaking"}
        saving={status === "saving"}
        error={error}
        onReview={submitForReview}
        onReset={reset}
      />
    );
  if (screen === "complete")
    return (
      <PatientCompleteScreen
        patient={patient}
        result={collection}
        waitedTooLong={waitedTooLong}
        speaking={status === "speaking" || status === "loading-speech"}
        onReadAloud={() => collection?.prescription && speak(prescriptionSpeech(collection.prescription, language))}
        onReset={reset}
      />
    );
  if (screen === "conversation" && session)
    return (
      <>
        <ConversationScreen
          question={session.current_question}
          turns={session.turns}
          turn={session.turn_count}
          status={status}
          error={error}
          typedAnswer={typedAnswer}
          onTypedChange={setTypedAnswer}
          onRecord={startRecording}
          onSubmitTyped={submitTyped}
          onRetrySpeech={() => speak(session.current_question, true)}
          onSkipSpeech={() => {
            stopAudio();
            startRecording();
          }}
          onCancelTurn={cancelTurn}
          onRedo={() => {
            stopAudio();
            const rolledBack = rollbackLastTurn(sessionRef.current);
            applySession(rolledBack);
            setTypedAnswer("");
            setError("");
            setStatus("idle");
            scheduleSpeech(rolledBack.current_question, true);
          }}
        />
        {videoConsent && <RecordingIndicator />}
      </>
    );
  return (
    <WelcomeScreen
      language={language}
      onLanguageChange={setLanguage}
      onStart={() => setScreen("patient-access")}
      onOpenYorubaTool={() =>
        navigate("/yoruba-image-to-speech", "yoruba-image-speech")
      }
    />
  );
}
