async function request(path, options) {
  const response = await fetch(`/api/face${path}`, options);
  const body = await response.json();
  if (!response.ok) { const error = new Error(body.error || "Face recognition failed. Please use manual lookup."); error.providerCode = body.providerCode; error.requestId = body.requestId; throw error; }
  return body;
}

const imagePayload = (faceImage) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(",")[1]);
  reader.onerror = () => reject(new Error("The photograph could not be read."));
  reader.readAsDataURL(faceImage);
});

export class TencentFaceAuthProvider {
  async enroll(faceImage, patientInfo) {
    const imageB64 = await imagePayload(faceImage);
    const result = await request("/enroll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...patientInfo, imageB64 }) });
    return { patientId: result.patient.id, patient: result.patient };
  }
  async identify(faceImage) {
    const imageB64 = await imagePayload(faceImage);
    const result = await request("/identify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageB64 }) });
    // `reason` distinguishes "nobody enrolled looks like this" from "two people
    // look too alike to choose", so the screen can say something useful.
    return { patientId: result.patient?.id || null, patient: result.patient, confidence: result.confidence, reason: result.reason };
  }
  async compare(faceImage, patientId) {
    const imageB64 = await imagePayload(faceImage);
    return request("/compare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageB64, patientId }) });
  }
  async manualLookup({ name, phone }) {
    const params = new URLSearchParams({ name, phone });
    return request(`/manual-lookup?${params}`);
  }
  async manualRegister(patientInfo) {
    const result = await request("/manual-register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patientInfo) });
    return result.patient;
  }
}

export const faceAuthProvider = new TencentFaceAuthProvider();
