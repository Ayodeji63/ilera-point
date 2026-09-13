async function request(path, options) {
  const response = await fetch(`/api/patients${path}`, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "The patient record service is unavailable.");
  return body;
}

export class PatientDirectory {
  async lookup({ name, phone }) {
    const params = new URLSearchParams({ name, phone });
    return request(`/lookup?${params}`);
  }

  async register(patientInfo) {
    const result = await request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patientInfo),
    });
    return result.patient;
  }
}

export const patientDirectory = new PatientDirectory();
