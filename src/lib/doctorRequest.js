import { doctorToken } from "./supabase/client";

// Every doctor-facing call carries the Supabase session token; the server
// decides from it whether the account is approved.
export async function doctorRequest(path, options = {}) {
  const token = await doctorToken();
  const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...options.headers } });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error || "The clinical record service failed.");
    // "pending", "rejected", "unregistered" — lets the app show the right screen
    // instead of a bare error message.
    error.code = body.code;
    throw error;
  }
  return body;
}
