import { Router } from "express";
import multer from "multer";
import { getSupabaseAdmin, requireDoctor } from "../supabaseAdmin.js";
import { collectionView, createPatientToken, patientTokenMatches } from "../consultationAccess.js";
import { missingColumnHint } from "../schemaHints.js";
import { canSeeEveryTier, canWorkCase, routeConsultation, tierForRole } from "../careRouting.js";
import { escalateInBackground } from "../redFlagEscalation.js";

export const consultationsRouter = Router();
const videoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const BUCKET = process.env.SUPABASE_VIDEO_BUCKET || "consultation-videos";

consultationsRouter.post("/", videoUpload.single("video"), async (req, res) => {
  try {
    const payload = JSON.parse(req.body.consultation || "{}");
    if (!payload.patient_id || !Array.isArray(payload.turns) || !payload.structured_record) return res.status(400).json({ error: "A complete consultation record is required." });
    const supabase = getSupabaseAdmin();
    let videoPath = null;
    if (payload.video_consent && req.file) {
      // This recording is for human clinician review only. No AI model receives or analyses it.
      videoPath = `${payload.patient_id}/${crypto.randomUUID()}.webm`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(videoPath, req.file.buffer, { contentType: "video/webm", upsert: false });
      if (uploadError) throw uploadError;
    }
    // The kiosk keeps this token so the waiting patient can read their own
    // result without an account. It is returned once and never listed.
    const patientToken = createPatientToken();
    // Routing is decided here, from the record, not by the browser: a modified
    // kiosk must not be able to route its own case away from a doctor.
    const routed = routeConsultation({ record: payload.structured_record, redFlagStatus: payload.red_flag_status });
    const { data, error } = await supabase.from("consultations").insert({
      ...payload,
      video_url: videoPath,
      status: "pending",
      patient_token: patientToken,
      assigned_tier: routed.tier,
      routing_reasons: routed.reasons,
    }).select("id,status,created_at").single();
    if (error) {
      if (videoPath) await supabase.storage.from(BUCKET).remove([videoPath]);
      throw error;
    }
    // A red flag rings the on-call clinician with a spoken alert, in the same
    // Sahara voice the patient just heard. Started after the record is safely
    // stored, and never allowed to fail the save.
    if (payload.red_flag_status?.emergency) {
      escalateInBackground({ consultationId: data.id, triggers: payload.red_flag_status.triggers });
    }
    res.status(201).json({ consultation: { ...data, patient_token: patientToken } });
  } catch (error) { res.status(502).json({ error: error.message }); }
});

// The patient waits at the kiosk while the clinician reviews. This is the only
// unauthenticated read of a consultation, and it returns nothing but that
// patient's own outcome — never the transcript, the record, or the video.
consultationsRouter.get("/:id/result", async (req, res) => {
  const token = String(req.query.token || "");
  if (!token) return res.status(404).json({ error: "No consultation was found." });
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("consultations")
      .select("id,status,patient_token,prescriptions(drug,dosage,instructions,created_at)")
      .eq("id", req.params.id)
      .maybeSingle();
    if (error) throw error;
    // A wrong token is answered exactly like a missing consultation, so the
    // endpoint never confirms that an id exists.
    if (!data || !patientTokenMatches(data.patient_token, token)) return res.status(404).json({ error: "No consultation was found." });
    res.json({ result: collectionView(data, data.prescriptions?.[0] || null) });
  } catch (error) {
    res.status(502).json({ error: missingColumnHint(error, "0003_patient_collection.sql") || "Your result could not be checked." });
  }
});

consultationsRouter.get("/", requireDoctor, async (req, res) => {
  try {
    let query = getSupabaseAdmin()
      .from("consultations")
      .select("id,created_at,status,red_flag_status,structured_record,assigned_tier,routing_reasons,patients(id,name,phone)")
      .in("status", ["pending", "flagged"]);
    // A community health worker sees only cases routed to their tier. This is
    // the delegation itself: not list ordering, but which cases exist for them.
    if (!canSeeEveryTier(req.doctor.role)) query = query.eq("assigned_tier", tierForRole(req.doctor.role));
    const { data, error } = await query.order("created_at", { ascending: true });
    if (error) throw error;
    res.json({ consultations: data, tier: tierForRole(req.doctor.role), role: req.doctor.role });
  } catch (error) { res.status(502).json({ error: missingColumnHint(error, "0004_task_shifting.sql") || error.message }); }
});

// Escalation is one-way and always available: a clinician who is unsure hands
// the case up. Nothing ever routes a case back down to a narrower tier.
consultationsRouter.patch("/:id/escalate", requireDoctor, async (req, res) => {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("consultations")
      .update({ assigned_tier: "doctor", escalated_by: req.doctor.id, escalated_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .select("id,assigned_tier")
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "No consultation was found." });
    res.json({ consultation: data });
  } catch (error) { res.status(502).json({ error: missingColumnHint(error, "0004_task_shifting.sql") || error.message }); }
});

consultationsRouter.get("/:id", requireDoctor, async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("consultations").select("*,patients(id,name,phone),prescriptions(*)").eq("id", req.params.id).single();
    if (error) throw error;
    // Answered as not-found rather than forbidden: a narrower tier learns
    // nothing about cases outside it, not even that they exist.
    if (!canWorkCase(req.doctor.role, data.assigned_tier)) return res.status(404).json({ error: "No consultation was found." });
    let signedVideoUrl = null;
    if (data.video_url) {
      const { data: signed, error: signedError } = await supabase.storage.from(BUCKET).createSignedUrl(data.video_url, 60 * 30);
      if (signedError) throw signedError;
      signedVideoUrl = signed.signedUrl;
    }
    res.json({ consultation: { ...data, signedVideoUrl } });
  } catch (error) { res.status(502).json({ error: error.message }); }
});

consultationsRouter.patch("/:id/status", requireDoctor, async (req, res) => {
  if (!["reviewed", "flagged"].includes(req.body.status)) return res.status(400).json({ error: "Status must be reviewed or flagged." });
  try {
    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase.from("consultations").select("assigned_tier").eq("id", req.params.id).maybeSingle();
    if (!existing || !canWorkCase(req.doctor.role, existing.assigned_tier)) return res.status(404).json({ error: "No consultation was found." });
    const { data, error } = await supabase.from("consultations").update({ status: req.body.status }).eq("id", req.params.id).select("id,status").single();
    if (error) throw error;
    res.json({ consultation: data });
  } catch (error) { res.status(502).json({ error: error.message }); }
});
