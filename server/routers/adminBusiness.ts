import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { requireAdmin, checkPermission } from "../services/middleware";
import * as db from "../db";
import { getDb } from "../db";
import {
  bonusConfigs, bonusPromoGroups, banners, telegramBots, telegramBotMessages,
  countryConfigs, adminAccounts, subAccountPermissions, adminLogs,
} from "../../drizzle/schema";
import { eq, and, desc, gte, lte, sql, inArray } from "drizzle-orm";
import { startOfDayInTimezone, endOfDayInTimezone } from "../services/timezone";
import { startBot, stopBot, restartBot, activeBots, getBotStatus, getAllBotStatuses } from "../services/telegramBot";
import { getMiddlewaveConfig, getGameList, getProjectInfo, getActiveProviders } from "../services/middlewave";
import { settleDailyReferralRebate } from "../services/depositCycle";

const CURRENCY_TIMEZONE_MAP: Record<string, string> = {
  MYR: "Asia/Kuala_Lumpur",
  SGD: "Asia/Singapore",
  THB: "Asia/Bangkok",
  AUD: "Australia/Sydney",
  USD: "America/New_York",
};

const COUNTRY_TIMEZONE_MAP: Record<string, string> = {
  MY: "Asia/Kuala_Lumpur",
  SG: "Asia/Singapore",
  TH: "Asia/Bangkok",
  AU: "Australia/Sydney",
  US: "America/New_York",
};

function inferTimezoneFromCountryCurrency(countryCode?: string, currency?: string): string {
  const c = (currency || "").toUpperCase();
  const cc = (countryCode || "").toUpperCase();
  if (CURRENCY_TIMEZONE_MAP[c]) return CURRENCY_TIMEZONE_MAP[c];
  if (COUNTRY_TIMEZONE_MAP[cc]) return COUNTRY_TIMEZONE_MAP[cc];
  return "UTC";
}

export const adminBonusRouter = router({
  list: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "bonus", "view");
      return db.getBonusesByAdmin(admin.adminId!);
    }),

  /** 前台分组主数据（标题、横幅、排序）；与活动通过 groupKey 关联 */
  listPromoGroups: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "bonus", "view");
      return db.getBonusPromoGroupsByAdmin(admin.adminId!);
    }),

  createPromoGroup: publicProcedure
    .input(
      z.object({
        token: z.string(),
        groupKey: z.string().min(1).max(128),
        title: z.string().max(256).optional().nullable(),
        bannerUrl: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "bonus", "edit");
      try {
        const r = await db.createBonusPromoGroup(admin.adminId!, {
          groupKey: input.groupKey,
          title: input.title,
          bannerUrl: input.bannerUrl,
        });
        await db.createAdminLog({
          adminId: admin.id,
          action: "create_promo_group",
          module: "bonus",
          targetType: "promo_group",
          details: { groupKey: input.groupKey.trim().slice(0, 128) },
        });
        return { success: true as const, id: r.id };
      } catch (e: any) {
        const msg = String(e?.message ?? e ?? "");
        if (e?.code === "ER_DUP_ENTRY" || msg.includes("Duplicate") || msg.includes("duplicate")) {
          throw new TRPCError({ code: "CONFLICT", message: "This group key already exists" });
        }
        throw e;
      }
    }),

  deletePromoGroup: publicProcedure
    .input(z.object({ token: z.string(), groupKey: z.string().min(1).max(128) }))
    .mutation(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "bonus", "edit");
      const res = await db.deleteBonusPromoGroupIfEmpty(admin.adminId!, input.groupKey);
      if (!res.ok && res.reason === "has_bonuses") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Move or delete promotions in this group before deleting it" });
      }
      if (!res.ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Could not delete promo group" });
      }
      await db.createAdminLog({
        adminId: admin.id,
        action: "delete_promo_group",
        module: "bonus",
        targetType: "promo_group",
        details: { groupKey: input.groupKey.trim().slice(0, 128) },
      });
      return { success: true as const };
    }),

  create: publicProcedure
    .input(z.object({
      token: z.string(),
      name: z.string(),
      description: z.string().optional(),
      bonusType: z.number().min(0).max(2),
      fixedAmount: z.number().optional(),
      percentage: z.number().optional(),
      randomMin: z.number().optional(),
      randomMax: z.number().optional(),
      cardImageUrl: z.string().optional(),
      detailImageUrl: z.string().optional(),
      claimConfig: z.any().optional(),
      rolloverMultiplier: z.number().optional(),
      turnoverTarget: z.number().optional(),
      maxWithdraw: z.number().optional(),
      sortOrder: z.number().default(0),
      promoGroupKey: z.string().max(128).optional(),
      promoGroupSort: z.number().default(0),
    }))
    .mutation(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "bonus", "edit");

      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const pk = (input.promoGroupKey ?? "").trim().slice(0, 128);

      const result = await database.insert(bonusConfigs).values({
        adminId: admin.adminId!,
        name: input.name,
        description: input.description || null,
        bonusType: input.bonusType,
        fixedAmount: input.fixedAmount?.toFixed(4) || null,
        percentage: input.percentage?.toFixed(4) || null,
        randomMin: input.randomMin?.toFixed(4) || null,
        randomMax: input.randomMax?.toFixed(4) || null,
        cardImageUrl: input.cardImageUrl || null,
        detailImageUrl: input.detailImageUrl || null,
        claimConfig: input.claimConfig || null,
        rolloverMultiplier: input.rolloverMultiplier?.toFixed(2) || null,
        turnoverTarget: input.turnoverTarget?.toFixed(4) || null,
        maxWithdraw: input.maxWithdraw?.toFixed(4) || null,
        sortOrder: input.sortOrder,
        promoGroupKey: pk,
        promoGroupTitle: null,
        promoGroupBannerUrl: null,
        promoGroupSort: input.promoGroupSort ?? 0,
        isActive: true,
      });

      if (pk) await db.ensureBonusPromoGroupRow(admin.adminId!, pk);

      await db.createAdminLog({ adminId: admin.id, action: "create_bonus", module: "bonus", targetId: result[0].insertId, targetType: "bonus_config" });
      return { success: true, bonusId: result[0].insertId };
    }),

  update: publicProcedure
    .input(z.object({
      token: z.string(),
      bonusId: z.number(),
      name: z.string().optional(),
      description: z.string().optional(),
      bonusType: z.number().optional(),
      fixedAmount: z.number().optional(),
      percentage: z.number().optional(),
      randomMin: z.number().optional(),
      randomMax: z.number().optional(),
      cardImageUrl: z.string().optional(),
      detailImageUrl: z.string().optional(),
      claimConfig: z.any().optional(),
      rolloverMultiplier: z.number().optional(),
      turnoverTarget: z.number().optional(),
      maxWithdraw: z.number().optional(),
      isActive: z.boolean().optional(),
      sortOrder: z.number().optional(),
      promoGroupKey: z.string().max(128).optional(),
      promoGroupSort: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "bonus", "edit");

      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const updateData: any = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.bonusType !== undefined) updateData.bonusType = input.bonusType;
      if (input.fixedAmount !== undefined) updateData.fixedAmount = input.fixedAmount.toFixed(4);
      if (input.percentage !== undefined) updateData.percentage = input.percentage.toFixed(4);
      if (input.randomMin !== undefined) updateData.randomMin = input.randomMin.toFixed(4);
      if (input.randomMax !== undefined) updateData.randomMax = input.randomMax.toFixed(4);
      if (input.cardImageUrl !== undefined) updateData.cardImageUrl = input.cardImageUrl;
      if (input.detailImageUrl !== undefined) updateData.detailImageUrl = input.detailImageUrl;
      if (input.claimConfig !== undefined) updateData.claimConfig = input.claimConfig;
      if (input.rolloverMultiplier !== undefined) updateData.rolloverMultiplier = input.rolloverMultiplier.toFixed(2);
      if (input.turnoverTarget !== undefined) updateData.turnoverTarget = input.turnoverTarget.toFixed(4);
      if (input.maxWithdraw !== undefined) updateData.maxWithdraw = input.maxWithdraw.toFixed(4);
      if (input.isActive !== undefined) updateData.isActive = input.isActive;
      if (input.sortOrder !== undefined) updateData.sortOrder = input.sortOrder;
      if (input.promoGroupKey !== undefined) updateData.promoGroupKey = input.promoGroupKey.trim().slice(0, 128);
      if (input.promoGroupSort !== undefined) updateData.promoGroupSort = input.promoGroupSort;
      updateData.ruleVersion = sql`${bonusConfigs.ruleVersion} + 1`;

      await database.update(bonusConfigs).set(updateData).where(and(eq(bonusConfigs.id, input.bonusId), eq(bonusConfigs.adminId, admin.adminId!)));

      if (input.promoGroupKey !== undefined) {
        const pk = input.promoGroupKey.trim().slice(0, 128);
        if (pk) await db.ensureBonusPromoGroupRow(admin.adminId!, pk);
      }
      await db.createAdminLog({ adminId: admin.id, action: "update_bonus", module: "bonus", targetId: input.bonusId, targetType: "bonus_config" });
      return { success: true };
    }),

  /** 更新前台分组展示信息（写入 bonus_promo_groups，不再写每条活动） */
  updatePromoGroup: publicProcedure
    .input(z.object({
      token: z.string(),
      promoGroupKey: z.string().min(1).max(128),
      promoGroupTitle: z.string().max(256).optional().nullable(),
      promoGroupBannerUrl: z.string().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "bonus", "edit");

      const key = input.promoGroupKey.trim().slice(0, 128);
      const hasChange =
        input.promoGroupTitle !== undefined ||
        input.promoGroupBannerUrl !== undefined;
      if (!hasChange) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No fields to update" });
      }

      await db.upsertBonusPromoGroupDisplay(admin.adminId!, key, {
        title: input.promoGroupTitle,
        bannerUrl: input.promoGroupBannerUrl,
      });

      await db.createAdminLog({
        adminId: admin.id,
        action: "update_promo_group",
        module: "bonus",
        targetType: "promo_group",
        details: { promoGroupKey: key },
      });
      return { success: true as const };
    }),

  /**
   * 拖拽后的完整布局：分组顺序 + 每组内奖金顺序。会写入 promoGroupSort、sortOrder、promoGroupKey。
   * groups[].key 使用 "__ungrouped__" 表示未分组（存库为空字符串）。
   */
  applyBonusLayout: publicProcedure
    .input(
      z.object({
        token: z.string(),
        groups: z.array(
          z.object({
            key: z.string().max(128),
            bonusIds: z.array(z.number().int().positive()),
          })
        ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "bonus", "edit");

      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const adminId = admin.adminId!;
      const flat = input.groups.flatMap((g) => g.bonusIds);
      if (flat.length !== new Set(flat).size) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Duplicate bonus id in layout" });
      }

      const existing = await database
        .select({ id: bonusConfigs.id })
        .from(bonusConfigs)
        .where(eq(bonusConfigs.adminId, adminId));
      const allIds = new Set(existing.map((r) => r.id));
      if (flat.length !== allIds.size) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Layout must list every bonus exactly once",
        });
      }
      for (const id of flat) {
        if (!allIds.has(id)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Invalid bonus id: ${id}` });
        }
      }

      await database.transaction(async (tx) => {
        for (let gi = 0; gi < input.groups.length; gi++) {
          const g = input.groups[gi];
          const pk = g.key === "__ungrouped__" ? "" : g.key.trim().slice(0, 128);
          for (let bi = 0; bi < g.bonusIds.length; bi++) {
            const id = g.bonusIds[bi];
            await tx
              .update(bonusConfigs)
              .set({
                promoGroupKey: pk,
                promoGroupSort: gi,
                sortOrder: bi,
                ruleVersion: sql`${bonusConfigs.ruleVersion} + 1`,
              })
              .where(and(eq(bonusConfigs.id, id), eq(bonusConfigs.adminId, adminId)));
          }
          if (pk) {
            await tx
              .insert(bonusPromoGroups)
              .values({
                adminId,
                groupKey: pk,
                title: null,
                bannerUrl: null,
                sortIndex: gi,
              })
              .onDuplicateKeyUpdate({
                set: { sortIndex: gi },
              });
          }
        }
      });

      await db.createAdminLog({
        adminId: admin.id,
        action: "apply_bonus_layout",
        module: "bonus",
        details: { groupCount: input.groups.length },
      });
      return { success: true as const };
    }),

  getReferralRule: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "bonus", "view");
      return db.getReferralRuleByAdmin(admin.adminId!);
    }),

  updateReferralRule: publicProcedure
    .input(z.object({
      token: z.string(),
      commissionEnabled: z.boolean(),
      inviteRewardEnabled: z.boolean(),
      inviteRewardThreshold: z.number().int().min(0),
      inviteRewardAmount: z.number().min(0),
      firstDepositRewardEnabled: z.boolean(),
      firstDepositPercent: z.number().min(0),
      firstDepositMaxAmount: z.number().min(0),
      rebateEnabled: z.boolean(),
      rebatePercent: z.number().min(0),
      rebateBase: z.enum(["valid_bet", "net_loss"]),
      rebateMinBase: z.number().min(0),
    }))
    .mutation(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "bonus", "edit");
      await db.upsertReferralRuleByAdmin(admin.adminId!, {
        commissionEnabled: input.commissionEnabled,
        inviteRewardEnabled: input.inviteRewardEnabled,
        inviteRewardThreshold: input.inviteRewardThreshold,
        inviteRewardAmount: input.inviteRewardAmount,
        firstDepositRewardEnabled: input.firstDepositRewardEnabled,
        firstDepositPercent: input.firstDepositPercent,
        firstDepositMaxAmount: input.firstDepositMaxAmount,
        rebateEnabled: input.rebateEnabled,
        rebatePercent: input.rebatePercent,
        rebateBase: input.rebateBase,
        rebateMinBase: input.rebateMinBase,
      });
      await db.createAdminLog({
        adminId: admin.id,
        action: "update_referral_rule",
        module: "bonus",
        targetType: "referral_rule",
      });
      return { success: true as const };
    }),

  listReferralLedger: publicProcedure
    .input(z.object({ token: z.string(), limit: z.number().int().min(1).max(200).optional() }))
    .query(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "bonus", "view");
      return db.listReferralLedgerByAdmin(admin.adminId!, { limit: input.limit });
    }),

  settleReferralRebate: publicProcedure
    .input(z.object({ token: z.string(), targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .mutation(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "bonus", "edit");
      const res = await settleDailyReferralRebate({
        adminId: admin.adminId!,
        targetDate: input.targetDate,
      });
      if (!res.success) {
        throw new TRPCError({ code: "BAD_REQUEST", message: res.error || "Failed to settle rebate" });
      }
      await db.createAdminLog({
        adminId: admin.id,
        action: "settle_referral_rebate",
        module: "bonus",
        targetType: "referral_rebate",
        details: { targetDate: input.targetDate, settledRows: res.settledRows, totalAmount: res.totalAmount },
      });
      return res;
    }),

  delete: publicProcedure
    .input(z.object({ token: z.string(), bonusId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "bonus", "delete");

      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await database.delete(bonusConfigs).where(and(eq(bonusConfigs.id, input.bonusId), eq(bonusConfigs.adminId, admin.adminId!)));
      await db.createAdminLog({ adminId: admin.id, action: "delete_bonus", module: "bonus", targetId: input.bonusId, targetType: "bonus_config" });
      return { success: true };
    }),
});

export const adminBannersRouter = router({
  list: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      return db.getBannersByAdmin(admin.adminId!);
    }),

  create: publicProcedure
    .input(z.object({ token: z.string(), title: z.string().optional(), imageUrl: z.string(), linkUrl: z.string().optional(), sortOrder: z.number().default(0) }))
    .mutation(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const result = await database.insert(banners).values({
        adminId: admin.adminId!,
        title: input.title || null,
        imageUrl: input.imageUrl,
        linkUrl: input.linkUrl || null,
        sortOrder: input.sortOrder,
        isActive: true,
      });
      return { success: true, bannerId: result[0].insertId };
    }),

  update: publicProcedure
    .input(z.object({ token: z.string(), bannerId: z.number(), title: z.string().optional(), imageUrl: z.string().optional(), linkUrl: z.string().optional(), isActive: z.boolean().optional(), sortOrder: z.number().optional() }))
    .mutation(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const updateData: any = {};
      if (input.title !== undefined) updateData.title = input.title;
      if (input.imageUrl !== undefined) updateData.imageUrl = input.imageUrl;
      if (input.linkUrl !== undefined) updateData.linkUrl = input.linkUrl;
      if (input.isActive !== undefined) updateData.isActive = input.isActive;
      if (input.sortOrder !== undefined) updateData.sortOrder = input.sortOrder;

      await database.update(banners).set(updateData).where(and(eq(banners.id, input.bannerId), eq(banners.adminId, admin.adminId!)));
      return { success: true };
    }),

  delete: publicProcedure
    .input(z.object({ token: z.string(), bannerId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await database.delete(banners).where(and(eq(banners.id, input.bannerId), eq(banners.adminId, admin.adminId!)));
      return { success: true };
    }),
});

export const adminSettingsRouter = router({
  getAll: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "setting", "view");
      return db.getAllSettings(admin.adminId!);
    }),

  set: publicProcedure
    .input(z.object({ token: z.string(), key: z.string(), value: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "setting", "edit");
      await db.setSetting(admin.adminId!, input.key, input.value);
      await db.createAdminLog({ adminId: admin.id, action: "update_setting", module: "setting", details: { key: input.key } });
      return { success: true };
    }),

  countries: router({
    list: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input, ctx }) => {
        const admin = requireAdmin(ctx);
        return db.getCountryConfigs(admin.adminId!);
      }),

    save: publicProcedure
      .input(z.object({
        token: z.string(),
        countries: z.array(z.object({
          countryCode: z.string(),
          phonePrefix: z.string(),
          currency: z.string(),
          isAllowed: z.boolean(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        const admin = requireAdmin(ctx);
        await checkPermission(admin.id, admin.role!, "setting", "edit");

        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await database.delete(countryConfigs).where(eq(countryConfigs.adminId, admin.adminId!));
        if (input.countries.length > 0) {
          await database.insert(countryConfigs).values(
            input.countries.map(c => ({ adminId: admin.adminId!, ...c }))
          );
          const preferred = input.countries.find(c => c.isAllowed) || input.countries[0];
          const inferredTimezone = inferTimezoneFromCountryCurrency(preferred.countryCode, preferred.currency);
          await db.setSetting(admin.adminId!, "timezone", inferredTimezone);
        }
        return { success: true };
      }),
  }),

  testMiddlewave: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      const config = await getMiddlewaveConfig(admin.adminId!);
      if (!config) {
        return { success: false, error: "Middlewave API Token not configured. Please set it in System settings first." };
      }
      try {
        // First try ProjectInfo to get providers
        const projectInfo = await getProjectInfo(config);
        if (projectInfo.success && projectInfo.providers) {
          const activeProviders = projectInfo.providers.filter(p => p.status === "active");
          return {
            success: true,
            message: `Connection successful! Project: ${projectInfo.project?.name || "Unknown"}, ${activeProviders.length} active providers.`,
            projectName: projectInfo.project?.name,
            projectStatus: projectInfo.project?.status,
            providers: projectInfo.providers.map(p => ({
              code: p.providerCode,
              name: p.providerName,
              status: p.status,
            })),
            activeProviderCount: activeProviders.length,
          };
        }
        // Fallback to GameList
        const result = await getGameList(config);
        const games = result.games || [];
        return {
          success: true,
          message: `Connection successful! Found ${games.length} games.`,
          gamesCount: games.length,
          sampleGames: games.slice(0, 3).map((g: any) => ({ name: g.gameName || g.name, provider: g.provider })),
        };
      } catch (err: any) {
        return {
          success: false,
          error: `Connection failed: ${err.message || "Unknown error"}`,
        };
      }
    }),

  // Get project info and active providers
  projectInfo: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      const config = await getMiddlewaveConfig(admin.adminId!);
      if (!config) {
        return { success: false, error: "Middlewave not configured" };
      }
      return getProjectInfo(config);
    }),
});

export const adminReportsRouter = router({
  summary: publicProcedure
    .input(z.object({
      token: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      timezone: z.string().default("UTC"),
    }))
    .query(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "report", "view");

      // Convert date range to UTC boundaries using the configured timezone
      // e.g., "2026-01-15" in "Asia/Kuala_Lumpur" (UTC+8) → starts at 2026-01-14T16:00:00Z
      const startUtc = startOfDayInTimezone(input.startDate, input.timezone);
      const endUtc = endOfDayInTimezone(input.endDate, input.timezone);

      const data = await db.getReportSummary(admin.adminId!, startUtc, endUtc);
      return {
        ...data,
        timezone: input.timezone,
        queryRange: {
          start: startUtc.toISOString(),
          end: endUtc.toISOString(),
          displayStart: input.startDate,
          displayEnd: input.endDate,
        },
      };
    }),
});

export const adminTelegramRouter = router({
  bots: router({
    list: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input, ctx }) => {
        const admin = requireAdmin(ctx);
        await checkPermission(admin.id, admin.role!, "telegram", "view");
        return db.getTelegramBotsByAdmin(admin.adminId!);
      }),

    create: publicProcedure
      .input(z.object({ token: z.string(), botToken: z.string(), botName: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const admin = requireAdmin(ctx);
        await checkPermission(admin.id, admin.role!, "telegram", "edit");

        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const result = await database.insert(telegramBots).values({
          adminId: admin.adminId!,
          botToken: input.botToken,
          botName: input.botName || null,
          isActive: true,
        });

        const botId = result[0].insertId;
        await db.createAdminLog({ adminId: admin.id, action: "create_telegram_bot", module: "telegram", targetId: botId, targetType: "telegram_bot" });

        // Start the bot polling immediately
        try {
          await startBot({
            id: botId,
            adminId: admin.adminId!,
            botToken: input.botToken,
            botName: input.botName || null,
            isActive: true,
          });
          console.log(`[TG Bot] Bot ${botId} started after creation`);
        } catch (err) {
          console.error(`[TG Bot] Failed to start bot ${botId} after creation:`, err);
        }

        return { success: true, botId };
      }),

    update: publicProcedure
      .input(z.object({ token: z.string(), botId: z.number(), botToken: z.string().optional(), botName: z.string().optional(), isActive: z.boolean().optional() }))
      .mutation(async ({ input, ctx }) => {
        const admin = requireAdmin(ctx);
        await checkPermission(admin.id, admin.role!, "telegram", "edit");

        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const updateData: any = {};
        if (input.botToken !== undefined) updateData.botToken = input.botToken;
        if (input.botName !== undefined) updateData.botName = input.botName;
        if (input.isActive !== undefined) updateData.isActive = input.isActive;

        await database.update(telegramBots).set(updateData).where(and(eq(telegramBots.id, input.botId), eq(telegramBots.adminId, admin.adminId!)));

        // Restart the bot to pick up changes
        try {
          if (updateData.isActive === false) {
            await stopBot(input.botId);
            console.log(`[TG Bot] Bot ${input.botId} stopped after deactivation`);
          } else {
            await restartBot(input.botId);
            console.log(`[TG Bot] Bot ${input.botId} restarted after update`);
          }
        } catch (err) {
          console.error(`[TG Bot] Failed to restart bot ${input.botId}:`, err);
        }

        return { success: true };
      }),

    delete: publicProcedure
      .input(z.object({ token: z.string(), botId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const admin = requireAdmin(ctx);
        await checkPermission(admin.id, admin.role!, "telegram", "delete");

        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // Stop the bot first
        try {
          await stopBot(input.botId);
        } catch {}

        await database.delete(telegramBots).where(and(eq(telegramBots.id, input.botId), eq(telegramBots.adminId, admin.adminId!)));
        return { success: true };
      }),

    testConnection: publicProcedure
      .input(z.object({ token: z.string(), botId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const admin = requireAdmin(ctx);
        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const [botConfig] = await database.select().from(telegramBots)
          .where(and(eq(telegramBots.id, input.botId), eq(telegramBots.adminId, admin.adminId!)))
          .limit(1);

        if (!botConfig) throw new TRPCError({ code: "NOT_FOUND", message: "Bot not found" });

        try {
          const testBot = new (await import("node-telegram-bot-api")).default(botConfig.botToken);
          const me = await testBot.getMe();
          
          // Auto-save botUsername if changed
          if (me.username && me.username !== botConfig.botUsername) {
            await database.update(telegramBots)
              .set({ botUsername: me.username })
              .where(eq(telegramBots.id, input.botId));
          }

          // Check if polling is active
          const isPolling = activeBots.has(input.botId);
          
          // If not polling, start it
          if (!isPolling && botConfig.isActive) {
            await startBot(botConfig);
          }

          // Get diagnostic info
          const diag = getBotStatus(input.botId);

          // Also check webhook info
          let webhookInfo: any = null;
          try {
            const resp = await fetch(`https://api.telegram.org/bot${botConfig.botToken}/getWebhookInfo`);
            webhookInfo = await resp.json();
          } catch {}

          return {
            success: true,
            botInfo: {
              id: me.id,
              username: me.username,
              firstName: me.first_name,
              isBot: me.is_bot,
            },
            isPolling: isPolling || botConfig.isActive,
            diagnostics: diag ? {
              startedAt: diag.startedAt,
              lastMessageAt: diag.lastMessageAt,
              messageCount: diag.messageCount,
              pollingErrorCount: diag.pollingErrorCount,
              lastPollingError: diag.lastPollingError,
            } : null,
            webhookInfo: webhookInfo?.result ? {
              url: webhookInfo.result.url || "(none)",
              pendingUpdateCount: webhookInfo.result.pending_update_count || 0,
            } : null,
          };
        } catch (err: any) {
          return {
            success: false,
            error: err.message || "Failed to connect to Telegram API",
            isPolling: false,
          };
        }
      }),

    getDiagnostics: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input, ctx }) => {
        const admin = requireAdmin(ctx);
        return getAllBotStatuses().filter(s => {
          // Only return diagnostics for bots owned by this admin
          const bot = activeBots.get(s.botId);
          return !!bot; // Return all active bot diagnostics for now
        });
      }),

    sendTestMessage: publicProcedure
      .input(z.object({ token: z.string(), botId: z.number(), chatId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const admin = requireAdmin(ctx);
        const bot = activeBots.get(input.botId);
        if (!bot) {
          return { success: false, error: "Bot is not running" };
        }
        try {
          await bot.sendMessage(input.chatId, "✅ Test message from TgGaming Admin Panel. Bot is working!", { parse_mode: "HTML" });
          return { success: true };
        } catch (err: any) {
          return { success: false, error: err.message || "Failed to send message" };
        }
      }),
  }),

  messages: router({
    list: publicProcedure
      .input(z.object({ token: z.string(), botId: z.number() }))
      .query(async ({ input, ctx }) => {
        const admin = requireAdmin(ctx);
        const database = await getDb();
        if (!database) return [];
        return database.select().from(telegramBotMessages).where(eq(telegramBotMessages.botId, input.botId));
      }),

    save: publicProcedure
      .input(z.object({
        token: z.string(),
        botId: z.number(),
        messages: z.array(z.object({
          lang: z.string(),
          section: z.string(),
          title: z.string().optional(),
          body: z.string().optional(),
          imageUrl: z.string().optional(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        const admin = requireAdmin(ctx);
        await checkPermission(admin.id, admin.role!, "telegram", "edit");

        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // Replace only provided language(s), keep other langs untouched.
        const langs = Array.from(new Set(input.messages.map((m) => m.lang).filter(Boolean)));
        if (langs.length > 0) {
          await database
            .delete(telegramBotMessages)
            .where(and(eq(telegramBotMessages.botId, input.botId), inArray(telegramBotMessages.lang, langs)));
        }
        if (input.messages.length > 0) {
          await database.insert(telegramBotMessages).values(
            input.messages.map(m => ({
              botId: input.botId,
              lang: m.lang,
              section: m.section,
              title: m.title || null,
              body: m.body || null,
              imageUrl: m.imageUrl || null,
            }))
          );
        }
        return { success: true };
      }),
  }),
});

export const adminSubAccountsRouter = router({
  list: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      if (admin.role !== "master") throw new TRPCError({ code: "FORBIDDEN" });
      const subs = await db.getSubAccounts(admin.adminId!);
      // Get permissions for each sub
      const result = await Promise.all(subs.map(async (sub) => {
        const perms = await db.getPermissions(sub.id);
        return { ...sub, permissions: perms };
      }));
      return result;
    }),

  updatePermissions: publicProcedure
    .input(z.object({
      token: z.string(),
      subAccountId: z.number(),
      permissions: z.array(z.object({
        module: z.string(),
        canView: z.boolean(),
        canEdit: z.boolean(),
        canDelete: z.boolean(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      if (admin.role !== "master") throw new TRPCError({ code: "FORBIDDEN" });

      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await database.delete(subAccountPermissions).where(eq(subAccountPermissions.adminId, input.subAccountId));
      if (input.permissions.length > 0) {
        await database.insert(subAccountPermissions).values(
          input.permissions.map(p => ({ adminId: input.subAccountId, ...p }))
        );
      }

      await db.createAdminLog({ adminId: admin.id, action: "update_permissions", module: "subaccount", targetId: input.subAccountId, targetType: "admin_account" });
      return { success: true };
    }),

  toggleActive: publicProcedure
    .input(z.object({ token: z.string(), subAccountId: z.number(), isActive: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      if (admin.role !== "master") throw new TRPCError({ code: "FORBIDDEN" });

      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await database.update(adminAccounts).set({ isActive: input.isActive }).where(and(eq(adminAccounts.id, input.subAccountId), eq(adminAccounts.parentId, admin.adminId!)));
      return { success: true };
    }),
});

export const adminFrontendRouter = router({
  get: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "setting", "view");
      return db.getFrontendSettings(admin.adminId!);
    }),

  save: publicProcedure
    .input(z.object({
      token: z.string(),
      templateId: z.string().optional(),
      customCss: z.string().optional(),
      customHeadHtml: z.string().optional(),
      customBodyJs: z.string().optional(),
      layoutInjections: z.record(
        z.string(),
        z.object({
          css: z.string().optional(),
          headHtml: z.string().optional(),
          bodyHtml: z.string().optional(),
          bodyJs: z.string().optional(),
          dataJson: z.string().optional(),
        })
      ).optional(),
      primaryColor: z.string().optional(),
      logoUrl: z.string().optional(),
      faviconUrl: z.string().optional(),
      siteName: z.string().optional(),
      footerText: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "setting", "edit");
      const { token, ...data } = input;
      await db.upsertFrontendSettings(admin.adminId!, data);
      await db.createAdminLog({ adminId: admin.id, action: "update_frontend_settings", module: "setting" });
      return { success: true };
    }),
});

export const adminDomainAclRouter = router({
  list: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "setting", "view");
      return db.getDomainAcl(admin.adminId!);
    }),

  add: publicProcedure
    .input(z.object({
      token: z.string(),
      domain: z.string(),
      purpose: z.enum(["admin", "player", "both"]).default("both"),
    }))
    .mutation(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "setting", "edit");
      const result = await db.addDomainAcl(admin.adminId!, input.domain, input.purpose);
      await db.createAdminLog({ adminId: admin.id, action: "add_domain_acl", module: "setting", details: { domain: input.domain } });
      return result;
    }),

  update: publicProcedure
    .input(z.object({
      token: z.string(),
      id: z.number(),
      domain: z.string().optional(),
      purpose: z.enum(["admin", "player", "both"]).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "setting", "edit");
      const { token, id, ...data } = input;
      await db.updateDomainAcl(id, admin.adminId!, data);
      return { success: true };
    }),

  delete: publicProcedure
    .input(z.object({ token: z.string(), id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "setting", "delete");
      await db.deleteDomainAcl(input.id, admin.adminId!);
      await db.createAdminLog({ adminId: admin.id, action: "delete_domain_acl", module: "setting", details: { id: input.id } });
      return { success: true };
    }),
});

export const adminLogsRouter = router({
  list: publicProcedure
    .input(z.object({ token: z.string(), page: z.number().default(1), pageSize: z.number().default(20), module: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      return db.getAdminLogs(admin.adminId!, { page: input.page, pageSize: input.pageSize, module: input.module });
    }),
});
