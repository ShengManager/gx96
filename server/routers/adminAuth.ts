import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  adminLogin,
  refreshAccessToken,
  verifyAccessToken,
  createMasterAdmin,
  hashPassword,
  verifyPassword,
  playerLogin,
  TokenPayload,
} from "../services/auth";
import { getDb, getAdminById, getPermissions, createAdminLog, getDomainAcl } from "../db";
import { adminAccounts, subAccountPermissions, players } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";

export const adminAuthRouter = router({
  // Admin login
  login: publicProcedure
    .input(z.object({
      username: z.string().min(1),
      password: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const ip = ctx.req.headers["x-forwarded-for"] as string || ctx.req.ip;
      const ua = ctx.req.headers["user-agent"];

      // Domain ACL enforcement
      const origin = ctx.req.headers.origin || ctx.req.headers.referer || "";
      const result = await adminLogin(input.username, input.password, ip, ua);

      // After login success, check domain ACL for the admin's tenant
      if (result.success && result.admin) {
        const adminId = result.admin.role === "sub" ? result.admin.parentId : result.admin.id;
        if (adminId) {
          const acl = await getDomainAcl(adminId);
          const activeAcl = acl.filter(d => d.isActive && (d.purpose === "admin" || d.purpose === "both"));
          if (activeAcl.length > 0 && origin) {
            try {
              const originHost = new URL(origin).hostname;
              const allowed = activeAcl.some(d => originHost === d.domain || originHost.endsWith("." + d.domain));
              if (!allowed) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Access denied: domain not authorized" });
              }
            } catch (e) {
              if (e instanceof TRPCError) throw e;
              // If origin parsing fails, allow (graceful degradation)
            }
          }
        }
      }
      if (!result.success) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: result.error });
      }
      return {
        accessToken: result.accessToken!,
        refreshToken: result.refreshToken!,
        admin: result.admin,
      };
    }),

  // Refresh token
  refresh: publicProcedure
    .input(z.object({ refreshToken: z.string() }))
    .mutation(async ({ input }) => {
      const result = await refreshAccessToken(input.refreshToken);
      if (!result.success) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: result.error });
      }
      return {
        accessToken: result.accessToken!,
        refreshToken: result.refreshToken!,
      };
    }),

  // Get current admin profile
  me: publicProcedure.query(async ({ ctx }) => {
    const authHeader = ctx.req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return null;

    const payload = verifyAccessToken(authHeader.slice(7));
    if (!payload || payload.type !== "admin") return null;

    const admin = await getAdminById(payload.id);
    if (!admin) return null;

    const permissions = admin.role === "sub" ? await getPermissions(admin.id) : null;

    return {
      id: admin.id,
      username: admin.username,
      displayName: admin.displayName,
      role: admin.role,
      parentId: admin.parentId,
      adminId: payload.adminId,
      permissions: permissions?.map(p => ({
        module: p.module,
        canView: p.canView,
        canEdit: p.canEdit,
        canDelete: p.canDelete,
      })),
    };
  }),

  // Setup initial master admin (only if no admin exists)
  setup: publicProcedure
    .input(z.object({
      username: z.string().min(3).max(64),
      password: z.string().min(6),
      displayName: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Check if any admin exists
      const existing = await db.select().from(adminAccounts).limit(1);
      if (existing.length > 0) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin already exists. Use login instead." });
      }

      const result = await createMasterAdmin(input.username, input.password, input.displayName);
      if (!result.success) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.error });
      }

      return { success: true, adminId: result.adminId };
    }),

  // Change password
  changePassword: publicProcedure
    .input(z.object({
      token: z.string(),
      currentPassword: z.string().min(1),
      newPassword: z.string().min(6),
    }))
    .mutation(async ({ input }) => {
      const payload = verifyAccessToken(input.token);
      if (!payload || payload.type !== "admin") {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid token" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const admin = await getAdminById(payload.id);
      if (!admin) throw new TRPCError({ code: "NOT_FOUND", message: "Admin not found" });

      // Verify current password
      const bcrypt = await import("bcryptjs");
      const valid = await bcrypt.compare(input.currentPassword, admin.passwordHash);
      if (!valid) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Current password is incorrect" });
      }

      // Hash and update new password
      const newHash = await hashPassword(input.newPassword);
      await db.update(adminAccounts).set({ passwordHash: newHash }).where(eq(adminAccounts.id, payload.id));

      await createAdminLog({
        adminId: payload.id,
        action: "change_password",
        module: "auth",
        targetId: payload.id,
        targetType: "admin_account",
      });

      return { success: true };
    }),

  // Create sub-account (master only)
  createSubAccount: publicProcedure
    .input(z.object({
      token: z.string(),
      username: z.string().min(3).max(64),
      password: z.string().min(6),
      displayName: z.string().optional(),
      permissions: z.array(z.object({
        module: z.string(),
        canView: z.boolean(),
        canEdit: z.boolean(),
        canDelete: z.boolean(),
      })),
    }))
    .mutation(async ({ input }) => {
      const payload = verifyAccessToken(input.token);
      if (!payload || payload.type !== "admin" || payload.role !== "master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only master admin can create sub-accounts" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const passwordHash = await hashPassword(input.password);
      const result = await db.insert(adminAccounts).values({
        username: input.username,
        passwordHash,
        displayName: input.displayName || input.username,
        role: "sub",
        parentId: payload.adminId,
        isActive: true,
      });

      const subId = result[0].insertId;

      // Insert permissions
      if (input.permissions.length > 0) {
        await db.insert(subAccountPermissions).values(
          input.permissions.map(p => ({
            adminId: subId,
            module: p.module,
            canView: p.canView,
            canEdit: p.canEdit,
            canDelete: p.canDelete,
          }))
        );
      }

      await createAdminLog({
        adminId: payload.id,
        action: "create_sub_account",
        module: "subaccount",
        targetId: subId,
        targetType: "admin_account",
      });

      return { success: true, subAccountId: subId };
    }),

  // ─── Player Login (Frontend) ───
  playerLogin: publicProcedure
    .input(z.object({
      username: z.string().min(1),
      password: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Find player by telegramUsername (used as username)
      const rows = await db
        .select()
        .from(players)
        .where(eq(players.telegramUsername, input.username))
        .limit(1);

      if (rows.length === 0) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid username or password" });
      }

      const player = rows[0];
      if (!player.isActive) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Account is disabled" });
      }

      // Players registered via Telegram have random passwords
      // For web login, we need to check if they have a set password
      // If no passwordHash exists (old players), reject
      if (!player.passwordHash) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Please set a password via Telegram Settings first" });
      }

      const valid = await verifyPassword(input.password, player.passwordHash);
      if (!valid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid username or password" });
      }

      const tokens = await playerLogin(player.id, player.adminId);

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        player: {
          id: player.id,
          username: player.telegramUsername || `tg_${player.telegramId.slice(-6)}`,
          phone: player.phone || "",
          displayName: player.telegramFirstName || player.telegramUsername || "Player",
          vipLevel: player.vipLevel,
        },
      };
    }),

  // ─── Player Register (Frontend) ───
  playerRegister: publicProcedure
    .input(z.object({
      username: z.string().min(3).max(64),
      password: z.string().min(6),
      phone: z.string().min(1),
      inviteCode: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Get the first admin (default tenant for web registrations)
      const admins = await db.select().from(adminAccounts).where(eq(adminAccounts.role, "master")).limit(1);
      if (admins.length === 0) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No admin configured" });
      }
      const adminId = admins[0].id;

      // Check if username already exists
      const existing = await db
        .select()
        .from(players)
        .where(and(eq(players.adminId, adminId), eq(players.telegramUsername, input.username)))
        .limit(1);
      if (existing.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Username already exists" });
      }

      // Check invite code
      let referrerId: number | null = null;
      if (input.inviteCode) {
        const referrer = await db
          .select()
          .from(players)
          .where(and(eq(players.adminId, adminId), eq(players.inviteCode, input.inviteCode)))
          .limit(1);
        if (referrer.length > 0) referrerId = referrer[0].id;
      }

      const passwordHash = await hashPassword(input.password);
      const invCode = nanoid(8).toUpperCase();

      const [result] = await db.insert(players).values({
        adminId,
        telegramId: `web_${nanoid(10)}`, // Web users get a pseudo telegramId
        telegramUsername: input.username,
        telegramFirstName: input.username,
        phone: input.phone,
        passwordHash,
        inviteCode: invCode,
        invitedBy: referrerId,
        isActive: true,
        lang: "en",
      }).$returningId();

      const tokens = await playerLogin(result.id, adminId);

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        player: {
          id: result.id,
          username: input.username,
          phone: input.phone,
          displayName: input.username,
          vipLevel: 0,
        },
      };
    }),
});
