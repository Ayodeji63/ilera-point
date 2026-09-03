import { ArrowRight, FileAudio, Mic, Volume2 } from "lucide-react";
import BrandHeader from "./BrandHeader";

export default function WelcomeScreen({ language, onLanguageChange, onStart, onOpenYorubaTool }) {
  return (
    <main className="kiosk-shell flex min-h-[100dvh] flex-col">
      <BrandHeader language={language} onLanguageChange={onLanguageChange} />
      <section className="welcome-content relative z-10 mx-auto grid w-full max-w-[1380px] flex-1 items-center gap-8 px-5 pb-8 pt-3 md:grid-cols-[1.08fr_.92fr] md:px-10 md:pb-12">
        <div className="welcome-copy max-w-3xl">
          <h1 className="text-balance text-[clamp(3rem,7vw,6rem)] font-black leading-[.92] tracking-[-.04em] text-[#103f33]">Tell us how you feel.</h1>
          <p className="mt-6 max-w-2xl text-balance text-xl font-semibold leading-relaxed text-[#47665e] md:text-2xl">Speak naturally. You can mix English with Yorùbá, Pidgin, Hausa, or Igbo.</p>
          <div className="welcome-translations mt-8 flex flex-wrap gap-x-7 gap-y-3 text-base font-extrabold text-[#103f33] md:text-lg">
            <span>Yorùbá: Sọ bí ara rẹ ṣe rí.</span><span>Pidgin: Tell us how body dey do you.</span>
          </div>
          <div className="welcome-audio-note mt-8 flex items-center gap-3 text-[#527269]"><Volume2 size={22} aria-hidden="true" /><span className="font-bold">Questions will be read aloud</span></div>
          <button type="button" onClick={onOpenYorubaTool} className="mt-5 flex min-h-12 items-center gap-2 font-black text-[#155944] underline decoration-2 underline-offset-4"><FileAudio size={21}/>Convert a Yoruba script image to speech</button>
        </div>
        <button onClick={onStart} className="welcome-action group route-panel relative mx-auto flex aspect-square w-full max-w-[420px] flex-col items-center justify-center rounded-full bg-[#f2d533] p-10 text-[#103f33] transition-transform duration-300 hover:scale-[1.025] active:scale-[.98]" aria-label="Start voice check-in">
          <span className="grid h-24 w-24 place-items-center rounded-full bg-[#103f33] text-white md:h-28 md:w-28"><Mic size={50} strokeWidth={2.4} /></span>
          <span className="mt-7 text-3xl font-black tracking-[-.03em] md:text-4xl">Tap to begin</span>
          <span className="mt-2 flex items-center gap-2 text-base font-extrabold">About 2 minutes <ArrowRight size={20} /></span>
        </button>
      </section>
      <div className="relative z-10 bg-[#103f33] px-5 py-3 text-center text-sm font-bold text-white md:text-base">This check-in does not diagnose illness or recommend medicine.</div>
    </main>
  );
}
