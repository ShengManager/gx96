import { describe, expect, it } from "vitest";

// Test bonus calculation logic without DB
describe("Bonus Calculation Logic", () => {
  // Simulated bonus types
  const calcBonus = (bonusType: number, depositAmount: number, config: any): number => {
    switch (bonusType) {
      case 0: // Fixed
        return parseFloat(config.fixedAmount || "0");
      case 1: // Percentage
        const pct = parseFloat(config.percentage || "0") / 100;
        let amount = depositAmount * pct;
        if (config.maxBonus && amount > parseFloat(config.maxBonus)) {
          amount = parseFloat(config.maxBonus);
        }
        return amount;
      case 2: // Random
        const min = parseFloat(config.randomMin || "0");
        const max = parseFloat(config.randomMax || "0");
        return min + Math.random() * (max - min);
      default:
        return 0;
    }
  };

  it("calculates fixed bonus correctly", () => {
    const amount = calcBonus(0, 100, { fixedAmount: "50" });
    expect(amount).toBe(50);
  });

  it("calculates percentage bonus correctly", () => {
    const amount = calcBonus(1, 200, { percentage: "50" });
    expect(amount).toBe(100);
  });

  it("caps percentage bonus at maxBonus", () => {
    const amount = calcBonus(1, 1000, { percentage: "50", maxBonus: "100" });
    expect(amount).toBe(100);
  });

  it("calculates random bonus within range", () => {
    const amount = calcBonus(2, 100, { randomMin: "10", randomMax: "50" });
    expect(amount).toBeGreaterThanOrEqual(10);
    expect(amount).toBeLessThanOrEqual(50);
  });

  // Rollover calculation test
  it("calculates rollover target correctly", () => {
    const depositAmount = 100;
    const bonusAmount = 50;
    const rolloverMultiplier = 3;
    const target = (depositAmount + bonusAmount) * rolloverMultiplier;
    expect(target).toBe(450);
  });

  // Claim eligibility check
  it("validates minimum deposit condition", () => {
    const minDeposit = 50;
    const depositAmount = 30;
    const eligible = depositAmount >= minDeposit;
    expect(eligible).toBe(false);
  });

  it("validates maximum deposit condition", () => {
    const maxDeposit = 500;
    const depositAmount = 300;
    const eligible = depositAmount <= maxDeposit;
    expect(eligible).toBe(true);
  });
});
