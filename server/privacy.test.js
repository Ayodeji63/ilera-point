import { describe, expect, it } from "vitest";
import { expiresAfterDays, sha256 } from "./privacy.js";

describe("privacy primitives", () => {
  it("hashes sensitive capabilities deterministically without retaining plaintext", () => {
    expect(sha256("secret")).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256("secret")).not.toBe("secret");
    expect(sha256("secret")).toBe(sha256("secret"));
  });

  it("creates explicit UTC retention deadlines", () => {
    expect(expiresAfterDays(2, new Date("2026-09-15T00:00:00.000Z"))).toBe("2026-09-17T00:00:00.000Z");
  });
});

