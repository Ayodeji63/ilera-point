import { describe, expect, it } from "vitest";
import { repairUtf8Mojibake } from "./textEncoding";

describe("transcription text encoding", () => {
  it("repairs UTF-8 Yoruba that was decoded as Latin-1", () => {
    expect(repairUtf8Mojibake("KÃ² sÃ­ ohun mÃ¬Ã­rÃ n kan")).toBe("Kò sí ohun mìíràn kan");
  });

  it("does not alter correctly decoded Yoruba", () => {
    expect(repairUtf8Mojibake("Kò sí àìsàn mìíràn.")).toBe("Kò sí àìsàn mìíràn.");
  });
});
