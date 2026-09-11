import { useState } from "react";
import { AlertTriangle, Pill, Save } from "lucide-react";
import { createPrescription } from "../lib/consultations";

export default function PrescriptionForm({ consultationId, onComplete }) {
  const [form, setForm] = useState({ drug: "", dosage: "", instructions: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  const save = async (acknowledged) => {
    setBusy(true); setError("");
    try {
      await createPrescription({ consultation_id: consultationId, ...form, acknowledged_interaction: acknowledged });
      onComplete();
    } catch (err) {
      // The server checks the prescription against what the patient said they
      // already take. It never blocks outright, but the warning must be read.
      if (err.code === "interaction") setWarning(err.message);
      else setError(err.message);
    } finally { setBusy(false); }
  };

  return <form onSubmit={(e) => { e.preventDefault(); save(false); }} className="rounded-[16px] bg-white p-6 shadow-[0_16px_40px_rgba(16,63,51,.08)]">
    <div className="flex items-center gap-3"><Pill className="text-[#1d6e59]" /><h2 className="text-2xl font-black">Prescription</h2></div>
    <div className="mt-5 grid gap-4 md:grid-cols-2">
      <label className="font-black">Drug<input required value={form.drug} onChange={(e) => { setForm({ ...form, drug: e.target.value }); setWarning(""); }} className="mt-2 min-h-14 w-full rounded-[14px] bg-[#f1f3ee] px-4" /></label>
      <label className="font-black">Dosage<input required value={form.dosage} onChange={(e) => setForm({ ...form, dosage: e.target.value })} className="mt-2 min-h-14 w-full rounded-[14px] bg-[#f1f3ee] px-4" /></label>
    </div>
    <label className="mt-4 block font-black">Instructions<textarea rows="3" value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} className="mt-2 w-full resize-none rounded-[14px] bg-[#f1f3ee] p-4" /></label>

    {warning && <div role="alert" className="mt-4 rounded-[14px] bg-[#fff2c7] p-5 text-[#6d5510]">
      <div className="flex gap-3"><AlertTriangle className="shrink-0" /><div><strong className="block text-lg">Check this against the patient's current medication</strong><p className="mt-2 font-bold leading-relaxed">{warning}</p></div></div>
      <p className="mt-4 text-sm font-bold">This is a reference check, not a clinical decision. If you have considered it and still want to prescribe, continue below — your override is recorded with the prescription.</p>
      <button type="button" onClick={() => save(true)} disabled={busy} className="mt-4 min-h-14 w-full rounded-[12px] bg-[#8b311f] px-5 font-black text-white disabled:opacity-50">{busy ? "Saving…" : "I have considered this — prescribe anyway"}</button>
    </div>}

    {error && <div role="alert" className="mt-4 rounded-[14px] bg-[#fff0e8] p-4 font-bold text-[#8b311f]">{error}</div>}
    <button disabled={busy} className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-[14px] bg-[#103f33] px-5 font-black text-white"><Save />{busy ? "Saving…" : "Save prescription and complete"}</button>
  </form>;
}
