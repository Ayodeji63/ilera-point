import { createHash } from "node:crypto";

export const CONSENT_NOTICE_VERSION = "2026-09-15.v1";
export const PRESCRIPTION_PROMPT_VERSION = "prescription-extract-2026-09-15.v1";

const positiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const retentionDays = {
  video: positiveInteger(process.env.RETENTION_VIDEO_DAYS, 30),
  clinical: positiveInteger(process.env.RETENTION_CLINICAL_DAYS, 2190),
  audit: positiveInteger(process.env.RETENTION_AUDIT_DAYS, 365),
  benchmark: positiveInteger(process.env.RETENTION_BENCHMARK_DAYS, 365),
};

export function expiresAfterDays(days, now = new Date()) {
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}

export function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function safeRequestMetadata(req) {
  return {
    method: req.method,
    route: req.route?.path || req.path,
    request_id: req.get("x-request-id") || null,
  };
}

