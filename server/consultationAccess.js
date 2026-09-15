import { randomBytes, timingSafeEqual } from "node:crypto";
import { sha256 } from "./privacy.js";

// The patient has no account. The kiosk is handed a capability token when the
// consultation is saved, holds it in memory for as long as the patient stands
// there, and discards it when the kiosk is cleared.
export function createPatientToken() {
  return randomBytes(32).toString("hex");
}

export function hashPatientToken(token) {
  return sha256(token);
}

export function patientTokenMatches(storedHash, supplied) {
  if (typeof storedHash !== "string" || typeof supplied !== "string" || !supplied) return false;
  const suppliedHash = hashPatientToken(supplied);
  if (storedHash.length !== suppliedHash.length) return false;
  return timingSafeEqual(Buffer.from(storedHash), Buffer.from(suppliedHash));
}

// A prescription is only ever shown once the clinician has finished with the
// case. While it is still pending, the patient sees that it is being reviewed
// and nothing more.
const FINISHED = new Set(["complete", "reviewed", "flagged"]);

export function collectionView(consultation, prescription) {
  if (!consultation) return null;
  const finished = FINISHED.has(consultation.status);
  return {
    status: consultation.status,
    finished,
    prescription: finished && prescription ? {
      drug: prescription.drug,
      dosage: prescription.dosage,
      instructions: prescription.instructions || "",
    } : null,
  };
}
