import { Router } from "express";
import { getSupabaseAdmin, requireAdmin, requireAuthenticated } from "../supabaseAdmin.js";
import { applicationRecord, doctorAccessDecision, validateApplication } from "../doctorAccess.js";

export const doctorsRouter = Router();

// Tells the browser which screen to show: onboarding form, waiting-for-approval,
// or the consultation queue. Deliberately reachable before approval.
doctorsRouter.get("/me", requireAuthenticated, (req, res) => {
  const decision = doctorAccessDecision(req.doctor);
  res.json({
    email: req.authEmail,
    status: decision.code,
    approved: decision.allowed,
    name: req.doctor?.name || "",
    role: req.doctor?.role || "doctor",
  });
});

doctorsRouter.post("/apply", requireAuthenticated, async (req, res) => {
  const name = String(req.body.name || "").trim();
  const licenceNumber = String(req.body.licence_number || "").trim();
  const invalid = validateApplication({ name, licenceNumber });
  if (invalid) return res.status(400).json({ error: invalid });
  // An existing record is never overwritten: a rejected applicant must not be
  // able to re-apply their way back to pending.
  if (req.doctor) return res.status(409).json({ error: "This account has already applied.", code: doctorAccessDecision(req.doctor).code });
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("doctors")
      // Email comes from the verified token, never from the request body.
      .insert(applicationRecord({ email: req.authEmail, name, licenceNumber }))
      .select("id,name,email,status")
      .single();
    if (error) throw error;
    res.status(201).json({ application: data });
  } catch (error) { res.status(502).json({ error: error.message }); }
});

doctorsRouter.get("/pending", requireAdmin, async (_req, res) => {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("doctors")
      .select("id,name,email,licence_number,status,created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (error) throw error;
    res.json({ applications: data });
  } catch (error) { res.status(502).json({ error: error.message }); }
});

doctorsRouter.patch("/:id/status", requireAdmin, async (req, res) => {
  const { status } = req.body;
  if (!["approved", "rejected"].includes(status)) return res.status(400).json({ error: "Status must be approved or rejected." });
  if (req.params.id === req.doctor.id) return res.status(400).json({ error: "You cannot review your own account." });
  try {
    // `role` is intentionally absent: approval never grants administrator rights.
    // Restricting the target to role 'doctor' also keeps one administrator from
    // disabling another through the API — admin accounts are script-managed.
    const { data, error } = await getSupabaseAdmin()
      .from("doctors")
      .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: req.doctor.id })
      .eq("id", req.params.id)
      .eq("role", "doctor")
      .select("id,name,email,status")
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "No doctor application with that id." });
    res.json({ doctor: data });
  } catch (error) { res.status(502).json({ error: error.message }); }
});
