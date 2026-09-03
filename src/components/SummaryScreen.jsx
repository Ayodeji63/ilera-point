import { useState } from "react";
import { Check, Pencil, RotateCcw, Save, Stethoscope, Volume2, X } from "lucide-react";
import BrandHeader from "./BrandHeader";

function EditableRow({ field, label, value, displayValue, array = false, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(array ? value.join(", ") : value);
  const save = () => {
    const nextValue = array ? draft.split(",").map((item) => item.trim()).filter(Boolean) : draft.trim();
    onSave(field, nextValue);
    setEditing(false);
  };
  const cancel = () => { setDraft(array ? value.join(", ") : value); setEditing(false); };

  return <div className="grid gap-3 border-b border-[#d8e1dc] py-5 md:grid-cols-[190px_1fr_auto] md:items-center"><dt className="font-black text-[#527269]">{label}</dt><dd className="min-w-0">{editing ? <input autoFocus maxLength="500" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") save(); if (event.key === "Escape") cancel(); }} aria-label={`Edit ${label}`} className="min-h-12 w-full rounded-[12px] bg-[#edf0eb] px-4 text-lg font-extrabold text-[#103f33]" /> : <span className="overflow-wrap-anywhere text-lg font-extrabold text-[#103f33]">{displayValue || "Not provided"}</span>}</dd><div className="flex gap-2">{editing ? <><button onClick={save} className="grid h-12 w-12 place-items-center rounded-[12px] bg-[#1d6e59] text-white" aria-label={`Save ${label}`}><Save size={20} /></button><button onClick={cancel} className="grid h-12 w-12 place-items-center rounded-[12px] bg-[#e3e7e3] text-[#103f33]" aria-label={`Cancel editing ${label}`}><X size={20} /></button></> : <button onClick={() => setEditing(true)} className="flex min-h-12 items-center gap-2 rounded-[12px] bg-[#e7f1ed] px-4 font-black text-[#155944]" aria-label={`Edit ${label}`}><Pencil size={18} />Edit</button>}</div></div>;
}

export default function SummaryScreen({ record, onUpdateRecord, onSpeak, speaking, saving, error, onReview, onReset }) {
  return (
    <main className="kiosk-shell min-h-[100dvh]">
      <BrandHeader compact />
      <section className="relative z-10 mx-auto max-w-5xl px-5 pb-12 md:px-10">
        <div className="flex flex-col gap-5 border-b-2 border-[#103f33] pb-7 pt-3 md:flex-row md:items-end md:justify-between">
          <div><div className="flex items-center gap-3 text-[#1d6e59]"><Check className="rounded-full bg-[#1d6e59] p-1 text-white" size={30} /><span className="text-lg font-black">Check-in complete</span></div><h1 className="mt-4 text-5xl font-black tracking-[-.04em] text-[#103f33] md:text-7xl">Check before you continue.</h1><p className="mt-4 text-lg font-semibold text-[#527269]">Tap Edit beside anything that is not right.</p></div>
          <button onClick={onSpeak} disabled={speaking} className="flex min-h-14 items-center justify-center gap-3 rounded-full bg-[#f2d533] px-6 font-black text-[#103f33] disabled:opacity-60"><Volume2 />{speaking ? "Reading summary…" : "Read this aloud"}</button>
        </div>
        <dl className="mt-3">
          <EditableRow field="chief_complaints" label="Main concern" value={record.chief_complaints} displayValue={record.chief_complaints.join(", ")} array onSave={onUpdateRecord} />
          <EditableRow field="onset" label="When it started" value={record.onset} displayValue={record.onset} onSave={onUpdateRecord} />
          <EditableRow field="associated_symptoms" label="Other symptoms" value={record.associated_symptoms} displayValue={record.associated_symptoms.join(", ") || "None reported"} array onSave={onUpdateRecord} />
          <EditableRow field="negative_symptoms_checked" label="Symptoms denied" value={record.negative_symptoms_checked} displayValue={record.negative_symptoms_checked.length ? `You reported no ${record.negative_symptoms_checked.join(" or ")}.` : "Not checked"} array onSave={onUpdateRecord} />
          <EditableRow field="medication_history" label="Medicines" value={record.medication_history || ""} displayValue={record.medication_history} onSave={onUpdateRecord} />
        </dl>
        {record.still_missing.length > 0 && <p className="mt-6 rounded-[14px] bg-[#fff2c7] p-5 font-bold text-[#6d5510]">A clinician may still ask about: {record.still_missing.join(", ")}.</p>}
        {error && <div role="alert" className="mt-6 rounded-[14px] bg-[#fff0e8] p-5 font-bold text-[#8b311f]">{error} Your answers are still on this screen; please try again.</div>}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row"><button disabled={saving} onClick={onReview} className="flex min-h-16 flex-1 items-center justify-center gap-3 rounded-[14px] bg-[#103f33] px-6 text-lg font-black text-white disabled:opacity-60"><Stethoscope />{saving ? "Sending securely…" : "Everything is correct — send to doctor"}</button><button disabled={saving} onClick={onReset} className="flex min-h-16 items-center justify-center gap-3 rounded-[14px] bg-white px-6 font-black text-[#103f33] shadow-[0_10px_25px_rgba(16,63,51,.08)] disabled:opacity-60"><RotateCcw />Start again</button></div>
      </section>
    </main>
  );
}
