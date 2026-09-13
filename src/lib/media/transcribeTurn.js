// Live transcription is already most of the way done when the patient stops
// talking, so it is tried first. The recording captured alongside it is the
// fallback whenever the socket did not work out — a patient should never have
// to repeat an answer because a connection dropped.
export async function transcribeTurn({ transcriber, blob, language, signal, upload, onFallback = () => {} }) {
  if (transcriber) {
    try {
      let removeAbortListener = () => {};
      const aborted = new Promise((_, reject) => {
        const abort = () => {
          transcriber.close?.();
          reject(new DOMException("The transcription was cancelled.", "AbortError"));
        };
        if (signal?.aborted) abort();
        else if (signal) {
          signal.addEventListener("abort", abort, { once: true });
          removeAbortListener = () => signal.removeEventListener("abort", abort);
        }
      });
      const transcript = await Promise.race([transcriber.commit(), aborted]).finally(removeAbortListener);
      if (transcript.trim()) return transcript;
      onFallback("Live transcription returned no words.");
    } catch (error) {
      if (signal?.aborted) throw error;
      onFallback(error.message);
    }
  }
  const result = await upload(blob, language, "standard", signal);
  return result.transcript;
}
