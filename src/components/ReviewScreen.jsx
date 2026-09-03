import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCheck } from "lucide-react";
import BrandHeader from "./BrandHeader";

const Field = ({ label, children }) => <div className="border-b border-[#d8e1dc] py-5"><dt className="text-sm font-black uppercase tracking-[.1em] text-[#527269]">{label}</dt><dd className="mt-2 text-xl font-extrabold text-[#103f33]">{children || "Not provided"}</dd></div>;

export default function ReviewScreen({ record, turnCount, decision, onDecision, onBack }) {
  if (!record) return <main className="kiosk-shell min-h-[100dvh]"><BrandHeader compact /><section className="mx-auto max-w-3xl px-5 py-20 text-center"><ClipboardCheck className="mx-auto text-[#1d6e59]" size={60} /><h1 className="mt-6 text-5xl font-black tracking-[-.04em] text-[#103f33]">No record to review</h1><p className="mt-4 text-xl font-semibold text-[#527269]">Complete a patient voice check-in first.</p><button onClick={onBack} className="mt-8 min-h-14 rounded-full bg-[#103f33] px-7 font-black text-white">Go to patient check-in</button></section></main>;
  return (
    <main className="min-h-[100dvh] bg-[#edf0eb]">
      <BrandHeader compact />
      <section className="mx-auto grid max-w-[1280px] gap-6 px-5 pb-10 md:grid-cols-[.65fr_1.35fr] md:px-10">
        <aside className="rounded-[16px] bg-[#103f33] p-7 text-white md:sticky md:top-6 md:self-start"><button onClick={onBack} className="flex min-h-11 items-center gap-2 font-black text-[#c4d8d1]"><ArrowLeft />Patient view</button><h1 className="mt-10 text-5xl font-black leading-[.95] tracking-[-.04em]">Clinician review</h1><p className="mt-5 text-lg font-semibold leading-relaxed text-[#b8d5cc]">Review the intake record. This is structured patient-reported information, not a diagnosis.</p><div className="mt-10 border-t border-white/20 pt-6"><div className="text-sm font-black uppercase tracking-[.1em] text-[#b8d5cc]">Interview length</div><div className="mt-2 text-3xl font-black">{turnCount} turn{turnCount === 1 ? "" : "s"}</div></div></aside>
        <div className="rounded-[16px] bg-white p-6 shadow-[0_16px_40px_rgba(16,63,51,.08)] md:p-9"><div className="flex items-center justify-between gap-4"><h2 className="text-3xl font-black tracking-[-.03em] text-[#103f33]">Patient-reported record</h2><span className="rounded-full bg-[#e7f1ed] px-4 py-2 text-sm font-black text-[#1d6e59]">Ready to review</span></div><dl className="mt-5"><Field label="Chief complaints">{record.chief_complaints.join(", ")}</Field><Field label="Onset">{record.onset}</Field><Field label="Associated symptoms">{record.associated_symptoms.join(", ")}</Field><Field label="Symptoms denied">{record.negative_symptoms_checked.join(", ")}</Field><Field label="Medication history">{record.medication_history}</Field><Field label="Still missing">{record.still_missing.join(", ") || "Nothing noted"}</Field></dl>
          {decision ? <div className={`mt-8 flex items-center gap-4 rounded-[14px] p-5 text-lg font-black ${decision === "approved" ? "bg-[#dff2e9] text-[#155944]" : "bg-[#fff0e8] text-[#8b311f]"}`}>{decision === "approved" ? <CheckCircle2 /> : <AlertTriangle />}{decision === "approved" ? "Record approved" : "Flagged for follow-up"}</div> : <div className="mt-8 grid gap-3 sm:grid-cols-2"><button onClick={() => onDecision("approved")} className="flex min-h-16 items-center justify-center gap-3 rounded-[14px] bg-[#1d6e59] px-5 text-lg font-black text-white"><CheckCircle2 />Approve record</button><button onClick={() => onDecision("flagged")} className="flex min-h-16 items-center justify-center gap-3 rounded-[14px] bg-[#f2d533] px-5 text-lg font-black text-[#103f33]"><AlertTriangle />Flag follow-up</button></div>}
        </div>
      </section>
    </main>
  );
}
