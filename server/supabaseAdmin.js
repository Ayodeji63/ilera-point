import { createClient } from "@supabase/supabase-js";
import { adminAccessDecision, describeDirectoryFailure, doctorAccessDecision } from "./doctorAccess.js";

let client;

export function getSupabaseAdmin() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not configured.");
  }
  if (!client) client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

// Resolves the signed-in account to its doctor record. The email always comes
// from the verified token, never from anything the caller sent.
export async function resolveDoctor(req) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { status: 401, error: "Doctor sign-in is required." };
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return { status: 401, error: "Your sign-in has expired. Please sign in again." };
  const { data: doctor, error: doctorError } = await supabase
    .from("doctors")
    .select("id,name,email,status,role")
    .eq("email", data.user.email)
    .maybeSingle();
  if (doctorError) return { status: 502, error: describeDirectoryFailure(doctorError) };
  return { email: data.user.email, doctor: doctor || null };
}

function guard(decide) {
  return async (req, res, next) => {
    try {
      const resolved = await resolveDoctor(req);
      if (resolved.error) return res.status(resolved.status).json({ error: resolved.error });
      const decision = decide(resolved.doctor);
      if (!decision.allowed) return res.status(decision.status).json({ error: decision.error, code: decision.code });
      req.doctor = resolved.doctor;
      next();
    } catch (error) { return res.status(503).json({ error: error.message }); }
  };
}

// Every route that touches patient data goes through here, so approval is
// enforced in one place rather than per route.
export const requireDoctor = guard(doctorAccessDecision);
export const requireAdmin = guard(adminAccessDecision);

// For endpoints an applicant must reach before approval: proves who they are
// without granting access to anything clinical.
export async function requireAuthenticated(req, res, next) {
  try {
    const resolved = await resolveDoctor(req);
    if (resolved.error) return res.status(resolved.status).json({ error: resolved.error });
    req.authEmail = resolved.email;
    req.doctor = resolved.doctor;
    next();
  } catch (error) { return res.status(503).json({ error: error.message }); }
}
