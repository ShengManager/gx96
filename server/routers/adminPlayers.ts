import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { requireAdmin, checkPermission } from "../services/middleware";
import * as db from "../db";
import { getDb } from "../db";
import { players, playerTags, withdrawals, playerBonuses, depositCycles, banks } from "../../drizzle/schema";
import { eq, and, count } from "drizzle-orm";
import { generateAutoLoginToken } from "../services/auth";
import { createDeposit, approveDeposit, checkWithdrawalConditions } from "../services/depositCycle";

function calcWalletBalance(cycle: any): number {
  if (!cycle) return 0;
  return Math.max(
    0,
    parseFloat(cycle.depositAmount || "0") +
    parseFloat(cycle.bonusAmount || "0") -
    parseFloat(cycle.totalWithdrawn || "0")
  );
}

/**
 * Withdrawable should follow real-time provider credits when present.
 * Fall back to local cycle book only when provider total is unavailable.
 */
function withdrawableCeiling(book: number, providerTotal: number): number {
  const b = Math.max(0, book);
  const p = Math.max(0, providerTotal);
  return p > 0.0001 ? p : b;
}

async function kickPlayerFromProvidersWithBalance(adminId: number, player: any) {
  const { getMiddlewaveConfig, checkAllProviderBalances, kickPlayer } = await import("../services/middlewave");
  const config = await getMiddlewaveConfig(adminId);
  if (!config) return { kickedProviders: [], totalProviderBalance: 0 };

  const playerIdentity = player.middlewavePlayerId || String(player.id);
  const balances = await checkAllProviderBalances(config, playerIdentity);
  const withBalance = balances.filter((b) => (b.balance || 0) > 0);

  for (const row of withBalance) {
    const res = await kickPlayer(config, row.provider, playerIdentity);
    if (!res.success) {
      const errText = `${res.error || ""} ${res.message || ""}`.toLowerCase();
      const ignorable =
        errText.includes("not in game") ||
        errText.includes("not online") ||
        errText.includes("no session") ||
        errText.includes("already offline") ||
        errText.includes("session not found");
      if (ignorable) continue;
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Kick player failed on ${row.provider}: ${res.error || res.message || "unknown error"}`,
      });
    }
  }

  return {
    kickedProviders: withBalance.map((r) => r.provider),
    totalProviderBalance: withBalance.reduce((sum, r) => sum + (r.balance || 0), 0),
  };
}

async function withdrawAllProviderBalances(adminId: number, player: any): Promise<number> {
  const { getMiddlewaveConfig, checkAllProviderBalances, withdrawFromProvider } = await import("../services/middlewave");
  const config = await getMiddlewaveConfig(adminId);
  if (!config) return 0;

  const playerIdentity = player.middlewavePlayerId || String(player.id);
  const balances = await checkAllProviderBalances(config, playerIdentity);
  const withBalance = balances.filter((b) => (b.balance || 0) > 0);

  let recovered = 0;
  for (const row of withBalance) {
    const amount = Number((row.balance || 0).toFixed(4));
    if (amount <= 0) continue;
    const wd = await withdrawFromProvider(config, row.provider, playerIdentity, amount);
    if (!wd.success) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Provider withdrawal failed on ${row.provider}: ${wd.error || wd.message || "unknown error"}`,
      });
    }
    recovered += amount;
  }
  return recovered;
}

export const adminPlayersRouter = router({
  list: publicProcedure
    .input(z.object({
      token: z.string(),
      search: z.string().optional(),
      page: z.number().default(1),
      pageSize: z.number().default(20),
    }))
    .query(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "player", "view");
      return db.getPlayersByAdmin(admin.adminId!, {
        search: input.search,
        page: input.page,
        pageSize: input.pageSize,
      });
    }),

  invitedList: publicProcedure
    .input(
      z.object({
        token: z.string(),
        playerId: z.number(),
        page: z.number().default(1),
        pageSize: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "player", "view");
      const player = await db.getPlayerById(input.playerId);
      if (!player || player.adminId !== admin.adminId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Player not found" });
      }
      return db.getInvitedPlayersPage(admin.adminId!, input.playerId, input.page, input.pageSize);
    }),

  detail: publicProcedure
    .input(z.object({ token: z.string(), playerId: z.number() }))
    .query(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "player", "view");

      const player = await db.getPlayerById(input.playerId);
      if (!player || player.adminId !== admin.adminId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Player not found" });
      }
      const database = await getDb();
      const invitedCountRows = database
        ? await database
            .select({ cnt: count() })
            .from(players)
            .where(and(eq(players.adminId, admin.adminId!), eq(players.invitedBy, player.id)))
        : [{ cnt: 0 }];
      const invitedCount = Number(invitedCountRows[0]?.cnt || 0);

      const [tags, depositHistory, withdrawHistory, bonuses, gameLogs, activeCycle, depositBanks, withdrawBanks, withdrawalCheck, telegramBots] = await Promise.all([
        db.getPlayerTags(input.playerId),
        db.getDepositsByPlayer(input.playerId),
        db.getWithdrawalsByPlayer(input.playerId),
        db.getPlayerBonuses(input.playerId),
        db.getGameLogsByPlayer(input.playerId, { page: 1, pageSize: 50 }),
        db.getActiveCycle(input.playerId),
        db.getDepositBanks(admin.adminId!),
        db.getWithdrawBanks(admin.adminId!),
        checkWithdrawalConditions(input.playerId),
        db.getTelegramBotsByAdmin(admin.adminId!),
      ]);
      const { getMiddlewaveConfig, checkAllProviderBalances, queryGameLogs } = await import("../services/middlewave");
      const config = await getMiddlewaveConfig(admin.adminId!);
      const localWalletBalance = calcWalletBalance(activeCycle);

      const playerIdentityCandidates = [
        player.middlewavePlayerId || "",
        String(player.id),
      ].filter(Boolean);

      let providerBalances: Array<{ provider: string; balance: number; error?: string }> = [];
      let providerBalanceTotal = 0;
      let providerBalanceError: string | null = null;
      let middlewaveGameLogs: Array<{
        provider?: string;
        gameCode?: string;
        gameName?: string;
        betAmount?: string;
        payout?: string;
        winLose?: string;
        transactionDate?: string;
        providerTranId?: string;
      }> = [];
      let middlewaveGameLogError: string | null = null;

      if (config) {
        for (const playerId of playerIdentityCandidates) {
          const balances = await checkAllProviderBalances(config, playerId);
          const hasAtLeastOneSuccess = balances.some((b) => !b.error);
          providerBalances = balances;
          providerBalanceTotal = balances.reduce((sum, b) => sum + (b.balance || 0), 0);
          try {
            const logsRes = await queryGameLogs(config, { playerId, page: 1, pageSize: 50 });
            if (logsRes.success) {
              middlewaveGameLogs = Array.isArray(logsRes.logs) ? logsRes.logs : [];
              middlewaveGameLogError = null;
            } else {
              middlewaveGameLogError = logsRes.error || logsRes.message || "Failed to load Middlewave game logs";
            }
          } catch (err: any) {
            middlewaveGameLogError = err?.message || "Failed to load Middlewave game logs";
          }
          if (hasAtLeastOneSuccess) break;
        }
      } else {
        providerBalanceError = "Middlewave not configured";
        middlewaveGameLogError = "Middlewave not configured";
      }

      if (config && providerBalances.length === 0) {
        providerBalanceError = "Unable to load provider balances";
      }
      const withdrawableMax = withdrawableCeiling(localWalletBalance, providerBalanceTotal);

      const activeBot = telegramBots.find((b: any) => b.isActive && b.botUsername) || telegramBots.find((b: any) => b.botUsername);
      const telegramBotUsername = String(activeBot?.botUsername || "").trim();
      const telegramInviteLink = telegramBotUsername && player.inviteCode
        ? `https://t.me/${telegramBotUsername}?start=${encodeURIComponent(player.inviteCode)}`
        : null;

      const invitedById = (player as { invitedBy?: number | null }).invitedBy;
      let inviter: { id: number; label: string } | null = null;
      if (typeof invitedById === "number" && invitedById > 0) {
        const labelMap = await db.getInviterLabelsForPlayerIds(admin.adminId!, [invitedById]);
        inviter = { id: invitedById, label: labelMap.get(invitedById) || `#${invitedById}` };
      }

      return {
        player,
        telegramBotUsername: telegramBotUsername || null,
        telegramInviteLink,
        invitedCount,
        inviter,
        tags,
        depositHistory,
        withdrawHistory,
        bonuses,
        gameLogs,
        activeCycle,
        depositBanks,
        withdrawBanks,
        walletBalance: withdrawableMax,
        localWalletBalance,
        providerBalances,
        providerBalanceTotal,
        middlewaveGameLogs,
        middlewaveGameLogError,
        overallCreditsTotal: withdrawableMax,
        providerBalanceError,
        withdrawalCheck,
      };
    }),

  middlewaveGameLogs: publicProcedure
    .input(z.object({
      token: z.string(),
      playerId: z.number(),
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(20),
      scope: z.enum(["all", "current_cycle"]).default("all"),
    }))
    .query(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "player", "view");

      const player = await db.getPlayerById(input.playerId);
      if (!player || player.adminId !== admin.adminId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Player not found" });
      }

      const { getMiddlewaveConfig, queryGameLogs } = await import("../services/middlewave");
      const config = await getMiddlewaveConfig(admin.adminId!);
      if (!config) {
        return { logs: [], total: 0, page: input.page, pageSize: input.pageSize, error: "Middlewave not configured" };
      }

      let startDate: string | undefined;
      let endDate: string | undefined;
      let scopedCycle: any = null;
      if (input.scope === "current_cycle") {
        scopedCycle = await db.getActiveCycle(player.id);
        if (!scopedCycle) {
          return { logs: [], total: 0, page: input.page, pageSize: input.pageSize, error: "No active deposit cycle" };
        }
        startDate = new Date(scopedCycle.createdAt).toISOString();
        if (scopedCycle.completedAt) endDate = new Date(scopedCycle.completedAt).toISOString();
      }

      const playerIdentityCandidates = [
        player.middlewavePlayerId || "",
        String(player.id),
      ].filter(Boolean);

      let chosen: any = null;
      let errorMsg = "Failed to load Middlewave game logs";
      for (const identity of playerIdentityCandidates) {
        try {
          const res = await queryGameLogs(config, {
            playerId: identity,
            startDate,
            endDate,
            page: input.page,
            pageSize: input.pageSize,
          });
          if (res.success) {
            chosen = res;
            break;
          }
          errorMsg = res.error || res.message || errorMsg;
        } catch (err: any) {
          errorMsg = err?.message || errorMsg;
        }
      }

      if (!chosen) {
        return { logs: [], total: 0, page: input.page, pageSize: input.pageSize, error: errorMsg };
      }

      const rawLogs = Array.isArray(chosen.logs) ? chosen.logs : [];
      const seen = new Set<string>();
      const deduped = rawLogs.filter((log: any) => {
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

      const includeTimelineMarkers = input.page === 1;
      const timelineEvents: any[] = [];
      const isForfeit = (note: string | null | undefined) =>
        String(note || "").toLowerCase().includes("forfeit");
      const isWithdrawStatusIncluded = (status: string | null | undefined) => {
        const s = String(status || "").toLowerCase();
        return s === "approved" || s === "completed" || s === "processing" || s === "pending";
      };

      if (includeTimelineMarkers) {
        const [allDeposits, allWithdrawals] = await Promise.all([
          db.getDepositsByPlayer(player.id),
          db.getWithdrawalsByPlayer(player.id),
        ]);

        if (input.scope === "current_cycle" && scopedCycle) {
          timelineEvents.push({
            entryType: "deposit",
            transactionDate: scopedCycle.createdAt,
            eventAmount: scopedCycle.depositAmount,
            gameName: "DEPOSIT",
            provider: "-",
            providerTranId: `deposit-cycle-${scopedCycle.id}`,
          });
          allWithdrawals
            .filter((w: any) => w.cycleId === scopedCycle.id && isForfeit(w.handleNote))
            .forEach((w: any) => {
              timelineEvents.push({
                entryType: "forfeited",
                transactionDate: w.createdAt,
                eventAmount: w.amount,
                gameName: "FORFEITED",
                provider: "-",
                providerTranId: `forfeit-${w.id}`,
                eventRef: `Order #${w.id}`,
              });
            });
          allWithdrawals
            .filter((w: any) => w.cycleId === scopedCycle.id && !isForfeit(w.handleNote) && isWithdrawStatusIncluded(w.status))
            .forEach((w: any) => {
              timelineEvents.push({
                entryType: "withdraw",
                transactionDate: w.createdAt,
                eventAmount: w.amount,
                gameName: "WITHDRAW",
                provider: "-",
                providerTranId: `withdraw-${w.id}`,
                eventRef: `Order #${w.id}`,
              });
            });
        } else if (input.scope === "all") {
          allDeposits
            .filter((d: any) => d.status === "approved")
            .forEach((d: any) => {
              timelineEvents.push({
                entryType: "deposit",
                transactionDate: d.createdAt,
                eventAmount: d.amount,
                gameName: "DEPOSIT",
                provider: "-",
                providerTranId: `deposit-${d.id}`,
                eventRef: `Order #${d.id}`,
              });
            });
          allWithdrawals
            .filter((w: any) => isForfeit(w.handleNote))
            .forEach((w: any) => {
              timelineEvents.push({
                entryType: "forfeited",
                transactionDate: w.createdAt,
                eventAmount: w.amount,
                gameName: "FORFEITED",
                provider: "-",
                providerTranId: `forfeit-${w.id}`,
                eventRef: `Order #${w.id}`,
              });
            });
          allWithdrawals
            .filter((w: any) => !isForfeit(w.handleNote) && isWithdrawStatusIncluded(w.status))
            .forEach((w: any) => {
              timelineEvents.push({
                entryType: "withdraw",
                transactionDate: w.createdAt,
                eventAmount: w.amount,
                gameName: "WITHDRAW",
                provider: "-",
                providerTranId: `withdraw-${w.id}`,
                eventRef: `Order #${w.id}`,
              });
            });
        }
      }

      const mergedAsc = [...timelineEvents, ...deduped]
        .sort((a: any, b: any) => new Date(a.transactionDate || 0).getTime() - new Date(b.transactionDate || 0).getTime());
      let runningBalance = 0;
      const withRunning = mergedAsc.map((row: any) => {
        const entryType = String(row.entryType || "game");
        const markerAmount = Math.max(0, parseFloat(String(row.eventAmount || "0")) || 0);
        const winLose = parseFloat(String(row.winLose || "0")) || 0;
        let delta = 0;
        if (entryType === "deposit") delta = markerAmount;
        else if (entryType === "withdraw" || entryType === "forfeited") delta = -markerAmount;
        else delta = winLose;
        runningBalance += delta;
        return { ...row, balanceAfter: runningBalance };
      });
      const mergedLogs = withRunning.reverse();

      return {
        logs: mergedLogs,
        total: Number(chosen.total || deduped.length || 0) + timelineEvents.length,
        page: Number(chosen.page || input.page),
        pageSize: Number(chosen.pageSize || input.pageSize),
      };
    }),

  updateVipLevel: publicProcedure
    .input(z.object({ token: z.string(), playerId: z.number(), vipLevel: z.number().min(0) }))
    .mutation(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "player", "edit");

      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await database.update(players).set({ vipLevel: input.vipLevel }).where(and(eq(players.id, input.playerId), eq(players.adminId, admin.adminId!)));
      await db.createAdminLog({ adminId: admin.id, action: "update_vip", module: "player", targetId: input.playerId, targetType: "player", details: { vipLevel: input.vipLevel } });
      return { success: true };
    }),

  addTag: publicProcedure
    .input(z.object({ token: z.string(), playerId: z.number(), tag: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "player", "edit");

      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await database.insert(playerTags).values({ playerId: input.playerId, tag: input.tag });
      return { success: true };
    }),

  removeTag: publicProcedure
    .input(z.object({ token: z.string(), playerId: z.number(), tagId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "player", "delete");

      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await database.delete(playerTags).where(eq(playerTags.id, input.tagId));
      return { success: true };
    }),

  toggleActive: publicProcedure
    .input(z.object({ token: z.string(), playerId: z.number(), isActive: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "player", "edit");

      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await database.update(players).set({ isActive: input.isActive }).where(and(eq(players.id, input.playerId), eq(players.adminId, admin.adminId!)));
      await db.createAdminLog({ adminId: admin.id, action: input.isActive ? "activate_player" : "deactivate_player", module: "player", targetId: input.playerId, targetType: "player" });
      return { success: true };
    }),

  manualCredit: publicProcedure
    .input(z.object({
      token: z.string(),
      playerId: z.number(),
      amount: z.number().positive(),
      bankId: z.number(),
      note: z.string().max(255).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "deposit", "edit");

      const player = await db.getPlayerById(input.playerId);
      if (!player || player.adminId !== admin.adminId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Player not found" });
      }
      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const bankRows = await database
        .select()
        .from(banks)
        .where(and(eq(banks.id, input.bankId), eq(banks.adminId, admin.adminId!)))
        .limit(1);
      const selectedBank = bankRows[0];
      if (!selectedBank || selectedBank.status !== "active" || (selectedBank.usageType !== "deposit" && selectedBank.usageType !== "both")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selected deposit bank is invalid or inactive" });
      }

      const cycle = await db.getActiveCycle(player.id);
      const walletBalance = calcWalletBalance(cycle);
      const kickState = await kickPlayerFromProvidersWithBalance(admin.adminId!, player);
      const totalCreditsNow = Math.max(walletBalance, kickState.totalProviderBalance);
      if (totalCreditsNow > 0.0001) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Deposit allowed only when no credits remain (wallet+provider=${totalCreditsNow.toFixed(2)})`,
        });
      }

      const createRes = await createDeposit({
        playerId: player.id,
        adminId: admin.adminId!,
        amount: input.amount,
        paymentMethod: "api_payment",
        bankId: input.bankId,
        apiPaymentRef: `manual-credit-${Date.now()}`,
      });
      if (!createRes.success || !createRes.depositId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: createRes.error || "Failed to create deposit" });
      }

      const approveRes = await approveDeposit(createRes.depositId, admin.id, input.note || "Manual credit from admin player detail");
      if (!approveRes.success) {
        throw new TRPCError({ code: "BAD_REQUEST", message: approveRes.error || "Failed to approve deposit" });
      }

      await db.createAdminLog({
        adminId: admin.id,
        action: "manual_credit_player",
        module: "deposit",
        targetId: player.id,
        targetType: "player",
        details: {
          amount: input.amount,
          bankId: input.bankId,
          depositId: createRes.depositId,
          kickedProviders: kickState.kickedProviders,
          note: input.note || null,
        },
      });

      return { success: true, depositId: createRes.depositId };
    }),

  manualWithdraw: publicProcedure
    .input(z.object({
      token: z.string(),
      playerId: z.number(),
      amount: z.number().positive(),
      bankId: z.number(),
      note: z.string().max(255).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "withdraw", "edit");

      const player = await db.getPlayerById(input.playerId);
      if (!player || player.adminId !== admin.adminId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Player not found" });
      }

      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const bankRows = await database
        .select()
        .from(banks)
        .where(and(eq(banks.id, input.bankId), eq(banks.adminId, admin.adminId!)))
        .limit(1);
      const selectedBank = bankRows[0];
      if (!selectedBank || selectedBank.status !== "active" || (selectedBank.usageType !== "withdraw" && selectedBank.usageType !== "both")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selected withdraw bank is invalid or inactive" });
      }

      const cycle = await db.getActiveCycle(player.id);
      if (!cycle) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No active wallet cycle to withdraw from" });
      }
      const withdrawalCheck = await checkWithdrawalConditions(player.id);
      if (!withdrawalCheck.canWithdraw) {
        throw new TRPCError({ code: "BAD_REQUEST", message: withdrawalCheck.reason || "Withdrawal conditions not met" });
      }

      const walletBalance = calcWalletBalance(cycle);

      const { getMiddlewaveConfig, checkAllProviderBalances } = await import("../services/middlewave");
      const mwConfig = await getMiddlewaveConfig(admin.adminId!);
      let providerBalanceTotalForCap = 0;
      if (mwConfig) {
        const playerIdentityCandidates = [
          player.middlewavePlayerId || "",
          String(player.id),
        ].filter(Boolean);
        for (const playerId of playerIdentityCandidates) {
          const balances = await checkAllProviderBalances(mwConfig, playerId);
          const hasAtLeastOneSuccess = balances.some((b) => !b.error);
          providerBalanceTotalForCap = balances.reduce((sum, b) => sum + (b.balance || 0), 0);
          if (hasAtLeastOneSuccess) break;
        }
      }

      const withdrawableMax = withdrawableCeiling(walletBalance, providerBalanceTotalForCap);
      if (withdrawableMax <= 0.0001) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No credits to withdraw" });
      }
      if (input.amount > withdrawableMax + 0.0001) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Withdraw amount cannot exceed withdrawable balance (${withdrawableMax.toFixed(4)} MYR)`,
        });
      }

      const kickState = await kickPlayerFromProvidersWithBalance(admin.adminId!, player);
      await withdrawAllProviderBalances(admin.adminId!, player);

      const [wdRes] = await database.insert(withdrawals).values({
        playerId: player.id,
        adminId: admin.adminId!,
        cycleId: cycle.id,
        amount: input.amount.toFixed(4),
        bankName: selectedBank.bankName || null,
        bankAccountName: selectedBank.accountName || null,
        bankAccountNumber: selectedBank.accountNumber || null,
        status: "approved",
        handledBy: admin.id,
        handleNote: input.note || "Manual withdrawal from admin player detail",
        usedBonus: parseFloat(cycle.bonusAmount || "0") > 0,
        rolloverMet: true,
        turnoverMet: true,
        processedAt: new Date(),
      });

      const newTotalWithdrawn = parseFloat(cycle.totalWithdrawn || "0") + input.amount;
      const totalCycleAmount = parseFloat(cycle.depositAmount || "0") + parseFloat(cycle.bonusAmount || "0");
      const shouldComplete = newTotalWithdrawn >= totalCycleAmount;

      await database
        .update(depositCycles)
        .set({
          totalWithdrawn: newTotalWithdrawn.toFixed(4),
          ...(shouldComplete ? { status: "completed", completedAt: new Date() } : {}),
        })
        .where(eq(depositCycles.id, cycle.id));

      await db.createAdminLog({
        adminId: admin.id,
        action: "manual_withdraw_player",
        module: "withdraw",
        targetId: player.id,
        targetType: "player",
        details: {
          amount: input.amount,
          withdrawalId: wdRes.insertId,
          kickedProviders: kickState.kickedProviders,
          note: input.note || null,
        },
      });

      return { success: true, withdrawalId: wdRes.insertId };
    }),

  forfeitBonuses: publicProcedure
    .input(z.object({
      token: z.string(),
      playerId: z.number(),
      amount: z.number().positive(),
      note: z.string().max(255).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "bonus", "edit");

      const player = await db.getPlayerById(input.playerId);
      if (!player || player.adminId !== admin.adminId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Player not found" });
      }

      const cycle = await db.getActiveCycle(player.id);
      if (!cycle) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No active wallet cycle to forfeit" });
      }
      const walletBalance = calcWalletBalance(cycle);

      const { getMiddlewaveConfig, checkAllProviderBalances } = await import("../services/middlewave");
      const mwConfig = await getMiddlewaveConfig(admin.adminId!);
      let providerBalanceTotalForCap = 0;
      if (mwConfig) {
        const playerIdentityCandidates = [
          player.middlewavePlayerId || "",
          String(player.id),
        ].filter(Boolean);
        for (const playerId of playerIdentityCandidates) {
          const balances = await checkAllProviderBalances(mwConfig, playerId);
          const hasAtLeastOneSuccess = balances.some((b) => !b.error);
          providerBalanceTotalForCap = balances.reduce((sum, b) => sum + (b.balance || 0), 0);
          if (hasAtLeastOneSuccess) break;
        }
      }

      const withdrawableMax = withdrawableCeiling(walletBalance, providerBalanceTotalForCap);
      if (withdrawableMax <= 0.0001) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No credits to forfeit" });
      }
      if (input.amount > withdrawableMax + 0.0001) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Forfeited amount cannot exceed withdrawable balance (${withdrawableMax.toFixed(4)} MYR)`,
        });
      }
      const forfeitAmount = Math.max(0, Math.min(input.amount, withdrawableMax));
      const fullForfeitRequested = forfeitAmount + 0.0001 >= withdrawableMax;

      const kickState = await kickPlayerFromProvidersWithBalance(admin.adminId!, player);
      const recoveredProviderAmount = await withdrawAllProviderBalances(admin.adminId!, player);

      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const activeBonuses = await database
        .select()
        .from(playerBonuses)
        .where(
          and(
            eq(playerBonuses.playerId, player.id),
            eq(playerBonuses.adminId, admin.adminId!),
            eq(playerBonuses.status, "active"),
            eq(playerBonuses.cycleId, cycle.id)
          )
        );

      const forfeitedAmount = activeBonuses.reduce((sum, b) => sum + parseFloat(b.awardedAmount || "0"), 0);
      const currentBonusAmount = parseFloat(cycle.bonusAmount || "0");
      const nextBonusAmount = activeBonuses.length > 0
        ? Math.max(0, currentBonusAmount - forfeitedAmount)
        : currentBonusAmount;
      const cycleTotalAfterBonusAdjustment = Math.max(0, parseFloat(cycle.depositAmount || "0") + nextBonusAmount);
      const nextTotalWithdrawnRaw = parseFloat(cycle.totalWithdrawn || "0") + forfeitAmount;
      const shouldCompleteCycle = fullForfeitRequested || (nextTotalWithdrawnRaw + 0.0001 >= cycleTotalAfterBonusAdjustment);
      const finalTotalWithdrawn = shouldCompleteCycle ? cycleTotalAfterBonusAdjustment : nextTotalWithdrawnRaw;

      if (activeBonuses.length > 0) {
        await database
          .update(playerBonuses)
          .set({ status: "forfeited", completedAt: new Date() })
          .where(
            and(
              eq(playerBonuses.playerId, player.id),
              eq(playerBonuses.adminId, admin.adminId!),
              eq(playerBonuses.status, "active"),
              eq(playerBonuses.cycleId, cycle.id)
            )
          );
      }

      const [wdRes] = await database.insert(withdrawals).values({
        playerId: player.id,
        adminId: admin.adminId!,
        cycleId: cycle.id,
        amount: forfeitAmount.toFixed(4),
        bankName: player.bankName || null,
        bankAccountName: player.bankAccountName || null,
        bankAccountNumber: player.bankAccountNumber || null,
        status: "approved",
        handledBy: admin.id,
        handleNote: input.note || "Forfeited wallet balance from admin player detail",
        usedBonus: parseFloat(cycle.bonusAmount || "0") > 0,
        rolloverMet: true,
        turnoverMet: true,
        processedAt: new Date(),
      });

      await database
        .update(depositCycles)
        .set({
          totalWithdrawn: finalTotalWithdrawn.toFixed(4),
          ...(activeBonuses.length > 0 ? { bonusAmount: nextBonusAmount.toFixed(4) } : {}),
          ...(shouldCompleteCycle ? { status: "completed", completedAt: new Date() } : {}),
        })
        .where(eq(depositCycles.id, cycle.id));

      await db.createAdminLog({
        adminId: admin.id,
        action: "forfeit_player_bonus",
        module: "bonus",
        targetId: player.id,
        targetType: "player",
        details: {
          cycleId: cycle.id,
          forfeitedCount: activeBonuses.length,
          forfeitedAmount,
          inputAmount: input.amount,
          appliedAmount: forfeitAmount,
          fullForfeitRequested,
          shouldCompleteCycle,
          cycleTotalAfterBonusAdjustment,
          withdrawalId: wdRes.insertId,
          recoveredProviderAmount,
          kickedProviders: kickState.kickedProviders,
          note: input.note || null,
        },
      });

      return {
        success: true,
        forfeitedCount: activeBonuses.length,
        forfeitedAmount,
        inputAmount: input.amount,
        appliedAmount: forfeitAmount,
        completedCycle: shouldCompleteCycle,
        withdrawalId: wdRes.insertId,
        recoveredProviderAmount,
      };
    }),

  loginAsPlayer: publicProcedure
    .input(z.object({ token: z.string(), playerId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "player", "edit");

      const player = await db.getPlayerById(input.playerId);
      if (!player || player.adminId !== admin.adminId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Player not found" });
      }

      const autoLoginToken = generateAutoLoginToken(player.id, admin.adminId!);

      const acl = await db.getDomainAcl(admin.adminId!);
      const playerDomain = acl.find((d) => d.isActive && (d.purpose === "player" || d.purpose === "both"))?.domain;

      const origin = (ctx.req.headers.origin as string) || "";
      const isLocalOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
      const protocol = origin.startsWith("http://") ? "http" : "https";
      const loginPath = `/login?token=${encodeURIComponent(autoLoginToken)}`;
      // In local development, always keep navigation on localhost
      // so admin can test full flow without jumping to production domains.
      let loginUrl = loginPath;
      if (isLocalOrigin) {
        loginUrl = `${origin}${loginPath}`;
      } else if (playerDomain) {
        loginUrl = `${protocol}://${playerDomain}${loginPath}`;
      } else if (process.env.NODE_ENV === "development") {
        loginUrl = `http://localhost:3002${loginPath}`;
      }

      await db.createAdminLog({
        adminId: admin.id,
        action: "login_as_player",
        module: "player",
        targetId: player.id,
        targetType: "player",
      });

      return { success: true, loginUrl };
    }),

  // ─── Anomalous Credit Detection ───
  checkAllBalances: publicProcedure
    .input(z.object({ token: z.string(), playerId: z.number() }))
    .query(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "player", "view");

      const player = await db.getPlayerById(input.playerId);
      if (!player || player.adminId !== admin.adminId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Player not found" });
      }

      const { getMiddlewaveConfig, checkAllProviderBalances } = await import("../services/middlewave");
      const config = await getMiddlewaveConfig(admin.adminId!);
      if (!config) throw new TRPCError({ code: "BAD_REQUEST", message: "Middlewave not configured" });

      const playerIdentity = player.middlewavePlayerId || String(player.id);
      const balances = await checkAllProviderBalances(config, playerIdentity);
      const totalExternal = balances.reduce((sum, b) => sum + b.balance, 0);
      const anomalies = balances.filter(b => b.balance > 0);

      return {
        playerId: player.id,
        balances,
        totalExternalBalance: totalExternal,
        hasAnomaly: anomalies.length > 1, // credits spread across multiple providers
        anomalyProviders: anomalies.map(a => a.provider),
      };
    }),

  // ─── Batch Anomaly Scan (scan all active players) ───
  scanAnomalies: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "player", "view");

      const { getMiddlewaveConfig, checkBalance, SUPPORTED_PROVIDERS } = await import("../services/middlewave");
      const config = await getMiddlewaveConfig(admin.adminId!);
      if (!config) return { anomalies: [], scanned: 0 };

      const allPlayers = await db.getPlayersByAdmin(admin.adminId!, { page: 1, pageSize: 500 });
      const playerList = allPlayers.players || [];
      const anomalies: Array<{ playerId: number; phone: string; providers: Array<{ provider: string; balance: number }> }> = [];

      for (const p of playerList) {
        const providerBalances: Array<{ provider: string; balance: number }> = [];
        for (const prov of SUPPORTED_PROVIDERS) {
          try {
            const res = await checkBalance(config, prov, String(p.id));
            if (res.success && res.balance && res.balance > 0) {
              providerBalances.push({ provider: prov, balance: res.balance });
            }
          } catch { /* skip */ }
        }
        if (providerBalances.length > 1) {
          anomalies.push({ playerId: p.id, phone: p.phone || "", providers: providerBalances });
        }
      }

      return { anomalies, scanned: playerList.length };
    }),
});
