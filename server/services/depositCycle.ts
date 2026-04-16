import { eq, and, desc } from "drizzle-orm";
import { getDb, getFinanceLimits, getSetting } from "../db";
import {
  deposits,
  withdrawals,
  depositCycles,
  playerBonuses,
  players,
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

  return { success: true, cycleId };
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
      } while (page <= totalPages && page <= 10);

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

// ─── Check withdrawal conditions ───
export async function checkWithdrawalConditions(playerId: number): Promise<{
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
  const walletBalance = providerTotal > 0 ? providerTotal : localWalletBalance;
  const maxWithdrawable = walletBalance;

  const syncedProgress = await syncActiveCycleProgressFromMiddlewave({
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
