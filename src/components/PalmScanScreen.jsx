import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Check, Hand, Keyboard, LoaderCircle, RotateCcw, Search, UserPlus } from "lucide-react";
import BrandHeader from "./BrandHeader";
import { palmAuthProvider } from "../lib/providers/PalmAuthProvider";
import { usePalmCamera, usePalmDetection } from "../lib/media/usePalmAutoCapture";

const CONNECTIONS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];

function HandTrace({ landmarks, ready }) {
  if (landmarks.length !== 21) return null;
  const color = ready ? "#55e39b" : "#f2d533";
  return <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
    {CONNECTIONS.map(([from,to]) => <line key={`${from}-${to}`} x1={landmarks[from].x*100} y1={landmarks[from].y*100} x2={landmarks[to].x*100} y2={landmarks[to].y*100} stroke={color} strokeWidth=".65" strokeLinecap="round" />)}
    {landmarks.map((point,index) => <circle key={index} cx={point.x*100} cy={point.y*100} r={index===0?1.2:.8} fill={color} stroke="#103f33" strokeWidth=".3" />)}
  </svg>;
}

const detectionCopy = {
  loading: "Loading palm recognition…", paused: "Complete your details to start the scan.", place: "Show one open palm to the camera", position: "Move closer until your open hand fills the guide", open: "Open and separate all five fingers", moving: "Hold still — automatic capture is almost ready", ready: "Palm in frame — capturing automatically", error: "Palm tracing could not start",
};

export default function PalmScanScreen({ onPatient }) {
  const [journey, setJourney] = useState("returning"); const [newStep, setNewStep] = useState("details");
  const [form, setForm] = useState({ name:"", phone:"" }); const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [noMatch, setNoMatch] = useState(false); const [scanStopped, setScanStopped] = useState(false);
  const [errorDetails, setErrorDetails] = useState(null);
  const [allowNoPalm, setAllowNoPalm] = useState(false);
  const autoFired = useRef(false);
  const { videoRef, status: camera, retry, captureBest } = usePalmCamera(true);
  const scanActive = camera === "ready" && !busy && !noMatch && !scanStopped && (journey === "returning" || newStep === "scan");
  const { state: detection, landmarks } = usePalmDetection(videoRef, scanActive);

  const chooseJourney = (next) => { setJourney(next); setNewStep("details"); setNoMatch(false); setScanStopped(false); setAllowNoPalm(false); setError(""); setResults([]); autoFired.current=false; };
  const registerWithoutPalm = async () => { setBusy(true);setError("");try{onPatient(await palmAuthProvider.manualRegister(form));}catch(e){setError(e.message);}finally{setBusy(false);} };
  const processPalm = async () => {
    setBusy(true); setError("");
    try {
      const image = await captureBest(landmarks);
      if (journey === "new") { const created=await palmAuthProvider.enroll(image,form); onPatient(created.patient); return; }
      const found=await palmAuthProvider.identify(image);
      if (found.patient) onPatient(found.patient);
      else setNoMatch(true);
    } catch(e) {
      const message = /quality check failed/i.test(e.message)
        ? "Palm quality was too low. Keep your full hand inside the guide, face the palm toward the camera, and avoid glare."
        : e.message;
      setError(message); setErrorDetails({ code: e.providerCode, requestId: e.requestId }); setScanStopped(true);
    }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (detection !== "ready") { autoFired.current=false; return; }
    if (!scanActive || autoFired.current) return;
    autoFired.current=true; void processPalm();
  }, [detection, scanActive]);
  useEffect(() => {
    if (journey !== "new" || newStep !== "scan" || !scanActive) return undefined;
    const timer = window.setTimeout(() => setAllowNoPalm(true), 12000);
    return () => window.clearTimeout(timer);
  }, [journey, newStep, scanActive]);

  const lookup = async (event) => { event.preventDefault();setBusy(true);setError("");try{const found=await palmAuthProvider.manualLookup(form);setResults(found.patients);if(!found.patients.length)setNoMatch(true);}catch(e){setError(e.message);}finally{setBusy(false);} };
  const continueNew = (event) => { event.preventDefault();setError("");setNoMatch(false);setScanStopped(false);setNewStep("scan"); };
  const cameraFailed = ["denied","missing","error"].includes(camera) || detection === "error";
  const caption = busy ? (journey === "new" ? "Registering your palm securely…" : "Looking for your record…") : scanStopped ? "Palm capture paused — adjust your hand, then try again" : detectionCopy[detection];

  return <main className="kiosk-shell min-h-[100dvh]"><BrandHeader compact />
    <section className="relative z-10 mx-auto grid max-w-[1280px] gap-6 px-5 pb-10 md:grid-cols-[1.08fr_.92fr] md:px-10">
      <div className="route-panel overflow-hidden rounded-[16px] bg-[#103f33] p-5 text-white md:p-8">
        <div className="flex items-center justify-between gap-4"><h1 className="text-4xl font-black tracking-[-.04em]">{journey==="new"?"Register your palm.":"Welcome back."}</h1><Hand className="shrink-0 text-[#f2d533]" size={38}/></div>
        <p className="mt-3 max-w-xl text-lg font-semibold text-[#b8d5cc]">{journey==="new"?"After your details, show one open palm. The kiosk captures automatically when your full hand is steady.":"Show one open palm. We will trace it and capture automatically when your full hand is in frame."}</p>
        <p className="mt-2 max-w-xl text-sm font-bold text-white/80">Your palm image is used only to identify you during this step and is not stored by IleraPoint.</p>
        <div className="relative mt-6 aspect-[4/3] overflow-hidden rounded-[16px] bg-[#092c24]">
          <video ref={videoRef} muted playsInline className="h-full w-full object-cover" aria-label="Live palm camera"/>
          <div className={`pointer-events-none absolute inset-[10%_22%] rounded-[42%] border-[3px] border-dashed ${detection==="ready"?"border-[#55e39b]":"border-[#f2d533]"}`}/>
          <HandTrace landmarks={landmarks} ready={detection==="ready"}/>
          {camera!=="ready"&&<div className="absolute inset-0 grid place-items-center bg-[#092c24]/95 px-6 text-center"><div>{camera==="starting"?<LoaderCircle className="mx-auto animate-spin" size={46}/>:<AlertCircle className="mx-auto text-[#f2d533]" size={46}/>}<p className="mt-4 font-black">{camera==="denied"?"Camera permission is blocked":camera==="missing"?"No camera was found":camera==="starting"?"Starting camera…":"The camera could not start"}</p>{camera!=="starting"&&<button onClick={retry} className="mt-5 min-h-12 rounded-[14px] bg-white/10 px-5 font-black"><RotateCcw className="mr-2 inline"/>Retry camera</button>}</div></div>}
          {busy&&<div className="absolute inset-0 grid place-items-center bg-[#103f33]/80"><LoaderCircle className="animate-spin text-[#f2d533]" size={52}/></div>}
        </div>
        <div className="mt-4 flex min-h-14 items-center gap-3 rounded-[14px] bg-white/10 px-4" aria-live="polite"><span className={`h-3 w-3 shrink-0 rounded-full ${detection==="ready"?"bg-[#55e39b]":detection==="moving"?"bg-[#f2d533]":"bg-white/50"}`}/><span className="font-black">{caption}</span></div>
      </div>

      <aside className="rounded-[16px] bg-white p-6 shadow-[0_16px_40px_rgba(16,63,51,.1)] md:p-8">
        <div className="grid grid-cols-2 gap-2 rounded-[14px] bg-[#edf0eb] p-1.5" aria-label="Patient type">
          <button onClick={()=>chooseJourney("returning")} className={`min-h-12 rounded-[10px] px-3 font-black ${journey==="returning"?"bg-[#103f33] text-white":"text-[#45655d]"}`}>Returning patient</button>
          <button onClick={()=>chooseJourney("new")} className={`min-h-12 rounded-[10px] px-3 font-black ${journey==="new"?"bg-[#103f33] text-white":"text-[#45655d]"}`}>I’m a new patient</button>
        </div>

        {journey==="new"&&newStep==="details"&&<><UserPlus className="mt-7 text-[#1d6e59]" size={34}/><h2 className="mt-3 text-3xl font-black tracking-[-.03em]">Create your patient record</h2><p className="mt-2 font-semibold text-[#527269]">Enter your details first. We use them to connect your visit and palm.</p><form onSubmit={continueNew} className="mt-6 space-y-4"><label className="block font-black">Full name<input autoFocus required minLength="2" value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} className="mt-2 min-h-14 w-full rounded-[14px] bg-[#f1f3ee] px-4"/></label><label className="block font-black">Phone number<input required inputMode="tel" value={form.phone} onChange={(e)=>setForm({...form,phone:e.target.value})} className="mt-2 min-h-14 w-full rounded-[14px] bg-[#f1f3ee] px-4"/></label><button className="flex min-h-16 w-full items-center justify-center gap-3 rounded-[14px] bg-[#f2d533] px-5 text-lg font-black text-[#103f33]">Continue to palm scan <Hand/></button></form></>}

        {journey==="new"&&newStep==="scan"&&<><Check className="mt-7 rounded-full bg-[#dff2e9] p-1 text-[#155944]" size={36}/><h2 className="mt-3 text-3xl font-black">Details ready</h2><p className="mt-2 text-lg font-black text-[#103f33]">{form.name}</p><p className="font-semibold text-[#527269]">{form.phone}</p><p className="mt-5 rounded-[14px] bg-[#e7f1ed] p-4 font-bold text-[#155944]">Now hold one open palm in the camera. There is nothing to tap.</p><button onClick={()=>setNewStep("details")} className="mt-4 flex min-h-12 items-center gap-2 font-black text-[#155944]"><ArrowLeft/>Edit my details</button>{(cameraFailed||allowNoPalm||scanStopped)&&<button onClick={registerWithoutPalm} disabled={busy} className="mt-5 min-h-14 w-full rounded-[14px] bg-[#103f33] px-5 font-black text-white">Continue without palm</button>}</>}

        {journey==="returning"&&<><Search className="mt-7 text-[#1d6e59]" size={34}/><h2 className="mt-3 text-3xl font-black tracking-[-.03em]">Find your existing record</h2><p className="mt-2 font-semibold text-[#527269]">Your palm is checked automatically. If that does not work, search by name or phone.</p>{noMatch&&<div className="mt-5 rounded-[14px] bg-[#fff2c7] p-4 text-[#6d5510]"><p className="font-black">We did not find a matching palm.</p><button onClick={()=>chooseJourney("new")} className="mt-3 min-h-12 w-full rounded-[12px] bg-[#f2d533] px-4 font-black text-[#103f33]"><UserPlus className="mr-2 inline"/>Create a new patient record</button><button onClick={()=>{setNoMatch(false);autoFired.current=false;}} className="mt-2 min-h-12 w-full font-black">Try the palm scan again</button></div>}<div className="my-6 flex items-center gap-3 text-sm font-black uppercase tracking-[.1em] text-[#527269]"><span className="h-px flex-1 bg-[#d8e1dc]"/>Manual lookup<span className="h-px flex-1 bg-[#d8e1dc]"/></div><form onSubmit={lookup} className="space-y-4"><input aria-label="Patient name" placeholder="Full name" value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} className="min-h-14 w-full rounded-[14px] bg-[#f1f3ee] px-4 font-semibold placeholder:text-[#45655d]"/><input aria-label="Phone number" placeholder="Phone number" value={form.phone} onChange={(e)=>setForm({...form,phone:e.target.value})} className="min-h-14 w-full rounded-[14px] bg-[#f1f3ee] px-4 font-semibold placeholder:text-[#45655d]"/><button disabled={busy} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-[14px] bg-[#e7f1ed] px-5 font-black text-[#155944]"><Keyboard/>Search patient records</button></form>{results.map((patient)=><button key={patient.id} onClick={()=>onPatient(patient)} className="mt-3 w-full rounded-[14px] bg-[#103f33] p-4 text-left text-white"><strong className="block text-lg">{patient.name}</strong><span className="text-[#b8d5cc]">{patient.phone||"No phone saved"}</span></button>)}</>}
        {error&&<div role="alert" className="mt-5 rounded-[14px] bg-[#fff0e8] p-4 font-bold text-[#8b311f]">{error} {journey==="returning"&&"Use manual lookup or try again."}{(errorDetails?.code||errorDetails?.requestId)&&<p className="mt-2 text-sm font-semibold">Support reference: {[errorDetails.code,errorDetails.requestId].filter(Boolean).join(" · ")}</p>}<button onClick={()=>{setError("");setErrorDetails(null);setScanStopped(false);autoFired.current=false;}} className="mt-3 min-h-12 w-full rounded-[12px] bg-white px-4 text-[#8b311f]">Try automatic palm scan again</button></div>}
      </aside>
    </section>
  </main>;
}
