import { useEffect, useRef, useState } from "react";
import WelcomeScreen from "./components/WelcomeScreen";
import PalmScanScreen from "./components/PalmScanScreen";
import VideoConsentScreen from "./components/VideoConsentScreen";
import ConversationScreen from "./components/ConversationScreen";
import EmergencyScreen from "./components/EmergencyScreen";
import SummaryScreen from "./components/SummaryScreen";
import RecordingIndicator from "./components/RecordingIndicator";
import PatientCompleteScreen from "./components/PatientCompleteScreen";
import DoctorLoginScreen from "./components/DoctorLoginScreen";
import DoctorQueueScreen from "./components/DoctorQueueScreen";
import CaseDetailScreen from "./components/CaseDetailScreen";
import YorubaImageSpeechScreen from "./components/YorubaImageSpeechScreen";
import { speechProvider } from "./lib/providers/SpeechProvider";
import { interviewTurn } from "./lib/llm/interviewTurn";
import { checkRedFlags } from "./lib/safety/redFlags";
import { commitInterviewTurn, createInterviewSession, createTurn, rollbackLastTurn, updateSessionRecord } from "./lib/interview/session";
import { SessionRecorder } from "./lib/media/sessionRecorder";
import { preloadPalmRecognition } from "./lib/media/usePalmAutoCapture";
import { saveConsultation } from "./lib/consultations";

const FIRST_QUESTIONS = { en: "What is the main health problem bringing you here today?", yo: "Kí ni ìṣòro àìlera pàtàkì tó mú ọ wá lónìí?", pcm: "Wetin dey worry you pass today?", ha: "Mene ne babban matsalar lafiyar da ta kawo ka yau?", ig: "Gịnị bụ isi nsogbu ahụike wetara gị taa?" };
const ACCENTS = { en: "yoruba", yo: "yoruba", pcm: "pidgin", ha: "hausa", ig: "igbo" };
const SAHARA_PLAYBACK_DEADLINE_MS = 10000;

function routeFromPath() {
  if (location.pathname === "/yoruba-image-to-speech") return { screen: "yoruba-image-speech" };
  if (location.pathname === "/doctor/login") return { screen: "doctor-login" };
  if (location.pathname === "/doctor/queue") return { screen: "doctor-queue" };
  const match = location.pathname.match(/^\/doctor\/case\/([^/]+)(?:\/prescribe)?$/);
  return match ? { screen: "doctor-case", caseId: match[1], prescribeMode: location.pathname.endsWith("/prescribe") } : { screen: "welcome" };
}
function summaryText(record) { return `Here is what we heard. Your main concern is ${record.chief_complaints.join(", ") || "not recorded"}. It started ${record.onset || "at an unspecified time"}. Other symptoms are ${record.associated_symptoms.join(", ") || "not recorded"}. Your medication history is ${record.medication_history || "not recorded"}. A clinician will review this information.`; }

export default function App() {
  const initialRoute = routeFromPath();
  const [screen, setScreen] = useState(initialRoute.screen); const [caseId, setCaseId] = useState(initialRoute.caseId || ""); const [prescribeMode, setPrescribeMode] = useState(Boolean(initialRoute.prescribeMode));
  const [language, setLanguage] = useState("en"); const [patient, setPatient] = useState(null); const [videoConsent, setVideoConsent] = useState(false);
  const [session, setSession] = useState(null); const [status, setStatus] = useState("idle"); const [error, setError] = useState("");
  const [typedAnswer, setTypedAnswer] = useState(""); const [triggers, setTriggers] = useState([]); const [consultation, setConsultation] = useState(null);
  const media = useRef(new SessionRecorder()); const currentAudio = useRef(null); const audioContext = useRef(null); const audioSource = useRef(null); const speechAbort = useRef(null); const speechTimer = useRef(null); const speechRun = useRef(0); const turnAbort = useRef(null); const turnCancelled = useRef(false); const videoBlob = useRef(null); const saving = useRef(false);

  const navigate = (path, nextScreen, id = "") => { history.pushState({}, "", path); setScreen(nextScreen); setCaseId(id); setPrescribeMode(path.endsWith("/prescribe")); };
  useEffect(() => { const pop = () => { const route = routeFromPath(); setScreen(route.screen); setCaseId(route.caseId || ""); setPrescribeMode(Boolean(route.prescribeMode)); }; addEventListener("popstate", pop); return () => removeEventListener("popstate", pop); }, []);
  useEffect(() => () => { media.current.destroy(); speechAbort.current?.abort(); turnAbort.current?.abort(); try{audioSource.current?.stop();}catch{} currentAudio.current?.pause(); audioContext.current?.close(); }, []);
  useEffect(() => { preloadPalmRecognition(); }, []);
  useEffect(() => { speechProvider.preload(FIRST_QUESTIONS[language], ACCENTS[language], "female", language); }, [language]);
  const stopAudio = () => { speechRun.current+=1;clearTimeout(speechTimer.current);speechAbort.current?.abort();speechAbort.current=null;try{audioSource.current?.stop();}catch{}audioSource.current=null;currentAudio.current?.pause();currentAudio.current=null;window.speechSynthesis?.cancel(); };
  const unlockAudio = async () => { const AudioContextClass=window.AudioContext||window.webkitAudioContext;if(!AudioContextClass)return;if(!audioContext.current)audioContext.current=new AudioContextClass();if(audioContext.current.state==="suspended")await audioContext.current.resume(); };
  const playBlob = async (blob,run) => {
    if(audioContext.current){const buffer=await audioContext.current.decodeAudioData(await blob.arrayBuffer());if(run!==speechRun.current)return;const source=audioContext.current.createBufferSource();source.buffer=buffer;source.connect(audioContext.current.destination);audioSource.current=source;await new Promise((resolve)=>{source.onended=resolve;source.start();});audioSource.current=null;return;}
    if(run!==speechRun.current)return;
    const url=URL.createObjectURL(blob);const audio=new Audio(url);currentAudio.current=audio;try{await new Promise((resolve,reject)=>{audio.onended=resolve;audio.onerror=()=>reject(new Error("The audio could not be played."));audio.play().catch(reject);});}finally{URL.revokeObjectURL(url);currentAudio.current=null;}
  };
  const speak = async (text) => {
    stopAudio();const run=speechRun.current;const controller=new AbortController();speechAbort.current=controller;let timedOut=false;const deadline=setTimeout(()=>{timedOut=true;controller.abort();},SAHARA_PLAYBACK_DEADLINE_MS);
    try{setError("");setStatus("loading-speech");const blob=await speechProvider.synthesize(text,ACCENTS[language],"female",language,controller.signal);if(run!==speechRun.current)return;setStatus("speaking");await playBlob(blob,run);}
    catch(error){if(run===speechRun.current&&(timedOut||error.name!=="AbortError"))setError(`Question audio unavailable: ${timedOut?"Speech took too long.":error.message} You can answer by voice or typing.`);}
    finally{clearTimeout(deadline);if(run===speechRun.current){speechAbort.current=null;setStatus("idle");}}
  };
  const scheduleSpeech=(text)=>{clearTimeout(speechTimer.current);speechTimer.current=setTimeout(()=>speak(text),250);};

  const beginInterview = async (consent) => {
    setError(""); setStatus("starting-media");
    try { await unlockAudio(); await media.current.start(consent); setVideoConsent(consent); const question=FIRST_QUESTIONS[language]; setSession(createInterviewSession(question)); setTypedAnswer(""); setScreen("conversation"); scheduleSpeech(question); }
    catch(e){setError(e.message || "Camera or microphone access was blocked.");}
    finally{setStatus("idle");}
  };
  const stopSessionRecording = async () => { if (media.current.stream) videoBlob.current = await media.current.finish(); return videoBlob.current; };
  const consultationPayload = (currentSession, safety = { emergency:false,triggers:[] }) => ({ patient_id:patient.id, language_pair:language, turns:currentSession.turns, structured_record:currentSession.record, red_flag_status:safety, video_consent:videoConsent });
  const persist = async (currentSession, safety) => { if (saving.current) return null; saving.current=true; setStatus("saving"); try { const video=await stopSessionRecording(); const saved=await saveConsultation(consultationPayload(currentSession,safety),video); setConsultation(saved); return saved; } finally { saving.current=false; setStatus("idle"); } };

  const processTranscript = async (transcript) => {
    if (!transcript.trim() || !session) return false; turnCancelled.current=false; setStatus("processing"); setError(""); const turn=createTurn(session,transcript);
    const controller=new AbortController();turnAbort.current=controller;const deadline=setTimeout(()=>controller.abort(),11000);
    try { const result=await interviewTurn([...session.turns,turn],session.record,language,controller.signal); const next=commitInterviewTurn(session,turn,result); const safety=checkRedFlags(next.record); setSession(next);
      if(safety.emergency){setTriggers(safety.triggers);setScreen("emergency");try{await persist(next,safety);}catch(e){setError(e.message);}return true;}
      if(result.interview_complete){await stopSessionRecording();setScreen("summary");scheduleSpeech(summaryText(next.record));return true;}
      scheduleSpeech(result.next_question);return true;
    } catch(e){if(!turnCancelled.current)setError(e.name==="AbortError"?"The interview response timed out. Your answer is preserved below; tap send to retry.":e.message);return false;} finally{clearTimeout(deadline);if(turnAbort.current===controller)turnAbort.current=null;setStatus("idle");}
  };
  const startRecording = async () => { setError("");turnCancelled.current=false;stopAudio();try{const finished=media.current.recordTurn();setStatus("recording");const blob=await finished;setStatus("transcribing");const controller=new AbortController();turnAbort.current=controller;const deadline=setTimeout(()=>controller.abort(),16000);let result;try{result=await speechProvider.transcribe(blob,language,"standard",controller.signal);}finally{clearTimeout(deadline);if(turnAbort.current===controller)turnAbort.current=null;}setTypedAnswer(result.transcript);const saved=await processTranscript(result.transcript);if(saved)setTypedAnswer("");}catch(e){if(!turnCancelled.current)setError(e.name==="AbortError"?"Transcription timed out. Please try again or type your answer.":e.message);setStatus("idle");} };
  const cancelTurn=()=>{turnCancelled.current=true;turnAbort.current?.abort();turnAbort.current=null;setStatus("idle");};
  const submitTyped=async(e)=>{e.preventDefault();stopAudio();const saved=await processTranscript(typedAnswer);if(saved)setTypedAnswer("");};
  const editRecord=(field,value)=>{const next=updateSessionRecord(session,field,value);const safety=checkRedFlags(next.record);setSession(next);if(safety.emergency){setTriggers(safety.triggers);setScreen("emergency");persist(next,safety).catch((e)=>setError(e.message));}};
  const submitForReview=async()=>{setError("");try{const saved=await persist(session,{emergency:false,triggers:[]});if(saved)setScreen("complete");}catch(e){setError(e.message);}};
  const reset=()=>{stopAudio();media.current.destroy();videoBlob.current=null;saving.current=false;history.pushState({},"","/");setPatient(null);setSession(null);setConsultation(null);setError("");setStatus("idle");setScreen("welcome");};

  if(screen==="doctor-login")return <DoctorLoginScreen onSignedIn={()=>navigate("/doctor/queue","doctor-queue")}/>;
  if(screen==="doctor-queue")return <DoctorQueueScreen onOpen={(id)=>navigate(`/doctor/case/${id}`,"doctor-case",id)} onLogout={()=>navigate("/doctor/login","doctor-login")}/>;
  if(screen==="doctor-case")return <CaseDetailScreen id={caseId} prescribeMode={prescribeMode} onBack={()=>prescribeMode?navigate(`/doctor/case/${caseId}`,"doctor-case",caseId):navigate("/doctor/queue","doctor-queue")} onPrescribe={()=>navigate(`/doctor/case/${caseId}/prescribe`,"doctor-case",caseId)} onComplete={()=>navigate("/doctor/queue","doctor-queue")}/>;
  if(screen==="yoruba-image-speech")return <YorubaImageSpeechScreen onBack={()=>navigate("/","welcome")}/>;
  if(screen==="palm")return <PalmScanScreen onPatient={(found)=>{setPatient(found);setError("");setScreen("consent");}}/>;
  if(screen==="consent")return <VideoConsentScreen patient={patient} busy={status==="starting-media"} error={error} onChoice={beginInterview}/>;
  if(screen==="emergency")return <EmergencyScreen triggers={triggers} status={status} error={error}/>;
  if(screen==="summary"&&session)return <SummaryScreen record={session.record} onUpdateRecord={editRecord} onSpeak={()=>speak(summaryText(session.record))} speaking={status==="speaking"} saving={status==="saving"} error={error} onReview={submitForReview} onReset={reset}/>;
  if(screen==="complete")return <PatientCompleteScreen patient={patient} consultation={consultation} onReset={reset}/>;
  if(screen==="conversation"&&session)return <><ConversationScreen question={session.current_question} turns={session.turns} turn={session.turn_count} status={status} error={error} typedAnswer={typedAnswer} onTypedChange={setTypedAnswer} onRecord={startRecording} onFinishRecording={()=>media.current.stopTurn()} onSubmitTyped={submitTyped} onRetrySpeech={()=>speak(session.current_question)} onSkipSpeech={()=>{stopAudio();setStatus("idle");}} onCancelTurn={cancelTurn} onRedo={()=>{stopAudio();setSession((current)=>rollbackLastTurn(current));setTypedAnswer("");setError("");setStatus("idle");}}/>{videoConsent&&<RecordingIndicator/>}</>;
  return <WelcomeScreen language={language} onLanguageChange={setLanguage} onStart={()=>setScreen("palm")} onOpenYorubaTool={()=>navigate("/yoruba-image-to-speech","yoruba-image-speech")}/>;
}
