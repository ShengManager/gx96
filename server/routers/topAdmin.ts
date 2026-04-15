import { z } from "zod";
import jwt from "jsonwebtoken";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { router, publicProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { hashPassword } from "../services/auth";
import { adminAccounts, countryConfigs, domainAcl, systemSettings } from "../../drizzle/schema";

type TopAdminTokenPayload = {
  type: "topadmin";
  username: string;
};

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

function inferTimezone(currency?: string, countryCode?: string, fallback?: string) {
  const c = (currency || "").toUpperCase();
  const cc = (countryCode || "").toUpperCase();
  if (CURRENCY_TIMEZONE_MAP[c]) return CURRENCY_TIMEZONE_MAP[c];
  if (COUNTRY_TIMEZONE_MAP[cc]) return COUNTRY_TIMEZONE_MAP[cc];
  return fallback || "UTC";
}

function getTopAdminCredentials() {
  const username = process.env.TOPADMIN_USERNAME;
  const password = process.env.TOPADMIN_PASSWORD;
  if (!username || !password) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "TopAdmin is not configured. Please set TOPADMIN_USERNAME and TOPADMIN_PASSWORD in .env.",
    });
  }
  return { username, password };
}

function getTopAdminTokenSecret() {
  return process.env.TOPADMIN_TOKEN_SECRET || process.env.JWT_SECRET || "topadmin-local-dev-secret";
}

function signTopAdminToken(username: string) {
  return jwt.sign({ type: "topadmin", username } satisfies TopAdminTokenPayload, getTopAdminTokenSecret(), {
    expiresIn: "12h",
  });
}

function verifyTopAdminToken(token: string): TopAdminTokenPayload {
  try {
    const payload = jwt.verify(token, getTopAdminTokenSecret()) as TopAdminTokenPayload;
    if (payload.type !== "topadmin" || !payload.username) {
      throw new Error("invalid payload");
    }
    return payload;
  } catch {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired TopAdmin token" });
  }
}

function throwFriendlyDbError(err: unknown): never {
  const message = (err as any)?.message || "";
  const code = (err as any)?.code || "";

  if (code === "ECONNREFUSED") {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database connection refused. Please ensure MySQL is running and DATABASE_URL is correct.",
    });
  }

  if (message.includes("doesn't exist") || message.includes("ER_NO_SUCH_TABLE")) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database tables are missing. Please run `pnpm db:push` first.",
    });
  }

  if (message.includes("Access denied")) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database authentication failed. Please verify DATABASE_URL username/password.",
    });
  }

  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: `Database error: ${message || code || "unknown error"}`,
  });
}

export const topAdminRouter = router({
  login: publicProcedure
    .input(z.object({
      username: z.string().min(1),
      password: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const creds = getTopAdminCredentials();
      if (input.username !== creds.username || input.password !== creds.password) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid TopAdmin credentials" });
      }
      return { token: signTopAdminToken(input.username) };
    }),

  createMasterTenant: publicProcedure
    .input(z.object({
      token: z.string().min(1),
      masterUsername: z.string().min(3).max(64),
      masterPassword: z.string().min(6).max(128),
      displayName: z.string().min(1).max(128),
      adminDomain: z.string().min(3).max(256),
      playerDomain: z.string().min(3).max(256),
      siteName: z.string().min(1).max(128),
      currency: z.string().min(1).max(10),
      countryCode: z.string().min(1).max(10),
      phonePrefix: z.string().min(1).max(10),
      timezone: z.string().min(1).max(64).optional(),
      defaultLanguage: z.string().min(1).max(10).default("zh"),
    }))
    .mutation(async ({ input }) => {
      verifyTopAdminToken(input.token);
      const resolvedTimezone = inferTimezone(input.currency, input.countryCode, input.timezone);
      try {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        }

        const existing = await db
          .select()
          .from(adminAccounts)
          .where(eq(adminAccounts.username, input.masterUsername))
          .limit(1);
        if (existing.length > 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Master username already exists" });
        }

        const passwordHash = await hashPassword(input.masterPassword);

        const result = await db.transaction(async (tx) => {
          const [insertedMaster] = await tx
            .insert(adminAccounts)
            .values({
              username: input.masterUsername,
              passwordHash,
              displayName: input.displayName,
              role: "master",
              parentId: null,
              isActive: true,
            })
            .$returningId();

          const adminId = insertedMaster.id;

          await tx.insert(domainAcl).values([
            { adminId, domain: input.adminDomain.trim().toLowerCase(), purpose: "admin", isActive: true },
            { adminId, domain: input.playerDomain.trim().toLowerCase(), purpose: "player", isActive: true },
          ]);

          await tx.insert(systemSettings).values({ adminId, settingKey: "site_name", settingValue: input.siteName })
            .onDuplicateKeyUpdate({ set: { settingValue: input.siteName } });
          await tx.insert(systemSettings).values({ adminId, settingKey: "timezone", settingValue: resolvedTimezone })
            .onDuplicateKeyUpdate({ set: { settingValue: resolvedTimezone } });
          await tx.insert(systemSettings).values({ adminId, settingKey: "default_language", settingValue: input.defaultLanguage })
            .onDuplicateKeyUpdate({ set: { settingValue: input.defaultLanguage } });
          await tx.insert(systemSettings).values({ adminId, settingKey: "default_currency", settingValue: input.currency.toUpperCase() })
            .onDuplicateKeyUpdate({ set: { settingValue: input.currency.toUpperCase() } });

          // Keep one country row for this newly created tenant.
          await tx.delete(countryConfigs).where(eq(countryConfigs.adminId, adminId));
          await tx.insert(countryConfigs).values({
            adminId,
            countryCode: input.countryCode.toUpperCase(),
            phonePrefix: input.phonePrefix,
            currency: input.currency.toUpperCase(),
            isAllowed: true,
          });

          return { adminId };
        });

        const savedAcl = await db.select().from(domainAcl).where(and(eq(domainAcl.adminId, result.adminId), eq(domainAcl.isActive, true)));

        return {
          success: true,
          adminId: result.adminId,
          masterUsername: input.masterUsername,
          domains: savedAcl.map((d) => ({ domain: d.domain, purpose: d.purpose })),
        };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throwFriendlyDbError(err);
      }
    }),
});

