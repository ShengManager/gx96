import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { requirePlayer, extractTokenFromRequest } from "../services/middleware";
import { refreshAccessToken } from "../services/auth";
import * as db from "../db";
import { getDb } from "../db";
import { players, deposits, withdrawals } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import {
  createDeposit,
  canCreateDeposit,
  checkWithdrawalConditions,
  createWithdrawal,
  markGameEntered,
} from "../services/depositCycle";
import { claimBonus, enrichBonusesWithEligibility } from "../services/bonus";
import {
  getMiddlewaveConfig,
  checkBalance,
  depositToProvider,
  loginGame,
  getGameList,
  checkAllProviderBalances,
  createPlayer,
  getProjectInfo,
  getPlayerProviderAccounts,
} from "../services/middlewave";
import { generateMiddlewavePlayerId } from "../services/playerId";
import {
  notifyAdminNewDeposit,
  notifyAdminNewWithdrawal,
} from "../services/websocket";
import { nanoid } from "nanoid";

function getUpstreamErrorMessage(err: any, fallback: string): string {
  const responseData = err?.response?.data;
  if (typeof responseData === "string" && responseData.trim()) return responseData.trim();
  if (responseData && typeof responseData === "object") {
    const msg = responseData.error || responseData.message;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  if (typeof err?.message === "string" && err.message.trim()) return err.message.trim();
  return fallback;
}

function isExclusiveModeError(message: string): boolean {
  const text = String(message || "").toLowerCase();
  return (
    text.includes("exclusive mode") ||
    (text.includes("余额") && text.includes("出金")) ||
    (text.includes("withdraw") && text.includes("before") && text.includes("deposit"))
  );
}

function pickProviderLoginFields(providerAccount: any): { loginAccount?: string; loginPassword?: string } {
  const pd = providerAccount?.providerData || {};
  const loginAccount = [
    pd.loginId,
    pd.username,
    pd.account,
    pd.memberId,
    providerAccount?.providerPlayerId,
  ].map((v: any) => String(v || "").trim()).find(Boolean);
  const loginPassword = [
    pd.password,
    pd.passwd,
    pd.pwd,
  ].map((v: any) => String(v || "").trim()).find(Boolean);
  return { loginAccount, loginPassword };
}

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
      if (!p) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Player not found" });
      }

      const activeCycle = await db.getActiveCycle(player.id);
      const localWalletBalanceRaw = activeCycle
        ? Math.max(
            0,
            parseFloat(activeCycle.depositAmount || "0") +
              parseFloat(activeCycle.bonusAmount || "0") -
              parseFloat(activeCycle.totalWithdrawn || "0")
          )
        : 0;
      const database = await getDb();
      const pendingRows = database
        ? await database.select({
          amount: withdrawals.amount,
          status: withdrawals.status,
          handleNote: withdrawals.handleNote,
        }).from(withdrawals).where(eq(withdrawals.playerId, player.id))
        : [];
      const pendingReserved = pendingRows
        .filter((w) => (w.status === "pending" || w.status === "processing") && !String(w.handleNote || "").toLowerCase().includes("forfeit"))
        .reduce((sum, w) => sum + Math.max(0, parseFloat(String(w.amount || "0")) || 0), 0);
      const localWalletBalance = Math.max(0, localWalletBalanceRaw - pendingReserved);

      const config = await getMiddlewaveConfig(player.adminId!);
      if (!config) {
        return {
          balance: localWalletBalance,
          walletBalance: localWalletBalance,
          pendingReserved,
          providerTotal: 0,
          provider: input.provider || "main",
          error: "Middlewave not configured",
        };
      }

      if (input.provider) {
        const providerBalance = p.middlewavePlayerId
          ? (await checkBalance(config, input.provider, p.middlewavePlayerId)).balance || 0
          : 0;
        return {
          balance: providerBalance,
          walletBalance: localWalletBalance,
          provider: input.provider,
        };
      }

      // Check all providers and keep a unified wallet-like value for frontend display.
      const balances = p.middlewavePlayerId
        ? await checkAllProviderBalances(config, p.middlewavePlayerId)
        : [];
      const providerTotal = balances.reduce((sum, b) => sum + (Number(b.balance) || 0), 0);
      // Wallet display should follow live game/provider balance once provider has funds.
      const effectiveBalanceRaw = providerTotal > 0 ? providerTotal : localWalletBalanceRaw;
      const effectiveBalance = Math.max(0, effectiveBalanceRaw - pendingReserved);

      return {
        balance: effectiveBalance,
        walletBalance: localWalletBalance,
        pendingReserved,
        providerTotal,
        total: providerTotal,
        balances,
      };
    }),

  // ─── Games ───
  gameList: publicProcedure
    .input(z.object({ token: z.string(), provider: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const player = requirePlayer(ctx);
      const config = await getMiddlewaveConfig(player.adminId!);
      if (!config) return { games: [] };

      try {
        const result = await getGameList(config, input.provider);
        return { games: result.games || [] };
      } catch (err: any) {
        console.warn("[player.gameList] upstream error:", err?.message || err);
        return { games: [] };
      }
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
      if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Player not found" });

      const config = await getMiddlewaveConfig(player.adminId!);
      if (!config) throw new TRPCError({ code: "BAD_REQUEST", message: "Middlewave not configured" });

      // Ensure the player has a stable middlewave player id.
      // Older records may not have this populated yet.
      let middlewavePlayerId = p.middlewavePlayerId;
      if (!middlewavePlayerId) {
        middlewavePlayerId = generateMiddlewavePlayerId(player.adminId!, p.telegramUsername || p.telegramId || String(player.id));
        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        await database
          .update(players)
          .set({ middlewavePlayerId })
          .where(eq(players.id, player.id));
      }

      const playerIdentityCandidates = Array.from(
        new Set([middlewavePlayerId, String(player.id)].filter(Boolean))
      );

      const attemptLaunchForIdentity = async (playerIdentity: string) => {
        let localResult: any;
        try {
          localResult = await loginGame(config, input.provider, playerIdentity, input.gameCode, input.lang);
        } catch (err: any) {
          return { success: false, error: getUpstreamErrorMessage(err, "Failed to launch game") };
        }

        if (localResult?.success && localResult?.url) return localResult;

        const errText = `${localResult?.error || ""} ${localResult?.message || ""}`.toLowerCase();
        const shouldAutoRegister =
          errText.includes("not registered") ||
          errText.includes("not found") ||
          errText.includes("player not exist");

        if (!shouldAutoRegister) return localResult;

        try {
          const createRes = await createPlayer(config, input.provider, playerIdentity);
          if (!createRes?.success) {
            const createErr = `${createRes?.error || ""} ${createRes?.message || ""}`.toLowerCase();
            const alreadyExists = createErr.includes("already") && createErr.includes("exist");
            if (!alreadyExists) {
              return { success: false, error: createRes?.error || createRes?.message || "Failed to register player with game provider" };
            }
          }
        } catch (err: any) {
          const msg = getUpstreamErrorMessage(err, "Failed to register player with game provider");
          const lower = msg.toLowerCase();
          const alreadyExists = lower.includes("already") && lower.includes("exist");
          if (!alreadyExists) return { success: false, error: msg };
        }

        try {
          return await loginGame(config, input.provider, playerIdentity, input.gameCode, input.lang);
        } catch (err: any) {
          return { success: false, error: getUpstreamErrorMessage(err, "Failed to launch game") };
        }
      };

      let result: any = { success: false, error: "Failed to launch game" };
      for (const identity of playerIdentityCandidates) {
        result = await attemptLaunchForIdentity(identity);
        if (result?.success && result?.url) {
          middlewavePlayerId = identity;
          break;
        }
      }

      // Fallback credit sync:
      // if login succeeds but provider balance is still empty while local wallet has balance,
      // attempt one explicit deposit and relaunch.
      if (result.success && result.url) {
        const activeCycle = await db.getActiveCycle(player.id);
        const walletBalance = activeCycle
          ? Math.max(
            0,
            parseFloat(activeCycle.depositAmount || "0") +
            parseFloat(activeCycle.bonusAmount || "0") -
            parseFloat(activeCycle.totalWithdrawn || "0")
          )
          : 0;

        if (walletBalance > 0) {
          let bal: any;
          try {
            bal = await checkBalance(config, input.provider, middlewavePlayerId);
          } catch {
            bal = { success: false, balance: 0 };
          }
          const providerBalance = bal.success && typeof bal.balance === "number" ? bal.balance : 0;
          const diff = Math.max(0, walletBalance - providerBalance);

          if (diff > 0.0001) {
            let depositRes: any = null;
            let depositErrorMessage: string | null = null;
            try {
              depositRes = await depositToProvider(config, input.provider, middlewavePlayerId, Number(diff.toFixed(4)));
            } catch (err: any) {
              depositErrorMessage = getUpstreamErrorMessage(err, "Unable to transfer wallet credits to provider");
            }
            if (depositRes?.success) {
              try {
                result = await loginGame(config, input.provider, middlewavePlayerId, input.gameCode, input.lang);
              } catch (err: any) {
                throw new TRPCError({
                  code: "BAD_REQUEST",
                  message: getUpstreamErrorMessage(err, "Failed to relaunch game after transfer"),
                });
              }
            } else {
              const depositMessage =
                depositErrorMessage ||
                depositRes?.error ||
                depositRes?.message ||
                "Unable to transfer wallet credits to provider";
              if (isExclusiveModeError(depositMessage)) {
                // Keep the original successful login result and let player continue.
              } else {
                throw new TRPCError({
                  code: "BAD_REQUEST",
                  message: depositMessage,
                });
              }
            }
          }
        }
      }

      if (!result.success || !result.url) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.error || "Failed to launch game" });
      }

      // Lock bonus claiming only after game launch is confirmed.
      await markGameEntered(player.id);

      let providerType: string | undefined;
      let providerTypeLabel: string | undefined;
      try {
        const pInfo = await getProjectInfo(config);
        const providerMeta = (pInfo.providers || []).find((p: any) => String(p.providerCode) === String(input.provider));
        providerType = providerMeta?.providerType ? String(providerMeta.providerType) : undefined;
        providerTypeLabel = providerMeta?.providerTypeLabel ? String(providerMeta.providerTypeLabel) : undefined;
      } catch {
        // no-op
      }

      let loginAccount: string | undefined;
      let loginPassword: string | undefined;
      try {
        const accountRes = await getPlayerProviderAccounts(config, middlewavePlayerId);
        if (accountRes.success && Array.isArray(accountRes.accounts)) {
          const providerAccount = accountRes.accounts.find((a: any) => String(a.providerCode) === String(input.provider));
          if (providerAccount) {
            const fields = pickProviderLoginFields(providerAccount);
            loginAccount = fields.loginAccount;
            loginPassword = fields.loginPassword;
            providerType = providerType || providerAccount.providerType;
          }
        }
      } catch {
        // no-op
      }

      return {
        url: result.url,
        gameType: result.gameType,
        providerType,
        providerTypeLabel,
        loginAccount,
        loginPassword,
      };
    }),

  // ─── Deposits ───
  depositCheck: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input, ctx }) => {
      const player = requirePlayer(ctx);
      const check = await canCreateDeposit(player.id);
      const banksList = await db.getDepositBanks(player.adminId!);
      const presets = await db.getDepositPresets(player.adminId!);
      const financeLimits = await db.getFinanceLimits(player.adminId!);
      return { ...check, canDeposit: check.allowed, banks: banksList, presets, ...financeLimits };
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
      return enrichBonusesWithEligibility(player.id, player.adminId!, bonuses as any, claimed as any);
    }),

  claimBonus: publicProcedure
    .input(z.object({
      token: z.string(),
      bonusConfigId: z.number(),
      idempotencyKey: z.string().min(6).max(128).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const player = requirePlayer(ctx);
      const cycle = await db.getActiveCycle(player.id);
      const depositAmount = cycle ? parseFloat(cycle.depositAmount) : 0;

      const result = await claimBonus(player.id, player.adminId!, input.bonusConfigId, depositAmount, {
        idempotencyKey: input.idempotencyKey,
        requestSource: "player_api",
        sourceEvent: "player_claim",
      });
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

  frontendLayout: publicProcedure
    .input(z.object({ token: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const payload = extractTokenFromRequest(ctx.req);
      const settings =
        payload?.type === "player" && payload.adminId
          ? await db.getFrontendSettings(payload.adminId)
          : await db.getAnyFrontendSettings();
      if (!settings) return null;
      return {
        siteName: settings.siteName || "",
        logoUrl: settings.logoUrl || "",
        footerText: settings.footerText || "",
        customCss: settings.customCss || "",
        customHeadHtml: settings.customHeadHtml || "",
        customBodyJs: settings.customBodyJs || "",
        layoutInjections: settings.layoutInjections || {},
      };
    }),

  // ─── Invite ───
  inviteInfo: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input, ctx }) => {
      const player = requirePlayer(ctx);
      const p = await db.getPlayerById(player.id);
      if (!p) throw new TRPCError({ code: "NOT_FOUND" });
      const database = await getDb();
      const invitedPlayers = database
        ? await database
          .select({
            id: players.id,
            phone: players.phone,
            telegramUsername: players.telegramUsername,
            telegramFirstName: players.telegramFirstName,
            inviteCode: players.inviteCode,
            createdAt: players.createdAt,
          })
          .from(players)
          .where(and(eq(players.adminId, player.adminId!), eq(players.invitedBy, p.id)))
          .orderBy(desc(players.createdAt))
        : [];
      const bots = await db.getTelegramBotsByAdmin(player.adminId!);
      const activeBot = bots.find((b: any) => b.isActive && b.botUsername) || bots.find((b: any) => b.botUsername);
      const botUsername = String(activeBot?.botUsername || "").trim();
      const inviteLink = botUsername && p.inviteCode
        ? `https://t.me/${botUsername}?start=${encodeURIComponent(p.inviteCode)}`
        : null;
      return {
        inviteCode: p.inviteCode,
        telegramBotUsername: botUsername || null,
        inviteLink,
        invitedCount: invitedPlayers.length,
        invitedPlayers,
      };
    }),
});
