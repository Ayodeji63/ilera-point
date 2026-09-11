import { AlertCircle, CheckCircle2, LoaderCircle, Pill, RotateCcw, Volume2 } from "lucide-react";
import BrandHeader from "./BrandHeader";

export default function PatientCompleteScreen({ patient, result, waitedTooLong, speaking, onReadAloud, onReset }) {
  const prescription = result?.prescription;
  const finished = Boolean(result?.finished);

  if (!finished) return <main className="kiosk-shell min-h-[100dvh]"><BrandHeader compact />
    <section className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-5 py-16 text-center">
      <LoaderCircle size={72} className="animate-spin text-[#1d6e59]" />
      <h1 className="mt-7 text-6xl font-black tracking-[-.04em] text-[#103f33]">The doctor is reading your answers.</h1>
      <p className="mt-5 max-w-2xl text-xl font-semibold text-[#527269]">Thank you, {patient?.name}. Please stay here — your prescription will appear on this screen as soon as the clinician has finished. This is not a diagnosis.</p>
      {waitedTooLong && <p className="mt-6 max-w-2xl rounded-[14px] bg-[#fff2c7] p-5 text-lg font-bold text-[#6d5510]">This is taking longer than usual. You can keep waiting here, or speak to reception and they will find your result for you.</p>}
      <button onClick={onReset} className="mt-10 flex min-h-16 items-center gap-3 rounded-[14px] bg-[#103f33] px-7 font-black text-white"><RotateCcw />Finish and clear this kiosk</button>
    </section>
  </main>;

  return <main className="kiosk-shell min-h-[100dvh]"><BrandHeader compact />
    <section className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-5 py-14 text-center">
      {prescription ? <Pill size={72} className="text-[#1d6e59]" /> : <CheckCircle2 size={72} className="text-[#1d6e59]" />}
      <h1 className="mt-6 text-5xl font-black tracking-[-.04em] text-[#103f33]">{prescription ? "The doctor has prescribed for you." : "The doctor has reviewed your answers."}</h1>

      {prescription
        ? <div className="mt-8 w-full rounded-[16px] bg-white p-7 text-left shadow-[0_16px_40px_rgba(16,63,51,.1)] md:p-9">
            <span className="text-sm font-black uppercase tracking-[.1em] text-[#527269]">Medicine</span>
            <p className="mt-1 overflow-wrap-anywhere text-[clamp(2rem,4vw,3.2rem)] font-black leading-tight tracking-[-.03em] text-[#103f33]">{prescription.drug}</p>
            <span className="mt-6 block text-sm font-black uppercase tracking-[.1em] text-[#527269]">How much, how often</span>
            <p className="mt-1 text-2xl font-black text-[#36564e]">{prescription.dosage}</p>
            {prescription.instructions && <><span className="mt-6 block text-sm font-black uppercase tracking-[.1em] text-[#527269]">Instructions</span><p className="mt-1 text-xl font-semibold leading-relaxed text-[#36564e]">{prescription.instructions}</p></>}
            <button onClick={onReadAloud} disabled={speaking} className="mt-7 flex min-h-16 w-full items-center justify-center gap-3 rounded-[14px] bg-[#f2d533] px-5 text-lg font-black text-[#103f33] disabled:opacity-60"><Volume2 />{speaking ? "Reading aloud…" : "Read this to me again"}</button>
          </div>
        : <div className="mt-8 w-full rounded-[16px] bg-white p-7 text-left shadow-[0_16px_40px_rgba(16,63,51,.1)]">
            <div className="flex gap-3"><AlertCircle className="shrink-0 text-[#8b311f]" /><p className="text-xl font-semibold leading-relaxed text-[#36564e]">No medicine was prescribed from this check-in. Please speak to reception — a member of staff will tell you what happens next.</p></div>
          </div>}

      <p className="mt-7 max-w-2xl text-lg font-semibold text-[#527269]">Take this to the pharmacy counter. If anything here is unclear, ask a member of staff before you take any medicine.</p>
      <button onClick={onReset} className="mt-8 flex min-h-16 items-center gap-3 rounded-[14px] bg-[#103f33] px-7 font-black text-white"><RotateCcw />I have finished — clear this screen</button>
    </section>
  </main>;
}
