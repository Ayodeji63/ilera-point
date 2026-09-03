export function resolveSessionVoiceGender(voiceGenders, fallbackGender) {
  const unique = [...new Set(voiceGenders)];
  return unique.length === 1 ? unique[0] : fallbackGender;
}
