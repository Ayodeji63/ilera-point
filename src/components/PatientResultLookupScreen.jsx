import { ArrowLeft, Clock3, FileSearch, LoaderCircle, Search, ShieldCheck } from "lucide-react";
import { useState } from "react";
import BrandHeader from "./BrandHeader";
import { lookupConsultationResult } from "../lib/consultations";

function formatCode(value) {
  const compact = String(value || "").toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 12);
  return compact.match(/.{1,4}/g)?.join("-") || "";
}

export default function PatientResultLookupScreen({ language, onLanguageChange, onBack, onResult }) {
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const check = async (event) => {
    event.preventDefault();
    setBusy(true);
    setPending(false);
    setError("");
    try {
      const response = await lookupConsultationResult(code, phone);
      if (response.result.finished) onResult(response.result);
      else setPending(true);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };

  return <main className="kiosk-shell min-h-[100dvh]">
    <BrandHeader compact language={language} onLanguageChange={onLanguageChange} />
    <section className="relative z-10 mx-auto grid max-w-[1120px] gap-6 px-5 pb-12 md:grid-cols-[.82fr_1.18fr] md:px-10">
      <div className="route-panel rounded-[16px] bg-[#103f33] p-7 text-white md:p-8">
        <button type="button" onClick={onBack} className="flex min-h-12 items-center gap-2 font-black text-[#b8d5cc]"><ArrowLeft size={21}/>Back to start</button>
        <FileSearch size={52} className="mt-6 text-[#f2d533]" aria-hidden="true" />
        <h1 className="mt-4 text-balance text-[clamp(2.7rem,4vw,4rem)] font-black leading-[.98] tracking-[-.04em]">Check an earlier visit.</h1>
        <p className="mt-5 max-w-xl text-xl font-semibold leading-relaxed text-[#b8d5cc]">Use the return code shown after your check-in and the same complete phone number.</p>
        <div className="mt-6 flex gap-3 rounded-[14px] bg-white/10 p-4"><ShieldCheck className="shrink-0 text-[#f2d533]"/><p className="font-bold leading-relaxed text-[#dcebe6]">The code does not contain your name or health information. Staff can help if you no longer have it.</p></div>
      </div>

      <div className="rounded-[16px] bg-white p-7 shadow-[0_16px_40px_rgba(16,63,51,.1)] md:p-8">
        <h2 className="text-3xl font-black tracking-[-.03em] text-[#103f33]">Find your doctor’s response</h2>
        <p className="mt-3 font-semibold leading-relaxed text-[#527269]">Return codes remain available for seven days unless your clinic configured a different period.</p>
        <form onSubmit={check} className="mt-8 space-y-5">
          <label className="block font-black text-[#103f33]">Return code
            <input autoFocus required value={code} onChange={(event) => setCode(formatCode(event.target.value))} placeholder="ABCD-EFGH-JKMN" autoCapitalize="characters" autoComplete="off" spellCheck="false" inputMode="text" className="mt-2 min-h-16 w-full rounded-[14px] bg-[#f1f3ee] px-4 text-xl font-black uppercase tracking-[.08em] placeholder:text-[#7f908b]" />
          </label>
          <label className="block font-black text-[#103f33]">Complete phone number
            <input required value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" autoComplete="tel" minLength="10" maxLength="21" className="mt-2 min-h-16 w-full rounded-[14px] bg-[#f1f3ee] px-4 text-lg font-semibold" />
          </label>
          <button disabled={busy || code.replaceAll("-", "").length !== 12} className="flex min-h-16 w-full items-center justify-center gap-3 rounded-[14px] bg-[#103f33] px-6 text-lg font-black text-white disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin"/> : <Search/>}{busy ? "Checking securely…" : "Check my visit"}</button>
        </form>
        {pending && <div role="status" className="mt-6 rounded-[14px] bg-[#fff2c7] p-5 text-[#6d5510]"><div className="flex gap-3"><Clock3 className="shrink-0"/><div><h3 className="font-black">The clinician is still reviewing your visit.</h3><p className="mt-1 font-semibold leading-relaxed">You do not need to remain at the kiosk. Keep your return code and check again later.</p></div></div></div>}
        {error && <div role="alert" className="mt-6 rounded-[14px] bg-[#fff0e8] p-5 font-bold text-[#8b311f]">{error}</div>}
      </div>
    </section>
  </main>;
}
