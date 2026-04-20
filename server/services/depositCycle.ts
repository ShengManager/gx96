import { eq, and, desc, count, sql, gte, lte } from "drizzle-orm";
import { getDb, getFinanceLimits, getSetting } from "../db";
import {
  deposits,
  withdrawals,
  depositCycles,
  playerBonuses,
  players,
  gameLogsCache,
  referralLedger,
  referralRules,
} from "../../drizzle/schema";

// ─── Check if player can create a new deposit ───
export async function canCreateDeposit(playerId: number): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  const db = await getDb();
  if (!db) return { allowed: false, reason: "Database unavailable" };

  // Check for pending/processing deposits
  const pendingDeposits = await db
    .select()
    .from(deposits)
    .where(
      and(
        eq(deposits.playerId, playerId),
        eq(deposits.status, "pending")
      )
    )
    .limit(1);

  if (pendingDeposits.length > 0) {
    return { allowed: false, reason: "You have a pending deposit. Please complete or cancel it first." };
  }

  const processingDeposits = await db
    .select()
    .from(deposits)
    .where(
      and(
        eq(deposits.playerId, playerId),
        eq(deposits.status, "processing")
      )
    )
    .limit(1);

  if (processingDeposits.length > 0) {
    return { allowed: false, reason: "Your deposit is being processed. Please wait." };
  }

  // Check for active deposit cycle (player still has credits or hasn't withdrawn all)
  const activeCycles = await db
    .select()
    .from(depositCycles)
    .where(
      and(
        eq(depositCycles.playerId, playerId),
        eq(depositCycles.status, "active")
      )
    )
    .limit(1);

  if (activeCycles.length > 0) {
    return {
      allowed: false,
      reason: "You have an active deposit cycle. Credits must be zero or fully withdrawn before a new deposit.",
    };
  }

  return { allowed: true };
}

// ─── Create a new deposit ───
export async function createDeposit(params: {
  playerId: number;
  adminId: number;
  amount: number;
  paymentMethod: "bank_transfer" | "api_payment";
  bankId?: number;
  receiptUrl?: string;
  apiPaymentRef?: string;
  apiPaymentUrl?: string;
}): Promise<{ success: boolean; depositId?: number; error?: string }> {
  const canDeposit = await canCreateDeposit(params.playerId);
  if (!canDeposit.allowed) {
    return { success: false, error: canDeposit.reason };
  }

  const limits = await getFinanceLimits(params.adminId);
  if (limits.minDeposit !== undefined && params.amount + 1e-9 < limits.minDeposit) {
    return { success: false, error: `Deposit amount must be at least ${limits.minDeposit.toFixed(2)}` };
  }
  if (limits.maxDeposit !== undefined && limits.maxDeposit > 0 && params.amount > limits.maxDeposit + 1e-9) {
    return { success: false, error: `Deposit amount cannot exceed ${limits.maxDeposit.toFixed(2)}` };
  }

  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  const result = await db.insert(deposits).values({
    playerId: params.playerId,
    adminId: params.adminId,
    amount: params.amount.toFixed(4),
    paymentMethod: params.paymentMethod,
    bankId: params.bankId || null,
    receiptUrl: params.receiptUrl || null,
    apiPaymentRef: params.apiPaymentRef || null,
    apiPaymentUrl: params.apiPaymentUrl || null,
    status: "pending",
  });

  return { success: true, depositId: result[0].insertId };
}

type ReferralRuleLite = {
  commissionEnabled: boolean;
  inviteRewardEnabled: boolean;
  inviteRewardThreshold: number;
  inviteRewardAmount: number;
  firstDepositRewardEnabled: boolean;
  firstDepositPercent: number;
  firstDepositMaxAmount: number;
  rebateEnabled: boolean;
  rebatePercent: number;
  rebateBase: "valid_bet" | "net_loss";
  rebateMinBase: number;
};

function toNum(value: unknown): number {
  const n = parseFloat(String(value ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

async function creditReferralReward(params: {
  adminId: number;
  inviterPlayerId: number;
  amount: number;
}) {
  const db = await getDb();
  if (!db) return false;
  const amount = Math.max(0, params.amount);
  if (!(amount > 0)) return false;
  const [activeCycle] = await db
    .select()
    .from(depositCycles)
    .where(
      and(
        eq(depositCycles.adminId, params.adminId),
        eq(depositCycles.playerId, params.inviterPlayerId),
        eq(depositCycles.status, "active")
      )
    )
    .orderBy(desc(depositCycles.createdAt))
    .limit(1);
  if (activeCycle) {
    await db
      .update(depositCycles)
      .set({
        bonusAmount: sql`${depositCycles.bonusAmount} + ${amount.toFixed(4)}`,
      })
      .where(eq(depositCycles.id, activeCycle.id));
    return true;
  }
  await db.insert(depositCycles).values({
    playerId: params.inviterPlayerId,
    adminId: params.adminId,
    status: "active",
    depositAmount: "0",
    bonusAmount: amount.toFixed(4),
    totalWithdrawn: "0",
    hasEnteredGame: false,
    targetRollover: "0",
    currentRollover: "0",
    targetTurnover: "0",
    currentTurnover: "0",
    rolloverMultiplierSnapshot: "0",
    turnoverMultiplierSnapshot: "0",
  });
  return true;
}

async function getReferralRuleLite(adminId: number): Promise<ReferralRuleLite | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(referralRules)
    .where(eq(referralRules.adminId, adminId))
    .limit(1);
  if (!row) return null;
  return {
    commissionEnabled: !!row.commissionEnabled,
    inviteRewardEnabled: !!row.inviteRewardEnabled,
    inviteRewardThreshold: Math.max(0, Number(row.inviteRewardThreshold || 0)),
    inviteRewardAmount: Math.max(0, toNum(row.inviteRewardAmount)),
    firstDepositRewardEnabled: !!row.firstDepositRewardEnabled,
    firstDepositPercent: Math.max(0, toNum(row.firstDepositPercent)),
    firstDepositMaxAmount: Math.max(0, toNum(row.firstDepositMaxAmount)),
    rebateEnabled: !!row.rebateEnabled,
    rebatePercent: Math.max(0, toNum(row.rebatePercent)),
    rebateBase: row.rebateBase === "net_loss" ? "net_loss" : "valid_bet",
    rebateMinBase: Math.max(0, toNum(row.rebateMinBase)),
  };
}

async function hasReferralLedgerKey(adminId: number, key: string) {
  const db = await getDb();
  if (!db) return false;
  const [row] = await db
    .select({ id: referralLedger.id })
    .from(referralLedger)
    .where(and(eq(referralLedger.adminId, adminId), eq(referralLedger.idempotencyKey, key)))
    .limit(1);
  return !!row;
}

async function awardReferralLedger(params: {
  adminId: number;
  inviterPlayerId: number;
  inviteePlayerId?: number | null;
  rewardType: "invite_milestone" | "first_deposit_commission" | "rebate";
  idempotencyKey: string;
  sourceDepositId?: number | null;
  periodDate?: string | null;
  baseAmount: number;
  rewardAmount: number;
  note?: string;
  extraMeta?: any;
}) {
  const db = await getDb();
  if (!db) return false;
  if (await hasReferralLedgerKey(params.adminId, params.idempotencyKey)) return false;
  const rewardAmount = Math.max(0, params.rewardAmount);
  if (!(rewardAmount > 0)) return false;
  const credited = await creditReferralReward({
    adminId: params.adminId,
    inviterPlayerId: params.inviterPlayerId,
    amount: rewardAmount,
  });
  if (!credited) return false;
  await db.insert(referralLedger).values({
    adminId: params.adminId,
    inviterPlayerId: params.inviterPlayerId,
    inviteePlayerId: params.inviteePlayerId || null,
    rewardType: params.rewardType,
    idempotencyKey: params.idempotencyKey.slice(0, 128),
    sourceDepositId: params.sourceDepositId || null,
    periodDate: params.periodDate || null,
    baseAmount: Math.max(0, params.baseAmount).toFixed(4),
    rewardAmount: rewardAmount.toFixed(4),
    note: params.note || null,
    extraMeta: params.extraMeta || null,
  });
  return true;
}

async function processReferralOnApprovedDeposit(deposit: any) {
  const db = await getDb();
  if (!db) return;
  const apiRef = String(deposit.apiPaymentRef || "").toLowerCase();
  if (apiRef.startsWith("manual-credit-") || apiRef.startsWith("referral-")) return;
  const rule = await getReferralRuleLite(deposit.adminId);
  if (!rule?.commissionEnabled) return;
  const [invitee] = await db
    .select({ id: players.id, invitedBy: players.invitedBy })
    .from(players)
    .where(and(eq(players.id, deposit.playerId), eq(players.adminId, deposit.adminId)))
    .limit(1);
  const inviterId = Number(invitee?.invitedBy || 0);
  if (!(inviterId > 0)) return;

  if (rule.firstDepositRewardEnabled && rule.firstDepositPercent > 0) {
    const [approvedCnt] = await db
      .select({ cnt: count() })
      .from(deposits)
      .where(
        and(
          eq(deposits.adminId, deposit.adminId),
          eq(deposits.playerId, deposit.playerId),
          eq(deposits.status, "approved"),
          sql`NOT (LOWER(COALESCE(${deposits.apiPaymentRef}, '')) LIKE 'referral-%')`,
          sql`NOT (LOWER(COALESCE(${deposits.apiPaymentRef}, '')) LIKE 'manual-credit-%')`
        )
      );
    const isFirstDeposit = Number(approvedCnt?.cnt || 0) === 1;
    if (isFirstDeposit) {
      const base = Math.max(0, toNum(deposit.amount));
      let reward = base * (rule.firstDepositPercent / 100);
      if (rule.firstDepositMaxAmount > 0) reward = Math.min(reward, rule.firstDepositMaxAmount);
      await awardReferralLedger({
        adminId: deposit.adminId,
        inviterPlayerId: inviterId,
        inviteePlayerId: deposit.playerId,
        rewardType: "first_deposit_commission",
        idempotencyKey: `ref:first-deposit:${deposit.id}`,
        sourceDepositId: deposit.id,
        baseAmount: base,
        rewardAmount: reward,
        note: "First deposit commission",
        extraMeta: { percent: rule.firstDepositPercent, cap: rule.firstDepositMaxAmount },
      });
    }
  }

  if (rule.inviteRewardEnabled && rule.inviteRewardThreshold > 0 && rule.inviteRewardAmount > 0) {
    const [inviteeCnt] = await db
      .select({ cnt: count() })
      .from(players)
      .where(and(eq(players.adminId, deposit.adminId), eq(players.invitedBy, inviterId)));
    const totalInvitees = Number(inviteeCnt?.cnt || 0);
    if (totalInvitees >= rule.inviteRewardThreshold) {
      await awardReferralLedger({
        adminId: deposit.adminId,
        inviterPlayerId: inviterId,
        rewardType: "invite_milestone",
        idempotencyKey: `ref:invite-threshold:${inviterId}:${rule.inviteRewardThreshold}`,
        baseAmount: totalInvitees,
        rewardAmount: rule.inviteRewardAmount,
        note: `Invite milestone reached (${rule.inviteRewardThreshold})`,
        extraMeta: { threshold: rule.inviteRewardThreshold, invitedCount: totalInvitees },
      });
    }
  }
}

// ─── Approve a deposit ───
export async function approveDeposit(
  depositId: number,
  handledBy: number,
  note?: string
): Promise<{ success: boolean; cycleId?: number; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  const depositRows = await db
    .select()
    .from(deposits)
    .where(eq(deposits.id, depositId))
    .limit(1);

  if (depositRows.length === 0) return { success: false, error: "Deposit not found" };
  const deposit = depositRows[0];

  if (deposit.status !== "pending" && deposit.status !== "processing") {
    return { success: false, error: `Cannot approve deposit with status: ${deposit.status}` };
  }

  // Apply default rollover/turnover settings for new cycle
  const rolloverMultiplierRaw = await getSetting(deposit.adminId, "default_rollover_multiplier");
  const turnoverTargetRaw = await getSetting(deposit.adminId, "default_turnover_target");
  const rolloverMultiplier = Math.max(0, parseFloat(rolloverMultiplierRaw || "0") || 0);
  const defaultTurnoverMultiplier = Math.max(0, parseFloat(turnoverTargetRaw || "0") || 0);
  const financeLimits = await getFinanceLimits(deposit.adminId);
  const depositAmountNum = Math.max(0, parseFloat(deposit.amount || "0") || 0);
  const targetRollover = depositAmountNum * rolloverMultiplier;
  const targetTurnover = depositAmountNum * defaultTurnoverMultiplier;

  // Create a new deposit cycle
  const cycleResult = await db.insert(depositCycles).values({
    playerId: deposit.playerId,
    adminId: deposit.adminId,
    status: "active",
    depositAmount: deposit.amount,
    bonusAmount: "0",
    totalWithdrawn: "0",
    hasEnteredGame: false,
    targetRollover: targetRollover.toFixed(4),
    currentRollover: "0",
    targetTurnover: targetTurnover.toFixed(4),
    currentTurnover: "0",
    rolloverMultiplierSnapshot: rolloverMultiplier.toFixed(4),
    turnoverMultiplierSnapshot: defaultTurnoverMultiplier.toFixed(4),
    minWithdrawSnapshot: financeLimits.minWithdraw?.toFixed(4) ?? null,
    maxWithdrawSnapshot: financeLimits.maxWithdraw?.toFixed(4) ?? null,
  });

  const cycleId = cycleResult[0].insertId;

  // Update deposit record
  await db
    .update(deposits)
    .set({
      status: "approved",
      cycleId,
      handledBy,
      handleNote: note || null,
      processedAt: new Date(),
    })
    .where(eq(deposits.id, depositId));

  await processReferralOnApprovedDeposit({ ...deposit, id: depositId });

  return { success: true, cycleId };
}

export async function settleDailyReferralRebate(params: {
  adminId: number;
  targetDate: string; // YYYY-MM-DD
}) {
  const db = await getDb();
  if (!db) return { success: false as const, settledRows: 0, totalAmount: 0, error: "Database unavailable" };
  const rule = await getReferralRuleLite(params.adminId);
  if (!rule?.rebateEnabled || !(rule.rebatePercent > 0)) {
    return { success: false as const, settledRows: 0, totalAmount: 0, error: "Rebate rule is disabled" };
  }
  const dateStart = new Date(`${params.targetDate}T00:00:00.000Z`);
  const dateEnd = new Date(`${params.targetDate}T23:59:59.999Z`);
  if (Number.isNaN(dateStart.getTime()) || Number.isNaN(dateEnd.getTime())) {
    return { success: false as const, settledRows: 0, totalAmount: 0, error: "Invalid target date" };
  }

  const rows = await db
    .select({
      inviteePlayerId: gameLogsCache.playerId,
      invitedBy: players.invitedBy,
      validBetSum: sql<string>`COALESCE(SUM(${gameLogsCache.validBet}), 0)`,
      winLoseSum: sql<string>`COALESCE(SUM(${gameLogsCache.winLose}), 0)`,
    })
    .from(gameLogsCache)
    .innerJoin(players, and(eq(players.id, gameLogsCache.playerId), eq(players.adminId, gameLogsCache.adminId)))
    .where(
      and(
        eq(gameLogsCache.adminId, params.adminId),
        gte(gameLogsCache.transactionDate, dateStart),
        lte(gameLogsCache.transactionDate, dateEnd),
        sql`${players.invitedBy} IS NOT NULL`
      )
    )
    .groupBy(gameLogsCache.playerId, players.invitedBy);

  let settledRows = 0;
  let totalAmount = 0;

  for (const row of rows) {
    const inviterId = Number(row.invitedBy || 0);
    const inviteeId = Number(row.inviteePlayerId || 0);
    if (!(inviterId > 0 && inviteeId > 0)) continue;
    const validBet = Math.max(0, toNum(row.validBetSum));
    const netLoss = Math.max(0, -toNum(row.winLoseSum));
    const base = rule.rebateBase === "net_loss" ? netLoss : validBet;
    if (base < rule.rebateMinBase) continue;
    const reward = Math.max(0, base * (rule.rebatePercent / 100));
    if (!(reward > 0)) continue;
    const idem = `ref:rebate:${params.targetDate}:${inviterId}:${inviteeId}:${rule.rebateBase}`;
    const created = await awardReferralLedger({
      adminId: params.adminId,
      inviterPlayerId: inviterId,
      inviteePlayerId: inviteeId,
      rewardType: "rebate",
      idempotencyKey: idem,
      periodDate: params.targetDate,
      baseAmount: base,
      rewardAmount: reward,
      note: `Daily rebate (${rule.rebateBase})`,
      extraMeta: {
        targetDate: params.targetDate,
        validBet,
        netLoss,
        rebatePercent: rule.rebatePercent,
      },
    });
    if (created) {
      settledRows += 1;
      totalAmount += reward;
    }
  }

  return { success: true as const, settledRows, totalAmount: Number(totalAmount.toFixed(4)) };
}

// ─── Reject a deposit ───
export async function rejectDeposit(
  depositId: number,
  handledBy: number,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  const depositRows = await db
    .select()
    .from(deposits)
    .where(eq(deposits.id, depositId))
    .limit(1);

  if (depositRows.length === 0) return { success: false, error: "Deposit not found" };
  if (depositRows[0].status !== "pending" && depositRows[0].status !== "processing") {
    return { success: false, error: `Cannot reject deposit with status: ${depositRows[0].status}` };
  }

  await db
    .update(deposits)
    .set({
      status: "rejected",
      handledBy,
      rejectionReason: reason,
      processedAt: new Date(),
    })
    .where(eq(deposits.id, depositId));

  return { success: true };
}

// ─── Handle deposit (mark as processing) ───
export async function handleDeposit(
  depositId: number,
  handledBy: number
): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  await db
    .update(deposits)
    .set({ status: "processing", handledBy })
    .where(eq(deposits.id, depositId));

  return { success: true };
}

async function syncActiveCycleProgressFromMiddlewave(params: {
  playerId: number;
  adminId: number;
  cycleId: number;
  cycleCreatedAt: Date;
}) {
  const db = await getDb();
  if (!db) return null;

  const playerRows = await db
    .select({
      id: players.id,
      middlewavePlayerId: players.middlewavePlayerId,
    })
    .from(players)
    .where(eq(players.id, params.playerId))
    .limit(1);

  if (playerRows.length === 0) return null;
  const player = playerRows[0];

  const { getMiddlewaveConfig, queryGameLogs } = await import("./middlewave");
  const config = await getMiddlewaveConfig(params.adminId);
  if (!config) return null;

  const playerIdentityCandidates = [
    player.middlewavePlayerId || "",
    String(player.id),
  ].filter(Boolean);

  let logs: any[] = [];
  for (const identity of playerIdentityCandidates) {
    try {
      let page = 1;
      let totalPages = 1;
      const pageSize = 100;
      const collected: any[] = [];
      do {
        const res = await queryGameLogs(config, {
          playerId: identity,
          startDate: new Date(params.cycleCreatedAt).toISOString(),
          page,
          pageSize,
        });
        if (!res.success) break;
        if (Array.isArray(res.logs)) collected.push(...res.logs);
        const total = Math.max(0, Number(res.total || 0));
        totalPages = total > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;
        page += 1;
      } while (page <= totalPages && page <= 3);

      if (collected.length > 0) {
        logs = collected;
        break;
      }
    } catch {
      // Ignore upstream errors here; we will keep existing cycle progress.
    }
  }

  if (logs.length === 0) return null;

  const seen = new Set<string>();
  const dedupedLogs = logs.filter((log: any) => {
    const key = [
      String(log.providerTranId || ""),
      String(log.transactionDate || ""),
      String(log.gameCode || ""),
      String(log.betAmount || ""),
      String(log.winLose || ""),
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  let rollover = 0;
  let turnover = 0;
  for (const row of dedupedLogs) {
    const validBet = Math.max(0, Number(row.validBet || 0));
    const positiveWinLose = Math.max(0, Number(row.winLose || 0));
    rollover += validBet;
    turnover += positiveWinLose;
  }

  await db
    .update(depositCycles)
    .set({
      currentRollover: rollover.toFixed(4),
      currentTurnover: turnover.toFixed(4),
      hasEnteredGame: true,
    })
    .where(eq(depositCycles.id, params.cycleId));

  return { currentRollover: rollover, currentTurnover: turnover };
}

export type CheckWithdrawalConditionsOpts = {
  /** Skip slow Middlewave game-log sync (admin UI loads MW separately). */
  skipExternalSync?: boolean;
  /** Skip per-provider balance probe (admin UI loads balances separately). */
  skipProviderProbe?: boolean;
};

// ─── Check withdrawal conditions ───
export async function checkWithdrawalConditions(
  playerId: number,
  opts?: CheckWithdrawalConditionsOpts
): Promise<{
  canWithdraw: boolean;
  reason?: string;
  hasEnteredGame?: boolean;
  rolloverMet?: boolean;
  turnoverMet?: boolean;
  rolloverProgress?: { current: number; target: number; percentage: number };
  turnoverProgress?: { current: number; target: number; percentage: number };
  rolloverMode?: "multiplier";
  turnoverMode?: "multiplier";
  rolloverMultiplier?: number;
  turnoverMultiplier?: number;
  turnoverConfiguredTarget?: number;
  walletBalance?: number;
  maxWithdrawable?: number;
  minWithdraw?: number;
  maxWithdrawSetting?: number;
}> {
  const db = await getDb();
  if (!db) return { canWithdraw: false, reason: "Database unavailable" };

  const cycles = await db
    .select()
    .from(depositCycles)
    .where(and(eq(depositCycles.playerId, playerId), eq(depositCycles.status, "active")))
    .limit(1);

  if (cycles.length === 0) {
    return { canWithdraw: false, reason: "No active deposit cycle" };
  }

  const cycle = cycles[0];
  const globalLimits = await getFinanceLimits(cycle.adminId);
  const baseAmountForRatio = Math.max(0, parseFloat(cycle.depositAmount || "0") + parseFloat(cycle.bonusAmount || "0"));
  const cycleTargetRolloverRaw = Math.max(0, parseFloat(cycle.targetRollover || "0"));
  const cycleTargetTurnoverRaw = Math.max(0, parseFloat(cycle.targetTurnover || "0"));
  const derivedRolloverMultiplier = baseAmountForRatio > 0 ? (cycleTargetRolloverRaw / baseAmountForRatio) : 0;
  const derivedTurnoverMultiplier = baseAmountForRatio > 0 ? (cycleTargetTurnoverRaw / baseAmountForRatio) : 0;
  if (
    cycle.minWithdrawSnapshot == null ||
    cycle.maxWithdrawSnapshot == null ||
    cycle.rolloverMultiplierSnapshot == null ||
    cycle.turnoverMultiplierSnapshot == null
  ) {
    await db
      .update(depositCycles)
      .set({
        minWithdrawSnapshot: cycle.minWithdrawSnapshot ?? (globalLimits.minWithdraw?.toFixed(4) ?? null),
        maxWithdrawSnapshot: cycle.maxWithdrawSnapshot ?? (globalLimits.maxWithdraw?.toFixed(4) ?? null),
        rolloverMultiplierSnapshot: cycle.rolloverMultiplierSnapshot ?? derivedRolloverMultiplier.toFixed(4),
        turnoverMultiplierSnapshot: cycle.turnoverMultiplierSnapshot ?? derivedTurnoverMultiplier.toFixed(4),
      })
      .where(eq(depositCycles.id, cycle.id));
  }
  const cycleRolloverMultiplier = cycle.rolloverMultiplierSnapshot != null
    ? Math.max(0, parseFloat(String(cycle.rolloverMultiplierSnapshot)) || 0)
    : derivedRolloverMultiplier;
  const cycleTurnoverMultiplier = cycle.turnoverMultiplierSnapshot != null
    ? Math.max(0, parseFloat(String(cycle.turnoverMultiplierSnapshot)) || 0)
    : derivedTurnoverMultiplier;

  const localWalletBalance = Math.max(
    0,
    parseFloat(cycle.depositAmount || "0") +
      parseFloat(cycle.bonusAmount || "0") -
      parseFloat(cycle.totalWithdrawn || "0")
  );

  // Freeze rules by cycle snapshot: settings changes after this deposit should not affect this active cycle.
  const cycleMinWithdraw = cycle.minWithdrawSnapshot != null
    ? Math.max(0, parseFloat(String(cycle.minWithdrawSnapshot)) || 0)
    : globalLimits.minWithdraw;
  const cycleMaxWithdraw = cycle.maxWithdrawSnapshot != null
    ? Math.max(0, parseFloat(String(cycle.maxWithdrawSnapshot)) || 0)
    : globalLimits.maxWithdraw;

  // Effective withdrawable should follow real-time provider credits when available.
  let providerTotal = 0;
  if (!opts?.skipProviderProbe) {
    try {
      const playerRows = await db
        .select({ middlewavePlayerId: players.middlewavePlayerId })
        .from(players)
        .where(eq(players.id, playerId))
        .limit(1);
      const middlewavePlayerId = String(playerRows[0]?.middlewavePlayerId || "").trim();
      const identity = middlewavePlayerId || String(playerId);
      if (identity) {
        const { getMiddlewaveConfig, checkAllProviderBalances } = await import("./middlewave");
        const cfg = await getMiddlewaveConfig(cycle.adminId);
        if (cfg) {
          const balances = await checkAllProviderBalances(cfg, identity);
          providerTotal = balances.reduce((sum, b) => sum + Math.max(0, Number(b.balance) || 0), 0);
        }
      }
    } catch {
      // Ignore provider probe failures and fall back to local cycle balance.
    }
  }
  const walletBalance = providerTotal > 0 ? providerTotal : localWalletBalance;
  const maxWithdrawable = walletBalance;

  const syncedProgress = opts?.skipExternalSync
    ? null
    : await syncActiveCycleProgressFromMiddlewave({
        playerId,
        adminId: cycle.adminId,
        cycleId: cycle.id,
        cycleCreatedAt: cycle.createdAt,
      });

  const cycleTargetRollover = parseFloat(cycle.targetRollover);
  const currentRollover = syncedProgress?.currentRollover ?? parseFloat(cycle.currentRollover);
  const cycleTargetTurnover = parseFloat(cycle.targetTurnover);
  const currentTurnover = syncedProgress?.currentTurnover ?? parseFloat(cycle.currentTurnover);
  // IMPORTANT: lock to this cycle's own snapshot rules (do not read live settings).
  // If historical rows have target=0, recover by snapshot multiplier.
  const targetRollover = cycleTargetRollover > 0
    ? cycleTargetRollover
    : Math.max(0, baseAmountForRatio * cycleRolloverMultiplier);
  const targetTurnover = cycleTargetTurnover > 0
    ? cycleTargetTurnover
    : Math.max(0, baseAmountForRatio * cycleTurnoverMultiplier);

  if ((cycleTargetRollover <= 0 && targetRollover > 0) || (cycleTargetTurnover <= 0 && targetTurnover > 0)) {
    await db
      .update(depositCycles)
      .set({
        targetRollover: targetRollover.toFixed(4),
        targetTurnover: targetTurnover.toFixed(4),
      })
      .where(eq(depositCycles.id, cycle.id));
  }

  const rolloverMet = targetRollover <= 0 || currentRollover >= targetRollover;
  const turnoverMet = targetTurnover <= 0 || currentTurnover >= targetTurnover;

  const rolloverProgress = {
    current: currentRollover,
    target: targetRollover,
    percentage:
      targetRollover > 0
        ? Math.min(100, (currentRollover / targetRollover) * 100)
        : cycle.hasEnteredGame
          ? 100
          : 0,
  };

  const turnoverProgress = {
    current: currentTurnover,
    target: targetTurnover,
    percentage:
      targetTurnover > 0
        ? Math.min(100, (currentTurnover / targetTurnover) * 100)
        : cycle.hasEnteredGame
          ? 100
          : 0,
  };

  const baseExtra = {
    hasEnteredGame: cycle.hasEnteredGame || !!syncedProgress,
    rolloverMet,
    turnoverMet,
    rolloverProgress,
    turnoverProgress,
    rolloverMode: "multiplier" as const,
    turnoverMode: "multiplier" as const,
    rolloverMultiplier: cycleRolloverMultiplier,
    turnoverMultiplier: cycleTurnoverMultiplier,
    turnoverConfiguredTarget: cycleTurnoverMultiplier,
    walletBalance,
    maxWithdrawable,
    minWithdraw: cycleMinWithdraw,
    maxWithdrawSetting: cycleMaxWithdraw,
  };

  const hasEnteredGame = cycle.hasEnteredGame || !!syncedProgress;
  if (!hasEnteredGame) {
    return {
      canWithdraw: false,
      reason: "Please enter a game first before withdrawal",
      ...baseExtra,
    };
  }

  if (!rolloverMet) {
    return {
      canWithdraw: false,
      reason: `Rollover not met: ${currentRollover.toFixed(2)} / ${targetRollover.toFixed(2)}`,
      ...baseExtra,
    };
  }

  if (!turnoverMet) {
    return {
      canWithdraw: false,
      reason: `Turnover not met: ${currentTurnover.toFixed(2)} / ${targetTurnover.toFixed(2)}`,
      ...baseExtra,
    };
  }

  if (cycleMinWithdraw !== undefined && walletBalance + 1e-9 < cycleMinWithdraw) {
    return {
      canWithdraw: false,
      reason: `Minimum withdrawal is ${cycleMinWithdraw.toFixed(2)} (your wallet balance is ${walletBalance.toFixed(2)})`,
      ...baseExtra,
    };
  }

  if (maxWithdrawable <= 0.0001) {
    return {
      canWithdraw: false,
      reason: "No withdrawable balance",
      ...baseExtra,
    };
  }

  return { canWithdraw: true, ...baseExtra };
}

// ─── Create a withdrawal ───
export async function createWithdrawal(params: {
  playerId: number;
  adminId: number;
  amount: number;
}): Promise<{ success: boolean; withdrawalId?: number; error?: string }> {
  // Double-check conditions server-side
  const conditions = await checkWithdrawalConditions(params.playerId);
  if (!conditions.canWithdraw) {
    return { success: false, error: conditions.reason };
  }

  if (conditions.minWithdraw !== undefined && params.amount + 1e-9 < conditions.minWithdraw) {
    return { success: false, error: `Withdrawal amount must be at least ${conditions.minWithdraw.toFixed(2)}` };
  }
  const maxW = conditions.maxWithdrawable ?? 0;
  if (params.amount > maxW + 1e-9) {
    return {
      success: false,
      error: `Amount exceeds maximum withdrawable (${maxW.toFixed(2)})`,
    };
  }

  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  // Get player bank info
  const playerRows = await db
    .select()
    .from(players)
    .where(eq(players.id, params.playerId))
    .limit(1);

  if (playerRows.length === 0) return { success: false, error: "Player not found" };
  const player = playerRows[0];

  // Get active cycle for bonus check
  const cycles = await db
    .select()
    .from(depositCycles)
    .where(and(eq(depositCycles.playerId, params.playerId), eq(depositCycles.status, "active")))
    .limit(1);

  const cycle = cycles[0];
  const usedBonus = cycle ? parseFloat(cycle.bonusAmount) > 0 : false;
  const rolloverMet = cycle ? parseFloat(cycle.currentRollover) >= parseFloat(cycle.targetRollover) : true;
  const turnoverMet = cycle ? parseFloat(cycle.currentTurnover) >= parseFloat(cycle.targetTurnover) : true;

  const result = await db.insert(withdrawals).values({
    playerId: params.playerId,
    adminId: params.adminId,
    cycleId: cycle?.id || null,
    amount: params.amount.toFixed(4),
    bankName: player.bankName,
    bankAccountName: player.bankAccountName,
    bankAccountNumber: player.bankAccountNumber,
    status: "pending",
    usedBonus,
    rolloverMet,
    turnoverMet,
  });

  return { success: true, withdrawalId: result[0].insertId };
}

// ─── Approve a withdrawal ───
export async function approveWithdrawal(
  withdrawalId: number,
  handledBy: number,
  note?: string
): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  const rows = await db
    .select()
    .from(withdrawals)
    .where(eq(withdrawals.id, withdrawalId))
    .limit(1);

  if (rows.length === 0) return { success: false, error: "Withdrawal not found" };
  const withdrawal = rows[0];

  if (withdrawal.status !== "pending" && withdrawal.status !== "processing") {
    return { success: false, error: `Cannot approve withdrawal with status: ${withdrawal.status}` };
  }

  await db
    .update(withdrawals)
    .set({
      status: "approved",
      handledBy,
      handleNote: note || null,
      processedAt: new Date(),
    })
    .where(eq(withdrawals.id, withdrawalId));

  // Update cycle total withdrawn
  if (withdrawal.cycleId) {
    const cycle = await db
      .select()
      .from(depositCycles)
      .where(eq(depositCycles.id, withdrawal.cycleId))
      .limit(1);

    if (cycle.length > 0) {
      const newTotal = parseFloat(cycle[0].totalWithdrawn) + parseFloat(withdrawal.amount);
      // Check if cycle should be completed (all funds withdrawn)
      const totalDeposit = parseFloat(cycle[0].depositAmount) + parseFloat(cycle[0].bonusAmount);
      const shouldComplete = newTotal >= totalDeposit;

      await db
        .update(depositCycles)
        .set({
          totalWithdrawn: newTotal.toFixed(4),
          ...(shouldComplete ? { status: "completed" as const, completedAt: new Date() } : {}),
        })
        .where(eq(depositCycles.id, withdrawal.cycleId));
    }
  }

  return { success: true };
}

// ─── Reject a withdrawal ───
export async function rejectWithdrawal(
  withdrawalId: number,
  handledBy: number,
  reason: string,
  pointsRecovered?: number
): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  await db
    .update(withdrawals)
    .set({
      status: "rejected",
      handledBy,
      rejectionReason: reason,
      pointsRecovered: pointsRecovered ? pointsRecovered.toFixed(4) : null,
      processedAt: new Date(),
    })
    .where(eq(withdrawals.id, withdrawalId));

  return { success: true };
}

// ─── Mark game entered in cycle ───
export async function markGameEntered(playerId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .update(depositCycles)
    .set({ hasEnteredGame: true })
    .where(and(eq(depositCycles.playerId, playerId), eq(depositCycles.status, "active")));
}

// ─── Complete cycle (when balance reaches zero) ───
export async function completeCycleIfEmpty(playerId: number, currentBalance: number): Promise<void> {
  if (currentBalance > 0) return;

  const db = await getDb();
  if (!db) return;

  await db
    .update(depositCycles)
    .set({ status: "completed", completedAt: new Date() })
    .where(and(eq(depositCycles.playerId, playerId), eq(depositCycles.status, "active")));
}
