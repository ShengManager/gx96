import { eq, and, gte, lte, sql, count } from "drizzle-orm";
import { getDb } from "../db";
import {
  bonusConfigs,
  playerBonuses,
  depositCycles,
  playerTags,
  players,
  deposits,
} from "../../drizzle/schema";

// ─── Types ───
export type ClaimConfig = {
  // Time controls
  startDate?: string; // ISO date
  endDate?: string; // ISO date
  ClaimTime?: { start: string; end: string }; // HH:mm format
  ClaimReset?: "daily" | "weekly" | "monthly" | "none";
  ClaimLimit?: number;

  // Deposit conditions
  minDeposit?: number;
  maxDeposit?: number;
  creditLessThan?: number;
  depositTarget?: number;
  consecutiveDepositDays?: number;

  // Player eligibility
  vipLevelMin?: number;
  vipLevelMax?: number;
  requireKyc?: boolean;
  excludeTags?: string[];

  // Display
  displayAngpaoText?: string;
  showIfAmount?: boolean;
};

export type ValidationResult = {
  valid: boolean;
  failReason?: string;
};

// ─── Time Validation ───
export function validateTime(config: ClaimConfig): ValidationResult {
  const now = new Date();

  if (config.startDate && new Date(config.startDate) > now) {
    return { valid: false, failReason: "Bonus has not started yet" };
  }

  if (config.endDate && new Date(config.endDate) < now) {
    return { valid: false, failReason: "Bonus has expired" };
  }

  if (config.ClaimTime) {
    const currentTime = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;
    if (currentTime < config.ClaimTime.start || currentTime > config.ClaimTime.end) {
      return { valid: false, failReason: `Bonus can only be claimed between ${config.ClaimTime.start} and ${config.ClaimTime.end} UTC` };
    }
  }

  return { valid: true };
}

// ─── Claim Limit Validation ───
export async function validateClaimLimit(
  playerId: number,
  bonusConfigId: number,
  config: ClaimConfig
): Promise<ValidationResult> {
  if (!config.ClaimLimit) return { valid: true };

  const db = await getDb();
  if (!db) return { valid: false, failReason: "Database unavailable" };

  let startDate: Date | undefined;
  const now = new Date();

  switch (config.ClaimReset) {
    case "daily":
      startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      break;
    case "weekly": {
      const day = now.getUTCDay();
      startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
      break;
    }
    case "monthly":
      startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      break;
    case "none":
    default:
      startDate = undefined;
  }

  let query = db
    .select({ cnt: count() })
    .from(playerBonuses)
    .where(
      and(
        eq(playerBonuses.playerId, playerId),
        eq(playerBonuses.bonusConfigId, bonusConfigId),
        ...(startDate ? [gte(playerBonuses.claimedAt, startDate)] : [])
      )
    );

  const rows = await query;
  const claimCount = rows[0]?.cnt || 0;

  if (claimCount >= config.ClaimLimit) {
    return { valid: false, failReason: `Claim limit reached (${claimCount}/${config.ClaimLimit})` };
  }

  return { valid: true };
}

// ─── Deposit Condition Validation ───
export async function validateDeposit(
  playerId: number,
  adminId: number,
  config: ClaimConfig
): Promise<ValidationResult> {
  const db = await getDb();
  if (!db) return { valid: false, failReason: "Database unavailable" };

  // Check active deposit cycle
  const cycles = await db
    .select()
    .from(depositCycles)
    .where(and(eq(depositCycles.playerId, playerId), eq(depositCycles.status, "active")))
    .limit(1);

  const activeCycle = cycles[0];

  if (config.minDeposit && activeCycle) {
    const depositAmt = parseFloat(activeCycle.depositAmount);
    if (depositAmt < config.minDeposit) {
      return { valid: false, failReason: `Minimum deposit required: ${config.minDeposit}, current: ${depositAmt}` };
    }
  }

  if (config.maxDeposit && activeCycle) {
    const depositAmt = parseFloat(activeCycle.depositAmount);
    if (depositAmt > config.maxDeposit) {
      return { valid: false, failReason: `Maximum deposit exceeded: ${config.maxDeposit}, current: ${depositAmt}` };
    }
  }

  if (config.creditLessThan !== undefined && activeCycle) {
    // This would need a balance check from Middlewave - simplified here
    // In production, pass the current balance as a parameter
  }

  if (config.depositTarget) {
    const depositCount = await db
      .select({ cnt: count() })
      .from(deposits)
      .where(and(eq(deposits.playerId, playerId), eq(deposits.adminId, adminId), eq(deposits.status, "approved")));
    const cnt = depositCount[0]?.cnt || 0;
    if (cnt < config.depositTarget) {
      return { valid: false, failReason: `Deposit target not met: ${cnt}/${config.depositTarget}` };
    }
  }

  return { valid: true };
}

// ─── Player Eligibility Validation ───
export async function validateEligibility(
  playerId: number,
  config: ClaimConfig
): Promise<ValidationResult> {
  const db = await getDb();
  if (!db) return { valid: false, failReason: "Database unavailable" };

  const playerRows = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  if (playerRows.length === 0) return { valid: false, failReason: "Player not found" };
  const player = playerRows[0];

  if (config.vipLevelMin !== undefined && player.vipLevel < config.vipLevelMin) {
    return { valid: false, failReason: `VIP level too low: ${player.vipLevel} < ${config.vipLevelMin}` };
  }

  if (config.vipLevelMax !== undefined && player.vipLevel > config.vipLevelMax) {
    return { valid: false, failReason: `VIP level too high: ${player.vipLevel} > ${config.vipLevelMax}` };
  }

  if (config.requireKyc && !player.kycVerified) {
    return { valid: false, failReason: "KYC verification required" };
  }

  if (config.excludeTags && config.excludeTags.length > 0) {
    const tags = await db
      .select()
      .from(playerTags)
      .where(eq(playerTags.playerId, playerId));
    const playerTagList = tags.map((t) => t.tag);
    const excluded = config.excludeTags.find((t) => playerTagList.includes(t));
    if (excluded) {
      return { valid: false, failReason: `Player has excluded tag: ${excluded}` };
    }
  }

  return { valid: true };
}

// ─── Game Lock Validation ───
export async function validateGameLock(playerId: number): Promise<ValidationResult> {
  const db = await getDb();
  if (!db) return { valid: false, failReason: "Database unavailable" };

  const cycles = await db
    .select()
    .from(depositCycles)
    .where(and(eq(depositCycles.playerId, playerId), eq(depositCycles.status, "active")))
    .limit(1);

  if (cycles.length > 0 && cycles[0].hasEnteredGame) {
    return { valid: false, failReason: "Cannot claim bonus after entering a game in this deposit cycle" };
  }

  return { valid: true };
}

// ─── Full Validation Pipeline ───
export async function validateBonusClaim(
  playerId: number,
  adminId: number,
  bonusConfigId: number
): Promise<ValidationResult> {
  const db = await getDb();
  if (!db) return { valid: false, failReason: "Database unavailable" };

  // Get bonus config
  const configs = await db
    .select()
    .from(bonusConfigs)
    .where(and(eq(bonusConfigs.id, bonusConfigId), eq(bonusConfigs.adminId, adminId)))
    .limit(1);

  if (configs.length === 0) return { valid: false, failReason: "Bonus not found" };
  const bonus = configs[0];

  if (!bonus.isActive) return { valid: false, failReason: "Bonus is not active" };

  const claimConfig: ClaimConfig = (bonus.claimConfig as ClaimConfig) || {};

  // 1. Time validation
  const timeResult = validateTime(claimConfig);
  if (!timeResult.valid) return timeResult;

  // 2. Claim limit validation
  const claimResult = await validateClaimLimit(playerId, bonusConfigId, claimConfig);
  if (!claimResult.valid) return claimResult;

  // 3. Deposit condition validation
  const depositResult = await validateDeposit(playerId, adminId, claimConfig);
  if (!depositResult.valid) return depositResult;

  // 4. Player eligibility validation
  const eligibilityResult = await validateEligibility(playerId, claimConfig);
  if (!eligibilityResult.valid) return eligibilityResult;

  // 5. Game lock validation
  const gameLockResult = await validateGameLock(playerId);
  if (!gameLockResult.valid) return gameLockResult;

  return { valid: true };
}

// ─── Calculate Bonus Amount ───
export function calculateBonusAmount(
  bonusType: number,
  depositAmount: number,
  fixedAmount?: string | null,
  percentage?: string | null,
  randomMin?: string | null,
  randomMax?: string | null
): number {
  switch (bonusType) {
    case 0: // Fixed
      return parseFloat(fixedAmount || "0");
    case 1: // Percentage
      return depositAmount * (parseFloat(percentage || "0") / 100);
    case 2: // Random
      const min = parseFloat(randomMin || "0");
      const max = parseFloat(randomMax || "0");
      return Math.round((Math.random() * (max - min) + min) * 100) / 100;
    default:
      return 0;
  }
}

// ─── Claim Bonus ───
export async function claimBonus(
  playerId: number,
  adminId: number,
  bonusConfigId: number,
  currentDepositAmount: number
): Promise<{ success: boolean; awardedAmount?: number; error?: string }> {
  // Validate first
  const validation = await validateBonusClaim(playerId, adminId, bonusConfigId);
  if (!validation.valid) {
    return { success: false, error: validation.failReason };
  }

  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  const configs = await db
    .select()
    .from(bonusConfigs)
    .where(eq(bonusConfigs.id, bonusConfigId))
    .limit(1);
  const bonus = configs[0];

  const amount = calculateBonusAmount(
    bonus.bonusType,
    currentDepositAmount,
    bonus.fixedAmount,
    bonus.percentage,
    bonus.randomMin,
    bonus.randomMax
  );

  // Get active cycle
  const cycles = await db
    .select()
    .from(depositCycles)
    .where(and(eq(depositCycles.playerId, playerId), eq(depositCycles.status, "active")))
    .limit(1);

  const cycleId = cycles[0]?.id || null;

  // Calculate rollover/turnover targets
  const rolloverMultiplier = parseFloat(bonus.rolloverMultiplier || "0");
  const depositAmt = cycles[0] ? parseFloat(cycles[0].depositAmount) : currentDepositAmount;
  const targetRollover = (depositAmt + amount) * rolloverMultiplier;
  const targetTurnover = parseFloat(bonus.turnoverTarget || "0");

  // Insert player bonus record
  await db.insert(playerBonuses).values({
    playerId,
    adminId,
    bonusConfigId,
    cycleId,
    awardedAmount: amount.toFixed(4),
    targetRollover: targetRollover.toFixed(4),
    currentRollover: "0",
    targetTurnover: targetTurnover.toFixed(4),
    currentTurnover: "0",
    status: "active",
  });

  // Update deposit cycle bonus amount and targets
  if (cycleId) {
    await db
      .update(depositCycles)
      .set({
        bonusAmount: sql`${depositCycles.bonusAmount} + ${amount.toFixed(4)}`,
        targetRollover: targetRollover.toFixed(4),
        targetTurnover: targetTurnover.toFixed(4),
      })
      .where(eq(depositCycles.id, cycleId));
  }

  return { success: true, awardedAmount: amount };
}
