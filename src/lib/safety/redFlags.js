export const RED_FLAGS = new Set([
  "difficulty breathing",
  "chest pain",
  "loss of consciousness",
  "severe bleeding",
  "seizure",
]);

export function checkRedFlags(record) {
  const symptoms = [...record.chief_complaints, ...record.associated_symptoms];
  const hits = symptoms.filter((symptom) => RED_FLAGS.has(symptom.toLowerCase().trim()));
  return { emergency: hits.length > 0, triggers: hits };
}
