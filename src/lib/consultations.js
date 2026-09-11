import { doctorRequest } from "./doctorRequest";

export async function saveConsultation(payload, video) {
  const form = new FormData();
  form.append("consultation", JSON.stringify(payload));
  if (video) form.append("video", new Blob([video], { type: "video/webm" }), `consultation-${Date.now()}.webm`);
  const response = await fetch("/api/consultations", { method: "POST", body: form });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "The consultation could not be saved.");
  return body.consultation;
}

// The waiting patient reads back only their own outcome, using the capability
// token the kiosk was handed when the consultation was saved.
export async function getConsultationResult(id, token) {
  const response = await fetch(`/api/consultations/${id}/result?token=${encodeURIComponent(token)}`);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Your result could not be checked.");
  return body.result;
}

export const getDoctorQueue = () => doctorRequest("/api/consultations");
export const escalateCase = (id) => doctorRequest(`/api/consultations/${id}/escalate`, { method: "PATCH" });
export const getDoctorCase = (id) => doctorRequest(`/api/consultations/${id}`).then((body) => body.consultation);
export const setCaseStatus = (id, status) => doctorRequest(`/api/consultations/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
export const createPrescription = (payload) => doctorRequest("/api/prescriptions", { method: "POST", body: JSON.stringify(payload) });
