import { BellRing, CheckCircle2 } from "lucide-react";
import BrandHeader from "./BrandHeader";

export default function EmergencyScreen({ triggers, status, error }) {
  return (
    <main className="min-h-[100dvh] bg-[#8e2f24] text-white">
      <BrandHeader compact inverse />
      <section className="mx-auto flex min-h-[calc(100dvh-90px)] max-w-5xl flex-col items-center justify-center px-5 pb-12 text-center">
        <span className="grid h-28 w-28 place-items-center rounded-full bg-white text-[#8e2f24]"><BellRing size={54} strokeWidth={2.3} /></span>
        <h1 className="mt-8 text-balance text-[clamp(3rem,7vw,6rem)] font-black leading-[.95] tracking-[-.04em]">Please stay here. You need help now.</h1>
        <p className="mt-7 max-w-3xl text-balance text-xl font-semibold leading-relaxed text-[#ffe9e4] md:text-2xl">This alert is visible on the kiosk. Please call a health worker to come to you now.</p>
        <div className="mt-8 flex items-center gap-3 rounded-[16px] bg-white/10 px-5 py-4 text-lg font-black"><CheckCircle2 /> Urgent symptom reported: {triggers.join(", ")}</div>
        <p className="mt-8 text-base font-bold text-[#ffd7cf]">Do not leave this screen. If no health worker is available, call your local emergency service.</p>
        <p className="mt-4 text-sm font-black text-[#ffd7cf]" aria-live="polite">{status === "saving" ? "Saving this urgent consultation for clinician review…" : error ? `The record could not upload: ${error}` : "The consultation has been queued for clinician review."}</p>
      </section>
    </main>
  );
}
