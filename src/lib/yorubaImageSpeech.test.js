import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSpeechPlan, createYorubaSpeech, prepareYorubaScript, readYorubaImage } from "./yorubaImageSpeech";

afterEach(() => vi.unstubAllGlobals());

describe("Yoruba image speech client", () => {
  it("uploads the selected image for transcription", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: "Ẹ káàárọ̀" }) });
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["image"], "yoruba.png", { type: "image/png" });
    await expect(readYorubaImage(file)).resolves.toEqual({ text: "Ẹ káàárọ̀" });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/yoruba-image/transcribe");
    expect(fetchMock.mock.calls[0][1].body.get("image")).toMatchObject({ name: "yoruba.png", type: "image/png", size: 5 });
  });

  it("requires Sahara for downloadable Yoruba speech", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["wav"]), headers: new Headers({ "X-Ilera-Speech-Provider": "sahara" }) });
    vi.stubGlobal("fetch", fetchMock);
    await createYorubaSpeech("Ẹ káàárọ̀, báwo ni?", [], new AbortController().signal);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ voiceAccent: "yoruba", voiceGender: "female", language: "yo", requireSahara: true, mode: "document" });
  });

  it("supports a valid Yoruba word shorter than Sahara's chunk minimum", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["wav"]), headers: new Headers({ "X-Ilera-Speech-Provider": "sahara" }) });
    vi.stubGlobal("fetch", fetchMock);
    await createYorubaSpeech("Àlàáfíà", [], new AbortController().signal);
    const { chunks } = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(chunks).toEqual(["Àlàáfíà   "]);
  });

  it("skips speaker labels and assigns editable cast voices", () => {
    const cast = [{ name: "SIRE", voiceGender: "male" }, { name: "MAMA RANTI", voiceGender: "female" }];
    const plan = buildSpeechPlan("SIRE\nNo!\nOre mi lasan ni.\n\nMAMA RANTI\nṢé ó jẹ́ wedding planner?\nRárá mà.", cast);
    expect(plan.chunks).toEqual(["No!       ", "Ore mi lasan ni.", "Ṣé ó jẹ́ wedding planner?", "Rárá mà.  "]);
    expect(plan.pausesMs).toEqual([650, 850, 550, 0]);
    expect(plan.voiceGenders).toEqual(["male", "male", "female", "female"]);
  });

  it("creates an explicit pause for a comma inside a screenplay line", () => {
    const plan = buildSpeechPlan("Báwo, ore mi.");
    expect(plan.chunks).toEqual(["Báwo,     ", "ore mi.   "]);
    expect(plan.pausesMs).toEqual([240, 0]);
  });

  it("requests Yoruba screenplay restoration", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: "Ọ̀rẹ́ mi.", speakers: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    await expect(prepareYorubaScript("Ore mi.")).resolves.toMatchObject({ text: "Ọ̀rẹ́ mi." });
    expect(fetchMock).toHaveBeenCalledWith("/api/yoruba-script/prepare", expect.objectContaining({ method: "POST" }));
  });
});
