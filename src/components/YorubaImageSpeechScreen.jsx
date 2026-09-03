import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Download, FileImage, LoaderCircle, RefreshCw, Upload, UsersRound, Volume2, X } from "lucide-react";
import BrandHeader from "./BrandHeader";
import { createYorubaSpeech, prepareYorubaScript, readYorubaImage } from "../lib/yorubaImageSpeech";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export default function YorubaImageSpeechScreen({ onBack }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [text, setText] = useState("");
  const [cast, setCast] = useState([]);
  const [audioUrl, setAudioUrl] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const work = useRef(null);

  const clearAudio = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl("");
  };

  useEffect(() => () => work.current?.abort(), []);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  const transcribe = async (nextFile) => {
    work.current?.abort();
    clearAudio();
    setError("");
    setText("");
    setCast([]);
    if (!IMAGE_TYPES.has(nextFile.type)) { setError("Use a JPG, PNG, or WebP image."); return; }
    if (nextFile.size > MAX_IMAGE_BYTES) { setError("The image must be 8 MB or smaller."); return; }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(nextFile);
    setPreviewUrl(URL.createObjectURL(nextFile));
    const controller = new AbortController();
    work.current = controller;
    setStatus("reading");
    let rawText = "";
    try {
      const result = await readYorubaImage(nextFile, controller.signal);
      rawText = result.text;
      setText(rawText);
      setStatus("preparing");
      const prepared = await prepareYorubaScript(rawText, controller.signal);
      setText(prepared.text);
      setCast(prepared.speakers);
      setStatus("editing");
    } catch (caught) {
      if (caught.name !== "AbortError") {
        setError(rawText ? `${caught.message} The raw transcription is available for manual editing.` : caught.message);
        setStatus(rawText ? "editing" : "idle");
      }
    } finally {
      if (work.current === controller) work.current = null;
    }
  };

  const generate = async () => {
    if (!text.trim()) return;
    work.current?.abort();
    clearAudio();
    setError("");
    const controller = new AbortController();
    work.current = controller;
    setStatus("generating");
    try {
      const result = await createYorubaSpeech(text, cast, controller.signal);
      setAudioUrl(URL.createObjectURL(result.audio));
      setStatus("ready");
    } catch (caught) {
      if (caught.name !== "AbortError") { setError(caught.message); setStatus("editing"); }
    } finally {
      if (work.current === controller) work.current = null;
    }
  };

  const reset = () => {
    work.current?.abort();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    clearAudio();
    setFile(null); setPreviewUrl(""); setText(""); setCast([]); setStatus("idle"); setError("");
  };

  const busy = status === "reading" || status === "preparing" || status === "generating";

  return (
    <main className="kiosk-shell min-h-[100dvh]">
      <BrandHeader compact />
      <section className="relative z-10 mx-auto w-full max-w-[1280px] px-5 pb-10 md:px-10">
        <button type="button" onClick={onBack} className="mb-4 flex min-h-12 items-center gap-2 font-black text-[#103f33]"><ArrowLeft size={21} />Back to check-in</button>
        <div className="mb-8 max-w-4xl">
          <h1 className="text-balance text-[clamp(2.6rem,6vw,5rem)] font-black leading-[.94] tracking-[-.04em] text-[#103f33]">Turn Yorùbá writing into speech.</h1>
          <p className="mt-5 max-w-3xl text-lg font-semibold leading-relaxed text-[#47665e] md:text-xl">Upload a clear photo or scan. Check the extracted text, then create a Sahara voice recording you can play or download.</p>
        </div>

        <div className="grid overflow-hidden rounded-[16px] shadow-[0_18px_45px_rgba(16,63,51,.12)] lg:grid-cols-[.9fr_1.1fr]">
          <section className="flex min-h-[520px] min-w-0 flex-col overflow-hidden bg-[#103f33] p-6 text-white md:p-8" aria-labelledby="image-heading">
            <div className="flex items-start justify-between gap-4"><div><h2 id="image-heading" className="text-3xl font-black tracking-[-.03em]">Upload the script</h2><p className="mt-2 font-semibold text-[#b8d5cc]">JPG, PNG, or WebP · up to 8 MB</p></div><FileImage className="shrink-0 text-[#f2d533]" size={34} /></div>
            <label onDragOver={(event)=>event.preventDefault()} onDrop={(event)=>{event.preventDefault();const dropped=event.dataTransfer.files?.[0];if(dropped)transcribe(dropped);}} className={`mt-6 flex min-w-0 max-w-full flex-1 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[14px] border-2 border-dashed ${previewUrl?"border-[#f2d533] bg-[#092c24]":"border-[#6f9187] bg-white/5 hover:border-[#f2d533]"}`}>
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy} onChange={(event)=>{const selected=event.target.files?.[0];if(selected)transcribe(selected);event.target.value="";}} />
              {previewUrl ? <img src={previewUrl} alt="Uploaded Yoruba script" className="h-full max-h-[390px] min-w-0 max-w-full object-contain" /> : <div className="px-5 text-center"><span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-[#f2d533] text-[#103f33]"><Upload size={34} /></span><div className="mt-5 text-2xl font-black">Choose or drop an image</div><p className="mt-2 font-semibold text-[#b8d5cc]">A straight, well-lit image gives the best result.</p></div>}
            </label>
            {file&&<div className="mt-4 flex items-center justify-between gap-4"><div className="min-w-0"><div className="truncate font-black">{file.name}</div><div className="text-sm font-semibold text-[#b8d5cc]">{(file.size/1024/1024).toFixed(2)} MB</div></div><button type="button" onClick={reset} disabled={busy} className="grid h-12 w-12 shrink-0 place-items-center rounded-[12px] bg-white/10 disabled:opacity-50" aria-label="Remove image"><X /></button></div>}
          </section>

          <section className="flex min-h-[520px] min-w-0 flex-col overflow-hidden bg-white p-6 md:p-8" aria-labelledby="text-heading">
            <div className="flex items-start justify-between gap-4"><div><h2 id="text-heading" className="text-3xl font-black tracking-[-.03em] text-[#103f33]">Check the Yoruba text</h2><p className="mt-2 font-semibold text-[#527269]">Correct any word or tone mark before creating speech.</p></div><Volume2 className="shrink-0 text-[#1d6e59]" size={32} /></div>

            {status==="reading"||status==="preparing"?<div className="mt-8 flex flex-1 flex-col items-center justify-center text-center text-[#103f33]" aria-live="polite"><LoaderCircle className="animate-spin text-[#1d6e59]" size={44}/><div className="mt-4 text-2xl font-black">{status==="reading"?"Reading the image…":"Restoring written Yorùbá…"}</div><p className="mt-2 max-w-md font-semibold text-[#527269]">{status==="reading"?"Keeping screenplay lines and punctuation in place.":"Adding tone marks and underdots while preserving English dialogue."}</p></div>:
              <textarea aria-label="Extracted Yoruba text" value={text} onChange={(event)=>{setText(event.target.value);clearAudio();if(status==="ready")setStatus("editing");}} disabled={!file||busy} placeholder={file?"Extracted Yoruba text will appear here…":"Upload an image to begin."} className="mt-6 min-h-[250px] w-full flex-1 resize-y rounded-[14px] bg-[#f1f3ee] p-5 text-lg font-semibold leading-relaxed text-[#103f33] placeholder:text-[#7f908b] disabled:cursor-not-allowed" />}

            {cast.length>0&&!busy&&<section className="mt-4" aria-labelledby="cast-heading"><div className="flex items-center gap-2 text-[#103f33]"><UsersRound size={21}/><h3 id="cast-heading" className="font-black">Cast voices</h3></div><p className="mt-1 font-semibold text-[#527269]">Character names are skipped in the recording. Check each suggested voice.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{cast.map((speaker)=><div key={speaker.name} className="flex min-w-0 items-center justify-between gap-3 rounded-[12px] bg-[#edf0eb] p-3"><span className="truncate font-black text-[#103f33]">{speaker.name}</span><div className="flex shrink-0 gap-1" role="group" aria-label={`${speaker.name} voice`}><button type="button" onClick={()=>{setCast((current)=>current.map((item)=>item.name===speaker.name?{...item,voiceGender:"female"}:item));clearAudio();}} aria-pressed={speaker.voiceGender==="female"} className={`min-h-10 rounded-[10px] px-3 font-black ${speaker.voiceGender==="female"?"bg-[#103f33] text-white":"bg-white text-[#527269]"}`}>Female</button><button type="button" onClick={()=>{setCast((current)=>current.map((item)=>item.name===speaker.name?{...item,voiceGender:"male"}:item));clearAudio();}} aria-pressed={speaker.voiceGender==="male"} className={`min-h-10 rounded-[10px] px-3 font-black ${speaker.voiceGender==="male"?"bg-[#103f33] text-white":"bg-white text-[#527269]"}`}>Male</button></div></div>)}</div></section>}

            {text&&!busy&&<p className="overflow-wrap-anywhere mt-3 font-bold text-[#527269]">Sahara v2.5 · Yorùbá ↔ English code-switching · restored tone marks and screenplay pacing.</p>}

            {error&&<div role="alert" className="mt-4 flex gap-3 rounded-[14px] bg-[#fff0e8] p-4 font-bold text-[#8b311f]"><AlertCircle className="shrink-0"/><span>{error}</span></div>}

            {audioUrl&&<div className="mt-5 rounded-[14px] bg-[#e7f1ed] p-4"><div className="mb-3 font-black text-[#155944]">Your Sahara recording is ready.</div><audio controls src={audioUrl} className="w-full"/><a href={audioUrl} download="ilerapoint-yoruba-speech.wav" className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-[14px] bg-[#f2d533] px-5 font-black text-[#103f33]"><Download size={21}/>Download WAV</a></div>}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={generate} disabled={!text.trim()||busy} className="flex min-h-16 flex-1 items-center justify-center gap-3 rounded-[14px] bg-[#103f33] px-5 text-lg font-black text-white disabled:cursor-not-allowed disabled:opacity-40">{status==="generating"?<><LoaderCircle className="animate-spin"/>Creating speech — longer scripts may take a minute…</>:<><Volume2/>Create Sahara speech</>}</button>
              {(file||text)&&<button type="button" onClick={reset} disabled={busy} className="flex min-h-16 items-center justify-center gap-2 rounded-[14px] bg-[#e7f1ed] px-5 font-black text-[#155944] disabled:opacity-50"><RefreshCw size={20}/>Start over</button>}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
