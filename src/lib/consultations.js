import { doctorToken } from "./supabase/client";

async function doctorRequest(path, options = {}) {
  const token = await doctorToken();
  const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...options.headers } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "The clinical record service failed.");
  return body;
}

export async function saveConsultation(payload, video) {
  const form = new FormData();
  form.append("consultation", JSON.stringify(payload));
  if (video) form.append("video", video, `consultation-${Date.now()}.webm`);
  const response = await fetch("/api/consultations", { method: "POST", body: form });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "The consultation could not be saved.");
  return body.consultation;
}

export const getDoctorQueue = () => doctorRequest("/api/consultations").then((body) => body.consultations);
export const getDoctorCase = (id) => doctorRequest(`/api/consultations/${id}`).then((body) => body.consultation);
export const setCaseStatus = (id, status) => doctorRequest(`/api/consultations/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
export const createPrescription = (payload) => doctorRequest("/api/prescriptions", { method: "POST", body: JSON.stringify(payload) });
