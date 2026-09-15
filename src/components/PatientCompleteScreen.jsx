import { AlertCircle, CheckCircle2, Clock3, LoaderCircle, Pill, ReceiptText, RotateCcw, Volume2 } from "lucide-react";
import BrandHeader from "./BrandHeader";

export default function PatientCompleteScreen({ patient, result, resultAccessCode, resultAccessExpiresAt, waitedTooLong, speaking, optionalConsentActive, privacyStatus, onWithdrawOptionalConsent, onReadAloud, onReset }) {
  const prescription = result?.prescription;
  const finished = Boolean(result?.finished);

  if (!finished) return <main className="kiosk-shell min-h-[100dvh]"><BrandHeader compact />
    <section className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-5 py-4 text-center md:py-5">
      <LoaderCircle size={40} className="animate-spin text-[#1d6e59]" />
      <h1 className="mt-2 text-balance text-[clamp(2.25rem,4.5vw,3rem)] font-black leading-[1.02] tracking-[-.04em] text-[#103f33]">The doctor is reading your answers.</h1>
      <p className="mt-3 max-w-2xl text-lg font-semibold text-[#527269]">{patient?.name ? `Thank you, ${patient.name}. ` : ""}You may wait here, or save the return code below and check again later. This is not a diagnosis.</p>
      {resultAccessCode && <div className="mt-4 w-full max-w-3xl rounded-[16px] bg-[#103f33] p-5 text-left text-white shadow-[0_16px_40px_rgba(16,63,51,.12)]">
        <div className="flex items-center gap-3"><ReceiptText className="text-[#f2d533]"/><h2 className="text-2xl font-black">Your private return code</h2></div>
        <p className="mt-3 select-all whitespace-nowrap text-center text-[clamp(1.75rem,4vw,3rem)] font-black tracking-[.04em] text-[#f2d533]">{resultAccessCode}</p>
        <p className="mt-3 font-semibold leading-relaxed text-[#dcebe6]">Write this down or take a photo. To return, choose “Check an earlier visit” and enter this code with the complete phone number used today.</p>
        {resultAccessExpiresAt && <p className="mt-3 text-sm font-bold text-[#b8d5cc]">Available until {new Date(resultAccessExpiresAt).toLocaleString()}.</p>}
      </div>}
      {waitedTooLong && <div className="mt-6 flex max-w-2xl gap-3 rounded-[14px] bg-[#fff2c7] p-5 text-left text-[#6d5510]"><Clock3 className="shrink-0"/><p className="text-lg font-bold">The review is taking longer than usual. You do not need to remain at the kiosk; keep your return code and check later, or speak to reception.</p></div>}
      {optionalConsentActive && <button disabled={privacyStatus === "withdrawing"} onClick={onWithdrawOptionalConsent} className="mt-4 min-h-14 rounded-[14px] bg-white px-5 font-black text-[#155944] shadow-[0_10px_25px_rgba(16,63,51,.08)] disabled:opacity-60">{privacyStatus === "withdrawing" ? "Withdrawing optional permission…" : "Withdraw video and research permission"}</button>}
      {privacyStatus === "withdrawn" && <p role="status" className="mt-4 max-w-2xl rounded-[14px] bg-[#dff2e9] p-4 font-bold text-[#155944]">Optional permission was withdrawn and any visit video was deleted. Your clinical record remains with the clinic.</p>}
      {privacyStatus && !["withdrawing", "withdrawn"].includes(privacyStatus) && <p role="alert" className="mt-4 max-w-2xl rounded-[14px] bg-[#fff0e8] p-4 font-bold text-[#8b311f]">{privacyStatus}</p>}
      <button onClick={onReset} className="mt-4 flex min-h-16 items-center gap-3 rounded-[14px] bg-[#103f33] px-7 font-black text-white"><RotateCcw />I saved my code — clear this kiosk</button>
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
