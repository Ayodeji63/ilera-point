import { useCallback, useRef, useState } from "react";
import { AlertTriangle, Check, Mic, PenLine, Pill, RotateCcw, Save, Square, Volume2 } from "lucide-react";
import { createPrescription, parsePrescription } from "../lib/consultations";
import { useClinicianDictation } from "../lib/media/useClinicianDictation";
import { speechProvider } from "../lib/providers/SpeechProvider";

const LANGUAGES = [
  ["en", "English"], ["yo", "Yorùbá + English"], ["pcm", "Pidgin + English"],
  ["ha", "Hausa + English"], ["ig", "Igbo + English"],
];
const ACCENTS = { en: "yoruba", yo: "yoruba", pcm: "pidgin", ha: "hausa", ig: "igbo" };
const WARNING_INTRO = {
  en: "Medication safety warning.", yo: "Ìkìlọ̀ ààbò oògùn.",
  pcm: "Medicine safety warning.", ha: "Gargadin amincin magani.",
  ig: "Ịdọ aka ná ntị maka nchekwa ọgwụ.",
};
const STATUS_COPY = {
  starting: "Opening the microphone…",
  waiting: "Start speaking — recording will stop after your finishing pause.",
  recording: "Listening… pause when the prescription is complete.",
  finishing: "Finishing the recording…",
  transcribing: "Turning the dictation into text…",
  parsing: "Checking every prescription field…",
};
const emptyForm = { drug: "", dosage: "", frequency: "", duration: "", instructions: "" };

export default function PrescriptionForm({ consultationId, onComplete }) {
  const [form, setForm] = useState(emptyForm);
  const [language, setLanguage] = useState("en");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [dictation, setDictation] = useState(null);
  const warningAudio = useRef(null);
  const saving = useRef(false);

  const readWarning = useCallback(async (text = warning) => {
    if (!text) return;
    try {
      warningAudio.current?.pause();
      const blob = await speechProvider.synthesize(`${WARNING_INTRO[language]} ${text}`, ACCENTS[language], "female", language);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      warningAudio.current = audio;
      audio.onended = () => URL.revokeObjectURL(url);
      audio.onerror = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch (failure) {
      setError(`The warning could not be read aloud: ${failure.message}`);
    }
  }, [language, warning]);

  const handleTranscript = useCallback(async ({ transcript, fileId }) => {
    setError("");
    setWarning("");
    try {
      const result = await parsePrescription({ consultation_id: consultationId, transcript, language_code: language, speech_file_id: fileId });
      setForm({
        drug: result.prescription.drug, dosage: result.prescription.dosage,
        frequency: result.prescription.frequency, duration: result.prescription.duration,
        instructions: result.prescription.instructions,
      });
      setDictation({ transcript, confidence: result.prescription.confidence, sampleId: result.sample_id });
      setWarning(result.warning || "");
      if (result.warning) void readWarning(result.warning);
    } catch (failure) {
      // A rejected model guess never enters the form. The transcript remains
      // visible so the clinician can deliberately type the intended medicine.
      setDictation({ transcript, invalid: true });
      setForm(emptyForm);
      setError(failure.message);
    }
  }, [consultationId, language, readWarning]);

  const dictationControl = useClinicianDictation(language, handleTranscript);
  const recording = ["starting", "waiting", "recording", "finishing"].includes(dictationControl.status);
  const processing = ["transcribing", "parsing"].includes(dictationControl.status);

  const change = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
  };

  const save = async ({ acknowledged = false, confirmed = false } = {}) => {
    if (saving.current || (dictation && !dictation.invalid && !confirmed)) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await createPrescription({
        consultation_id: consultationId, ...form,
        acknowledged_interaction: acknowledged,
        dictated: Boolean(dictation && !dictation.invalid),
        raw_transcript: dictation?.transcript || null,
        parse_confidence: dictation?.confidence ?? null,
        confirmed_dictation: confirmed,
      });
      onComplete();
    } catch (failure) {
      if (failure.code === "interaction") {
        setWarning(failure.message);
        void readWarning(failure.message);
      } else setError(failure.message);
    } finally { saving.current = false; setBusy(false); }
  };

  const controlLabel = processing ? "Prescription dictation is being processed" : recording ? "Stop prescription dictation" : "Start prescription dictation";

  return <div className="space-y-5">
    <section className="rounded-[16px] bg-[#103f33] p-6 text-white shadow-[0_16px_40px_rgba(16,63,51,.12)]" aria-labelledby="dictate-heading" aria-busy={processing}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl"><h2 id="dictate-heading" className="text-2xl font-black tracking-[-.03em]">Dictate one prescription</h2><p className="mt-2 font-semibold leading-relaxed text-[#b8d5cc]">Say the drug, dose, frequency, duration and instructions. You will review every field before anything is saved.</p></div>
        <label className="font-black text-[#b8d5cc]">Dictation language<select value={language} disabled={recording || processing || busy} onChange={(event) => setLanguage(event.target.value)} className="mt-2 block min-h-12 rounded-[12px] bg-white px-3 text-[#103f33] disabled:opacity-60">{LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
      </div>
      <div className="mt-6 flex flex-col items-center rounded-[14px] bg-black/15 px-5 py-6 text-center">
        <button type="button" onClick={recording ? dictationControl.stop : dictationControl.start} disabled={processing || busy} aria-label={controlLabel} className={`grid size-32 place-items-center rounded-full transition-[transform,background-color] duration-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#0a78ff] focus-visible:ring-offset-4 focus-visible:ring-offset-[#103f33] active:scale-95 disabled:cursor-wait disabled:opacity-60 ${recording ? "bg-[#ef755f] text-white" : "bg-[#f2d533] text-[#103f33]"}`}>{recording ? <Square size={38} fill="currentColor" /> : processing ? <RotateCcw className="animate-spin" size={40} /> : <Mic size={46} />}</button>
        <p aria-live="polite" className="mt-4 min-h-7 text-lg font-black">{STATUS_COPY[dictationControl.status] || "Tap once, then dictate naturally."}</p>
        {recording && <button type="button" onClick={dictationControl.cancel} className="mt-2 min-h-12 px-4 font-black text-[#b8d5cc] underline underline-offset-4">Cancel dictation</button>}
      </div>
      {(dictationControl.error || error) && <div role="alert" className="mt-4 rounded-[14px] bg-[#fff0e8] p-4 font-bold text-[#8b311f]">{dictationControl.error || error}</div>}
      {dictation?.transcript && <div className="mt-4 border-t border-white/20 pt-4"><span className="text-sm font-black uppercase tracking-[.1em] text-[#b8d5cc]">Sahara transcript</span><p className="mt-2 font-semibold leading-relaxed">“{dictation.transcript}”</p></div>}
    </section>

    <form onSubmit={(event) => { event.preventDefault(); save(); }} className="rounded-[16px] bg-white p-6 shadow-[0_16px_40px_rgba(16,63,51,.08)]">
      <div className="flex items-center gap-3"><Pill className="text-[#1d6e59]" /><h2 className="text-2xl font-black">Prescription details</h2></div>
      <p className="mt-2 font-semibold text-[#527269]">Type directly, or check the fields filled from your dictation.</p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Field label="Drug" required disabled={busy} value={form.drug} onChange={(value) => { change("drug", value); setWarning(""); }} />
        <Field label="Dose" required disabled={busy} value={form.dosage} placeholder="e.g. 500 mg" onChange={(value) => change("dosage", value)} />
        <Field label="Frequency" disabled={busy} value={form.frequency} placeholder="e.g. TDS" onChange={(value) => change("frequency", value)} />
        <Field label="Duration" disabled={busy} value={form.duration} placeholder="e.g. 5 days" onChange={(value) => change("duration", value)} />
      </div>
      <label className="mt-4 block font-black">Instructions<textarea rows="3" disabled={busy} value={form.instructions} onChange={(event) => change("instructions", event.target.value)} className="mt-2 w-full resize-none rounded-[14px] bg-[#f1f3ee] p-4 placeholder:text-[#45655d] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#0a78ff] disabled:opacity-60" /></label>

      {dictation && !dictation.invalid && <Confirmation form={form} confidence={dictation.confidence} />}
      {warning && <Warning warning={warning} onRead={() => readWarning()} onAcknowledge={dictation && !dictation.invalid ? null : () => save({ acknowledged: true })} busy={busy} />}

      {dictation && !dictation.invalid ? <div className="mt-5 grid gap-3 sm:grid-cols-[.7fr_1.3fr]">
        <button type="button" disabled={busy} onClick={() => { setDictation(null); setWarning(""); }} className="flex min-h-14 items-center justify-center gap-2 rounded-[14px] bg-[#e3e7e3] px-4 font-black text-[#103f33] disabled:opacity-60"><PenLine />Discard and type</button>
        <button type="button" onClick={() => save({ acknowledged: Boolean(warning), confirmed: true })} disabled={busy} className="flex min-h-14 items-center justify-center gap-2 rounded-[14px] bg-[#103f33] px-5 font-black text-white disabled:opacity-50"><Check />{busy ? "Saving…" : warning ? "I considered the warning — confirm and prescribe" : "Confirm and save prescription"}</button>
      </div> : <button disabled={busy || processing || recording} className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-[14px] bg-[#103f33] px-5 font-black text-white disabled:opacity-50"><Save />{busy ? "Saving…" : "Save typed prescription and complete"}</button>}
    </form>
  </div>;
}

function Field({ label, value, onChange, placeholder = "", required = false, disabled = false }) {
  return <label className="font-black">{label}<input required={required} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-2 min-h-14 w-full rounded-[14px] bg-[#f1f3ee] px-4 placeholder:text-[#45655d] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#0a78ff] disabled:opacity-60" /></label>;
}

function Confirmation({ form, confidence }) {
  const rows = [["Drug", form.drug], ["Dose", form.dosage], ["Frequency", form.frequency], ["Duration", form.duration], ["Instructions", form.instructions]];
  return <section className="mt-5 rounded-[14px] bg-[#e7f1ed] p-5" aria-labelledby="confirm-heading"><div className="flex gap-3"><Check className="shrink-0 text-[#1d6e59]" /><div><h3 id="confirm-heading" className="text-xl font-black text-[#103f33]">Confirm what will be written</h3><p className="mt-1 font-semibold text-[#527269]">This draft came from speech. Check the drug and dose against the patient record before confirming.</p></div></div><dl className="mt-4 grid gap-x-5 sm:grid-cols-2">{rows.map(([label, value]) => <div key={label} className="border-b border-[#b8d5cc] py-3"><dt className="text-sm font-black uppercase tracking-[.08em] text-[#527269]">{label}</dt><dd className="mt-1 font-black text-[#103f33]">{value || "Missing"}</dd></div>)}</dl><p className="mt-4 text-sm font-bold text-[#527269]">Parse confidence: {Math.round(confidence * 100)}%. Confidence never replaces your review.</p></section>;
}

function Warning({ warning, onRead, onAcknowledge, busy }) {
  return <div role="alert" className="mt-4 rounded-[14px] bg-[#fff2c7] p-5 text-[#6d5510]"><div className="flex gap-3"><AlertTriangle className="shrink-0" /><div><strong className="block text-lg">Check this against the patient's current medication</strong><p className="mt-2 font-bold leading-relaxed">{warning}</p></div></div><button type="button" onClick={onRead} className="mt-4 flex min-h-12 items-center gap-2 rounded-[12px] bg-white px-4 font-black"><Volume2 />Read warning aloud</button><p className="mt-4 text-sm font-bold">This is a reference check, not a clinical decision. An override is recorded only after you confirm below.</p>{onAcknowledge && <button type="button" onClick={onAcknowledge} disabled={busy} className="mt-4 min-h-14 w-full rounded-[12px] bg-[#8b311f] px-5 font-black text-white disabled:opacity-50">{busy ? "Saving…" : "I have considered this — prescribe anyway"}</button>}</div>;
}
