import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";

// Admin routers
import { adminAuthRouter } from "./routers/adminAuth";
import { adminPlayersRouter } from "./routers/adminPlayers";
import { adminFinanceRouter } from "./routers/adminFinance";
import {
  adminBonusRouter,
  adminBannersRouter,
  adminSettingsRouter,
  adminReportsRouter,
  adminTelegramRouter,
  adminSubAccountsRouter,
  adminLogsRouter,
  adminFrontendRouter,
  adminDomainAclRouter,
} from "./routers/adminBusiness";
import { topAdminRouter } from "./routers/topAdmin";
import { adminMediaRouter } from "./routers/adminMedia";

// Player router
import { playerApiRouter } from "./routers/playerApi";

export const appRouter = router({
  system: systemRouter,

  // Manus OAuth auth (kept for scaffold compat)
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Admin APIs ───
  adminAuth: adminAuthRouter,
  adminPlayers: adminPlayersRouter,
  adminFinance: adminFinanceRouter,
  adminBonus: adminBonusRouter,
  adminBanners: adminBannersRouter,
  adminSettings: adminSettingsRouter,
  adminReports: adminReportsRouter,
  adminTelegram: adminTelegramRouter,
  adminSubAccounts: adminSubAccountsRouter,
  adminLogs: adminLogsRouter,
  adminFrontend: adminFrontendRouter,
  adminDomainAcl: adminDomainAclRouter,
  adminMedia: adminMediaRouter,
  topAdmin: topAdminRouter,

  // ─── Player APIs ───
  player: playerApiRouter,
});

export type AppRouter = typeof appRouter;
