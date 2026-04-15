import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { requirePlayer } from "../services/middleware";
import { refreshAccessToken } from "../services/auth";
import * as db from "../db";
import { getDb } from "../db";
import { players, deposits } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import {
  createDeposit,
  canCreateDeposit,
  checkWithdrawalConditions,
  createWithdrawal,
  markGameEntered,
} from "../services/depositCycle";
import { claimBonus, validateBonusClaim } from "../services/bonus";
import {
  getMiddlewaveConfig,
  checkBalance,
  loginGame,
  getGameList,
  checkAllProviderBalances,
} from "../services/middlewave";
import {
  notifyAdminNewDeposit,
  notifyAdminNewWithdrawal,
} from "../services/websocket";
import { storagePut } from "../storage";
import { nanoid } from "nanoid";

export const playerApiRouter = router({
  // ─── Auth ───
  me: publicProcedure.query(async ({ ctx }) => {
    const player = requirePlayer(ctx);
    const p = await db.getPlayerById(player.id);
    if (!p) throw new TRPCError({ code: "NOT_FOUND" });
    const cycle = await db.getActiveCycle(player.id);
    return { player: p, activeCycle: cycle };
  }),

  refresh: publicProcedure
    .input(z.object({ refreshToken: z.string() }))
    .mutation(async ({ input }) => {
      const result = await refreshAccessToken(input.refreshToken);
      if (!result.success) throw new TRPCError({ code: "UNAUTHORIZED", message: result.error });
      return { accessToken: result.accessToken!, refreshToken: result.refreshToken! };
    }),

  // ─── Balance ───
  balance: publicProcedure
    .input(z.object({ token: z.string(), provider: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const player = requirePlayer(ctx);
      const p = await db.getPlayerById(player.id);
      if (!p || !p.middlewavePlayerId) return { balance: 0, provider: input.provider || "main" };

      const config = await getMiddlewaveConfig(player.adminId!);
      if (!config) return { balance: 0, error: "Middlewave not configured" };

      if (input.provider) {
        const result = await checkBalance(config, input.provider, p.middlewavePlayerId);
        return { balance: result.balance || 0, provider: input.provider };
      }

      // Check all providers
      const balances = await checkAllProviderBalances(config, p.middlewavePlayerId);
      return { balances, total: balances.reduce((sum, b) => sum + b.balance, 0) };
    }),

  // ─── Games ───
  gameList: publicProcedure
    .input(z.object({ token: z.string(), provider: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const player = requirePlayer(ctx);
      const config = await getMiddlewaveConfig(player.adminId!);
      if (!config) return { games: [] };

      const result = await getGameList(config, input.provider);
      return { games: result.games || [] };
    }),

  launchGame: publicProcedure
    .input(z.object({
      token: z.string(),
      provider: z.string(),
      gameCode: z.string(),
      lang: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const player = requirePlayer(ctx);
      const p = await db.getPlayerById(player.id);
      if (!p || !p.middlewavePlayerId) throw new TRPCError({ code: "BAD_REQUEST", message: "Player not registered with game provider" });

      const config = await getMiddlewaveConfig(player.adminId!);
      if (!config) throw new TRPCError({ code: "BAD_REQUEST", message: "Middlewave not configured" });

      // Mark game entered in deposit cycle (locks bonus claiming)
      await markGameEntered(player.id);

      const result = await loginGame(config, input.provider, p.middlewavePlayerId, input.gameCode, input.lang);
      if (!result.success || !result.url) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.error || "Failed to launch game" });
      }

      return { url: result.url, gameType: result.gameType };
    }),

  // ─── Deposits ───
  depositCheck: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input, ctx }) => {
      const player = requirePlayer(ctx);
      const check = await canCreateDeposit(player.id);
      const banksList = await db.getDepositBanks(player.adminId!);
      const presets = await db.getDepositPresets(player.adminId!);
      return { ...check, banks: banksList, presets };
    }),

  createDeposit: publicProcedure
    .input(z.object({
      token: z.string(),
      amount: z.number().positive(),
      bankId: z.number(),
      receiptUrl: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const player = requirePlayer(ctx);
      const result = await createDeposit({
        playerId: player.id,
        adminId: player.adminId!,
        amount: input.amount,
        paymentMethod: "bank_transfer",
        bankId: input.bankId,
        receiptUrl: input.receiptUrl,
      });

      if (!result.success) throw new TRPCError({ code: "BAD_REQUEST", message: result.error });

      // Notify admin via WebSocket
      notifyAdminNewDeposit(player.adminId!, {
        depositId: result.depositId,
        playerId: player.id,
        amount: input.amount,
        status: "pending",
      });

      return result;
    }),

  uploadReceipt: publicProcedure
    .input(z.object({ token: z.string(), depositId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      // This endpoint expects multipart form data with the receipt file
      // The actual file upload is handled via a separate Express route
      // This just returns the upload URL pattern
      const player = requirePlayer(ctx);
      const key = `receipts/${player.adminId}/${player.id}/${input.depositId}-${nanoid(8)}`;
      return { uploadKey: key };
    }),

  cancelDeposit: publicProcedure
    .input(z.object({ token: z.string(), depositId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const player = requirePlayer(ctx);
      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await database.update(deposits)
        .set({ status: "cancelled" })
        .where(and(eq(deposits.id, input.depositId), eq(deposits.playerId, player.id), eq(deposits.status, "pending")));

      return { success: true };
    }),

  depositHistory: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input, ctx }) => {
      const player = requirePlayer(ctx);
      return db.getDepositsByPlayer(player.id);
    }),

  // ─── Withdrawals ───
  withdrawalCheck: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input, ctx }) => {
      const player = requirePlayer(ctx);
      return checkWithdrawalConditions(player.id);
    }),

  createWithdrawal: publicProcedure
    .input(z.object({ token: z.string(), amount: z.number().positive() }))
    .mutation(async ({ input, ctx }) => {
      const player = requirePlayer(ctx);
      const result = await createWithdrawal({
        playerId: player.id,
        adminId: player.adminId!,
        amount: input.amount,
      });

      if (!result.success) throw new TRPCError({ code: "BAD_REQUEST", message: result.error });

      notifyAdminNewWithdrawal(player.adminId!, {
        withdrawalId: result.withdrawalId,
        playerId: player.id,
        amount: input.amount,
        status: "pending",
      });

      return result;
    }),

  withdrawalHistory: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input, ctx }) => {
      const player = requirePlayer(ctx);
      return db.getWithdrawalsByPlayer(player.id);
    }),

  // ─── Bonus ───
  bonusList: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input, ctx }) => {
      const player = requirePlayer(ctx);
      const bonuses = await db.getActiveBonusesByAdmin(player.adminId!);
      const claimed = await db.getPlayerBonuses(player.id);

      return bonuses.map(b => ({
        ...b,
        claimedByPlayer: claimed.filter(c => c.bonusConfigId === b.id),
      }));
    }),

  claimBonus: publicProcedure
    .input(z.object({ token: z.string(), bonusConfigId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const player = requirePlayer(ctx);
      const cycle = await db.getActiveCycle(player.id);
      const depositAmount = cycle ? parseFloat(cycle.depositAmount) : 0;

      const result = await claimBonus(player.id, player.adminId!, input.bonusConfigId, depositAmount);
      if (!result.success) throw new TRPCError({ code: "BAD_REQUEST", message: result.error });
      return result;
    }),

  myBonuses: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input, ctx }) => {
      const player = requirePlayer(ctx);
      return db.getPlayerBonuses(player.id);
    }),

  // ─── Game Logs ───
  gameLogs: publicProcedure
    .input(z.object({ token: z.string(), page: z.number().default(1), pageSize: z.number().default(20) }))
    .query(async ({ input, ctx }) => {
      const player = requirePlayer(ctx);
      return db.getGameLogsByPlayer(player.id, { page: input.page, pageSize: input.pageSize });
    }),

  // ─── Profile ───
  updateProfile: publicProcedure
    .input(z.object({
      token: z.string(),
      bankName: z.string().optional(),
      bankAccountName: z.string().optional(),
      bankAccountNumber: z.string().optional(),
      lang: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const player = requirePlayer(ctx);
      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const updateData: any = {};
      if (input.bankName !== undefined) updateData.bankName = input.bankName;
      if (input.bankAccountName !== undefined) updateData.bankAccountName = input.bankAccountName;
      if (input.bankAccountNumber !== undefined) updateData.bankAccountNumber = input.bankAccountNumber;
      if (input.lang !== undefined) updateData.lang = input.lang;

      await database.update(players).set(updateData).where(eq(players.id, player.id));
      return { success: true };
    }),

  // ─── Banners ───
  banners: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input, ctx }) => {
      const player = requirePlayer(ctx);
      return db.getActiveBanners(player.adminId!);
    }),

  // ─── Invite ───
  inviteInfo: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input, ctx }) => {
      const player = requirePlayer(ctx);
      const p = await db.getPlayerById(player.id);
      if (!p) throw new TRPCError({ code: "NOT_FOUND" });
      return { inviteCode: p.inviteCode };
    }),
});
