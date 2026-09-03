import { describe, expect, it } from "vitest";
import { resolveSessionVoiceGender } from "./speechVoices.js";

describe("screenplay session voice", () => {
  it("uses male when every chunk belongs to one male character", () => {
    expect(resolveSessionVoiceGender(["male", "male"], "female")).toBe("male");
  });

  it("keeps the fallback for a mixed cast handled by grouped sessions", () => {
    expect(resolveSessionVoiceGender(["male", "female"], "female")).toBe("female");
  });
});
