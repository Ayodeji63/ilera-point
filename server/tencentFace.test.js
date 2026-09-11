import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { faceMatchSettings, isFaceSearchMiss, normalizeFaceImage, resolveFaceMatch, tc3Authorization, tc3CanonicalRequest } from "./tencentFace.js";

const sha256Hex = (value) => createHash("sha256").update(value, "utf8").digest("hex");

afterEach(() => {
  delete process.env.FACE_MATCH_THRESHOLD;
  delete process.env.FACE_MATCH_MARGIN;
});

describe("TC3-HMAC-SHA256 signing", () => {
  // Tencent's published worked example. Their docs redact the secret, but they
  // print both intermediate hashes, which pin the canonical request byte for
  // byte — the part that is easy to get subtly wrong.
  const payload = '{"Limit": 1, "Filters": [{"Values": ["unnamed"], "Name": "instance-name"}]}';

  it("builds the canonical request Tencent documents", () => {
    const { canonicalRequest, signedHeaders } = tc3CanonicalRequest({
      headers: { "content-type": "application/json; charset=utf-8", host: "cvm.tencentcloudapi.com" },
      payload,
    });
    expect(sha256Hex(payload)).toBe("99d58dfbc6745f6747f36bfca17dee5e6881dc0428a0a36f96199342bc5b4907");
    expect(sha256Hex(canonicalRequest)).toBe("2815843035062fffda5fd6f2a44ea8a34818b0dc46f024b8b3786976a3adda7a");
    expect(signedHeaders).toBe("content-type;host");
  });

  it("sorts and lowercases headers however they were given", () => {
    const { signedHeaders } = tc3CanonicalRequest({
      headers: { "X-TC-Action": "searchpersons", Host: "iai.intl.tencentcloudapi.com", "Content-Type": "application/json; charset=utf-8" },
      payload: "{}",
    });
    expect(signedHeaders).toBe("content-type;host;x-tc-action");
  });

  it("derives the credential scope from the request timestamp, not the local date", () => {
    const authorization = tc3Authorization({
      secretId: "AKIDEXAMPLE", secretKey: "SECRETEXAMPLE", service: "iai", timestamp: 1551113065,
      headers: { "content-type": "application/json; charset=utf-8", host: "cvm.tencentcloudapi.com" },
      payload,
    });
    expect(authorization).toContain("Credential=AKIDEXAMPLE/2019-02-25/iai/tc3_request");
    expect(authorization).toMatch(/Signature=[0-9a-f]{64}$/);
  });

  it("produces a different signature when any signed input changes", () => {
    const base = { secretId: "AKIDEXAMPLE", secretKey: "SECRETEXAMPLE", service: "iai", timestamp: 1551113065, headers: { host: "iai.intl.tencentcloudapi.com" }, payload: "{}" };
    const signature = (options) => tc3Authorization({ ...base, ...options }).split("Signature=")[1];
    expect(signature({})).toBe(signature({}));
    expect(signature({ payload: '{"a":1}' })).not.toBe(signature({}));
    expect(signature({ timestamp: 1551113066 })).not.toBe(signature({}));
    expect(signature({ secretKey: "OTHER" })).not.toBe(signature({}));
  });
});

describe("face match safety rule", () => {
  it("accepts a confident, unambiguous candidate", () => {
    expect(resolveFaceMatch([{ PersonId: "patient-1", Score: 92 }, { PersonId: "patient-2", Score: 61 }], { threshold: 80, margin: 5 }))
      .toMatchObject({ matched: true, patientId: "patient-1" });
  });

  it("refuses a candidate below the threshold", () => {
    expect(resolveFaceMatch([{ PersonId: "patient-1", Score: 74 }], { threshold: 80, margin: 5 }))
      .toMatchObject({ matched: false, reason: "below_threshold" });
  });

  it("refuses two candidates that are too close to separate", () => {
    // Both look like the patient. Identifying either one risks handing over
    // another person's prescription, so the kiosk asks instead.
    expect(resolveFaceMatch([{ PersonId: "patient-1", Score: 91 }, { PersonId: "patient-2", Score: 88 }], { threshold: 80, margin: 5 }))
      .toMatchObject({ matched: false, reason: "ambiguous" });
  });

  it("refuses an empty or malformed candidate list", () => {
    expect(resolveFaceMatch([], { threshold: 80, margin: 5 })).toMatchObject({ matched: false, reason: "no_candidates" });
    expect(resolveFaceMatch(null, { threshold: 80, margin: 5 })).toMatchObject({ matched: false });
    expect(resolveFaceMatch([{ Score: 99 }], { threshold: 80, margin: 5 })).toMatchObject({ matched: false });
    expect(resolveFaceMatch([{ PersonId: "p", Score: "not a number" }], { threshold: 80, margin: 5 })).toMatchObject({ matched: false });
  });

  it("ranks candidates itself rather than trusting the order received", () => {
    expect(resolveFaceMatch([{ PersonId: "low", Score: 40 }, { PersonId: "high", Score: 95 }], { threshold: 80, margin: 5 }))
      .toMatchObject({ matched: true, patientId: "high" });
  });

  it("defaults to a conservative threshold and reads overrides from the environment", () => {
    expect(faceMatchSettings()).toEqual({ threshold: 80, margin: 5 });
    process.env.FACE_MATCH_THRESHOLD = "90";
    process.env.FACE_MATCH_MARGIN = "10";
    expect(faceMatchSettings()).toEqual({ threshold: 90, margin: 10 });
    process.env.FACE_MATCH_THRESHOLD = "nonsense";
    expect(faceMatchSettings().threshold).toBe(80);
  });
});

describe("face image input", () => {
  it("strips a data URL prefix and rejects unusable input", () => {
    expect(normalizeFaceImage("data:image/jpeg;base64,YWJj")).toBe("YWJj");
    expect(() => normalizeFaceImage("")).toThrow(/no face image/i);
    expect(() => normalizeFaceImage("not base64!")).toThrow(/valid base64/i);
    expect(() => normalizeFaceImage("A".repeat(9 * 1024 * 1024))).toThrow(/too large/i);
  });

  it("recognises a provider miss so it can be reported as no match", () => {
    expect(isFaceSearchMiss("No faces found in the image")).toBe(true);
    expect(isFaceSearchMiss("Rate limit exceeded")).toBe(false);
  });
});
