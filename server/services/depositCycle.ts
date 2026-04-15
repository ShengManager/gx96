import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../db";
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

  // Create a new deposit cycle
  const cycleResult = await db.insert(depositCycles).values({
    playerId: deposit.playerId,
    adminId: deposit.adminId,
    status: "active",
    depositAmount: deposit.amount,
    bonusAmount: "0",
    totalWithdrawn: "0",
    hasEnteredGame: false,
    targetRollover: "0",
    currentRollover: "0",
    targetTurnover: "0",
    currentTurnover: "0",
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

// ─── Check withdrawal conditions ───
export async function checkWithdrawalConditions(playerId: number): Promise<{
  canWithdraw: boolean;
  reason?: string;
  rolloverProgress?: { current: number; target: number; percentage: number };
  turnoverProgress?: { current: number; target: number; percentage: number };
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
  const targetRollover = parseFloat(cycle.targetRollover);
  const currentRollover = parseFloat(cycle.currentRollover);
  const targetTurnover = parseFloat(cycle.targetTurnover);
  const currentTurnover = parseFloat(cycle.currentTurnover);

  const rolloverMet = targetRollover <= 0 || currentRollover >= targetRollover;
  const turnoverMet = targetTurnover <= 0 || currentTurnover >= targetTurnover;

  const rolloverProgress = {
    current: currentRollover,
    target: targetRollover,
    percentage: targetRollover > 0 ? Math.min(100, (currentRollover / targetRollover) * 100) : 100,
  };

  const turnoverProgress = {
    current: currentTurnover,
    target: targetTurnover,
    percentage: targetTurnover > 0 ? Math.min(100, (currentTurnover / targetTurnover) * 100) : 100,
  };

  if (!rolloverMet) {
    return {
      canWithdraw: false,
      reason: `Rollover not met: ${currentRollover.toFixed(2)} / ${targetRollover.toFixed(2)}`,
      rolloverProgress,
      turnoverProgress,
    };
  }

  if (!turnoverMet) {
    return {
      canWithdraw: false,
      reason: `Turnover not met: ${currentTurnover.toFixed(2)} / ${targetTurnover.toFixed(2)}`,
      rolloverProgress,
      turnoverProgress,
    };
  }

  return { canWithdraw: true, rolloverProgress, turnoverProgress };
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
