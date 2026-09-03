import { describe, expect, it, vi } from "vitest";
import { prepareYorubaScreenplay } from "./yorubaScript.js";

describe("Yoruba screenplay preparation", () => {
  it("restores orthography without translating code-switched dialogue", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        normalizedText: "SIRE\nỌ̀rẹ́ mi kan ló wá mi wálé.\nMAMA RANTI\nṢé ó jẹ́ wedding planner?",
        speakers: [{ name: "Sire", suggestedVoiceGender: "male" }, { name: "MAMA RANTI", suggestedVoiceGender: "female" }],
      }) }] } }],
    }), { status: 200 }));
    const result = await prepareYorubaScreenplay({ text: "SIRE\nOre mi kan lo wami wale", apiKey: "key", fetchImpl });
    expect(result).toMatchObject({ speakers: [{ name: "SIRE", voiceGender: "male" }, { name: "MAMA RANTI", voiceGender: "female" }] });
    expect(result.normalizedText).toContain("Ọ̀rẹ́");
    const request = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(request.contents[0].parts[0].text).toMatch(/Restore standard Yoruba orthography/i);
    expect(request.contents[0].parts[0].text).toMatch(/do not translate/i);
  });
});
