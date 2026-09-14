import { useEffect, useState } from "react";
import { Activity, Check, HeartPulse, RotateCcw, SkipForward, Thermometer } from "lucide-react";
import BrandHeader from "./BrandHeader";
import { captureVitals } from "../lib/vitals";

function Waveform({ values, active }) {
  const samples = values.length > 1 ? values : [0.5, 0.5];
  const points = samples.map((value, index) => `${(index / (samples.length - 1)) * 100},${52 - value * 44}`).join(" ");
  return (
    <div className="relative h-36 overflow-hidden rounded-[14px] bg-[#082f27]" aria-label={active ? "Live pulse signal" : "Pulse signal waiting"} role="img">
      <svg viewBox="0 0 100 56" preserveAspectRatio="none" className="h-full w-full" aria-hidden="true">
        <path d="M0 28H100" stroke="rgba(184,213,204,.18)" strokeWidth=".5" />
        <polyline points={points} fill="none" stroke="#f2d533" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {!values.length && <div className="absolute inset-0 grid place-items-center px-4 text-center font-bold text-[#b8d5cc]">Waiting for your finger…</div>}
    </div>
  );
}

function CaptureStatus({ result, error, state, progress, compact = false }) {
  const headingClass = `${compact ? "text-3xl" : "text-4xl"} font-black tracking-[-.04em] text-[#103f33]`;
  if (result) return <>
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#dff2e9] text-[#155944]"><Check /></div>
    <h2 className={`mt-5 ${headingClass}`}>Vitals captured</h2>
    <p className="mt-3 text-lg font-semibold text-[#527269]">These measurements will be included for the clinician to review.</p>
    <dl className={`${compact ? "mt-5" : "mt-8"} divide-y divide-[#d8e1dc] border-y border-[#d8e1dc]`}>
      <div className="flex items-end justify-between gap-4 py-4"><dt className="font-black text-[#527269]">Temperature</dt><dd className="text-3xl font-black tracking-[-.03em] text-[#103f33]">{result.temperature_c} <span className="text-lg">°C</span></dd></div>
      <div className="flex items-end justify-between gap-4 py-4"><dt className="font-black text-[#527269]">Heart rate</dt><dd className="text-3xl font-black tracking-[-.03em] text-[#103f33]">{result.heart_rate_bpm} <span className="text-lg">bpm</span></dd></div>
    </dl>
    <p className="mt-4 font-bold capitalize text-[#527269]">Signal quality: {result.sample_quality}</p>
  </>;
  if (error) return <>
    <h2 className={headingClass}>We could not get a stable reading.</h2>
    <div role="alert" className="mt-5 rounded-[14px] bg-[#fff0e8] p-5 font-bold leading-relaxed text-[#8b311f]">{error}</div>
    <p className="mt-5 text-lg font-semibold text-[#527269]">Adjust your finger and forehead, then retry. You can also continue without vitals.</p>
  </>;
  return <>
    <h2 className={headingClass}>{state.finger_present ? "Signal found — keep still." : "Place your finger now."}</h2>
    <p className="mt-4 text-lg font-semibold leading-relaxed text-[#527269]">The pulse needs several steady beats. Capture finishes automatically.</p>
    <div className={`${compact ? "mt-5" : "mt-8"} h-3 overflow-hidden rounded-full bg-[#e3e7e3]`} aria-label={`Capture ${progress}% complete`} role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}><div className="h-full bg-[#1d6e59] transition-[width] duration-300" style={{ width: `${progress}%` }} /></div>
    <p className="mt-3 font-black text-[#1d6e59]">{state.finger_present ? `${progress}% · reading your pulse` : "Waiting for a clear pulse signal"}</p>
  </>;
}

function CaptureActions({ result, error, onContinue, onRetry }) {
  return <div className="mt-7 grid gap-3">
    {result && <button onClick={() => onContinue(result)} className="flex min-h-16 items-center justify-center gap-3 rounded-[14px] bg-[#f2d533] px-6 text-lg font-black text-[#103f33]"><Check />Continue to health questions</button>}
    {error && <button onClick={onRetry} className="flex min-h-16 items-center justify-center gap-3 rounded-[14px] bg-[#103f33] px-6 text-lg font-black text-white"><RotateCcw />Try the sensors again</button>}
    {error && <button onClick={() => onContinue(null)} className="flex min-h-14 items-center justify-center gap-3 rounded-[14px] bg-[#e7f1ed] px-6 font-black text-[#155944]"><SkipForward />Continue without vitals</button>}
    {!result && !error && <button onClick={() => onContinue(null)} className="min-h-14 rounded-[14px] bg-[#e7f1ed] px-6 font-black text-[#155944]">Skip this check</button>}
  </div>;
}

export default function VitalsScreen({ patient, onContinue }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ status: "starting", progress: 0, waveform: [], finger_present: false });
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "starting", progress: 0, waveform: [], finger_present: false });
    setResult(null);
    setError("");
    captureVitals({
      signal: controller.signal,
      onUpdate: (update) => setState(update),
    }).then((reading) => {
      setResult(reading);
      setState((current) => ({ ...current, status: "complete", progress: 1 }));
    }).catch((captureError) => {
      if (captureError.name !== "AbortError") {
        setError(captureError.message);
        setState((current) => ({ ...current, status: "error" }));
      }
    });
    return () => controller.abort();
  }, [attempt]);

  const progress = Math.round((state.progress || 0) * 100);
  const capturing = !result && !error;

  return (
    <main className="kiosk-shell min-h-[100dvh]">
      <BrandHeader compact />
      <section className="relative z-10 mx-auto max-w-6xl px-5 pb-12 md:px-10">
        <div className="grid overflow-hidden rounded-[16px] bg-white shadow-[0_16px_40px_rgba(16,63,51,.10)] lg:grid-cols-[1.05fr_.95fr]">
          <div className="bg-[#103f33] p-7 text-white md:p-10">
            <div className="flex items-start justify-between gap-5">
              <div>
                <h1 className="max-w-xl text-5xl font-black leading-[.96] tracking-[-.04em] md:text-6xl">Hold still while we check your body.</h1>
                <p className="mt-5 max-w-2xl text-lg font-semibold leading-relaxed text-[#b8d5cc]">{patient?.name}, keep your finger flat on the pulse sensor and your forehead 2–5 cm from the temperature sensor.</p>
              </div>
              <Activity className="shrink-0 text-[#f2d533]" size={48} />
            </div>

            <div className="mt-6 rounded-[14px] bg-white p-5 text-[#103f33] lg:hidden" aria-live="polite">
              <CaptureStatus result={result} error={error} state={state} progress={progress} compact />
              <CaptureActions result={result} error={error} onContinue={onContinue} onRetry={() => setAttempt((value) => value + 1)} />
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:mt-8">
              <div className="rounded-[14px] bg-white/10 p-5"><HeartPulse className="text-[#f2d533]" /><strong className="mt-3 block text-xl">Finger stays flat</strong><span className="mt-1 block font-semibold text-[#b8d5cc]">Cover the red light completely. Do not press hard.</span></div>
              <div className="rounded-[14px] bg-white/10 p-5"><Thermometer className="text-[#f2d533]" /><strong className="mt-3 block text-xl">Forehead stays close</strong><span className="mt-1 block font-semibold text-[#b8d5cc]">Keep 2–5 cm away and avoid turning your head.</span></div>
            </div>

            <div className="mt-6"><Waveform values={state.waveform || []} active={capturing && state.finger_present} /></div>
          </div>

          <div className="hidden flex-col justify-between p-10 lg:flex lg:min-h-[560px]">
            <div aria-live="polite">
              <CaptureStatus result={result} error={error} state={state} progress={progress} />
            </div>
            <CaptureActions result={result} error={error} onContinue={onContinue} onRetry={() => setAttempt((value) => value + 1)} />
          </div>
        </div>
      </section>
    </main>
  );
}
