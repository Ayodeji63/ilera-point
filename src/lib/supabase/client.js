import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = url && anonKey ? createClient(url, anonKey) : null;

export async function doctorToken() {
  if (!supabase) throw new Error("Doctor sign-in is not configured.");
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Please sign in again.");
  return data.session.access_token;
}
