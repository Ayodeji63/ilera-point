import { useEffect, useRef, useState } from "react";
import { Check, Play, RotateCcw, SkipForward, Thermometer, Volume2 } from "lucide-react";
import BrandHeader from "./BrandHeader";
import { captureTemperatureVitals } from "../lib/vitals";
import { hasLocalizedVitalsGuidance, vitalsGuidance } from "../lib/vitalsGuidance";

export default function TemperatureScreen({ patient, language, pulseResult, speaking, onSpeak, onStopSpeech, onContinue }) {
  const copy = vitalsGuidance(language, "temperature");
  const localized = hasLocalizedVitalsGuidance(language);
  const controller = useRef(null);
  const spokenGuide = useRef("");
  const [started, setStarted] = useState(false);
  const [state, setState] = useState({ progress: 0, phase: "idle" });
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!localized || spokenGuide.current === language) return undefined;
    spokenGuide.current = language;
    const timer = setTimeout(() => onSpeak(copy.voice), 350);
    return () => clearTimeout(timer);
  }, [copy.voice, language, localized, onSpeak]);

  useEffect(() => () => controller.current?.abort(), []);

  const startCapture = async () => {
    onStopSpeech();
    controller.current?.abort();
    controller.current = new AbortController();
    setStarted(true);
    setResult(null);
    setError("");
    setState({ progress: 0, phase: "position_forehead" });
    try {
      const reading = await captureTemperatureVitals({ signal: controller.current.signal, onUpdate: setState });
      setResult(reading);
    } catch (captureError) {
      if (captureError.name !== "AbortError") setError(captureError.message);
    }
  };

  const progress = Math.round((state.progress || 0) * 100);
  const measuring = started && !result && !error;
  const status = state.phase === "measuring" ? "Reading your forehead temperature." : "Get into position and hold still.";

  return (
    <main className="kiosk-shell min-h-[100dvh]">
      <BrandHeader compact />
      <section className="relative z-10 mx-auto max-w-6xl px-5 pb-12 md:px-10">
        <div className="grid overflow-hidden rounded-[16px] bg-white shadow-[0_18px_45px_rgba(16,63,51,.12)] lg:grid-cols-[1.08fr_.92fr]">
          <div className="bg-[#103f33] p-7 text-white md:p-10">
            <Thermometer size={50} className="text-[#f2d533]" aria-hidden="true" />
            <h1 className="mt-6 max-w-2xl text-balance text-5xl font-black leading-[.96] tracking-[-.04em] md:text-6xl">{copy.title}</h1>
            <p className="mt-5 max-w-2xl text-xl font-semibold leading-relaxed text-[#b8d5cc]">{patient?.name}, {copy.intro}</p>
            <div className="mt-7 flex gap-4 rounded-[14px] bg-white/10 p-5">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#f2d533] text-[#103f33]"><Check size={24} /></span>
              <p className="text-lg font-black leading-relaxed">{copy.instruction}</p>
            </div>
            {!started && <button type="button" onClick={startCapture} className="mt-5 flex min-h-16 w-full items-center justify-center gap-3 rounded-[14px] bg-[#f2d533] px-6 text-lg font-black text-[#103f33] lg:hidden"><Play fill="currentColor" />{copy.start}</button>}
            {localized && <button type="button" onClick={() => onSpeak(copy.voice)} disabled={speaking} className="mt-5 flex min-h-12 items-center gap-3 font-black text-[#f2d533] underline decoration-2 underline-offset-4 disabled:opacity-50"><Volume2 size={22} />{copy.replay}</button>}

            <div className="mt-8 flex min-h-44 items-center gap-6 rounded-[14px] bg-[#082f27] p-6">
              <div className={`grid h-24 w-24 shrink-0 place-items-center rounded-full ${measuring ? "bg-[#f2d533] text-[#103f33]" : "bg-white/10 text-[#f2d533]"}`}><Thermometer size={46} /></div>
              <div><strong className="text-2xl">2-3 cm</strong><p className="mt-2 text-lg font-semibold leading-relaxed text-[#b8d5cc]">Face the sensor directly. Do not touch it with your forehead.</p></div>
            </div>
          </div>

          <div className="flex min-h-[620px] flex-col justify-between p-7 md:p-10" aria-live="polite">
            {!started && <div>
              <div className="flex items-center gap-3 font-black text-[#1d6e59]"><Check className="rounded-full bg-[#dff2e9] p-1" size={30} /><span>Pulse stage finished</span></div>
              <h2 className="mt-6 text-4xl font-black tracking-[-.04em] text-[#103f33]">Ready for the second check.</h2>
              <p className="mt-4 text-lg font-semibold leading-relaxed text-[#527269]">Nothing is being measured yet. Position your forehead, then press Start.</p>
              {pulseResult?.heart_rate_bpm != null && <p className="mt-7 bg-[#e7f1ed] p-5 text-lg font-black text-[#155944]">Pulse saved: {pulseResult.heart_rate_bpm} bpm</p>}
            </div>}

            {measuring && <div>
              <h2 className="text-4xl font-black tracking-[-.04em] text-[#103f33]">{status}</h2>
              <p className="mt-4 text-lg font-semibold text-[#527269]">Keep the same distance and angle until this check finishes.</p>
              <div className="mt-9 flex items-center justify-between font-black text-[#1d6e59]"><span>Temperature check</span><span>{progress}%</span></div>
              <div className="mt-3 h-4 overflow-hidden rounded-full bg-[#e3e7e3]" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}><div className="h-full bg-[#1d6e59] transition-[width] duration-300" style={{ width: `${progress}%` }} /></div>
            </div>}

            {result && <div>
              <div className="grid h-12 w-12 place-items-center rounded-full bg-[#dff2e9] text-[#155944]"><Check /></div>
              <h2 className="mt-5 text-4xl font-black tracking-[-.04em] text-[#103f33]">Temperature check complete.</h2>
              <dl className="mt-7 divide-y divide-[#d8e1dc] border-y border-[#d8e1dc]">
                {result.temperature_c != null && <div className="flex items-end justify-between gap-5 py-5"><dt className="font-black text-[#527269]">Calibrated temperature</dt><dd className="text-4xl font-black text-[#103f33]">{result.temperature_c}<span className="text-lg"> °C</span></dd></div>}
                <div className="flex items-end justify-between gap-5 py-5"><dt className="font-black text-[#527269]">Surface reading</dt><dd className="text-4xl font-black text-[#103f33]">{result.temperature_surface_c}<span className="text-lg"> °C</span></dd></div>
              </dl>
              {!result.temperature_calibrated && <div className="mt-5 bg-[#fff2c7] p-4 font-bold leading-relaxed text-[#6d5510]">This is a skin-surface reading, not a body-temperature estimate. Add reference-derived calibration coefficients before clinical use.</div>}
              {result.ambient_warning && <div className="mt-3 bg-[#fff0e8] p-4 font-bold text-[#8b311f]">{result.ambient_warning}</div>}
            </div>}

            {error && <div>
              <h2 className="text-4xl font-black tracking-[-.04em] text-[#103f33]">We could not verify the temperature.</h2>
              <div className="mt-5 bg-[#fff0e8] p-5 font-bold leading-relaxed text-[#8b311f]" role="alert">{error}</div>
              <p className="mt-5 text-lg font-semibold text-[#527269]">Move to 2-3 cm, face the sensor directly, and try again.</p>
            </div>}

            <div className="mt-8 grid gap-3">
              {!started && <button type="button" onClick={startCapture} className="hidden min-h-16 items-center justify-center gap-3 rounded-[14px] bg-[#f2d533] px-6 text-lg font-black text-[#103f33] lg:flex"><Play fill="currentColor" />{copy.start}</button>}
              {error && <button type="button" onClick={startCapture} className="flex min-h-16 items-center justify-center gap-3 rounded-[14px] bg-[#103f33] px-6 text-lg font-black text-white"><RotateCcw />{copy.retry}</button>}
              {result && <button type="button" onClick={() => onContinue(result)} className="flex min-h-16 items-center justify-center gap-3 rounded-[14px] bg-[#f2d533] px-6 text-lg font-black text-[#103f33]"><Check />{copy.continue}</button>}
              {!measuring && !result && <button type="button" onClick={() => onContinue(null)} className="flex min-h-14 items-center justify-center gap-3 rounded-[14px] bg-[#e7f1ed] px-6 font-black text-[#155944]"><SkipForward />{copy.skip}</button>}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
