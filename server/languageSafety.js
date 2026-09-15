const DEFAULT_LEVELS = Object.freeze({
  en: "supported",
  yo: "supervised",
  pcm: "supervised",
  ha: "supervised",
  ig: "supervised",
});

export function languageDeployment(languageCode) {
  const disabled = new Set(String(process.env.DISABLED_LANGUAGE_CODES || "").split(",").map((item) => item.trim()).filter(Boolean));
  if (disabled.has(languageCode)) return { allowed: false, level: "disabled", message: "Voice processing for this language is temporarily unavailable. Please type in English or ask a health worker for help." };
  const level = DEFAULT_LEVELS[languageCode];
  if (!level) return { allowed: false, level: "unsupported", message: "This language is not supported." };
  if (level === "supervised") return {
    allowed: true,
    level,
    requiresConfirmation: true,
    message: "Voice recognition for this language is still being evaluated. Check the displayed transcript and correct every important symptom, medicine, number and denial before sending.",
  };
  return { allowed: true, level, requiresConfirmation: true, message: "Check the displayed transcript before sending it to a clinician." };
}

