import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { requireAdmin, checkPermission } from "../services/middleware";
import * as db from "../db";
import { getDb } from "../db";
import { players, playerTags } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { generateAutoLoginToken } from "../services/auth";

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
      return db.getPlayersByAdmin(admin.adminId!, { search: input.search, page: input.page, pageSize: input.pageSize });
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

      const [tags, depositHistory, withdrawHistory, bonuses, gameLogs, activeCycle] = await Promise.all([
        db.getPlayerTags(input.playerId),
        db.getDepositsByPlayer(input.playerId),
        db.getWithdrawalsByPlayer(input.playerId),
        db.getPlayerBonuses(input.playerId),
        db.getGameLogsByPlayer(input.playerId, { page: 1, pageSize: 50 }),
        db.getActiveCycle(input.playerId),
      ]);

      return { player, tags, depositHistory, withdrawHistory, bonuses, gameLogs, activeCycle };
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
      const protocol = origin.startsWith("http://") ? "http" : "https";
      const loginPath = `/login?token=${encodeURIComponent(autoLoginToken)}`;
      const loginUrl = playerDomain ? `${protocol}://${playerDomain}${loginPath}` : loginPath;

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

      const balances = await checkAllProviderBalances(config, String(player.id));
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
