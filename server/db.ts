import { eq, and, desc, asc, gte, lte, like, sql, count, sum, or, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  adminAccounts, AdminAccount, InsertAdminAccount,
  subAccountPermissions, SubAccountPermission,
  telegramBots, TelegramBot,
  telegramBotMessages,
  players, Player, InsertPlayer,
  playerTags,
  inviteRelations,
  banks, Bank,
  bankCatalog, BankCatalog,
  depositCycles, DepositCycle,
  deposits, Deposit,
  withdrawals, Withdrawal,
  bonusConfigs, BonusConfig,
  playerBonuses, PlayerBonus,
  gameLogsCache,
  adminLogs,
  systemSettings,
  banners,
  depositPresets,
  countryConfigs,
  refreshTokens,
  frontendSettings,
  domainAcl,
} from "../drizzle/schema";

import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users (Manus OAuth compat) ───
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  textFields.forEach((field) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    (values as any)[field] = normalized;
    updateSet[field] = normalized;
  });
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Admin Accounts ───
export async function getAdminById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(adminAccounts).where(eq(adminAccounts.id, id)).limit(1);
  return rows[0] || null;
}

export async function getSubAccounts(masterAdminId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(adminAccounts).where(eq(adminAccounts.parentId, masterAdminId)).orderBy(desc(adminAccounts.createdAt));
}

export async function getPermissions(adminId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(subAccountPermissions).where(eq(subAccountPermissions.adminId, adminId));
}

// ─── Players ───
export async function getPlayersByAdmin(adminId: number, opts?: { search?: string; page?: number; pageSize?: number }) {
  const db = await getDb();
  if (!db) return { players: [], total: 0 };
  const page = opts?.page || 1;
  const pageSize = opts?.pageSize || 20;
  const offset = (page - 1) * pageSize;

  let conditions = [eq(players.adminId, adminId)];
  if (opts?.search) {
    conditions.push(
      or(
        like(players.telegramUsername, `%${opts.search}%`),
        like(players.phone, `%${opts.search}%`),
        like(players.telegramFirstName, `%${opts.search}%`),
        like(players.inviteCode, `%${opts.search}%`)
      ) as any
    );
  }

  const [rows, countRows] = await Promise.all([
    db.select().from(players).where(and(...conditions)).orderBy(desc(players.createdAt)).limit(pageSize).offset(offset),
    db.select({ cnt: count() }).from(players).where(and(...conditions)),
  ]);

  return { players: rows, total: countRows[0]?.cnt || 0 };
}

/** Map inviter player id -> short display label (same admin). */
export async function getInviterLabelsForPlayerIds(adminId: number, inviterIds: number[]) {
  const uniq = Array.from(new Set(inviterIds.filter((id) => typeof id === "number" && id > 0)));
  const map = new Map<number, string>();
  if (uniq.length === 0) return map;
  const database = await getDb();
  if (!database) return map;
  const rows = await database
    .select({
      id: players.id,
      telegramFirstName: players.telegramFirstName,
      telegramLastName: players.telegramLastName,
      telegramUsername: players.telegramUsername,
      phone: players.phone,
    })
    .from(players)
    .where(and(eq(players.adminId, adminId), inArray(players.id, uniq)));
  for (const r of rows) {
    const name = [r.telegramFirstName, r.telegramLastName].filter(Boolean).join(" ").trim();
    const label =
      name ||
      (r.telegramUsername ? `@${r.telegramUsername}` : "") ||
      (r.phone ? String(r.phone) : "") ||
      `#${r.id}`;
    map.set(r.id, label);
  }
  return map;
}

export async function getInvitedPlayersPage(
  adminId: number,
  inviterPlayerId: number,
  page: number,
  pageSize: number
) {
  const database = await getDb();
  if (!database) return { rows: [], total: 0 };
  const inviter = await database
    .select({ id: players.id })
    .from(players)
    .where(and(eq(players.id, inviterPlayerId), eq(players.adminId, adminId)))
    .limit(1);
  if (!inviter[0]) return { rows: [], total: 0 };

  const safePage = Math.max(1, page);
  const safeSize = Math.min(100, Math.max(1, pageSize));
  const offset = (safePage - 1) * safeSize;
  const conditions = and(eq(players.adminId, adminId), eq(players.invitedBy, inviterPlayerId));

  const [listRows, countRows] = await Promise.all([
    database
      .select({
        id: players.id,
        phone: players.phone,
        telegramUsername: players.telegramUsername,
        telegramFirstName: players.telegramFirstName,
        telegramLastName: players.telegramLastName,
        inviteCode: players.inviteCode,
        createdAt: players.createdAt,
      })
      .from(players)
      .where(conditions)
      .orderBy(desc(players.createdAt))
      .limit(safeSize)
      .offset(offset),
    database.select({ cnt: count() }).from(players).where(conditions),
  ]);

  return { rows: listRows, total: countRows[0]?.cnt || 0 };
}

export async function getPlayerById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(players).where(eq(players.id, id)).limit(1);
  return rows[0] || null;
}

export async function getPlayerByTelegramId(adminId: number, telegramId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(players).where(and(eq(players.adminId, adminId), eq(players.telegramId, telegramId))).limit(1);
  return rows[0] || null;
}

export async function getPlayerByInviteCode(inviteCode: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(players).where(eq(players.inviteCode, inviteCode)).limit(1);
  return rows[0] || null;
}

// ─── Deposits ───
export async function getDepositsByAdmin(adminId: number, opts?: { status?: string; page?: number; pageSize?: number }) {
  const db = await getDb();
  if (!db) return { deposits: [], total: 0 };
  const page = opts?.page || 1;
  const pageSize = opts?.pageSize || 20;
  const offset = (page - 1) * pageSize;

  let conditions: any[] = [eq(deposits.adminId, adminId)];
  if (opts?.status) conditions.push(eq(deposits.status, opts.status as any));

  const [rows, countRows] = await Promise.all([
    db.select().from(deposits).where(and(...conditions)).orderBy(desc(deposits.createdAt)).limit(pageSize).offset(offset),
    db.select({ cnt: count() }).from(deposits).where(and(...conditions)),
  ]);

  return { deposits: rows, total: countRows[0]?.cnt || 0 };
}

export async function getDepositsByPlayer(playerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(deposits).where(eq(deposits.playerId, playerId)).orderBy(desc(deposits.createdAt));
}

// ─── Withdrawals ───
export async function getWithdrawalsByAdmin(adminId: number, opts?: { status?: string; page?: number; pageSize?: number }) {
  const db = await getDb();
  if (!db) return { withdrawals: [], total: 0 };
  const page = opts?.page || 1;
  const pageSize = opts?.pageSize || 20;
  const offset = (page - 1) * pageSize;

  let conditions: any[] = [eq(withdrawals.adminId, adminId)];
  if (opts?.status) conditions.push(eq(withdrawals.status, opts.status as any));

  const [rows, countRows] = await Promise.all([
    db.select().from(withdrawals).where(and(...conditions)).orderBy(desc(withdrawals.createdAt)).limit(pageSize).offset(offset),
    db.select({ cnt: count() }).from(withdrawals).where(and(...conditions)),
  ]);

  return { withdrawals: rows, total: countRows[0]?.cnt || 0 };
}

export async function getWithdrawalsByPlayer(playerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(withdrawals).where(eq(withdrawals.playerId, playerId)).orderBy(desc(withdrawals.createdAt));
}

// ─── Bonus Configs ───
export async function getBonusesByAdmin(adminId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(bonusConfigs).where(eq(bonusConfigs.adminId, adminId)).orderBy(asc(bonusConfigs.sortOrder));
}

export async function getActiveBonusesByAdmin(adminId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(bonusConfigs).where(and(eq(bonusConfigs.adminId, adminId), eq(bonusConfigs.isActive, true))).orderBy(asc(bonusConfigs.sortOrder));
}

// ─── Player Bonuses ───
export async function getPlayerBonuses(playerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(playerBonuses).where(eq(playerBonuses.playerId, playerId)).orderBy(desc(playerBonuses.claimedAt));
}

// ─── Banks ───
export async function getBanksByAdmin(adminId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(banks).where(eq(banks.adminId, adminId)).orderBy(asc(banks.sortOrder));
}

export async function getDepositBanks(adminId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(banks).where(
    and(
      eq(banks.adminId, adminId),
      eq(banks.status, "active"),
      or(eq(banks.usageType, "deposit"), eq(banks.usageType, "both"))
    )
  ).orderBy(asc(banks.sortOrder));
}

export async function getWithdrawBanks(adminId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(banks).where(
    and(
      eq(banks.adminId, adminId),
      eq(banks.status, "active"),
      or(eq(banks.usageType, "withdraw"), eq(banks.usageType, "both"))
    )
  ).orderBy(asc(banks.sortOrder));
}

// ─── System Settings ───
export async function getSetting(adminId: number, key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(systemSettings).where(and(eq(systemSettings.adminId, adminId), eq(systemSettings.settingKey, key))).limit(1);
  return rows[0]?.settingValue || null;
}

export async function setSetting(adminId: number, key: string, value: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(systemSettings).values({ adminId, settingKey: key, settingValue: value })
    .onDuplicateKeyUpdate({ set: { settingValue: value } });
}

export async function getAllSettings(adminId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(systemSettings).where(eq(systemSettings.adminId, adminId));
}

/** System settings: min/max deposit & withdraw (Admin → Settings) */
export async function getFinanceLimits(adminId: number): Promise<{
  minDeposit?: number;
  maxDeposit?: number;
  minWithdraw?: number;
  maxWithdraw?: number;
}> {
  const parseOpt = (s: string | null): number | undefined => {
    if (s == null || String(s).trim() === "") return undefined;
    const n = parseFloat(String(s));
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  const [minD, maxD, minW, maxW] = await Promise.all([
    getSetting(adminId, "min_deposit"),
    getSetting(adminId, "max_deposit"),
    getSetting(adminId, "min_withdraw"),
    getSetting(adminId, "max_withdraw"),
  ]);
  return {
    minDeposit: parseOpt(minD),
    maxDeposit: parseOpt(maxD),
    minWithdraw: parseOpt(minW),
    maxWithdraw: parseOpt(maxW),
  };
}

// ─── Banners ───
export async function getBannersByAdmin(adminId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(banners).where(eq(banners.adminId, adminId)).orderBy(asc(banners.sortOrder));
}

export async function getActiveBanners(adminId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(banners).where(and(eq(banners.adminId, adminId), eq(banners.isActive, true))).orderBy(asc(banners.sortOrder));
}

// ─── Telegram Bots ───
export async function getTelegramBotsByAdmin(adminId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(telegramBots).where(eq(telegramBots.adminId, adminId));
}

export async function getTelegramBotById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(telegramBots).where(eq(telegramBots.id, id)).limit(1);
  return rows[0] || null;
}

// ─── Country Configs ───
export async function getCountryConfigs(adminId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(countryConfigs).where(eq(countryConfigs.adminId, adminId));
}

export async function getAllowedCountries(adminId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(countryConfigs).where(and(eq(countryConfigs.adminId, adminId), eq(countryConfigs.isAllowed, true)));
}

// ─── Deposit Presets ───
export async function getDepositPresets(adminId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(depositPresets).where(and(eq(depositPresets.adminId, adminId), eq(depositPresets.isActive, true))).orderBy(asc(depositPresets.sortOrder));
}

// ─── Game Logs ───
export async function getGameLogsByPlayer(playerId: number, opts?: { page?: number; pageSize?: number }) {
  const db = await getDb();
  if (!db) return { logs: [], total: 0 };
  const page = opts?.page || 1;
  const pageSize = opts?.pageSize || 20;
  const offset = (page - 1) * pageSize;

  const [rows, countRows] = await Promise.all([
    db.select().from(gameLogsCache).where(eq(gameLogsCache.playerId, playerId)).orderBy(desc(gameLogsCache.syncedAt)).limit(pageSize).offset(offset),
    db.select({ cnt: count() }).from(gameLogsCache).where(eq(gameLogsCache.playerId, playerId)),
  ]);

  return { logs: rows, total: countRows[0]?.cnt || 0 };
}

// ─── Admin Logs ───
export async function createAdminLog(params: {
  adminId: number;
  action: string;
  module: string;
  targetId?: number;
  targetType?: string;
  details?: any;
  ipAddress?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(adminLogs).values({
    adminId: params.adminId,
    action: params.action,
    module: params.module,
    targetId: params.targetId || null,
    targetType: params.targetType || null,
    details: params.details || null,
    ipAddress: params.ipAddress || null,
  });
}

export async function getAdminLogs(adminId: number, opts?: { page?: number; pageSize?: number; module?: string }) {
  const db = await getDb();
  if (!db) return { logs: [], total: 0 };
  const page = opts?.page || 1;
  const pageSize = opts?.pageSize || 20;
  const offset = (page - 1) * pageSize;

  let conditions: any[] = [eq(adminLogs.adminId, adminId)];
  if (opts?.module) conditions.push(eq(adminLogs.module, opts.module));

  const [rows, countRows] = await Promise.all([
    db.select().from(adminLogs).where(and(...conditions)).orderBy(desc(adminLogs.createdAt)).limit(pageSize).offset(offset),
    db.select({ cnt: count() }).from(adminLogs).where(and(...conditions)),
  ]);

  return { logs: rows, total: countRows[0]?.cnt || 0 };
}

// ─── Reports ───
export async function getReportSummary(adminId: number, startDate: Date, endDate: Date) {
  const db = await getDb();
  if (!db) return null;

  const [depositSum, withdrawSum, newPlayers, bonusSum] = await Promise.all([
    db.select({ total: sum(deposits.amount), cnt: count() }).from(deposits)
      .where(and(eq(deposits.adminId, adminId), eq(deposits.status, "approved"), gte(deposits.processedAt, startDate), lte(deposits.processedAt, endDate))),
    db.select({ total: sum(withdrawals.amount), cnt: count() }).from(withdrawals)
      .where(and(eq(withdrawals.adminId, adminId), eq(withdrawals.status, "approved"), gte(withdrawals.processedAt, startDate), lte(withdrawals.processedAt, endDate))),
    db.select({ cnt: count() }).from(players)
      .where(and(eq(players.adminId, adminId), gte(players.createdAt, startDate), lte(players.createdAt, endDate))),
    db.select({ total: sum(playerBonuses.awardedAmount), cnt: count() }).from(playerBonuses)
      .where(and(eq(playerBonuses.adminId, adminId), gte(playerBonuses.claimedAt, startDate), lte(playerBonuses.claimedAt, endDate))),
  ]);

  return {
    totalDeposits: parseFloat(depositSum[0]?.total || "0"),
    depositCount: depositSum[0]?.cnt || 0,
    totalWithdrawals: parseFloat(withdrawSum[0]?.total || "0"),
    withdrawalCount: withdrawSum[0]?.cnt || 0,
    newPlayers: newPlayers[0]?.cnt || 0,
    totalBonuses: parseFloat(bonusSum[0]?.total || "0"),
    bonusCount: bonusSum[0]?.cnt || 0,
    netRevenue: parseFloat(depositSum[0]?.total || "0") - parseFloat(withdrawSum[0]?.total || "0"),
  };
}

// ─── Player Tags ───
export async function getPlayerTags(playerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(playerTags).where(eq(playerTags.playerId, playerId));
}

// ─── Deposit Cycles ───
export async function getActiveCycle(playerId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(depositCycles).where(and(eq(depositCycles.playerId, playerId), eq(depositCycles.status, "active"))).limit(1);
  return rows[0] || null;
}

// ─── Frontend Settings ───

export async function getFrontendSettings(adminId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(frontendSettings).where(eq(frontendSettings.adminId, adminId)).limit(1);
  return rows.length > 0 ? rows[0] : null;
}

export async function upsertFrontendSettings(adminId: number, data: {
  templateId?: string;
  customCss?: string | null;
  customHeadHtml?: string | null;
  customBodyJs?: string | null;
  primaryColor?: string | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  siteName?: string | null;
  footerText?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getFrontendSettings(adminId);
  if (existing) {
    const updateData: any = {};
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined) updateData[key] = val;
    }
    await db.update(frontendSettings).set(updateData).where(eq(frontendSettings.adminId, adminId));
  } else {
    await db.insert(frontendSettings).values({
      adminId,
      templateId: data.templateId || "default",
      customCss: data.customCss || null,
      customHeadHtml: data.customHeadHtml || null,
      customBodyJs: data.customBodyJs || null,
      primaryColor: data.primaryColor || null,
      logoUrl: data.logoUrl || null,
      faviconUrl: data.faviconUrl || null,
      siteName: data.siteName || null,
      footerText: data.footerText || null,
    });
  }
  return { success: true };
}

// ─── Domain ACL ───

export async function getDomainAcl(adminId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(domainAcl).where(eq(domainAcl.adminId, adminId));
}

export async function addDomainAcl(adminId: number, domain: string, purpose: "admin" | "player" | "both") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(domainAcl).values({ adminId, domain, purpose, isActive: true });
  return { success: true, id: result[0].insertId };
}

export async function updateDomainAcl(id: number, adminId: number, data: { domain?: string; purpose?: "admin" | "player" | "both"; isActive?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData: any = {};
  if (data.domain !== undefined) updateData.domain = data.domain;
  if (data.purpose !== undefined) updateData.purpose = data.purpose;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  await db.update(domainAcl).set(updateData).where(and(eq(domainAcl.id, id), eq(domainAcl.adminId, adminId)));
  return { success: true };
}

export async function deleteDomainAcl(id: number, adminId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(domainAcl).where(and(eq(domainAcl.id, id), eq(domainAcl.adminId, adminId)));
  return { success: true };
}

// ─── Timezone Helper ───

export function formatWithTimezone(date: Date | string | null, timezoneOffset: number = 0): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const utcMs = d.getTime();
  const offsetMs = timezoneOffset * 60 * 60 * 1000;
  const adjusted = new Date(utcMs + offsetMs);
  return adjusted.toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
}

export async function getTimezoneOffset(adminId: number): Promise<number> {
  const tz = await getSetting(adminId, "timezone");
  if (!tz) return 0;
  const num = parseFloat(tz);
  return isNaN(num) ? 0 : num;
}

// ─── Bank Catalog ───
export async function getBankCatalog(country?: string): Promise<BankCatalog[]> {
  const db = await getDb();
  if (!db) return [];
  if (country) {
    return db.select().from(bankCatalog)
      .where(and(eq(bankCatalog.country, country), eq(bankCatalog.isActive, true)))
      .orderBy(bankCatalog.sortOrder);
  }
  return db.select().from(bankCatalog)
    .where(eq(bankCatalog.isActive, true))
    .orderBy(bankCatalog.sortOrder);
}
