export function transcriptionPollDelay(attempt) {
  return attempt === 0 ? 350 : Math.min(1200, 450 + attempt * 150);
}
