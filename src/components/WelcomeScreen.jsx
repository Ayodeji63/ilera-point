import { ArrowRight, FileAudio, Mic, ReceiptText, ShieldCheck, Volume2 } from "lucide-react";
import BrandHeader from "./BrandHeader";

export default function WelcomeScreen({ language, onLanguageChange, onStart, onCheckResult, onOpenYorubaTool }) {
  return (
    <main className="kiosk-shell flex min-h-[100dvh] flex-col">
      <BrandHeader language={language} onLanguageChange={onLanguageChange} />
      <section className="welcome-content relative z-10 mx-auto grid w-full max-w-[1380px] flex-1 items-center gap-8 px-5 pb-8 pt-2 md:grid-cols-[.92fr_1.08fr] md:px-10 md:pb-12">
        <div className="welcome-copy max-w-3xl">
          <h1 className="text-balance text-[clamp(3rem,7vw,6rem)] font-black leading-[.92] tracking-[-.04em] text-[#103f33]">Tell us how you feel.</h1>
          <p className="mt-6 max-w-2xl text-balance text-xl font-semibold leading-relaxed text-[#47665e] md:text-2xl">Speak naturally. You can mix English with Yorùbá, Pidgin, Hausa, or Igbo.</p>
          <div className="welcome-translations mt-8 flex flex-wrap gap-x-7 gap-y-3 text-base font-extrabold text-[#103f33] md:text-lg">
            <span>Yorùbá: Sọ bí ara rẹ ṣe rí.</span><span>Pidgin: Tell us how body dey do you.</span>
          </div>
          <div className="welcome-audio-note mt-8 flex items-center gap-3 text-[#527269]"><Volume2 size={22} aria-hidden="true" /><span className="font-bold">Questions will be read aloud. You can change language before recording starts.</span></div>
          <button type="button" onClick={onOpenYorubaTool} className="mt-5 flex min-h-12 items-center gap-2 font-black text-[#155944] underline decoration-2 underline-offset-4"><FileAudio size={21}/>Convert a Yoruba script image to speech</button>
        </div>

        <div className="route-panel overflow-hidden rounded-[16px] bg-[#103f33] text-white">
          <figure className="relative">
            <img src="/images/ilerapoint-clinician-welcome.webp" alt="A doctor in a primary-care clinic" className="aspect-[4/3] w-full object-cover object-center md:aspect-[16/9]" fetchPriority="high" />
            <figcaption className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-[#103f33]/90 px-5 py-4 font-bold text-[#dcebe6]">
              <ShieldCheck className="shrink-0 text-[#f2d533]" aria-hidden="true" />
              <span>A clinician reviews every completed check-in. <span className="font-semibold text-[#b8d5cc]">Illustrative image.</span></span>
            </figcaption>
          </figure>
          <div className="grid gap-3 p-5 sm:grid-cols-[1.25fr_.75fr] md:p-6">
            <button type="button" onClick={onStart} className="group flex min-h-16 items-center justify-between gap-4 rounded-[14px] bg-[#f2d533] px-5 text-left text-[#103f33] transition-transform duration-200 active:scale-[.985]">
              <span className="flex items-center gap-3"><Mic size={28} strokeWidth={2.4}/><span><strong className="block text-xl font-black">Start a new check-in</strong><span className="font-bold">About 2 minutes</span></span></span>
              <ArrowRight className="shrink-0 transition-transform duration-200 group-hover:translate-x-1"/>
            </button>
            <button type="button" onClick={onCheckResult} className="flex min-h-16 items-center justify-center gap-3 rounded-[14px] bg-white/10 px-4 font-black text-white hover:bg-white/20 active:bg-white/25"><ReceiptText/>Check an earlier visit</button>
          </div>
        </div>
      </section>
      <div className="relative z-10 bg-[#103f33] px-5 py-3 text-center text-sm font-bold text-white md:text-base">This check-in does not diagnose illness or recommend medicine.</div>
    </main>
  );
}
