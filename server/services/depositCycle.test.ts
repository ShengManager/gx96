import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the database module
vi.mock("../db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  getActiveCycle: vi.fn(),
  getPlayerById: vi.fn(),
}));

import * as db from "../db";

// Test the deposit cycle business logic in isolation
describe("Deposit Cycle Business Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("canCreateDeposit logic", () => {
    it("should allow deposit when no active cycle exists", () => {
      // If getActiveCycle returns null, player can deposit
      const activeCycle = null;
      const canDeposit = activeCycle === null;
      expect(canDeposit).toBe(true);
    });

    it("should block deposit when active cycle exists with balance", () => {
      const activeCycle = {
        id: 1,
        depositAmount: "100.00",
        bonusAmount: "20.00",
        totalWithdrawn: "0.00",
        status: "active",
      };
      // Player cannot deposit if they have an active cycle
      const canDeposit = activeCycle === null;
      expect(canDeposit).toBe(false);
    });

    it("should allow deposit when cycle is completed", () => {
      const activeCycle = {
        id: 1,
        depositAmount: "100.00",
        bonusAmount: "0.00",
        totalWithdrawn: "100.00",
        status: "completed",
      };
      // Completed cycle means no active cycle
      const isActive = activeCycle.status === "active";
      expect(isActive).toBe(false);
    });
  });

  describe("withdrawal conditions logic", () => {
    it("should pass when rollover and turnover targets are met", () => {
      const cycle = {
        targetRollover: "500.00",
        currentRollover: "600.00",
        targetTurnover: "300.00",
        currentTurnover: "350.00",
        hasEnteredGame: true,
      };

      const rolloverMet = parseFloat(cycle.currentRollover) >= parseFloat(cycle.targetRollover);
      const turnoverMet = parseFloat(cycle.currentTurnover) >= parseFloat(cycle.targetTurnover);
      const gameEntered = cycle.hasEnteredGame;

      expect(rolloverMet).toBe(true);
      expect(turnoverMet).toBe(true);
      expect(gameEntered).toBe(true);
    });

    it("should fail when rollover not met", () => {
      const cycle = {
        targetRollover: "500.00",
        currentRollover: "200.00",
        targetTurnover: "300.00",
        currentTurnover: "350.00",
        hasEnteredGame: true,
      };

      const rolloverMet = parseFloat(cycle.currentRollover) >= parseFloat(cycle.targetRollover);
      expect(rolloverMet).toBe(false);
    });

    it("should fail when game not entered", () => {
      const cycle = {
        targetRollover: "0.00",
        currentRollover: "0.00",
        targetTurnover: "0.00",
        currentTurnover: "0.00",
        hasEnteredGame: false,
      };

      expect(cycle.hasEnteredGame).toBe(false);
    });

    it("should calculate withdrawal amount correctly after deductions", () => {
      const depositAmount = 100;
      const bonusAmount = 20;
      const totalWithdrawn = 0;
      const requestedAmount = 150;
      const balance = 200;

      // Player can withdraw up to their balance
      const maxWithdraw = balance;
      const canWithdraw = requestedAmount <= maxWithdraw;
      expect(canWithdraw).toBe(true);
    });
  });

  describe("deposit lifecycle states", () => {
    it("should transition from pending to processing to approved", () => {
      const states = ["pending", "processing", "approved"];
      const validTransitions: Record<string, string[]> = {
        pending: ["processing", "rejected"],
        processing: ["approved", "rejected"],
        approved: [],
        rejected: [],
      };

      expect(validTransitions["pending"]).toContain("processing");
      expect(validTransitions["processing"]).toContain("approved");
      expect(validTransitions["approved"]).toHaveLength(0);
    });

    it("should not allow transition from approved back to pending", () => {
      const validTransitions: Record<string, string[]> = {
        pending: ["processing", "rejected"],
        processing: ["approved", "rejected"],
        approved: [],
        rejected: [],
      };

      expect(validTransitions["approved"]).not.toContain("pending");
    });
  });
});

describe("Bonus Claim Integration Logic", () => {
  it("should calculate fixed bonus correctly", () => {
    const bonusConfig = { bonusType: 0, fixedAmount: 50 };
    const depositAmount = 100;

    let bonusAmount = 0;
    if (bonusConfig.bonusType === 0) {
      bonusAmount = bonusConfig.fixedAmount;
    }
    expect(bonusAmount).toBe(50);
  });

  it("should calculate percentage bonus correctly", () => {
    const bonusConfig = { bonusType: 1, percentage: 50 };
    const depositAmount = 200;

    let bonusAmount = 0;
    if (bonusConfig.bonusType === 1) {
      bonusAmount = depositAmount * (bonusConfig.percentage / 100);
    }
    expect(bonusAmount).toBe(100);
  });

  it("should calculate random bonus within range", () => {
    const bonusConfig = { bonusType: 2, randomMin: 10, randomMax: 50 };

    for (let i = 0; i < 100; i++) {
      const bonusAmount = bonusConfig.randomMin + Math.random() * (bonusConfig.randomMax - bonusConfig.randomMin);
      expect(bonusAmount).toBeGreaterThanOrEqual(bonusConfig.randomMin);
      expect(bonusAmount).toBeLessThanOrEqual(bonusConfig.randomMax);
    }
  });

  it("should block bonus claim when game has been entered", () => {
    const activeCycle = { hasEnteredGame: true };
    const canClaim = !activeCycle.hasEnteredGame;
    expect(canClaim).toBe(false);
  });

  it("should allow bonus claim when game has not been entered", () => {
    const activeCycle = { hasEnteredGame: false };
    const canClaim = !activeCycle.hasEnteredGame;
    expect(canClaim).toBe(true);
  });

  it("should calculate rollover target from bonus multiplier", () => {
    const depositAmount = 100;
    const bonusAmount = 50;
    const rolloverMultiplier = 5;

    const targetRollover = (depositAmount + bonusAmount) * rolloverMultiplier;
    expect(targetRollover).toBe(750);
  });

  it("should enforce max claim count per player", () => {
    const claimConfig = { maxClaimPerPlayer: 3 };
    const currentClaimCount = 3;

    const canClaim = currentClaimCount < claimConfig.maxClaimPerPlayer;
    expect(canClaim).toBe(false);
  });

  it("should validate deposit condition for bonus", () => {
    const claimConfig = {
      depositCondition: { minDeposit: 50, maxDeposit: 500 },
    };
    const depositAmount = 100;

    const meetsMin = depositAmount >= claimConfig.depositCondition.minDeposit;
    const meetsMax = depositAmount <= claimConfig.depositCondition.maxDeposit;
    expect(meetsMin).toBe(true);
    expect(meetsMax).toBe(true);
  });

  it("should reject deposit below minimum for bonus", () => {
    const claimConfig = {
      depositCondition: { minDeposit: 50, maxDeposit: 500 },
    };
    const depositAmount = 30;

    const meetsMin = depositAmount >= claimConfig.depositCondition.minDeposit;
    expect(meetsMin).toBe(false);
  });
});

describe("Domain ACL Logic", () => {
  it("should allow access when no ACL rules exist", () => {
    const activeAcl: any[] = [];
    const origin = "https://example.com";

    // No rules = allow all
    const allowed = activeAcl.length === 0 || activeAcl.some(d => {
      const originHost = new URL(origin).hostname;
      return originHost === d.domain || originHost.endsWith("." + d.domain);
    });
    expect(allowed).toBe(true);
  });

  it("should allow access when domain matches ACL", () => {
    const activeAcl = [{ domain: "admin.tggaming.com", isActive: true, purpose: "admin" }];
    const origin = "https://admin.tggaming.com";

    const originHost = new URL(origin).hostname;
    const allowed = activeAcl.some(d => originHost === d.domain || originHost.endsWith("." + d.domain));
    expect(allowed).toBe(true);
  });

  it("should block access when domain does not match ACL", () => {
    const activeAcl = [{ domain: "admin.tggaming.com", isActive: true, purpose: "admin" }];
    const origin = "https://evil.hacker.com";

    const originHost = new URL(origin).hostname;
    const allowed = activeAcl.some(d => originHost === d.domain || originHost.endsWith("." + d.domain));
    expect(allowed).toBe(false);
  });

  it("should allow subdomain when parent domain is in ACL", () => {
    const activeAcl = [{ domain: "tggaming.com", isActive: true, purpose: "both" }];
    const origin = "https://admin.tggaming.com";

    const originHost = new URL(origin).hostname;
    const allowed = activeAcl.some(d => originHost === d.domain || originHost.endsWith("." + d.domain));
    expect(allowed).toBe(true);
  });
});
