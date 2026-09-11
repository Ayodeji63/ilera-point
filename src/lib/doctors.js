import { doctorRequest } from "./doctorRequest";

export const getDoctorAccount = () => doctorRequest("/api/doctors/me");
export const applyForAccess = (name, licenceNumber) =>
  doctorRequest("/api/doctors/apply", { method: "POST", body: JSON.stringify({ name, licence_number: licenceNumber }) });
export const getPendingApplications = () => doctorRequest("/api/doctors/pending").then((body) => body.applications);
export const reviewApplication = (id, status) =>
  doctorRequest(`/api/doctors/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
