import { Router } from "express";
import multer from "multer";
import { getSupabaseAdmin, requireDoctor } from "../supabaseAdmin.js";

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
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(videoPath, req.file.buffer, { contentType: req.file.mimetype || "video/webm", upsert: false });
      if (uploadError) throw uploadError;
    }
    const { data, error } = await supabase.from("consultations").insert({ ...payload, video_url: videoPath, status: "pending" }).select("id,status,created_at").single();
    if (error) {
      if (videoPath) await supabase.storage.from(BUCKET).remove([videoPath]);
      throw error;
    }
    res.status(201).json({ consultation: data });
  } catch (error) { res.status(502).json({ error: error.message }); }
});

consultationsRouter.get("/", requireDoctor, async (req, res) => {
  try {
    const { data, error } = await getSupabaseAdmin().from("consultations").select("id,created_at,status,red_flag_status,structured_record,patients(id,name,phone)").in("status", ["pending", "flagged"]).order("created_at", { ascending: true });
    if (error) throw error;
    res.json({ consultations: data });
  } catch (error) { res.status(502).json({ error: error.message }); }
});

consultationsRouter.get("/:id", requireDoctor, async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("consultations").select("*,patients(id,name,phone),prescriptions(*)").eq("id", req.params.id).single();
    if (error) throw error;
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
    const { data, error } = await getSupabaseAdmin().from("consultations").update({ status: req.body.status }).eq("id", req.params.id).select("id,status").single();
    if (error) throw error;
    res.json({ consultation: data });
  } catch (error) { res.status(502).json({ error: error.message }); }
});
