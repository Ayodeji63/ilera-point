// Live transcription is already most of the way done when the patient stops
// talking, so it is tried first. The recording captured alongside it is the
// fallback whenever the socket did not work out — a patient should never have
// to repeat an answer because a connection dropped.
export async function transcribeTurn({ transcriber, blob, language, signal, upload, onFallback = () => {} }) {
  if (transcriber) {
    try {
      const transcript = await transcriber.commit();
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
