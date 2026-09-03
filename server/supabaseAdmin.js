import { createClient } from "@supabase/supabase-js";

let client;

export function getSupabaseAdmin() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not configured.");
  }
  if (!client) client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

export async function requireDoctor(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return res.status(401).json({ error: "Doctor sign-in is required." });
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ error: "Your sign-in has expired. Please sign in again." });
    const { data: doctor, error: doctorError } = await supabase.from("doctors").select("id,name,email").eq("email", data.user.email).maybeSingle();
    if (doctorError || !doctor) return res.status(403).json({ error: "This account is not registered as an IleraPoint doctor." });
    req.doctor = doctor;
    next();
  } catch (error) { return res.status(503).json({ error: error.message }); }
}
