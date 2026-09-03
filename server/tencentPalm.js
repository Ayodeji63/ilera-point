const BASE64_IMAGE = /^[A-Za-z0-9+/]+={0,2}$/;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export class PalmInputError extends Error {}

export function isPalmSearchMiss(message) { return /(?:user|palm).*(?:not found|no match)|not found in search/i.test(String(message || "")); }

export function normalizePalmImage(input) {
  const image = String(input || "").replace(/^data:image\/[a-zA-Z+.-]+;base64,/, "").trim();
  if (!image) throw new PalmInputError("No palm image was supplied.");
  if (!BASE64_IMAGE.test(image)) throw new PalmInputError("Palm image is not valid base64.");
  const padding = image.endsWith("==") ? 2 : image.endsWith("=") ? 1 : 0;
  const bytes = Math.floor((image.length * 3) / 4) - padding;
  if (bytes > MAX_IMAGE_BYTES) throw new PalmInputError("Palm image is too large. Move closer and try again.");
  return image;
}

async function callTencent(path, body) {
  if (!process.env.TENCENT_PALM_API_KEY) throw new Error("TENCENT_PALM_API_KEY is not configured.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const credential = process.env.TENCENT_PALM_API_KEY.replace(/^Bearer\s+/i, "").trim();
  try {
    const response = await fetch(`${process.env.TENCENT_PALM_BASE_URL || "https://open.intl.palm.tencent.com"}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Palm service returned HTTP ${response.status}.`);
    const envelope = await response.json();
    if (envelope.code !== 0) {
      console.warn("Tencent PalmAI rejected request", { path, code: envelope.code, requestId: envelope.requestId, message: envelope.message });
      const error = new Error(envelope.message || "Palm service rejected the request."); error.providerCode=envelope.code; error.requestId=envelope.requestId; throw error;
    }
    return envelope;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("Palm service did not respond within 15 seconds.");
    throw error;
  } finally { clearTimeout(timer); }
}

const rgbImage = (image) => ({ Data: normalizePalmImage(image), ImageType: 1 });

export async function registerPalm(userId, image) {
  const result = await callTencent("/palm/openai/register_rgb_palm", { UserId: userId, RgbImage: rgbImage(image), IsForce: false });
  return { palmId: result.data.PalmId, requestId: result.requestId };
}

export async function searchPalm(image) {
  let result;
  try { result = await callTencent("/palm/openai/search_rgb_palm", { RgbImage: rgbImage(image) }); }
  catch (error) {
    if (isPalmSearchMiss(error.message)) return null;
    throw error;
  }
  if (!result.data?.UserId) return null;
  return { patientId: result.data.UserId, confidence: result.data.Score, algorithmVersion: result.data.AlgorithmVersion, palmDirection: result.data.PalmDirection };
}

export async function comparePalm(userId, image) {
  const result = await callTencent("/palm/openai/compare_rgb_palm", { RgbImage: rgbImage(image), CompareUserId: userId });
  return { isMatch: result.data.IsMatch, confidence: result.data.Score, algorithmVersion: result.data.AlgorithmVersion, palmDirection: result.data.PalmDirection };
}
