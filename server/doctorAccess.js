// Anyone can create a Supabase Auth account against this project, so signing in
// proves an email address and nothing more. This decides whether an account may
// see patient data, and it is the only thing standing between a login and a
// medical record. Everything that is not an explicit approval is denied.
import { missingColumnHint } from "./schemaHints.js";

const APPROVED = "approved";

export function doctorAccessDecision(doctor) {
  if (!doctor) {
    return { allowed: false, status: 403, code: "unregistered", error: "This account has not applied for IleraPoint access yet." };
  }
  if (doctor.status === "pending") {
    return { allowed: false, status: 403, code: "pending", error: "Your application is waiting for approval by an IleraPoint administrator." };
  }
  if (doctor.status === "rejected") {
    return { allowed: false, status: 403, code: "rejected", error: "This account was not approved for IleraPoint access." };
  }
  // A status we do not recognise — a typo, a half-finished migration, a column
  // default that changed — must never be read as permission.
  if (doctor.status !== APPROVED) {
    return { allowed: false, status: 403, code: "unregistered", error: "This account is not approved for IleraPoint access." };
  }
  return { allowed: true, code: APPROVED };
}

export function describeDirectoryFailure(error) {
  return missingColumnHint(error, "0002_doctor_onboarding.sql") || "The doctor directory could not be read.";
}

const MAX_NAME = 120;
const MAX_LICENCE = 60;

export function validateApplication({ name, licenceNumber }) {
  if (name.length < 2 || name.length > MAX_NAME) return "Enter the name your patients will see.";
  if (licenceNumber.length < 3 || licenceNumber.length > MAX_LICENCE) return "Enter your medical registration number.";
  return null;
}

// Builds the row from the verified email plus the two self-asserted details an
// applicant is allowed to supply. Status and role are fixed here, so no request
// body can register itself as approved or as an administrator.
export function applicationRecord({ email, name, licenceNumber }) {
  return { name, email, licence_number: licenceNumber, status: "pending", role: "doctor" };
}

export function adminAccessDecision(doctor) {
  const access = doctorAccessDecision(doctor);
  if (!access.allowed) return access;
  if (doctor.role !== "admin") {
    return { allowed: false, status: 403, code: "not_admin", error: "This account cannot review doctor applications." };
  }
  return { allowed: true, code: "admin" };
}
