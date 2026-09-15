const STORAGE_KEY = "ilerapoint.active-result.v1";

function browserSessionStorage() {
  try { return globalThis.sessionStorage; } catch { return null; }
}

export function savePatientReceipt(consultation, language, storage, optionalConsentActive = false) {
  const target = storage || browserSessionStorage();
  if (!consultation?.id || !consultation?.patient_token || !target) return;
  const receipt = {
    id: consultation.id,
    patient_token: consultation.patient_token,
    patient_return_code: consultation.patient_return_code || "",
    patient_result_expires_at: consultation.patient_result_expires_at || "",
    language: language || "en",
    optional_consent_active: Boolean(optionalConsentActive),
  };
  try { target.setItem(STORAGE_KEY, JSON.stringify(receipt)); } catch {}
}

export function readPatientReceipt(storage, now = Date.now()) {
  const target = storage || browserSessionStorage();
  if (!target) return null;
  try {
    const receipt = JSON.parse(target.getItem(STORAGE_KEY) || "null");
    const expiresAt = new Date(receipt?.patient_result_expires_at || 0).getTime();
    if (!receipt?.id || !receipt?.patient_token || !Number.isFinite(expiresAt) || expiresAt <= now) {
      target.removeItem(STORAGE_KEY);
      return null;
    }
    return receipt;
  } catch {
    try { target.removeItem(STORAGE_KEY); } catch {}
    return null;
  }
}

export function clearPatientReceipt(storage) {
  try { (storage || browserSessionStorage())?.removeItem(STORAGE_KEY); } catch {}
}
