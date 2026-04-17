import { createHash } from "crypto";
import { and, count, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import {
  bonusConfigs,
  bonusLedger,
  depositCycles,
  deposits,
  playerBonuses,
  playerTags,
  players,
} from "../../drizzle/schema";

export type ClaimConfig = {
  startDate?: string;
  endDate?: string;
  ClaimTime?: { start: string; end: string };
  ClaimReset?: "daily" | "weekly" | "monthly" | "none";
  ClaimLimit?: number;
  minDeposit?: number;
  maxDeposit?: number;
  creditLessThan?: number;
  depositTarget?: number;
  consecutiveDepositDays?: number;
  vipLevelMin?: number;
  vipLevelMax?: number;
  requireKyc?: boolean;
  excludeTags?: string[];
  displayAngpaoText?: string;
  showIfAmount?: boolean;
  maxBonus?: number;
};

const claimConfigSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  ClaimTime: z
    .object({
      start: z.string().regex(/^\d{2}:\d{2}$/),
      end: z.string().regex(/^\d{2}:\d{2}$/),
    })
    .optional(),
  ClaimReset: z.enum(["daily", "weekly", "monthly", "none"]).optional(),
  ClaimLimit: z.number().int().positive().optional(),
  minDeposit: z.number().nonnegative().optional(),
  maxDeposit: z.number().nonnegative().optional(),
  creditLessThan: z.number().nonnegative().optional(),
  depositTarget: z.number().int().nonnegative().optional(),
  consecutiveDepositDays: z.number().int().nonnegative().optional(),
  vipLevelMin: z.number().int().nonnegative().optional(),
  vipLevelMax: z.number().int().nonnegative().optional(),
  requireKyc: z.boolean().optional(),
  excludeTags: z.array(z.string()).optional(),
  displayAngpaoText: z.string().optional(),
  showIfAmount: z.boolean().optional(),
  maxBonus: z.number().nonnegative().optional(),
});

export type ValidationResult = {
  valid: boolean;
  reasonCode?: string;
  failReason?: string;
};

type ClaimBonusOptions = {
  idempotencyKey?: string;
  sourceEvent?: string;
  sourceRef?: string;
  requestSource?: string;
  requestMeta?: Record<string, unknown>;
};

const MONEY_SCALE = 4;

function roundMoney(value: number, scale: number = MONEY_SCALE): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** scale;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function parseNumber(v: unknown): number {
  const num = Number(v);
  return Number.isFinite(num) ? num : 0;
}

function normalizeClaimConfig(raw: unknown): ClaimConfig {
  const parsed = claimConfigSchema.safeParse(raw ?? {});
  if (parsed.success) return parsed.data;
  return {};
}

function getClaimWindowStart(now: Date, reset: ClaimConfig["ClaimReset"]): Date | undefined {
  switch (reset) {
    case "daily":
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    case "weekly": {
      const day = now.getUTCDay();
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
    }
    case "monthly":
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    default:
      return undefined;
  }
}

function getClaimPeriodKey(reset: ClaimConfig["ClaimReset"], now: Date): string {
  switch (reset) {
    case "daily":
      return `daily:${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
    case "weekly": {
      const day = now.getUTCDay();
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
      return `weekly:${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}-${String(start.getUTCDate()).padStart(2, "0")}`;
    }
    case "monthly":
      return `monthly:${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    default:
      return "none";
  }
}

function normalizeIdempotencyKey(
  playerId: number,
  adminId: number,
  bonusConfigId: number,
  key?: string
): string {
  const trimmed = String(key || "").trim();
  if (trimmed) return trimmed.slice(0, 128);
  return `auto:${adminId}:${playerId}:${bonusConfigId}:${Date.now()}`;
}

function seededFraction(seed: string): number {
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 13);
  const max = 0x1fffffffffffff;
  const parsed = Number.parseInt(hex, 16);
  return Number.isFinite(parsed) ? parsed / max : Math.random();
}

function isDuplicateKeyError(err: any): boolean {
  return err?.code === "ER_DUP_ENTRY" || Number(err?.errno) === 1062;
}

async function insertLedger(
  dbConn: any,
  params: {
    adminId: number;
    playerId: number;
    bonusConfigId: number;
    playerBonusId?: number | null;
    eventType: "claim_attempt" | "claim_awarded" | "claim_rejected" | "claim_duplicate";
    status: "success" | "failed";
    idempotencyKey?: string;
    claimPeriodKey?: string;
    ruleVersion?: number;
    requestSource?: string;
    reasonCode?: string;
    message?: string;
    inputSnapshot?: unknown;
    outputSnapshot?: unknown;
  }
) {
  try {
    await dbConn.insert(bonusLedger).values({
      adminId: params.adminId,
      playerId: params.playerId,
      bonusConfigId: params.bonusConfigId,
      playerBonusId: params.playerBonusId || null,
      eventType: params.eventType,
      status: params.status,
      idempotencyKey: params.idempotencyKey || null,
      claimPeriodKey: params.claimPeriodKey || null,
      ruleVersion: params.ruleVersion || null,
      requestSource: params.requestSource || null,
      reasonCode: params.reasonCode || null,
      message: params.message || null,
      inputSnapshot: (params.inputSnapshot as any) || null,
      outputSnapshot: (params.outputSnapshot as any) || null,
    });
  } catch (err: any) {
    // Keep bonus flow resilient even when ledger migration is pending.
    console.warn("[Bonus] Failed to write bonus_ledger:", err?.message || err);
  }
}

export function validateTime(config: ClaimConfig, now: Date = new Date()): ValidationResult {
  if (config.startDate && new Date(config.startDate) > now) {
    return { valid: false, reasonCode: "BONUS_NOT_STARTED", failReason: "Bonus has not started yet" };
  }

  if (config.endDate && new Date(config.endDate) < now) {
    return { valid: false, reasonCode: "BONUS_EXPIRED", failReason: "Bonus has expired" };
  }

  if (config.ClaimTime) {
    const currentTime = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;
    if (currentTime < config.ClaimTime.start || currentTime > config.ClaimTime.end) {
      return {
        valid: false,
        reasonCode: "CLAIM_TIME_LOCKED",
        failReason: `Bonus can only be claimed between ${config.ClaimTime.start} and ${config.ClaimTime.end} UTC`,
      };
    }
  }

  return { valid: true };
}

export async function validateClaimLimit(
  playerId: number,
  bonusConfigId: number,
  config: ClaimConfig,
  now: Date = new Date()
): Promise<ValidationResult> {
  const effectiveClaimLimit =
    config.ClaimLimit && config.ClaimLimit > 0
      ? config.ClaimLimit
      : (config.ClaimReset && config.ClaimReset !== "none" ? 1 : undefined);
  if (!effectiveClaimLimit) return { valid: true };

  const db = await getDb();
  if (!db) return { valid: false, reasonCode: "DB_UNAVAILABLE", failReason: "Database unavailable" };

  const startDate = getClaimWindowStart(now, config.ClaimReset);
  const rows = await db
    .select({ cnt: count() })
    .from(playerBonuses)
    .where(
      and(
        eq(playerBonuses.playerId, playerId),
        eq(playerBonuses.bonusConfigId, bonusConfigId),
        ...(startDate ? [gte(playerBonuses.claimedAt, startDate)] : [])
      )
    );

  const claimCount = Number(rows[0]?.cnt || 0);
  if (claimCount >= effectiveClaimLimit) {
    return {
      valid: false,
      reasonCode: "CLAIM_LIMIT_REACHED",
      failReason: `Claim limit reached (${claimCount}/${effectiveClaimLimit})`,
    };
  }
  return { valid: true };
}

export async function validateDeposit(
  playerId: number,
  adminId: number,
  config: ClaimConfig
): Promise<ValidationResult> {
  const db = await getDb();
  if (!db) return { valid: false, reasonCode: "DB_UNAVAILABLE", failReason: "Database unavailable" };

  const cycles = await db
    .select()
    .from(depositCycles)
    .where(and(eq(depositCycles.playerId, playerId), eq(depositCycles.status, "active")))
    .limit(1);
  const activeCycle = cycles[0];
  const hasDepositRequirement =
    config.minDeposit !== undefined ||
    config.maxDeposit !== undefined ||
    config.depositTarget !== undefined;
  if (!activeCycle && hasDepositRequirement) {
    return {
      valid: false,
      reasonCode: "NO_ACTIVE_CYCLE",
      failReason: "No active deposit cycle for deposit-related bonus conditions.",
    };
  }
  const depositAmt = activeCycle ? parseNumber(activeCycle.depositAmount) : 0;
  const currentBalance = activeCycle
    ? Math.max(
        0,
        parseNumber(activeCycle.depositAmount) +
          parseNumber(activeCycle.bonusAmount) -
          parseNumber(activeCycle.totalWithdrawn)
      )
    : 0;

  if (config.minDeposit !== undefined && depositAmt < config.minDeposit) {
    return {
      valid: false,
      reasonCode: "MIN_DEPOSIT_NOT_MET",
      failReason: `Minimum deposit required: ${config.minDeposit}, current: ${depositAmt}`,
    };
  }

  if (config.maxDeposit !== undefined && depositAmt > config.maxDeposit) {
    return {
      valid: false,
      reasonCode: "MAX_DEPOSIT_EXCEEDED",
      failReason: `Maximum deposit exceeded: ${config.maxDeposit}, current: ${depositAmt}`,
    };
  }

  if (config.creditLessThan !== undefined) {
    const threshold = Math.max(0, Number(config.creditLessThan) || 0);
    // Business rule: eligible only when current balance is strictly less than threshold.
    if (currentBalance + 1e-9 >= threshold) {
      return {
        valid: false,
        reasonCode: "CREDIT_TOO_HIGH",
        failReason: `Current balance ${currentBalance.toFixed(4)} must be less than ${threshold.toFixed(4)} to claim this bonus`,
      };
    }
  }

  if (config.depositTarget) {
    const depositCount = await db
      .select({ cnt: count() })
      .from(deposits)
      .where(and(eq(deposits.playerId, playerId), eq(deposits.adminId, adminId), eq(deposits.status, "approved")));
    const cnt = Number(depositCount[0]?.cnt || 0);
    if (cnt < config.depositTarget) {
      return {
        valid: false,
        reasonCode: "DEPOSIT_TARGET_NOT_MET",
        failReason: `Deposit target not met: ${cnt}/${config.depositTarget}`,
      };
    }
  }

  return { valid: true };
}

export async function validateEligibility(
  playerId: number,
  config: ClaimConfig
): Promise<ValidationResult> {
  const db = await getDb();
  if (!db) return { valid: false, reasonCode: "DB_UNAVAILABLE", failReason: "Database unavailable" };

  const playerRows = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  if (playerRows.length === 0) return { valid: false, reasonCode: "PLAYER_NOT_FOUND", failReason: "Player not found" };
  const player = playerRows[0];

  if (config.vipLevelMin !== undefined && player.vipLevel < config.vipLevelMin) {
    return {
      valid: false,
      reasonCode: "VIP_TOO_LOW",
      failReason: `VIP level too low: ${player.vipLevel} < ${config.vipLevelMin}`,
    };
  }

  if (config.vipLevelMax !== undefined && player.vipLevel > config.vipLevelMax) {
    return {
      valid: false,
      reasonCode: "VIP_TOO_HIGH",
      failReason: `VIP level too high: ${player.vipLevel} > ${config.vipLevelMax}`,
    };
  }

  if (config.requireKyc && !player.kycVerified) {
    return { valid: false, reasonCode: "KYC_REQUIRED", failReason: "KYC verification required" };
  }

  if (config.excludeTags && config.excludeTags.length > 0) {
    const tags = await db
      .select()
      .from(playerTags)
      .where(eq(playerTags.playerId, playerId));
    const playerTagList = tags.map((t) => t.tag);
    const excluded = config.excludeTags.find((t) => playerTagList.includes(t));
    if (excluded) {
      return {
        valid: false,
        reasonCode: "TAG_EXCLUDED",
        failReason: `Player has excluded tag: ${excluded}`,
      };
    }
  }

  return { valid: true };
}

export async function validateGameLock(playerId: number): Promise<ValidationResult> {
  const db = await getDb();
  if (!db) return { valid: false, reasonCode: "DB_UNAVAILABLE", failReason: "Database unavailable" };

  const cycles = await db
    .select()
    .from(depositCycles)
    .where(and(eq(depositCycles.playerId, playerId), eq(depositCycles.status, "active")))
    .limit(1);

  if (cycles.length > 0 && cycles[0].hasEnteredGame) {
    return {
      valid: false,
      reasonCode: "GAME_ALREADY_ENTERED",
      failReason: "Cannot claim bonus after entering a game in this deposit cycle",
    };
  }
  return { valid: true };
}

async function validateBonusClaimWithConfig(
  playerId: number,
  adminId: number,
  bonusConfigId: number,
  claimConfig: ClaimConfig,
  bonusActive: boolean,
  now: Date
): Promise<ValidationResult> {
  if (!bonusActive) return { valid: false, reasonCode: "BONUS_INACTIVE", failReason: "Bonus is not active" };

  // Safety rule: keep at most one active bonus execution per player.
  const db = await getDb();
  if (!db) return { valid: false, reasonCode: "DB_UNAVAILABLE", failReason: "Database unavailable" };
  const activeRows = await db
    .select({ cnt: count() })
    .from(playerBonuses)
    .where(
      and(
        eq(playerBonuses.playerId, playerId),
        eq(playerBonuses.adminId, adminId),
        eq(playerBonuses.status, "active")
      )
    );
  const activeCount = Number(activeRows[0]?.cnt || 0);
  if (activeCount > 0) {
    return {
      valid: false,
      reasonCode: "ACTIVE_BONUS_EXISTS",
      failReason: "You already have an active bonus. Complete or forfeit it before claiming another one.",
    };
  }

  const timeResult = validateTime(claimConfig, now);
  if (!timeResult.valid) return timeResult;

  const claimResult = await validateClaimLimit(playerId, bonusConfigId, claimConfig, now);
  if (!claimResult.valid) return claimResult;

  const depositResult = await validateDeposit(playerId, adminId, claimConfig);
  if (!depositResult.valid) return depositResult;

  const eligibilityResult = await validateEligibility(playerId, claimConfig);
  if (!eligibilityResult.valid) return eligibilityResult;

  const gameLockResult = await validateGameLock(playerId);
  if (!gameLockResult.valid) return gameLockResult;

  return { valid: true };
}

export async function validateBonusClaim(
  playerId: number,
  adminId: number,
  bonusConfigId: number
): Promise<ValidationResult> {
  const db = await getDb();
  if (!db) return { valid: false, reasonCode: "DB_UNAVAILABLE", failReason: "Database unavailable" };

  const configs = await db
    .select()
    .from(bonusConfigs)
    .where(and(eq(bonusConfigs.id, bonusConfigId), eq(bonusConfigs.adminId, adminId)))
    .limit(1);
  if (configs.length === 0) return { valid: false, reasonCode: "BONUS_NOT_FOUND", failReason: "Bonus not found" };
  const bonus = configs[0];
  const claimConfig = normalizeClaimConfig(bonus.claimConfig);

  return validateBonusClaimWithConfig(
    playerId,
    adminId,
    bonusConfigId,
    claimConfig,
    Boolean(bonus.isActive),
    new Date()
  );
}

export function calculateBonusAmount(
  bonusType: number,
  depositAmount: number,
  fixedAmount?: string | null,
  percentage?: string | null,
  randomMin?: string | null,
  randomMax?: string | null,
  opts?: { seed?: string; maxBonus?: number }
): number {
  let amount = 0;
  switch (bonusType) {
    case 0:
      amount = parseNumber(fixedAmount);
      break;
    case 1:
      amount = depositAmount * (parseNumber(percentage) / 100);
      break;
    case 2: {
      const min = parseNumber(randomMin);
      const max = parseNumber(randomMax);
      const low = Math.min(min, max);
      const high = Math.max(min, max);
      const ratio = opts?.seed ? seededFraction(opts.seed) : Math.random();
      amount = low + (high - low) * ratio;
      break;
    }
    default:
      amount = 0;
  }

  if (opts?.maxBonus !== undefined) {
    amount = Math.min(amount, Math.max(0, opts.maxBonus));
  }
  return roundMoney(Math.max(0, amount));
}

export async function claimBonus(
  playerId: number,
  adminId: number,
  bonusConfigId: number,
  currentDepositAmount: number,
  options: ClaimBonusOptions = {}
): Promise<{ success: boolean; awardedAmount?: number; duplicate?: boolean; reasonCode?: string; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, reasonCode: "DB_UNAVAILABLE", error: "Database unavailable" };

  const now = new Date();
  const idempotencyKey = normalizeIdempotencyKey(playerId, adminId, bonusConfigId, options.idempotencyKey);

  const [bonus] = await db
    .select()
    .from(bonusConfigs)
    .where(and(eq(bonusConfigs.id, bonusConfigId), eq(bonusConfigs.adminId, adminId)))
    .limit(1);
  if (!bonus) return { success: false, reasonCode: "BONUS_NOT_FOUND", error: "Bonus not found" };

  const claimConfig = normalizeClaimConfig(bonus.claimConfig);
  const claimPeriodKey = getClaimPeriodKey(claimConfig.ClaimReset, now);
  const ruleVersion = Number((bonus as any).ruleVersion || 1);

  const existingRows = await db
    .select()
    .from(playerBonuses)
    .where(
      and(
        eq(playerBonuses.adminId, adminId),
        eq(playerBonuses.playerId, playerId),
        eq(playerBonuses.bonusConfigId, bonusConfigId),
        eq(playerBonuses.idempotencyKey, idempotencyKey)
      )
    )
    .limit(1);
  if (existingRows[0]) {
    await insertLedger(db, {
      adminId,
      playerId,
      bonusConfigId,
      playerBonusId: existingRows[0].id,
      eventType: "claim_duplicate",
      status: "success",
      idempotencyKey,
      claimPeriodKey,
      ruleVersion,
      requestSource: options.requestSource,
      reasonCode: "IDEMPOTENT_REPLAY",
      message: "Duplicate claim request returned existing result",
      outputSnapshot: {
        awardedAmount: parseNumber(existingRows[0].awardedAmount),
      },
    });
    return { success: true, awardedAmount: parseNumber(existingRows[0].awardedAmount), duplicate: true };
  }

  await insertLedger(db, {
    adminId,
    playerId,
    bonusConfigId,
    eventType: "claim_attempt",
    status: "success",
    idempotencyKey,
    claimPeriodKey,
    ruleVersion,
    requestSource: options.requestSource,
    inputSnapshot: {
      currentDepositAmount,
      sourceEvent: options.sourceEvent || "manual_claim",
      sourceRef: options.sourceRef || null,
      requestMeta: options.requestMeta || null,
    },
  });

  const validation = await validateBonusClaimWithConfig(
    playerId,
    adminId,
    bonusConfigId,
    claimConfig,
    Boolean(bonus.isActive),
    now
  );
  if (!validation.valid) {
    await insertLedger(db, {
      adminId,
      playerId,
      bonusConfigId,
      eventType: "claim_rejected",
      status: "failed",
      idempotencyKey,
      claimPeriodKey,
      ruleVersion,
      requestSource: options.requestSource,
      reasonCode: validation.reasonCode,
      message: validation.failReason,
    });
    return { success: false, reasonCode: validation.reasonCode, error: validation.failReason || "Bonus claim blocked" };
  }

  const cycles = await db
    .select()
    .from(depositCycles)
    .where(and(eq(depositCycles.playerId, playerId), eq(depositCycles.status, "active")))
    .limit(1);
  const cycle = cycles[0];
  const cycleId = cycle?.id || null;

  const amount = calculateBonusAmount(
    bonus.bonusType,
    currentDepositAmount,
    bonus.fixedAmount,
    bonus.percentage,
    bonus.randomMin,
    bonus.randomMax,
    { seed: idempotencyKey, maxBonus: claimConfig.maxBonus }
  );
  if (amount <= 0) {
    await insertLedger(db, {
      adminId,
      playerId,
      bonusConfigId,
      eventType: "claim_rejected",
      status: "failed",
      idempotencyKey,
      claimPeriodKey,
      ruleVersion,
      requestSource: options.requestSource,
      reasonCode: "BONUS_AMOUNT_ZERO",
      message: "Bonus amount is zero",
    });
    return { success: false, reasonCode: "BONUS_AMOUNT_ZERO", error: "Bonus amount is zero" };
  }

  const rolloverMultiplier = parseNumber(bonus.rolloverMultiplier);
  const turnoverMultiplier = parseNumber(bonus.turnoverTarget);
  const depositAmt = cycle ? parseNumber(cycle.depositAmount) : currentDepositAmount;
  const targetRollover = roundMoney((depositAmt + amount) * rolloverMultiplier);
  // turnoverTarget field is treated as multiplier (xN), same semantics as rollover.
  const targetTurnover = roundMoney((depositAmt + amount) * turnoverMultiplier);

  try {
    await db.transaction(async (tx) => {
      const inserted = await tx.insert(playerBonuses).values({
        playerId,
        adminId,
        bonusConfigId,
        cycleId: cycleId || undefined,
        idempotencyKey,
        claimPeriodKey,
        sourceEvent: (options.sourceEvent || "manual_claim").slice(0, 64),
        sourceRef: options.sourceRef ? options.sourceRef.slice(0, 128) : null,
        ruleVersion,
        claimMeta: {
          requestSource: options.requestSource || null,
          requestMeta: options.requestMeta || null,
        },
        awardedAmount: amount.toFixed(MONEY_SCALE),
        targetRollover: targetRollover.toFixed(MONEY_SCALE),
        currentRollover: "0",
        targetTurnover: targetTurnover.toFixed(MONEY_SCALE),
        currentTurnover: "0",
        status: "active",
      }).$returningId();

      const playerBonusId = inserted[0]?.id;
      let effectiveCycleId = cycleId;
      if (!effectiveCycleId) {
        const newCycleRows = await tx
          .insert(depositCycles)
          .values({
            playerId,
            adminId,
            status: "active",
            depositAmount: "0",
            bonusAmount: amount.toFixed(MONEY_SCALE),
            totalWithdrawn: "0",
            hasEnteredGame: false,
            targetRollover: targetRollover.toFixed(MONEY_SCALE),
            currentRollover: "0",
            targetTurnover: targetTurnover.toFixed(MONEY_SCALE),
            currentTurnover: "0",
            rolloverMultiplierSnapshot: rolloverMultiplier.toFixed(4),
            turnoverMultiplierSnapshot: turnoverMultiplier.toFixed(4),
          })
          .$returningId();
        effectiveCycleId = newCycleRows[0]?.id || null;
        if (effectiveCycleId) {
          await tx
            .update(playerBonuses)
            .set({ cycleId: effectiveCycleId })
            .where(eq(playerBonuses.id, playerBonusId));
        }
      } else {
        await tx
          .update(depositCycles)
          .set({
            bonusAmount: sql`${depositCycles.bonusAmount} + ${amount.toFixed(MONEY_SCALE)}`,
            targetRollover: targetRollover.toFixed(MONEY_SCALE),
            targetTurnover: targetTurnover.toFixed(MONEY_SCALE),
          })
          .where(eq(depositCycles.id, effectiveCycleId));
      }

      await insertLedger(tx, {
        adminId,
        playerId,
        bonusConfigId,
        playerBonusId,
        eventType: "claim_awarded",
        status: "success",
        idempotencyKey,
        claimPeriodKey,
        ruleVersion,
        requestSource: options.requestSource,
        outputSnapshot: {
          awardedAmount: amount,
          targetRollover,
          targetTurnover,
          cycleId: effectiveCycleId,
        },
      });

      return { playerBonusId };
    });

    return { success: true, awardedAmount: amount, duplicate: false };
  } catch (err: any) {
    if (isDuplicateKeyError(err)) {
      const [row] = await db
        .select()
        .from(playerBonuses)
        .where(
          and(
            eq(playerBonuses.adminId, adminId),
            eq(playerBonuses.playerId, playerId),
            eq(playerBonuses.bonusConfigId, bonusConfigId),
            eq(playerBonuses.idempotencyKey, idempotencyKey)
          )
        )
        .limit(1);
      if (row) {
        await insertLedger(db, {
          adminId,
          playerId,
          bonusConfigId,
          playerBonusId: row.id,
          eventType: "claim_duplicate",
          status: "success",
          idempotencyKey,
          claimPeriodKey,
          ruleVersion,
          requestSource: options.requestSource,
          reasonCode: "IDEMPOTENT_REPLAY",
          message: "Duplicate claim was deduplicated by unique constraint",
        });
        return { success: true, awardedAmount: parseNumber(row.awardedAmount), duplicate: true };
      }
    }

    await insertLedger(db, {
      adminId,
      playerId,
      bonusConfigId,
      eventType: "claim_rejected",
      status: "failed",
      idempotencyKey,
      claimPeriodKey,
      ruleVersion,
      requestSource: options.requestSource,
      reasonCode: "CLAIM_TX_FAILED",
      message: err?.message || "Bonus claim transaction failed",
    });
    return { success: false, reasonCode: "CLAIM_TX_FAILED", error: err?.message || "Bonus claim failed" };
  }
}
