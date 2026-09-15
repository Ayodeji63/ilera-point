// 42703 is Postgres' "undefined column". Reaching it at runtime means a
// migration in supabase/migrations was never applied, which is worth saying
// plainly rather than returning a bare gateway error or leaking the column name.
const COLUMN_MIGRATIONS = {
  interaction_override: "0011_clinical_prescribing_context.sql",
  patient_context_snapshot: "0011_clinical_prescribing_context.sql",
  patient_factors_confirmed: "0011_clinical_prescribing_context.sql",
  clinical_context_acknowledgement: "0011_clinical_prescribing_context.sql",
  frequency: "0009_prescription_dictation.sql",
  duration: "0009_prescription_dictation.sql",
  dictated: "0009_prescription_dictation.sql",
  raw_transcript: "0009_prescription_dictation.sql",
  parse_confidence: "0009_prescription_dictation.sql",
  parse_provider: "0010_ethics_privacy.sql",
  parse_model: "0010_ethics_privacy.sql",
  prompt_version: "0010_ethics_privacy.sql",
  patient_return_code_hash: "0012_patient_result_return.sql",
  patient_result_expires_at: "0012_patient_result_return.sql",
};

function missingColumnName(message) {
  return message.match(/Could not find the '([^']+)' column/i)?.[1]
    || message.match(/column (?:[a-z0-9_]+\.)?["']?([a-z0-9_]+)["']? does not exist/i)?.[1]
    || null;
}

export function missingColumnHint(error, migration) {
  const message = error?.message || "";
  const schemaCacheMiss = /Could not find the '[^']+' column of '[^']+' in the schema cache/i.test(message);
  if (error?.code === "42703" || error?.code === "PGRST204" || schemaCacheMiss || /column .* does not exist/i.test(message)) {
    const requiredMigration = COLUMN_MIGRATIONS[missingColumnName(message)] || migration;
    return `The database schema is behind this build. Run supabase/migrations/${requiredMigration} in the Supabase SQL editor, then retry.`;
  }
  return null;
}
