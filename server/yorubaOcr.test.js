import { describe, expect, it, vi } from "vitest";
import { extractYorubaText } from "./yorubaOcr.js";

describe("Yoruba image OCR", () => {
  it("sends inline image data and preserves returned Yoruba text", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ text: "Ẹ káàárọ̀, ilé ayé." }) }] } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await extractYorubaText({ image: Buffer.from("image"), mimeType: "image/png", apiKey: "key", fetchImpl });

    expect(result.text).toBe("Ẹ káàárọ̀, ilé ayé.");
    const request = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(request.contents[0].parts[0].inline_data.mime_type).toBe("image/png");
    expect(request.contents[0].parts[0].inline_data.data).toBe(Buffer.from("image").toString("base64"));
    expect(request.contents[0].parts[1].text).toMatch(/screenplay.*character heading.*separate lines/i);
  });

  it("returns an empty string when no Yoruba is readable", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ text: "" }) }] } }],
    }), { status: 200 }));
    await expect(extractYorubaText({ image: Buffer.from("image"), mimeType: "image/jpeg", apiKey: "key", fetchImpl })).resolves.toMatchObject({ text: "" });
  });
});
