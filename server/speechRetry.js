// Sahara caps /tts/v1/stream at a few upgrades per minute and reports the
// refusal as a malformed WebSocket frame (see saharaStreamBudget.js). Opening
// another socket only spends the next slot, so those failures go straight to the
// generate endpoint instead of reconnecting.
export function isSaharaStreamLimited(message) {
  return /(invalid websocket frame|stream connection limit|ratelimit exceeded|too many requests|\b429\b)/i.test(message);
}

export function isTransientSaharaFailure(message) {
  // "queued for processing" is the generate endpoint saying it accepted the text
  // but has not rendered it yet. That is a wait, not a failure, and must not
  // reach the patient as a dead end.
  const reconnectable = /(socket hang up|ECONNRESET|EPIPE|ETIMEDOUT|connection closed|opening handshake|unexpected server response|speech session timed out|speech generation failed|queued for processing)/i.test(message);
  const nonRetryable = /(authentication|permission|quota|credit|unsupported|chunk.*size|invalid (voice|language|input|request))/i.test(message);
  return (reconnectable || isSaharaStreamLimited(message)) && !nonRetryable;
}

export function shouldRetrySahara(message, attempt, maxAttempts = 2) {
  return attempt < maxAttempts && isTransientSaharaFailure(message) && !isSaharaStreamLimited(message);
}
