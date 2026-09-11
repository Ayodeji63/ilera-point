import { createHash, createHmac } from "node:crypto";

const HOST = process.env.TENCENT_FACE_HOST || "iai.intl.tencentcloudapi.com";
const SERVICE = "iai";
const VERSION = "2020-03-03";
const BASE64_IMAGE = /^[A-Za-z0-9+/]+={0,2}$/;
// Tencent caps face images at 5 MB.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const DEFAULT_THRESHOLD = 80;
const DEFAULT_MARGIN = 5;

export class FaceInputError extends Error {}

export function isFaceSearchMiss(message) {
  return /(?:no (?:face|person)s? (?:found|matched)|not found|empty group|no valid)/i.test(String(message || ""));
}

export function normalizeFaceImage(input) {
  const image = String(input || "").replace(/^data:image\/[a-zA-Z+.-]+;base64,/, "").trim();
  if (!image) throw new FaceInputError("No face image was supplied.");
  if (!BASE64_IMAGE.test(image)) throw new FaceInputError("Face image is not valid base64.");
  const padding = image.endsWith("==") ? 2 : image.endsWith("=") ? 1 : 0;
  const bytes = Math.floor((image.length * 3) / 4) - padding;
  if (bytes > MAX_IMAGE_BYTES) throw new FaceInputError("Face image is too large. Move closer and try again.");
  return image;
}

const sha256Hex = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const hmac = (key, value) => createHmac("sha256", key).update(value, "utf8").digest();

// TC3-HMAC-SHA256, per Tencent's signing specification. Exported so the
// canonical request can be checked byte for byte against their worked example.
export function tc3CanonicalRequest({ method = "POST", uri = "/", query = "", headers, payload }) {
  const names = Object.keys(headers).map((name) => name.toLowerCase()).sort();
  const canonicalHeaders = names.map((name) => `${name}:${String(headers[name]).trim()}\n`).join("");
  return {
    signedHeaders: names.join(";"),
    canonicalRequest: [method, uri, query, canonicalHeaders, names.join(";"), sha256Hex(payload)].join("\n"),
  };
}

export function tc3Authorization({ secretId, secretKey, service, headers, payload, timestamp }) {
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const scope = `${date}/${service}/tc3_request`;
  const { signedHeaders, canonicalRequest } = tc3CanonicalRequest({ headers, payload });
  const stringToSign = ["TC3-HMAC-SHA256", String(timestamp), scope, sha256Hex(canonicalRequest)].join("\n");
  const signing = hmac(hmac(hmac(`TC3${secretKey}`, date), service), "tc3_request");
  const signature = createHmac("sha256", signing).update(stringToSign, "utf8").digest("hex");
  return `TC3-HMAC-SHA256 Credential=${secretId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

export function faceMatchSettings() {
  const threshold = Number(process.env.FACE_MATCH_THRESHOLD || DEFAULT_THRESHOLD);
  const margin = Number(process.env.FACE_MATCH_MARGIN || DEFAULT_MARGIN);
  return {
    threshold: Number.isFinite(threshold) ? threshold : DEFAULT_THRESHOLD,
    margin: Number.isFinite(margin) ? margin : DEFAULT_MARGIN,
  };
}

// Tencent documents no score that means "this is genuinely the same person", and
// a false match here shows one patient another patient's prescription. So a
// candidate is accepted only when it clears the threshold AND is clearly ahead
// of the runner-up; anything else is reported as no match and the kiosk falls
// back to manual lookup rather than guessing.
export function resolveFaceMatch(candidates, { threshold, margin } = faceMatchSettings()) {
  const ranked = [...(candidates || [])]
    .filter((candidate) => candidate?.PersonId && Number.isFinite(Number(candidate.Score)))
    .sort((left, right) => Number(right.Score) - Number(left.Score));
  if (!ranked.length) return { matched: false, reason: "no_candidates" };
  const [best, runnerUp] = ranked;
  if (Number(best.Score) < threshold) return { matched: false, reason: "below_threshold", score: Number(best.Score) };
  if (runnerUp && Number(best.Score) - Number(runnerUp.Score) < margin) {
    return { matched: false, reason: "ambiguous", score: Number(best.Score) };
  }
  return { matched: true, patientId: best.PersonId, score: Number(best.Score) };
}

async function callTencent(action, body) {
  const secretId = process.env.TENCENT_SECRET_ID;
  const secretKey = process.env.TENCENT_SECRET_KEY;
  if (!secretId || !secretKey) throw new Error("TENCENT_SECRET_ID and TENCENT_SECRET_KEY are not configured.");
  const payload = JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000);
  const headers = { "content-type": "application/json; charset=utf-8", host: HOST, "x-tc-action": action.toLowerCase() };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`https://${HOST}`, {
      method: "POST",
      headers: {
        Authorization: tc3Authorization({ secretId, secretKey, service: SERVICE, headers, payload, timestamp }),
        "Content-Type": "application/json; charset=utf-8",
        Host: HOST,
        "X-TC-Action": action,
        "X-TC-Timestamp": String(timestamp),
        "X-TC-Version": VERSION,
        "X-TC-Region": process.env.TENCENT_FACE_REGION || "ap-singapore",
      },
      body: payload,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Face service returned HTTP ${response.status}.`);
    const envelope = await response.json();
    if (envelope.Response?.Error) {
      const { Code, Message } = envelope.Response.Error;
      console.warn("Tencent IAI rejected request", { action, code: Code, requestId: envelope.Response.RequestId, message: Message });
      const error = new Error(Message || "Face service rejected the request.");
      error.providerCode = Code;
      error.requestId = envelope.Response.RequestId;
      throw error;
    }
    return envelope.Response;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("Face service did not respond within 15 seconds.");
    throw error;
  } finally { clearTimeout(timer); }
}

export const faceGroupId = () => process.env.TENCENT_FACE_GROUP_ID || "ilerapoint-patients";

export async function ensureFaceGroup() {
  try {
    await callTencent("CreateGroup", { GroupId: faceGroupId(), GroupName: "IleraPoint patients" });
  } catch (error) {
    // Creating a group that already exists is the normal case on every restart.
    if (!/already exist|GroupId.*exist/i.test(error.message || "")) throw error;
  }
}

export async function enrollFace(patientId, name, image) {
  const result = await callTencent("CreatePerson", {
    GroupId: faceGroupId(),
    PersonId: patientId,
    PersonName: name.slice(0, 60),
    Image: normalizeFaceImage(image),
    // Refuse a blurred or badly lit enrolment rather than storing a weak reference.
    QualityControl: 3,
    UniquePersonControl: 3,
  });
  return { faceId: result.FaceId, requestId: result.RequestId, similarPersonId: result.SimilarPersonId };
}

export async function searchFace(image) {
  let result;
  try {
    result = await callTencent("SearchPersons", {
      GroupIds: [faceGroupId()],
      Image: normalizeFaceImage(image),
      MaxFaceNum: 1,
      // Two candidates so an ambiguous pair can be detected and refused.
      MaxPersonNum: 2,
      NeedPersonInfo: 0,
      QualityControl: 1,
    });
  } catch (error) {
    if (isFaceSearchMiss(error.message)) return { matched: false, reason: "no_candidates" };
    throw error;
  }
  return resolveFaceMatch(result.Results?.[0]?.Candidates || []);
}

export async function verifyFace(patientId, image) {
  const result = await callTencent("VerifyPerson", { PersonId: patientId, Image: normalizeFaceImage(image) });
  const { threshold } = faceMatchSettings();
  return { isMatch: Boolean(result.IsMatch) && Number(result.Score) >= threshold, confidence: Number(result.Score) };
}
