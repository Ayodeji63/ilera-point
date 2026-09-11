import { describe, expect, it } from "vitest";
import { faceFraming, faceRegion } from "./useFaceAutoCapture";

const box = (originX, originY, width, height) => ({ originX, originY, width, height });

describe("faceRegion", () => {
  it("pads the detected box so the crop keeps hairline and chin", () => {
    const region = faceRegion(box(500, 200, 300, 400), 1280, 720);
    expect(region.x).toBeCloseTo(446, 0);
    expect(region.y).toBeCloseTo(128, 0);
    expect(region.width).toBeCloseTo(408, 0);
    expect(region.height).toBeCloseTo(544, 0);
  });

  it("clamps the padded region to the frame", () => {
    const region = faceRegion(box(0, 0, 300, 400), 1280, 720);
    expect(region.x).toBe(0);
    expect(region.y).toBe(0);
  });

  it("rejects a missing or degenerate box", () => {
    expect(faceRegion(null, 1280, 720)).toBeNull();
    expect(faceRegion(box(0, 0, 0, 0), 1280, 720)).toBeNull();
    expect(faceRegion({ originX: Number.NaN, originY: 0, width: 10, height: 10 }, 1280, 720)).toBeNull();
  });
});

describe("faceFraming", () => {
  const centred = box(490, 160, 300, 400);

  it("accepts a centred face that fills enough of the frame", () => {
    expect(faceFraming(centred, 1280, 720)).toBe("framed");
  });

  it("asks the patient to move closer or back off", () => {
    expect(faceFraming(box(590, 260, 200, 200), 1280, 720)).toBe("closer");
    expect(faceFraming(box(140, 40, 1000, 640), 1280, 720)).toBe("further");
  });

  it("asks the patient to centre themselves", () => {
    expect(faceFraming(box(20, 160, 300, 400), 1280, 720)).toBe("position");
    expect(faceFraming(box(1100, 160, 300, 400), 1280, 720)).toBe("position");
  });

  it("rejects a face that runs off the edge of the frame", () => {
    expect(faceFraming(box(-20, 160, 300, 400), 1280, 720)).toBe("position");
    expect(faceFraming(box(1100, 160, 300, 400), 1280, 720)).toBe("position");
  });

  it("waits when there is no face at all", () => {
    expect(faceFraming(null, 1280, 720)).toBe("place");
  });
});
