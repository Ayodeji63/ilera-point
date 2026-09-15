import { getSupabaseAdmin } from "./supabaseAdmin.js";

const VIDEO_BUCKET = process.env.SUPABASE_VIDEO_BUCKET || "consultation-videos";
const ALERT_BUCKET = process.env.SUPABASE_ALERT_BUCKET || "escalation-alerts";

export async function enforceRetention({ dryRun = true, now = new Date() } = {}) {
  const supabase = getSupabaseAdmin();
  const cutoff = now.toISOString();
  const report = { dryRun, expiredVideos: 0, expiredPatientResultCapabilities: 0, expiredAlertAudio: 0, auditEvents: 0, aiEvents: 0, benchmarkSamples: 0, clinicalRecords: 0 };

  const { data: resultCapabilities, error: resultCapabilitiesError } = await supabase.from("consultations")
    .select("id")
    .not("patient_return_code_hash", "is", null)
    .lte("patient_result_expires_at", cutoff)
    .limit(500);
  if (resultCapabilitiesError) throw resultCapabilitiesError;
  report.expiredPatientResultCapabilities = resultCapabilities.length;
  if (!dryRun && resultCapabilities.length) {
    const { error } = await supabase.from("consultations").update({
      patient_token_hash: null,
      patient_token_expires_at: null,
      patient_token_consumed_at: null,
      patient_return_code_hash: null,
      patient_result_expires_at: null,
    }).in("id", resultCapabilities.map((row) => row.id));
    if (error) throw error;
  }

  const { data: videos, error: videoQueryError } = await supabase.from("consultations")
    .select("id,video_url")
    .not("video_url", "is", null)
    .lte("video_retention_until", cutoff)
    .limit(500);
  if (videoQueryError) throw videoQueryError;
  report.expiredVideos = videos.length;
  if (!dryRun && videos.length) {
    const paths = videos.map((row) => row.video_url).filter(Boolean);
    const { error: storageError } = await supabase.storage.from(VIDEO_BUCKET).remove(paths);
    if (storageError) throw storageError;
    const ids = videos.map((row) => row.id);
    const { error } = await supabase.from("consultations").update({ video_url: null, video_retention_until: null }).in("id", ids);
    if (error) throw error;
  }

  const { data: calls, error: callsError } = await supabase.from("voice_calls").select("id,audio_path").lte("retention_until", cutoff).limit(500);
  if (callsError) throw callsError;
  report.expiredAlertAudio = calls.length;
  if (!dryRun && calls.length) {
    const paths = calls.map((row) => row.audio_path).filter(Boolean);
    if (paths.length) {
      const { error: storageError } = await supabase.storage.from(ALERT_BUCKET).remove(paths);
      if (storageError) throw storageError;
    }
    const { error } = await supabase.from("voice_calls").delete().in("id", calls.map((row) => row.id));
    if (error) throw error;
  }

  for (const [table, key] of [["audit_events", "auditEvents"], ["ai_processing_events", "aiEvents"], ["benchmark_samples", "benchmarkSamples"]]) {
    const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).lte("retention_until", cutoff);
    if (error) throw error;
    report[key] = count || 0;
    if (!dryRun && count) {
      const { error: deleteError } = await supabase.from(table).delete().lte("retention_until", cutoff);
      if (deleteError) throw deleteError;
    }
  }

  const { count: clinicalCount, error: clinicalCountError } = await supabase.from("consultations").select("id", { count: "exact", head: true }).lte("retention_until", cutoff);
  if (clinicalCountError) throw clinicalCountError;
  report.clinicalRecords = clinicalCount || 0;
  if (!dryRun && report.clinicalRecords && process.env.RETENTION_DELETE_CLINICAL_RECORDS === "1") {
    const { data: expired, error } = await supabase.from("consultations").select("id").lte("retention_until", cutoff).limit(500);
    if (error) throw error;
    const ids = expired.map((row) => row.id);
    if (ids.length) {
      for (const table of ["prescriptions", "voice_calls", "consent_records", "benchmark_samples"]) {
        const { error: dependentError } = await supabase.from(table).delete().in("consultation_id", ids);
        if (dependentError) throw dependentError;
      }
      const { error: deleteError } = await supabase.from("consultations").delete().in("id", ids);
      if (deleteError) throw deleteError;
    }
  }
  return report;
}
