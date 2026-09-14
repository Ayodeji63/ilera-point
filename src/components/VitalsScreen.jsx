import { useEffect, useState } from "react";
import { Check, HeartPulse, RotateCcw, SkipForward, Thermometer } from "lucide-react";
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

function TemperatureHold({ measuring }) {
  return (
    <div className="flex h-36 items-center gap-5 rounded-[14px] bg-[#082f27] px-6 text-white" role="img" aria-label="Temperature measurement in progress">
      <div className={`grid h-16 w-16 shrink-0 place-items-center rounded-full ${measuring ? "bg-[#f2d533] text-[#103f33]" : "bg-white/10 text-[#f2d533]"}`}>
        <Thermometer size={34} aria-hidden="true" />
      </div>
      <p className="text-lg font-black leading-snug text-[#b8d5cc]">{measuring ? "Reading several samples. Keep your forehead in the same position." : "Move your forehead close to the sensor. Measurement starts automatically."}</p>
    </div>
  );
}

function MeasurementRoute({ state }) {
  const stage = state.stage || "pulse";
  const pulseComplete = ["temperature", "complete"].includes(stage);
  const temperatureComplete = stage === "complete";
  const steps = [
    { key: "pulse", label: "Pulse first", detail: pulseComplete ? "Pulse stage finished" : "Keep one finger over the red light", icon: HeartPulse, complete: pulseComplete },
    { key: "temperature", label: "Temperature second", detail: temperatureComplete ? "Temperature stage finished" : "Then move your forehead 2–5 cm from the sensor", icon: Thermometer, complete: temperatureComplete },
  ];
  return (
    <ol className="mt-7 overflow-hidden rounded-[14px] bg-white/10">
      {steps.map(({ key, label, detail, icon: Icon, complete }, index) => {
        const active = stage === key;
        return (
          <li key={key} className={`flex min-w-0 items-center gap-4 px-5 py-4 ${index ? "border-t border-white/10" : ""} ${active ? "bg-white/[.08]" : ""}`}>
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${active ? "bg-[#f2d533] text-[#103f33]" : complete ? "bg-[#dff2e9] text-[#155944]" : "bg-white/10 text-[#b8d5cc]"}`}>
              {complete ? <Check size={22} aria-hidden="true" /> : <Icon size={22} aria-hidden="true" />}
            </span>
            <span className="min-w-0">
              <strong className="block text-lg text-white">{label}</strong>
              <span className="block font-semibold leading-relaxed text-[#b8d5cc]">{detail}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function captureHeading(state) {
  if (state.stage === "temperature") {
    return state.phase === "measuring" ? "Hold your forehead still." : "Now move to temperature.";
  }
  if (state.phase === "retrying") return "Signal unclear — checking once more.";
  if (state.phase === "measuring") return "Pulse found — keep still.";
  return "Place one finger on the red light.";
}

function CaptureStatus({ result, error, state, progress, compact = false }) {
  const headingClass = `${compact ? "text-3xl" : "text-4xl"} font-black tracking-[-.04em] text-[#103f33]`;
  const warnings = state.warnings || [];
  if (result) {
    const partial = warnings.length > 0;
    return <>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#dff2e9] text-[#155944]"><Check /></div>
      <h2 className={`mt-5 ${headingClass}`}>{partial ? "One reading captured" : "Vitals captured"}</h2>
      <p className="mt-3 text-lg font-semibold text-[#527269]">Available measurements will be included for the clinician to review.</p>
      <dl className={`${compact ? "mt-5" : "mt-8"} divide-y divide-[#d8e1dc] border-y border-[#d8e1dc]`}>
        {result.heart_rate_bpm != null && <div className="flex items-end justify-between gap-4 py-4"><dt className="font-black text-[#527269]">Heart rate</dt><dd className="text-3xl font-black tracking-[-.03em] text-[#103f33]">{result.heart_rate_bpm} <span className="text-lg">bpm</span></dd></div>}
        {result.temperature_c != null && <div className="flex items-end justify-between gap-4 py-4"><dt className="font-black text-[#527269]">Temperature</dt><dd className="text-3xl font-black tracking-[-.03em] text-[#103f33]">{result.temperature_c} <span className="text-lg">°C</span></dd></div>}
      </dl>
      {result.heart_rate_bpm != null && <p className="mt-4 font-bold capitalize text-[#527269]">Pulse signal quality: {result.sample_quality}</p>}
      {partial && <div role="status" className="mt-5 rounded-[14px] bg-[#fff2c7] p-4 font-bold leading-relaxed text-[#6d5510]">{warnings.join(" ")}</div>}
    </>;
  }
  if (error) return <>
    <h2 className={headingClass}>We could not complete the checks.</h2>
    <div role="alert" className="mt-5 rounded-[14px] bg-[#fff0e8] p-5 font-bold leading-relaxed text-[#8b311f]">{error}</div>
    <p className="mt-5 text-lg font-semibold text-[#527269]">You can retry both sensors or continue without vitals.</p>
  </>;

  const stageProgress = Math.round((state.stage_progress || 0) * 100);
  const isTemperature = state.stage === "temperature";
  return <>
    <h2 className={headingClass}>{captureHeading(state)}</h2>
    <p className="mt-4 text-lg font-semibold leading-relaxed text-[#527269]">
      {isTemperature
        ? state.phase === "measuring" ? "We take several readings and keep only a stable result." : "Remove your finger, then hold your forehead 2–5 cm from the temperature sensor."
        : state.phase === "retrying" ? "Keep your hand resting. The second pulse attempt begins automatically." : "The first 1.5 seconds settle contact; several consistent beats are required."}
    </p>
    <div className={`${compact ? "mt-5" : "mt-8"} flex items-center justify-between gap-4 font-black text-[#1d6e59]`}>
      <span>{isTemperature ? "Temperature · second check" : `Pulse · first check${state.pulse_attempt > 1 ? ` · attempt ${state.pulse_attempt} of ${state.pulse_attempts}` : ""}`}</span>
      <span>{stageProgress}%</span>
    </div>
    <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#e3e7e3]" aria-label={`Overall capture ${progress}% complete`} role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}><div className="h-full bg-[#1d6e59] transition-[width] duration-300" style={{ width: `${progress}%` }} /></div>
  </>;
}

function CaptureActions({ result, error, warnings, onContinue, onRetry }) {
  return <div className="mt-7 grid gap-3">
    {result && <button onClick={() => onContinue(result)} className="flex min-h-16 items-center justify-center gap-3 rounded-[14px] bg-[#f2d533] px-6 text-lg font-black text-[#103f33]"><Check />Continue to health questions</button>}
    {result && warnings?.length > 0 && <button onClick={onRetry} className="flex min-h-14 items-center justify-center gap-3 rounded-[14px] bg-[#e7f1ed] px-6 font-black text-[#155944]"><RotateCcw />Retry both checks</button>}
    {error && <button onClick={onRetry} className="flex min-h-16 items-center justify-center gap-3 rounded-[14px] bg-[#103f33] px-6 text-lg font-black text-white"><RotateCcw />Try both sensors again</button>}
    {error && <button onClick={() => onContinue(null)} className="flex min-h-14 items-center justify-center gap-3 rounded-[14px] bg-[#e7f1ed] px-6 font-black text-[#155944]"><SkipForward />Continue without vitals</button>}
    {!result && !error && <button onClick={() => onContinue(null)} className="min-h-14 rounded-[14px] bg-[#e7f1ed] px-6 font-black text-[#155944]">Skip these checks</button>}
  </div>;
}

export default function VitalsScreen({ patient, onContinue }) {
  const initialState = { status: "starting", stage: "pulse", phase: "waiting_for_finger", progress: 0, stage_progress: 0, waveform: [], finger_present: false };
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState(initialState);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setState(initialState);
    setResult(null);
    setError("");
    captureVitals({ signal: controller.signal, onUpdate: (update) => setState(update) })
      .then((reading) => setResult(reading))
      .catch((captureError) => {
        if (captureError.name !== "AbortError") {
          setError(captureError.message);
          setState((current) => ({ ...current, status: "error" }));
        }
      });
    return () => controller.abort();
  }, [attempt]);

  const progress = Math.round((state.progress || 0) * 100);
  const capturing = !result && !error;
  const isTemperature = state.stage === "temperature";
  const retry = () => setAttempt((value) => value + 1);

  return (
    <main className="kiosk-shell min-h-[100dvh]">
      <BrandHeader compact />
      <section className="relative z-10 mx-auto max-w-6xl px-5 pb-12 md:px-10">
        <div className="grid overflow-hidden rounded-[16px] bg-white shadow-[0_16px_40px_rgba(16,63,51,.10)] lg:grid-cols-[1.05fr_.95fr]">
          <div className="bg-[#103f33] p-7 text-white md:p-10">
            <div className="flex items-start justify-between gap-5">
              <div className="min-w-0">
                <h1 className="max-w-xl text-5xl font-black leading-[.96] tracking-[-.04em] md:text-6xl">Two quick checks, one at a time.</h1>
                <p className="mt-5 max-w-2xl text-lg font-semibold leading-relaxed text-[#b8d5cc]">
                  {isTemperature
                    ? `${patient?.name}, remove your finger and hold your forehead 2–5 cm from the temperature sensor.`
                    : `${patient?.name}, start with one relaxed finger covering the pulse sensor's red light.`}
                </p>
              </div>
              {isTemperature ? <Thermometer className="shrink-0 text-[#f2d533]" size={48} /> : <HeartPulse className="shrink-0 text-[#f2d533]" size={48} />}
            </div>

            <div className="mt-6 rounded-[14px] bg-white p-5 text-[#103f33] lg:hidden" aria-live="polite">
              <CaptureStatus result={result} error={error} state={state} progress={progress} compact />
              <CaptureActions result={result} error={error} warnings={state.warnings} onContinue={onContinue} onRetry={retry} />
            </div>

            <MeasurementRoute state={state} />
            <div className="mt-6">{isTemperature ? <TemperatureHold measuring={state.phase === "measuring"} /> : <Waveform values={state.waveform || []} active={capturing && state.finger_present} />}</div>
          </div>

          <div className="hidden flex-col justify-between p-10 lg:flex lg:min-h-[560px]">
            <div aria-live="polite"><CaptureStatus result={result} error={error} state={state} progress={progress} /></div>
            <CaptureActions result={result} error={error} warnings={state.warnings} onContinue={onContinue} onRetry={retry} />
          </div>
        </div>
      </section>
    </main>
  );
}
