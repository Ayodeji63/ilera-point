import { describe, expect, it } from "vitest";
import { handRegion } from "./usePalmAutoCapture";

const landmarks = Array.from({ length: 21 }, (_, index) => ({
  x: index % 2 ? .7 : .3,
  y: index % 3 ? .8 : .2,
}));

describe("handRegion", () => {
  it("maps MediaPipe landmarks into a padded source-frame region", () => {
    const region = handRegion(landmarks, 1280, 720);
    expect(region.x).toBeCloseTo(353.28, 2);
    expect(region.y).toBeCloseTo(118.08, 2);
    expect(region.width).toBeCloseTo(573.44, 2);
    expect(region.height).toBeCloseTo(483.84, 2);
  });

  it("rejects incomplete landmark sets", () => {
    expect(handRegion([{ x: .5, y: .5 }], 1280, 720)).toBeNull();
  });
});
