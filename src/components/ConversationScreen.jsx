import { AlertCircle, Keyboard, Mic, RotateCcw, Send } from "lucide-react";
import BrandHeader from "./BrandHeader";

export default function ConversationScreen({ question, turns, turn, status, error, typedAnswer, onTypedChange, onRecord, onSubmitTyped, onRedo, onRetrySpeech, onSkipSpeech, onCancelTurn }) {
  const busy = status === "processing" || status === "transcribing";
  const listening = status === "waiting-for-speech" || status === "recording" || status === "finishing-recording";
  const recording = status === "recording";
  const speechActive = status === "loading-speech" || status === "speaking";
  return (
    <main className="kiosk-shell min-h-[100dvh]">
      <BrandHeader compact />
      <div className="relative z-10 mx-auto grid max-w-[1380px] gap-6 px-5 pb-8 md:grid-cols-[minmax(0,1.15fr)_minmax(340px,.85fr)] md:px-10">
        <section className="route-panel flex min-h-[66vh] flex-col justify-between rounded-[16px] bg-[#103f33] p-6 text-white md:p-10">
          <div>
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <span className="text-xs font-black uppercase leading-relaxed tracking-[.1em] text-[#b8d5cc] sm:text-sm sm:tracking-[.12em]">Question {turn + 1} · gathering the details your clinician needs</span>
              <span className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-sm font-black text-[#dcebe6]">{turn} answers saved</span>
            </div>
            <h1 className="mt-8 max-w-4xl overflow-wrap-anywhere text-balance text-[clamp(2.15rem,5vw,4.8rem)] font-black leading-[1.02] tracking-[-.04em] sm:mt-12">{question}</h1>
            <p className="mt-5 text-lg font-semibold text-[#b8d5cc]">Speak in the language that feels natural to you.</p>
          </div>
          <div className="mt-10 flex flex-col items-center">
            <div className={`relative grid h-32 w-32 place-items-center rounded-full ${recording ? "recording-ring bg-[#ef755f] text-white" : listening ? "bg-[#f2d533] text-[#103f33]" : "bg-[#d9dfd8] text-[#547068]"}`} aria-hidden="true"><Mic size={48} strokeWidth={2.5} /></div>
            <div className="mt-5 min-h-8 text-center text-xl font-black" aria-live="polite">{status === "waiting-for-speech" ? "I’m listening — start speaking" : recording ? "I can hear you — take your time, even if you need to pause and think" : status === "finishing-recording" ? "Got it — sending your answer" : status === "transcribing" ? "Turning your speech into text…" : status === "processing" ? "Preparing the next question…" : status === "loading-speech" ? "Preparing question audio…" : status === "speaking" ? "Reading the question aloud…" : "Getting ready to listen automatically…"}</div>
            {speechActive&&<button type="button" onClick={onSkipSpeech} className="mt-3 min-h-12 px-5 font-black text-[#b8d5cc] underline decoration-2 underline-offset-4">Skip audio and start answering</button>}
            {(listening||busy)&&<button type="button" onClick={onCancelTurn} className="mt-3 min-h-12 px-5 font-black text-[#b8d5cc] underline decoration-2 underline-offset-4">Cancel and type instead</button>}
            {!listening&&!busy&&!speechActive&&error&&<button type="button" onClick={onRecord} className="mt-3 min-h-12 rounded-[12px] bg-white/10 px-5 font-black text-white">Listen again</button>}
          </div>
        </section>
        <aside className="flex min-h-[66vh] min-w-0 flex-col rounded-[16px] bg-white p-5 shadow-[0_16px_40px_rgba(16,63,51,.1)] md:p-7">
          <div className="flex items-center justify-between gap-3"><h2 className="text-2xl font-black tracking-[-.03em] text-[#103f33]">What we heard</h2><span className="shrink-0 rounded-full bg-[#e7f1ed] px-3 py-1 text-sm font-black text-[#1d6e59]">{turn} saved</span></div>
          <div aria-live="polite" className="mt-5 max-h-[34vh] flex-1 space-y-4 overflow-auto">
            {turns.length ? turns.map((item) => <div key={`${item.turn_number}-${item.timestamp}`} className="border-b border-[#dfe6e2] pb-4"><div className="text-sm font-bold text-[#6f8580]">Question {item.turn_number}</div><div className="mt-1 overflow-wrap-anywhere text-lg font-semibold leading-relaxed text-[#36564e]">“{item.transcript}”</div></div>) : <p className="text-lg font-semibold leading-relaxed text-[#6f8580]">Your words will appear here after you speak.</p>}
          </div>
          {turns.length > 0 && <button type="button" onClick={onRedo} disabled={busy || listening} className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-[14px] bg-[#e7f1ed] px-4 font-black text-[#155944] disabled:opacity-40"><RotateCcw size={20} />Redo my last answer</button>}
          {error && <div className="my-4 rounded-[14px] bg-[#fff0e8] p-4 font-bold text-[#8b311f]" role="alert"><div className="flex gap-3"><AlertCircle className="shrink-0" /><span>{error}</span></div>{error.startsWith("Question audio unavailable:")&&<button type="button" onClick={onRetrySpeech} disabled={speechActive} className="mt-3 min-h-12 w-full rounded-[12px] bg-white px-4 font-black text-[#8b311f] disabled:opacity-50">Try question audio again</button>}</div>}
          <form onSubmit={onSubmitTyped} className="mt-5 border-t border-[#dfe6e2] pt-5">
            <label className="flex items-center gap-2 text-sm font-black uppercase tracking-[.1em] text-[#527269]"><Keyboard size={18} /> Or type your answer</label>
            <div className="mt-3 flex gap-2"><textarea rows="2" maxLength="1000" value={typedAnswer} onChange={(event) => onTypedChange(event.target.value)} placeholder="Type here…" className="min-h-16 min-w-0 flex-1 resize-none rounded-[14px] bg-[#f1f3ee] px-4 py-3 text-base font-semibold text-[#103f33] placeholder:text-[#7f908b]" /><button disabled={!typedAnswer.trim() || busy || listening} className="grid min-h-16 w-16 shrink-0 place-items-center rounded-[14px] bg-[#103f33] text-white disabled:opacity-40" aria-label="Send typed answer"><Send /></button></div>
          </form>
        </aside>
      </div>
    </main>
  );
}
