import { ArrowLeft, Keyboard, LoaderCircle, Search, UserPlus } from "lucide-react";
import { useState } from "react";
import BrandHeader from "./BrandHeader";
import { patientDirectory } from "../lib/providers/PatientDirectory";

export default function PatientAccessScreen({ onPatient, onBack }) {
  const [journey, setJourney] = useState("returning");
  const [form, setForm] = useState({ name: "", phone: "" });
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  const chooseJourney = (next) => {
    setJourney(next);
    setResults([]);
    setSearched(false);
    setError("");
  };

  const lookup = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const found = await patientDirectory.lookup(form);
      setResults(found.patients);
      setSearched(true);
    } catch (lookupError) {
      setError(lookupError.message);
    } finally {
      setBusy(false);
    }
  };

  const register = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onPatient(await patientDirectory.register(form));
    } catch (registrationError) {
      setError(registrationError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="kiosk-shell min-h-[100dvh]">
      <BrandHeader compact />
      <section className="relative z-10 mx-auto grid max-w-[1120px] gap-6 px-5 pb-10 md:grid-cols-[.88fr_1.12fr] md:px-10">
        <div className="route-panel flex min-h-[560px] flex-col justify-between rounded-[16px] bg-[#103f33] p-6 text-white md:p-10">
          <div>
            <button type="button" onClick={onBack} className="flex min-h-12 items-center gap-2 font-black text-[#b8d5cc]"><ArrowLeft size={21} />Back</button>
            <h1 className="mt-10 text-balance text-[clamp(2.7rem,6vw,5.2rem)] font-black leading-[.95] tracking-[-.04em]">Let’s find your patient record.</h1>
            <p className="mt-6 max-w-xl text-xl font-semibold leading-relaxed text-[#b8d5cc]">Returning patients can search their existing record. New patients can create one before the interview.</p>
          </div>
          <p className="mt-10 rounded-[14px] bg-white/10 p-4 font-bold text-[#dcebe6]">Your name and phone number are used only to connect this visit to your care record.</p>
        </div>

        <div className="min-h-[560px] rounded-[16px] bg-white p-6 shadow-[0_16px_40px_rgba(16,63,51,.1)] md:p-9">
          <div className="grid grid-cols-2 gap-2 rounded-[14px] bg-[#edf0eb] p-1.5" aria-label="Patient type">
            <button type="button" onClick={() => chooseJourney("returning")} aria-pressed={journey === "returning"} className={`min-h-12 rounded-[10px] px-3 font-black ${journey === "returning" ? "bg-[#103f33] text-white" : "text-[#45655d]"}`}>Returning patient</button>
            <button type="button" onClick={() => chooseJourney("new")} aria-pressed={journey === "new"} className={`min-h-12 rounded-[10px] px-3 font-black ${journey === "new" ? "bg-[#103f33] text-white" : "text-[#45655d]"}`}>I’m a new patient</button>
          </div>

          {journey === "returning" ? (
            <div className="mt-8">
              <Search className="text-[#1d6e59]" size={34} />
              <h2 className="mt-3 text-3xl font-black tracking-[-.03em] text-[#103f33]">Find your existing record</h2>
              <p className="mt-2 font-semibold leading-relaxed text-[#527269]">Enter either your name or phone number.</p>
              <form onSubmit={lookup} className="mt-6 space-y-4">
                <label className="block font-black text-[#103f33]">Full name<input autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-2 min-h-14 w-full rounded-[14px] bg-[#f1f3ee] px-4 font-semibold" /></label>
                <label className="block font-black text-[#103f33]">Phone number<input inputMode="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="mt-2 min-h-14 w-full rounded-[14px] bg-[#f1f3ee] px-4 font-semibold" /></label>
                <button disabled={busy} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-[14px] bg-[#103f33] px-5 font-black text-white disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" /> : <Keyboard />}Search patient records</button>
              </form>
              {searched && results.length === 0 && <div className="mt-5 rounded-[14px] bg-[#fff2c7] p-4 text-[#6d5510]"><p className="font-black">No matching patient record was found.</p><button type="button" onClick={() => chooseJourney("new")} className="mt-3 min-h-12 w-full rounded-[12px] bg-[#f2d533] px-4 font-black text-[#103f33]"><UserPlus className="mr-2 inline" />Create a new patient record</button></div>}
              <div className="mt-5 space-y-3">{results.map((result) => <button type="button" key={result.id} onClick={() => onPatient(result)} className="w-full rounded-[14px] bg-[#e7f1ed] p-4 text-left text-[#103f33]"><strong className="block text-lg">{result.name}</strong><span className="font-semibold text-[#527269]">{result.phone || "No phone saved"}</span></button>)}</div>
            </div>
          ) : (
            <div className="mt-8">
              <UserPlus className="text-[#1d6e59]" size={34} />
              <h2 className="mt-3 text-3xl font-black tracking-[-.03em] text-[#103f33]">Create your patient record</h2>
              <p className="mt-2 font-semibold leading-relaxed text-[#527269]">Enter your details, then continue to recording consent.</p>
              <form onSubmit={register} className="mt-6 space-y-4">
                <label className="block font-black text-[#103f33]">Full name<input autoFocus required minLength="2" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-2 min-h-14 w-full rounded-[14px] bg-[#f1f3ee] px-4 font-semibold" /></label>
                <label className="block font-black text-[#103f33]">Phone number <span className="font-semibold text-[#527269]">(optional)</span><input inputMode="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="mt-2 min-h-14 w-full rounded-[14px] bg-[#f1f3ee] px-4 font-semibold" /></label>
                <button disabled={busy} className="flex min-h-16 w-full items-center justify-center gap-3 rounded-[14px] bg-[#f2d533] px-5 text-lg font-black text-[#103f33] disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" /> : <UserPlus />}Create record and continue</button>
              </form>
            </div>
          )}

          {error && <div role="alert" className="mt-5 rounded-[14px] bg-[#fff0e8] p-4 font-bold text-[#8b311f]">{error}</div>}
        </div>
      </section>
    </main>
  );
}
