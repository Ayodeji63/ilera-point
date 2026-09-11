import { afterEach, describe, expect, it } from "vitest";
import { hasStreamSlot, noteStreamRateLimited, reserveStreamSlot, resetStreamBudget, streamBudgetDelaySeconds } from "./saharaStreamBudget.js";

afterEach(() => { resetStreamBudget(); delete process.env.SAHARA_STREAM_LIMIT_PER_MINUTE; });

describe("Sahara stream connection budget", () => {
  it("allows only three stream connections per rolling minute", () => {
    const now = 1_000_000;
    expect([0, 1, 2].map((offset) => reserveStreamSlot({ now: now + offset }))).toEqual([true, true, true]);
    expect(reserveStreamSlot({ now: now + 3 })).toBe(false);
    expect(reserveStreamSlot({ now: now + 60_000 })).toBe(true);
  });

  it("keeps slots back for real requests when warming the pool", () => {
    const now = 2_000_000;
    reserveStreamSlot({ now });
    expect(hasStreamSlot({ keepInReserve: 1, now })).toBe(true);
    reserveStreamSlot({ now });
    expect(hasStreamSlot({ keepInReserve: 1, now })).toBe(false);
    expect(hasStreamSlot({ now })).toBe(true);
  });

  it("stops opening sockets until the provider's Retry-After has passed", () => {
    const now = 3_000_000;
    noteStreamRateLimited({ retryAfterSeconds: 14, now });
    expect(hasStreamSlot({ now })).toBe(false);
    expect(streamBudgetDelaySeconds(now)).toBe(14);
    expect(hasStreamSlot({ now: now + 14_000 })).toBe(true);
  });

  it("honours a configured limit", () => {
    process.env.SAHARA_STREAM_LIMIT_PER_MINUTE = "1";
    const now = 4_000_000;
    expect(reserveStreamSlot({ now })).toBe(true);
    expect(reserveStreamSlot({ now })).toBe(false);
  });
});
