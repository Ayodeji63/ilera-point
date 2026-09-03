async function request(path, options) {
  const response = await fetch(`/api/palm${path}`, options);
  const body = await response.json();
  if (!response.ok) { const error = new Error(body.error || "Palm service failed. Please use manual lookup."); error.providerCode=body.providerCode; error.requestId=body.requestId; throw error; }
  return body;
}

const imagePayload = (palmImage) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(",")[1]);
  reader.onerror = () => reject(new Error("The palm image could not be read."));
  reader.readAsDataURL(palmImage);
});

export class TencentPalmAuthProvider {
  async enroll(palmImage, patientInfo) {
    const imageB64 = await imagePayload(palmImage);
    const result = await request("/enroll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...patientInfo, imageB64 }) });
    return { patientId: result.patient.id, patient: result.patient };
  }
  async identify(palmImage) {
    const imageB64 = await imagePayload(palmImage);
    const result = await request("/identify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageB64 }) });
    return { patientId: result.patient?.id || null, patient: result.patient, confidence: result.confidence };
  }
  async compare(palmImage, patientId) {
    const imageB64 = await imagePayload(palmImage);
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

export const palmAuthProvider = new TencentPalmAuthProvider();
