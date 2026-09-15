import { useCallback, useEffect, useRef, useState } from "react";
import { speechProvider } from "../providers/SpeechProvider";
import { connectTurnTranscriber } from "./pcmStream";
import { SessionRecorder } from "./sessionRecorder";
import { transcribeTurn } from "./transcribeTurn";

export function useClinicianDictation(languageCode, onTranscript) {
  const recorder = useRef(null);
  const transcriber = useRef(null);
  const aborter = useRef(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const cancel = useCallback(() => {
    aborter.current?.abort();
    transcriber.current?.close();
    recorder.current?.destroy();
    aborter.current = null;
    transcriber.current = null;
    recorder.current = null;
    setStatus("idle");
  }, []);

  useEffect(() => cancel, [cancel]);

  const stop = useCallback(() => recorder.current?.stopTurn(), []);

  const start = useCallback(async () => {
    if (status !== "idle") return;
    setError("");
    setStatus("starting");
    const active = new SessionRecorder();
    recorder.current = active;
    let live = null;
    try {
      await active.start(false);
      const finished = active.recordTurnUntilSilence({
        silenceMs: 2800,
        waitForSpeechMs: 18000,
        maxDurationMs: 60000,
        onState: (next) => setStatus(next === "waiting" ? "waiting" : next === "speaking" ? "recording" : "finishing"),
        onAudio: (context, source) => {
          live = connectTurnTranscriber({
            context,
            source,
            languageCode,
            onUnavailable: () => { if (transcriber.current === live) transcriber.current = null; },
          });
          transcriber.current = live;
        },
      });
      const blob = await finished;
      if (!blob.size) throw new Error("No dictation was recorded. Move closer to the microphone and try again.");
      setStatus("transcribing");
      const controller = new AbortController();
      aborter.current = controller;
      const result = await transcribeTurn({
        transcriber: live,
        blob,
        language: languageCode,
        signal: controller.signal,
        upload: (...args) => speechProvider.transcribe(...args),
        withMetadata: true,
      });
      setStatus("parsing");
      await onTranscript(result);
      setStatus("idle");
    } catch (failure) {
      if (failure.name !== "AbortError") setError(failure.message || "Dictation failed. Please try again or type the prescription.");
      setStatus("idle");
    } finally {
      transcriber.current?.close();
      transcriber.current = null;
      aborter.current = null;
      await active.finish().catch(() => active.destroy());
      if (recorder.current === active) recorder.current = null;
    }
  }, [languageCode, onTranscript, status]);

  return { start, stop, cancel, status, error, clearError: () => setError("") };
}
