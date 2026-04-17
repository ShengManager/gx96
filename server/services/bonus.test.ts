import { describe, expect, it } from "vitest";
import { calculateBonusAmount, validateTime, type ClaimConfig } from "./bonus";

describe("Bonus Calculation Logic", () => {
  it("calculates fixed bonus correctly", () => {
    const amount = calculateBonusAmount(0, 100, "50", null, null, null);
    expect(amount).toBe(50);
  });

  it("calculates percentage bonus correctly", () => {
    const amount = calculateBonusAmount(1, 200, null, "50", null, null);
    expect(amount).toBe(100);
  });

  it("caps percentage bonus at maxBonus", () => {
    const amount = calculateBonusAmount(1, 1000, null, "50", null, null, { maxBonus: 100 });
    expect(amount).toBe(100);
  });

  it("random bonus with same seed is deterministic", () => {
    const a = calculateBonusAmount(2, 100, null, null, "10", "50", { seed: "same-seed" });
    const b = calculateBonusAmount(2, 100, null, null, "10", "50", { seed: "same-seed" });
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(10);
    expect(a).toBeLessThanOrEqual(50);
  });

  it("random bonus with different seed changes value", () => {
    const a = calculateBonusAmount(2, 100, null, null, "10", "50", { seed: "seed-a" });
    const b = calculateBonusAmount(2, 100, null, null, "10", "50", { seed: "seed-b" });
    expect(a).not.toBe(b);
  });
});

describe("Bonus Time Validation", () => {
  it("rejects claim before start date", () => {
    const config: ClaimConfig = {
      startDate: "2099-01-01T00:00:00.000Z",
    };
    const result = validateTime(config, new Date("2026-01-01T00:00:00.000Z"));
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("BONUS_NOT_STARTED");
  });

  it("rejects claim outside ClaimTime window", () => {
    const config: ClaimConfig = {
      ClaimTime: { start: "10:00", end: "11:00" },
    };
    const result = validateTime(config, new Date("2026-01-01T09:30:00.000Z"));
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("CLAIM_TIME_LOCKED");
  });
});
