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
  bonusPromoGroups,
  playerBonuses, PlayerBonus,
  gameLogsCache,
  adminLogs,
  systemSettings,
  referralRules,
  referralLedger,
  banners,
  depositPresets,
  countryConfigs,
  refreshTokens,
  frontendSettings,
  domainAcl,
} from "../drizzle/schema";

import { ENV } from './_core/env';
import { withdrawalEntryKind } from "./services/withdrawalKind";

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

  const mapDepositSource = (row: any): "admin_manual" | "player_bank" | "api_deposit" => {
    const paymentMethod = String(row?.paymentMethod || "");
    const apiRef = String(row?.apiPaymentRef || "").toLowerCase();
    if (paymentMethod === "api_payment" && apiRef.startsWith("manual-credit-")) return "admin_manual";
    if (paymentMethod === "api_payment") return "api_deposit";
    return "player_bank";
  };

  const rowsWithSource = rows.map((row: any) => ({
    ...row,
    sourceKind: mapDepositSource(row),
  }));

  return { deposits: rowsWithSource, total: countRows[0]?.cnt || 0 };
}

/** Deposits still needing staff action: pending (Handle) or processing (Approve/Reject) */
export async function countDepositsPendingAction(adminId: number): Promise<number> {
  const database = await getDb();
  if (!database) return 0;
  const [row] = await database
    .select({ cnt: count() })
    .from(deposits)
    .where(
      and(eq(deposits.adminId, adminId), inArray(deposits.status, ["pending", "processing"]))
    );
  return Number(row?.cnt ?? 0);
}

/** Withdrawals still needing staff action: pending (Handle) or processing (Approve/Reject) */
export async function countWithdrawalsPendingAction(adminId: number): Promise<number> {
  const database = await getDb();
  if (!database) return 0;
  const [row] = await database
    .select({ cnt: count() })
    .from(withdrawals)
    .where(
      and(eq(withdrawals.adminId, adminId), inArray(withdrawals.status, ["pending", "processing"]))
    );
  return Number(row?.cnt ?? 0);
}

export async function getDepositsByPlayer(playerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(deposits).where(eq(deposits.playerId, playerId)).orderBy(desc(deposits.createdAt));
}

// ─── Withdrawals ───
export async function getWithdrawalsByAdmin(
  adminId: number,
  opts?: {
    status?: string;
    page?: number;
    pageSize?: number;
    /** default: only player + manual payouts (excludes bonus-forfeit rows) */
    listKind?: "all" | "withdrawals" | "forfeits";
  }
) {
  const db = await getDb();
  if (!db) return { withdrawals: [], total: 0 };
  const page = opts?.page || 1;
  const pageSize = opts?.pageSize || 20;
  const offset = (page - 1) * pageSize;

  const listKind = opts?.listKind ?? "withdrawals";

  let conditions: any[] = [eq(withdrawals.adminId, adminId)];
  if (opts?.status) conditions.push(eq(withdrawals.status, opts.status as any));
  if (listKind === "forfeits") {
    conditions.push(sql`LOWER(COALESCE(${withdrawals.handleNote}, '')) LIKE '%forfeit%'`);
  } else if (listKind === "withdrawals") {
    conditions.push(sql`NOT (LOWER(COALESCE(${withdrawals.handleNote}, '')) LIKE '%forfeit%')`);
  }

  const [rows, countRows] = await Promise.all([
    db.select().from(withdrawals).where(and(...conditions)).orderBy(desc(withdrawals.createdAt)).limit(pageSize).offset(offset),
    db.select({ cnt: count() }).from(withdrawals).where(and(...conditions)),
  ]);

  const rowsWithKind = rows.map((row) => ({
    ...row,
    entryKind: withdrawalEntryKind(row.handleNote),
  }));

  return { withdrawals: rowsWithKind, total: countRows[0]?.cnt || 0 };
}

export async function getWithdrawalsByPlayer(playerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(withdrawals).where(eq(withdrawals.playerId, playerId)).orderBy(desc(withdrawals.createdAt));
}

// ─── Bonus Configs ───

export type BonusPromoGroupRow = typeof bonusPromoGroups.$inferSelect;

export async function getBonusPromoGroupsByAdmin(adminId: number): Promise<BonusPromoGroupRow[]> {
  const database = await getDb();
  if (!database) return [];
  return database
    .select()
    .from(bonusPromoGroups)
    .where(eq(bonusPromoGroups.adminId, adminId))
    .orderBy(asc(bonusPromoGroups.sortIndex), asc(bonusPromoGroups.groupKey));
}

/** 将独立分组表中的标题/横幅合并到列表（优先于 bonus_configs 上遗留字段） */
export function mergePromoGroupDisplayIntoBonuses<
  T extends { promoGroupKey?: string | null; promoGroupTitle?: string | null; promoGroupBannerUrl?: string | null },
>(bonuses: T[], groups: { groupKey: string; title: string | null; bannerUrl: string | null }[]): T[] {
  const gmap = new Map(groups.map((g) => [g.groupKey.trim(), g]));
  return bonuses.map((b) => {
    const k = String(b.promoGroupKey ?? "").trim();
    if (!k) return b;
    const g = gmap.get(k);
    if (!g) return b;
    return {
      ...b,
      promoGroupTitle: g.title ?? b.promoGroupTitle ?? null,
      promoGroupBannerUrl: g.bannerUrl ?? b.promoGroupBannerUrl ?? null,
    };
  });
}

export async function getBonusesByAdmin(adminId: number) {
  const database = await getDb();
  if (!database) return [];
  const bonuses = await database
    .select()
    .from(bonusConfigs)
    .where(eq(bonusConfigs.adminId, adminId))
    .orderBy(asc(bonusConfigs.promoGroupSort), asc(bonusConfigs.sortOrder));
  const metaRows = await getBonusPromoGroupsByAdmin(adminId);
  const meta = metaRows.map((g) => ({ groupKey: g.groupKey, title: g.title, bannerUrl: g.bannerUrl }));
  return mergePromoGroupDisplayIntoBonuses(bonuses, meta);
}

export async function getActiveBonusesByAdmin(adminId: number) {
  const database = await getDb();
  if (!database) return [];
  const bonuses = await database
    .select()
    .from(bonusConfigs)
    .where(and(eq(bonusConfigs.adminId, adminId), eq(bonusConfigs.isActive, true)))
    .orderBy(asc(bonusConfigs.promoGroupSort), asc(bonusConfigs.sortOrder));
  const metaRows = await getBonusPromoGroupsByAdmin(adminId);
  const meta = metaRows.map((g) => ({ groupKey: g.groupKey, title: g.title, bannerUrl: g.bannerUrl }));
  return mergePromoGroupDisplayIntoBonuses(bonuses, meta);
}

export type ReferralRuleConfig = {
  commissionEnabled: boolean;
  inviteRewardEnabled: boolean;
  inviteRewardThreshold: number;
  inviteRewardAmount: number;
  firstDepositRewardEnabled: boolean;
  firstDepositPercent: number;
  firstDepositMaxAmount: number;
  rebateEnabled: boolean;
  rebatePercent: number;
  rebateBase: "valid_bet" | "net_loss";
  rebateMinBase: number;
};

export const DEFAULT_REFERRAL_RULE: ReferralRuleConfig = {
  commissionEnabled: false,
  inviteRewardEnabled: false,
  inviteRewardThreshold: 0,
  inviteRewardAmount: 0,
  firstDepositRewardEnabled: false,
  firstDepositPercent: 0,
  firstDepositMaxAmount: 0,
  rebateEnabled: false,
  rebatePercent: 0,
  rebateBase: "valid_bet",
  rebateMinBase: 0,
};

const parseMoney = (v: unknown) => {
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
};

export async function getReferralRuleByAdmin(adminId: number): Promise<ReferralRuleConfig> {
  const database = await getDb();
  if (!database) return { ...DEFAULT_REFERRAL_RULE };
  const [row] = await database
    .select()
    .from(referralRules)
    .where(eq(referralRules.adminId, adminId))
    .limit(1);
  if (!row) return { ...DEFAULT_REFERRAL_RULE };
  return {
    commissionEnabled: !!row.commissionEnabled,
    inviteRewardEnabled: !!row.inviteRewardEnabled,
    inviteRewardThreshold: Math.max(0, Number(row.inviteRewardThreshold || 0)),
    inviteRewardAmount: Math.max(0, parseMoney(row.inviteRewardAmount)),
    firstDepositRewardEnabled: !!row.firstDepositRewardEnabled,
    firstDepositPercent: Math.max(0, parseMoney(row.firstDepositPercent)),
    firstDepositMaxAmount: Math.max(0, parseMoney(row.firstDepositMaxAmount)),
    rebateEnabled: !!row.rebateEnabled,
    rebatePercent: Math.max(0, parseMoney(row.rebatePercent)),
    rebateBase: row.rebateBase === "net_loss" ? "net_loss" : "valid_bet",
    rebateMinBase: Math.max(0, parseMoney(row.rebateMinBase)),
  };
}

export async function upsertReferralRuleByAdmin(adminId: number, rule: ReferralRuleConfig): Promise<void> {
  const database = await getDb();
  if (!database) return;
  await database
    .insert(referralRules)
    .values({
      adminId,
      commissionEnabled: !!rule.commissionEnabled,
      inviteRewardEnabled: !!rule.inviteRewardEnabled,
      inviteRewardThreshold: Math.max(0, Math.floor(rule.inviteRewardThreshold || 0)),
      inviteRewardAmount: Math.max(0, rule.inviteRewardAmount || 0).toFixed(4),
      firstDepositRewardEnabled: !!rule.firstDepositRewardEnabled,
      firstDepositPercent: Math.max(0, rule.firstDepositPercent || 0).toFixed(4),
      firstDepositMaxAmount: Math.max(0, rule.firstDepositMaxAmount || 0).toFixed(4),
      rebateEnabled: !!rule.rebateEnabled,
      rebatePercent: Math.max(0, rule.rebatePercent || 0).toFixed(4),
      rebateBase: rule.rebateBase === "net_loss" ? "net_loss" : "valid_bet",
      rebateMinBase: Math.max(0, rule.rebateMinBase || 0).toFixed(4),
    })
    .onDuplicateKeyUpdate({
      set: {
        commissionEnabled: !!rule.commissionEnabled,
        inviteRewardEnabled: !!rule.inviteRewardEnabled,
        inviteRewardThreshold: Math.max(0, Math.floor(rule.inviteRewardThreshold || 0)),
        inviteRewardAmount: Math.max(0, rule.inviteRewardAmount || 0).toFixed(4),
        firstDepositRewardEnabled: !!rule.firstDepositRewardEnabled,
        firstDepositPercent: Math.max(0, rule.firstDepositPercent || 0).toFixed(4),
        firstDepositMaxAmount: Math.max(0, rule.firstDepositMaxAmount || 0).toFixed(4),
        rebateEnabled: !!rule.rebateEnabled,
        rebatePercent: Math.max(0, rule.rebatePercent || 0).toFixed(4),
        rebateBase: rule.rebateBase === "net_loss" ? "net_loss" : "valid_bet",
        rebateMinBase: Math.max(0, rule.rebateMinBase || 0).toFixed(4),
      },
    });
}

export async function listReferralLedgerByAdmin(
  adminId: number,
  opts?: { limit?: number }
) {
  const database = await getDb();
  if (!database) return [];
  const limit = Math.min(200, Math.max(1, Number(opts?.limit || 100)));
  return database
    .select()
    .from(referralLedger)
    .where(eq(referralLedger.adminId, adminId))
    .orderBy(desc(referralLedger.createdAt))
    .limit(limit);
}

export async function createBonusPromoGroup(
  adminId: number,
  input: { groupKey: string; title?: string | null; bannerUrl?: string | null }
): Promise<{ id: number }> {
  const database = await getDb();
  if (!database) throw new Error("Database unavailable");
  const key = input.groupKey.trim().slice(0, 128);
  if (!key) throw new Error("Empty group key");

  const [maxRow] = await database
    .select({ m: sql<number>`COALESCE(MAX(${bonusPromoGroups.sortIndex}), -1)` })
    .from(bonusPromoGroups)
    .where(eq(bonusPromoGroups.adminId, adminId));
  const nextSort = Number(maxRow?.m ?? -1) + 1;

  const result = await database.insert(bonusPromoGroups).values({
    adminId,
    groupKey: key,
    title: input.title?.trim().slice(0, 256) || null,
    bannerUrl: input.bannerUrl?.trim() || null,
    sortIndex: nextSort,
  });
  const insertId = (result as unknown as { insertId: number }[])[0]?.insertId;
  return { id: Number(insertId ?? 0) };
}

/** 更新或插入分组展示字段（标题、横幅）；无表行时会插入一行 */
export async function upsertBonusPromoGroupDisplay(
  adminId: number,
  groupKey: string,
  fields: { title?: string | null; bannerUrl?: string | null }
): Promise<void> {
  const database = await getDb();
  if (!database) throw new Error("Database unavailable");
  const key = groupKey.trim().slice(0, 128);
  if (!key) throw new Error("Empty group key");

  const [maxRow] = await database
    .select({ m: sql<number>`COALESCE(MAX(${bonusPromoGroups.sortIndex}), -1)` })
    .from(bonusPromoGroups)
    .where(eq(bonusPromoGroups.adminId, adminId));
  const nextSort = Number(maxRow?.m ?? -1) + 1;

  const title = fields.title !== undefined ? (fields.title ? String(fields.title).trim().slice(0, 256) : null) : undefined;
  const bannerUrl = fields.bannerUrl !== undefined ? (fields.bannerUrl?.trim() || null) : undefined;

  await database
    .insert(bonusPromoGroups)
    .values({
      adminId,
      groupKey: key,
      title: title ?? null,
      bannerUrl: bannerUrl ?? null,
      sortIndex: nextSort,
    })
    .onDuplicateKeyUpdate({
      set: {
        ...(title !== undefined ? { title } : {}),
        ...(bannerUrl !== undefined ? { bannerUrl } : {}),
      },
    });
}

export async function deleteBonusPromoGroupIfEmpty(adminId: number, groupKey: string): Promise<{ ok: boolean; reason?: string }> {
  const database = await getDb();
  if (!database) return { ok: false, reason: "db" };
  const key = groupKey.trim().slice(0, 128);
  if (!key) return { ok: false, reason: "empty_key" };
  const [cntRow] = await database
    .select({ c: count() })
    .from(bonusConfigs)
    .where(and(eq(bonusConfigs.adminId, adminId), eq(bonusConfigs.promoGroupKey, key)));
  if (Number(cntRow?.c ?? 0) > 0) return { ok: false, reason: "has_bonuses" };
  await database.delete(bonusPromoGroups).where(and(eq(bonusPromoGroups.adminId, adminId), eq(bonusPromoGroups.groupKey, key)));
  return { ok: true };
}

/** 保存活动时若填写了分组 Key，确保分组表存在一行（便于空壳分组与前台合并） */
export async function ensureBonusPromoGroupRow(adminId: number, rawKey: string): Promise<void> {
  const database = await getDb();
  if (!database) return;
  const k = rawKey.trim().slice(0, 128);
  if (!k) return;
  const [existing] = await database
    .select({ id: bonusPromoGroups.id })
    .from(bonusPromoGroups)
    .where(and(eq(bonusPromoGroups.adminId, adminId), eq(bonusPromoGroups.groupKey, k)))
    .limit(1);
  if (existing) return;
  const [maxRow] = await database
    .select({ m: sql<number>`COALESCE(MAX(${bonusPromoGroups.sortIndex}), -1)` })
    .from(bonusPromoGroups)
    .where(eq(bonusPromoGroups.adminId, adminId));
  const nextSort = Number(maxRow?.m ?? -1) + 1;
  await database.insert(bonusPromoGroups).values({
    adminId,
    groupKey: k,
    title: null,
    bannerUrl: null,
    sortIndex: nextSort,
  });
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
  const excludeForfeit = sql`NOT (LOWER(COALESCE(${withdrawals.handleNote}, '')) LIKE '%forfeit%')`;

  const [approvedDeposits, approvedWithdrawals, pendingDeposits, pendingWithdrawals, rejectedDeposits, rejectedWithdrawals, newPlayers, totalPlayers, bonusSum, depositPlayerCount, withdrawalPlayerCount, banksByAdmin, approvedDepositByBank, pendingDepositByBank, approvedWithdrawalByBank, pendingWithdrawalByBank, depositTxRows, withdrawalTxRows, approvedDepositDetailRows, approvedWithdrawalDetailRows, pendingDepositDetailRows, pendingWithdrawalDetailRows, bonusDetailRows, newPlayerDetailRows] = await Promise.all([
    db.select({ total: sum(deposits.amount), cnt: count() }).from(deposits)
      .where(and(eq(deposits.adminId, adminId), eq(deposits.status, "approved"), gte(deposits.processedAt, startDate), lte(deposits.processedAt, endDate))),
    db.select({ total: sum(withdrawals.amount), cnt: count() }).from(withdrawals)
      .where(and(eq(withdrawals.adminId, adminId), eq(withdrawals.status, "approved"), excludeForfeit, gte(withdrawals.processedAt, startDate), lte(withdrawals.processedAt, endDate))),
    db.select({ total: sum(deposits.amount), cnt: count() }).from(deposits)
      .where(and(eq(deposits.adminId, adminId), inArray(deposits.status, ["pending", "processing"]), gte(deposits.createdAt, startDate), lte(deposits.createdAt, endDate))),
    db.select({ total: sum(withdrawals.amount), cnt: count() }).from(withdrawals)
      .where(and(eq(withdrawals.adminId, adminId), inArray(withdrawals.status, ["pending", "processing"]), excludeForfeit, gte(withdrawals.createdAt, startDate), lte(withdrawals.createdAt, endDate))),
    db.select({ total: sum(deposits.amount), cnt: count() }).from(deposits)
      .where(and(eq(deposits.adminId, adminId), eq(deposits.status, "rejected"), gte(deposits.createdAt, startDate), lte(deposits.createdAt, endDate))),
    db.select({ total: sum(withdrawals.amount), cnt: count() }).from(withdrawals)
      .where(and(eq(withdrawals.adminId, adminId), eq(withdrawals.status, "rejected"), excludeForfeit, gte(withdrawals.createdAt, startDate), lte(withdrawals.createdAt, endDate))),
    db.select({ cnt: count() }).from(players)
      .where(and(eq(players.adminId, adminId), gte(players.createdAt, startDate), lte(players.createdAt, endDate))),
    db.select({ cnt: count() }).from(players)
      .where(eq(players.adminId, adminId)),
    db.select({ total: sum(playerBonuses.awardedAmount), cnt: count() }).from(playerBonuses)
      .where(and(eq(playerBonuses.adminId, adminId), gte(playerBonuses.claimedAt, startDate), lte(playerBonuses.claimedAt, endDate))),
    db.select({ cnt: sql<number>`count(distinct ${deposits.playerId})` }).from(deposits)
      .where(and(eq(deposits.adminId, adminId), eq(deposits.status, "approved"), gte(deposits.processedAt, startDate), lte(deposits.processedAt, endDate))),
    db.select({ cnt: sql<number>`count(distinct ${withdrawals.playerId})` }).from(withdrawals)
      .where(and(eq(withdrawals.adminId, adminId), eq(withdrawals.status, "approved"), excludeForfeit, gte(withdrawals.processedAt, startDate), lte(withdrawals.processedAt, endDate))),
    db.select({
      id: banks.id,
      bankName: banks.bankName,
      accountName: banks.accountName,
      accountNumber: banks.accountNumber,
      usageType: banks.usageType,
      status: banks.status,
    }).from(banks).where(eq(banks.adminId, adminId)),
    db.select({
      bankId: deposits.bankId,
      total: sum(deposits.amount),
      cnt: count(),
    }).from(deposits)
      .where(and(eq(deposits.adminId, adminId), eq(deposits.status, "approved"), gte(deposits.processedAt, startDate), lte(deposits.processedAt, endDate)))
      .groupBy(deposits.bankId),
    db.select({
      bankId: deposits.bankId,
      total: sum(deposits.amount),
      cnt: count(),
    }).from(deposits)
      .where(and(eq(deposits.adminId, adminId), inArray(deposits.status, ["pending", "processing"]), gte(deposits.createdAt, startDate), lte(deposits.createdAt, endDate)))
      .groupBy(deposits.bankId),
    db.select({
      bankName: withdrawals.bankName,
      total: sum(withdrawals.amount),
      cnt: count(),
    }).from(withdrawals)
      .where(and(eq(withdrawals.adminId, adminId), eq(withdrawals.status, "approved"), excludeForfeit, gte(withdrawals.processedAt, startDate), lte(withdrawals.processedAt, endDate)))
      .groupBy(withdrawals.bankName),
    db.select({
      bankName: withdrawals.bankName,
      total: sum(withdrawals.amount),
      cnt: count(),
    }).from(withdrawals)
      .where(and(eq(withdrawals.adminId, adminId), inArray(withdrawals.status, ["pending", "processing"]), excludeForfeit, gte(withdrawals.createdAt, startDate), lte(withdrawals.createdAt, endDate)))
      .groupBy(withdrawals.bankName),
    db.select({
      id: deposits.id,
      playerId: deposits.playerId,
      amount: deposits.amount,
      status: deposits.status,
      bankId: deposits.bankId,
      handleNote: deposits.handleNote,
      createdAt: deposits.createdAt,
      processedAt: deposits.processedAt,
    }).from(deposits)
      .where(and(eq(deposits.adminId, adminId), gte(deposits.createdAt, startDate), lte(deposits.createdAt, endDate)))
      .orderBy(desc(deposits.createdAt))
      .limit(300),
    db.select({
      id: withdrawals.id,
      playerId: withdrawals.playerId,
      amount: withdrawals.amount,
      status: withdrawals.status,
      bankName: withdrawals.bankName,
      bankAccountName: withdrawals.bankAccountName,
      bankAccountNumber: withdrawals.bankAccountNumber,
      handleNote: withdrawals.handleNote,
      createdAt: withdrawals.createdAt,
      processedAt: withdrawals.processedAt,
    }).from(withdrawals)
      .where(and(eq(withdrawals.adminId, adminId), excludeForfeit, gte(withdrawals.createdAt, startDate), lte(withdrawals.createdAt, endDate)))
      .orderBy(desc(withdrawals.createdAt))
      .limit(300),
    db.select({
      id: deposits.id,
      playerId: deposits.playerId,
      amount: deposits.amount,
      status: deposits.status,
      paymentMethod: deposits.paymentMethod,
      apiPaymentRef: deposits.apiPaymentRef,
      bankId: deposits.bankId,
      createdAt: deposits.createdAt,
      processedAt: deposits.processedAt,
      handleNote: deposits.handleNote,
    }).from(deposits)
      .where(and(eq(deposits.adminId, adminId), eq(deposits.status, "approved"), gte(deposits.processedAt, startDate), lte(deposits.processedAt, endDate)))
      .orderBy(desc(deposits.processedAt))
      .limit(2000),
    db.select({
      id: withdrawals.id,
      playerId: withdrawals.playerId,
      amount: withdrawals.amount,
      status: withdrawals.status,
      bankName: withdrawals.bankName,
      bankAccountName: withdrawals.bankAccountName,
      bankAccountNumber: withdrawals.bankAccountNumber,
      createdAt: withdrawals.createdAt,
      processedAt: withdrawals.processedAt,
      handleNote: withdrawals.handleNote,
    }).from(withdrawals)
      .where(and(eq(withdrawals.adminId, adminId), eq(withdrawals.status, "approved"), excludeForfeit, gte(withdrawals.processedAt, startDate), lte(withdrawals.processedAt, endDate)))
      .orderBy(desc(withdrawals.processedAt))
      .limit(2000),
    db.select({
      id: deposits.id,
      playerId: deposits.playerId,
      amount: deposits.amount,
      status: deposits.status,
      paymentMethod: deposits.paymentMethod,
      apiPaymentRef: deposits.apiPaymentRef,
      bankId: deposits.bankId,
      createdAt: deposits.createdAt,
      processedAt: deposits.processedAt,
      handleNote: deposits.handleNote,
    }).from(deposits)
      .where(and(eq(deposits.adminId, adminId), inArray(deposits.status, ["pending", "processing"]), gte(deposits.createdAt, startDate), lte(deposits.createdAt, endDate)))
      .orderBy(desc(deposits.createdAt))
      .limit(2000),
    db.select({
      id: withdrawals.id,
      playerId: withdrawals.playerId,
      amount: withdrawals.amount,
      status: withdrawals.status,
      bankName: withdrawals.bankName,
      bankAccountName: withdrawals.bankAccountName,
      bankAccountNumber: withdrawals.bankAccountNumber,
      createdAt: withdrawals.createdAt,
      processedAt: withdrawals.processedAt,
      handleNote: withdrawals.handleNote,
    }).from(withdrawals)
      .where(and(eq(withdrawals.adminId, adminId), inArray(withdrawals.status, ["pending", "processing"]), excludeForfeit, gte(withdrawals.createdAt, startDate), lte(withdrawals.createdAt, endDate)))
      .orderBy(desc(withdrawals.createdAt))
      .limit(2000),
    db.select({
      id: playerBonuses.id,
      playerId: playerBonuses.playerId,
      bonusConfigId: playerBonuses.bonusConfigId,
      awardedAmount: playerBonuses.awardedAmount,
      status: playerBonuses.status,
      claimedAt: playerBonuses.claimedAt,
    }).from(playerBonuses)
      .where(and(eq(playerBonuses.adminId, adminId), gte(playerBonuses.claimedAt, startDate), lte(playerBonuses.claimedAt, endDate)))
      .orderBy(desc(playerBonuses.claimedAt))
      .limit(2000),
    db.select({
      id: players.id,
      telegramUsername: players.telegramUsername,
      telegramFirstName: players.telegramFirstName,
      telegramLastName: players.telegramLastName,
      phone: players.phone,
      invitedBy: players.invitedBy,
      createdAt: players.createdAt,
    }).from(players)
      .where(and(eq(players.adminId, adminId), gte(players.createdAt, startDate), lte(players.createdAt, endDate)))
      .orderBy(desc(players.createdAt))
      .limit(2000),
  ]);

  const toNum = (v: any) => parseFloat(v || "0") || 0;
  const totalDeposits = toNum(approvedDeposits[0]?.total);
  const totalWithdrawals = toNum(approvedWithdrawals[0]?.total);
  const totalBonuses = toNum(bonusSum[0]?.total);
  const pendingDepositAmount = toNum(pendingDeposits[0]?.total);
  const pendingWithdrawalAmount = toNum(pendingWithdrawals[0]?.total);
  const rejectedDepositAmount = toNum(rejectedDeposits[0]?.total);
  const rejectedWithdrawalAmount = toNum(rejectedWithdrawals[0]?.total);
  const depositCount = Number(approvedDeposits[0]?.cnt || 0);
  const withdrawalCount = Number(approvedWithdrawals[0]?.cnt || 0);
  const bonusCount = Number(bonusSum[0]?.cnt || 0);
  const netCashflow = totalDeposits - totalWithdrawals;
  const netRevenue = totalDeposits - totalWithdrawals - totalBonuses;
  const depositPlayers = Number(depositPlayerCount[0]?.cnt || 0);
  const withdrawalPlayers = Number(withdrawalPlayerCount[0]?.cnt || 0);
  const avgDeposit = depositCount > 0 ? totalDeposits / depositCount : 0;
  const avgWithdrawal = withdrawalCount > 0 ? totalWithdrawals / withdrawalCount : 0;
  const bonusCostRate = totalDeposits > 0 ? (totalBonuses / totalDeposits) * 100 : 0;
  const withdrawalRate = totalDeposits > 0 ? (totalWithdrawals / totalDeposits) * 100 : 0;

  const bankById = new Map<number, any>();
  const bankKeyByName = new Map<string, string>();
  const bankBreakdownMap = new Map<string, any>();
  const normalizeName = (name: any) => String(name || "").trim().toLowerCase();
  const ensureRow = (key: string, seed: any) => {
    if (!bankBreakdownMap.has(key)) {
      bankBreakdownMap.set(key, {
        bankKey: key,
        bankId: seed.bankId ?? null,
        bankName: seed.bankName || "Unknown",
        accountName: seed.accountName || "",
        accountNumber: seed.accountNumber || "",
        usageType: seed.usageType || "",
        status: seed.status || "",
        depositApprovedAmount: 0,
        depositApprovedCount: 0,
        depositPendingAmount: 0,
        depositPendingCount: 0,
        withdrawalApprovedAmount: 0,
        withdrawalApprovedCount: 0,
        withdrawalPendingAmount: 0,
        withdrawalPendingCount: 0,
      });
    }
    return bankBreakdownMap.get(key);
  };

  for (const b of banksByAdmin) {
    bankById.set(b.id, b);
    const key = `bank:${b.id}`;
    ensureRow(key, {
      bankId: b.id,
      bankName: b.bankName,
      accountName: b.accountName,
      accountNumber: b.accountNumber,
      usageType: b.usageType,
      status: b.status,
    });
    const n = normalizeName(b.bankName);
    if (n && !bankKeyByName.has(n)) bankKeyByName.set(n, key);
  }

  for (const row of approvedDepositByBank) {
    const bank = row.bankId ? bankById.get(Number(row.bankId)) : null;
    const key = bank ? `bank:${bank.id}` : "bank:unknown_deposit";
    const target = ensureRow(key, {
      bankId: bank?.id ?? null,
      bankName: bank?.bankName || "Unknown Deposit Bank",
      accountName: bank?.accountName || "",
      accountNumber: bank?.accountNumber || "",
      usageType: bank?.usageType || "",
      status: bank?.status || "",
    });
    target.depositApprovedAmount += toNum(row.total);
    target.depositApprovedCount += Number(row.cnt || 0);
  }

  for (const row of pendingDepositByBank) {
    const bank = row.bankId ? bankById.get(Number(row.bankId)) : null;
    const key = bank ? `bank:${bank.id}` : "bank:unknown_deposit";
    const target = ensureRow(key, {
      bankId: bank?.id ?? null,
      bankName: bank?.bankName || "Unknown Deposit Bank",
      accountName: bank?.accountName || "",
      accountNumber: bank?.accountNumber || "",
      usageType: bank?.usageType || "",
      status: bank?.status || "",
    });
    target.depositPendingAmount += toNum(row.total);
    target.depositPendingCount += Number(row.cnt || 0);
  }

  for (const row of approvedWithdrawalByBank) {
    const rawName = String(row.bankName || "").trim();
    const normalized = normalizeName(rawName);
    const key = normalized && bankKeyByName.get(normalized)
      ? bankKeyByName.get(normalized)!
      : `withdraw:${normalized || "unknown"}`;
    const target = ensureRow(key, {
      bankName: rawName || "Unknown Withdraw Bank",
    });
    target.withdrawalApprovedAmount += toNum(row.total);
    target.withdrawalApprovedCount += Number(row.cnt || 0);
  }

  for (const row of pendingWithdrawalByBank) {
    const rawName = String(row.bankName || "").trim();
    const normalized = normalizeName(rawName);
    const key = normalized && bankKeyByName.get(normalized)
      ? bankKeyByName.get(normalized)!
      : `withdraw:${normalized || "unknown"}`;
    const target = ensureRow(key, {
      bankName: rawName || "Unknown Withdraw Bank",
    });
    target.withdrawalPendingAmount += toNum(row.total);
    target.withdrawalPendingCount += Number(row.cnt || 0);
  }

  const bankBreakdown = Array.from(bankBreakdownMap.values())
    .map((row: any) => ({
      ...row,
      netApproved: row.depositApprovedAmount - row.withdrawalApprovedAmount,
      totalVolume:
        row.depositApprovedAmount +
        row.depositPendingAmount +
        row.withdrawalApprovedAmount +
        row.withdrawalPendingAmount,
    }))
    .sort((a: any, b: any) => b.totalVolume - a.totalVolume);

  const detailPlayerIds = [
    ...approvedDepositDetailRows.map((r: any) => Number(r.playerId || 0)),
    ...approvedWithdrawalDetailRows.map((r: any) => Number(r.playerId || 0)),
    ...pendingDepositDetailRows.map((r: any) => Number(r.playerId || 0)),
    ...pendingWithdrawalDetailRows.map((r: any) => Number(r.playerId || 0)),
    ...bonusDetailRows.map((r: any) => Number(r.playerId || 0)),
  ];

  const txPlayerIds = Array.from(
    new Set(
      [...depositTxRows, ...withdrawalTxRows]
        .map((r: any) => Number(r.playerId || 0))
        .filter((id) => id > 0)
    )
  );
  const allPlayerIds = Array.from(new Set([...txPlayerIds, ...detailPlayerIds].filter((id) => id > 0)));
  const playerRows = allPlayerIds.length
    ? await db.select({
      id: players.id,
      telegramUsername: players.telegramUsername,
      telegramFirstName: players.telegramFirstName,
      telegramLastName: players.telegramLastName,
    }).from(players).where(and(eq(players.adminId, adminId), inArray(players.id, allPlayerIds)))
    : [];
  const playerMap = new Map<number, any>(playerRows.map((p: any) => [Number(p.id), p]));

  const bonusConfigIds = Array.from(new Set(bonusDetailRows.map((r: any) => Number(r.bonusConfigId || 0)).filter((id) => id > 0)));
  const bonusConfigRows = bonusConfigIds.length
    ? await db.select({
      id: bonusConfigs.id,
      name: bonusConfigs.name,
    }).from(bonusConfigs).where(and(eq(bonusConfigs.adminId, adminId), inArray(bonusConfigs.id, bonusConfigIds)))
    : [];
  const bonusConfigMap = new Map<number, string>(bonusConfigRows.map((b: any) => [Number(b.id), String(b.name || "")]));

  const mapDepositSource = (row: any): "admin_manual" | "player_bank" | "api_deposit" => {
    const paymentMethod = String(row?.paymentMethod || "");
    const apiRef = String(row?.apiPaymentRef || "").toLowerCase();
    if (paymentMethod === "api_payment" && apiRef.startsWith("manual-credit-")) return "admin_manual";
    if (paymentMethod === "api_payment") return "api_deposit";
    return "player_bank";
  };

  const bankTransactions = [
    ...depositTxRows.map((r: any) => {
      const player = playerMap.get(Number(r.playerId));
      const bank = r.bankId ? bankById.get(Number(r.bankId)) : null;
      const eventAt = r.processedAt || r.createdAt;
      return {
        id: `D-${r.id}`,
        txType: "deposit",
        status: r.status,
        amount: toNum(r.amount),
        playerId: Number(r.playerId),
        playerName:
          [player?.telegramFirstName, player?.telegramLastName].filter(Boolean).join(" ").trim() ||
          player?.telegramFirstName ||
          player?.telegramUsername ||
          `Player#${r.playerId}`,
        playerUsername: player?.telegramUsername || "",
        bankName: bank?.bankName || "Unknown Deposit Bank",
        bankAccountName: bank?.accountName || "",
        bankAccountNumber: bank?.accountNumber || "",
        bankKey: bank?.id ? `bank:${bank.id}` : `bank-name:${normalizeName(bank?.bankName || "unknown")}`,
        note: r.handleNote || "",
        createdAt: r.createdAt,
        processedAt: r.processedAt,
        eventAt,
      };
    }),
    ...withdrawalTxRows.map((r: any) => {
      const player = playerMap.get(Number(r.playerId));
      const eventAt = r.processedAt || r.createdAt;
      const normalized = normalizeName(r.bankName || "");
      const bankKey = normalized && bankKeyByName.get(normalized)
        ? bankKeyByName.get(normalized)!
        : `bank-name:${normalized || "unknown"}`;
      return {
        id: `W-${r.id}`,
        txType: "withdrawal",
        status: r.status,
        amount: toNum(r.amount),
        playerId: Number(r.playerId),
        playerName:
          [player?.telegramFirstName, player?.telegramLastName].filter(Boolean).join(" ").trim() ||
          player?.telegramFirstName ||
          player?.telegramUsername ||
          `Player#${r.playerId}`,
        playerUsername: player?.telegramUsername || "",
        bankName: r.bankName || "Unknown Withdraw Bank",
        bankAccountName: r.bankAccountName || "",
        bankAccountNumber: r.bankAccountNumber || "",
        bankKey,
        note: r.handleNote || "",
        createdAt: r.createdAt,
        processedAt: r.processedAt,
        eventAt,
      };
    }),
  ]
    .sort((a: any, b: any) => new Date(b.eventAt || 0).getTime() - new Date(a.eventAt || 0).getTime())
    .slice(0, 400);

  const toPlayerMeta = (playerId: number) => {
    const player = playerMap.get(Number(playerId));
    return {
      playerName:
        [player?.telegramFirstName, player?.telegramLastName].filter(Boolean).join(" ").trim() ||
        player?.telegramFirstName ||
        player?.telegramUsername ||
        `Player#${playerId}`,
      playerUsername: player?.telegramUsername || "",
    };
  };

  const approvedDepositDetails = approvedDepositDetailRows.map((r: any) => {
    const bank = r.bankId ? bankById.get(Number(r.bankId)) : null;
    return {
      id: r.id,
      amount: toNum(r.amount),
      status: r.status,
      sourceKind: mapDepositSource(r),
      bankName: bank?.bankName || "Unknown Deposit Bank",
      createdAt: r.createdAt,
      processedAt: r.processedAt,
      ...toPlayerMeta(Number(r.playerId)),
    };
  });

  const pendingDepositDetails = pendingDepositDetailRows.map((r: any) => {
    const bank = r.bankId ? bankById.get(Number(r.bankId)) : null;
    return {
      id: r.id,
      amount: toNum(r.amount),
      status: r.status,
      sourceKind: mapDepositSource(r),
      bankName: bank?.bankName || "Unknown Deposit Bank",
      createdAt: r.createdAt,
      processedAt: r.processedAt,
      ...toPlayerMeta(Number(r.playerId)),
    };
  });

  const approvedWithdrawalDetails = approvedWithdrawalDetailRows.map((r: any) => ({
    id: r.id,
    amount: toNum(r.amount),
    status: r.status,
    bankName: r.bankName || "Unknown Withdraw Bank",
    createdAt: r.createdAt,
    processedAt: r.processedAt,
    ...toPlayerMeta(Number(r.playerId)),
  }));

  const pendingWithdrawalDetails = pendingWithdrawalDetailRows.map((r: any) => ({
    id: r.id,
    amount: toNum(r.amount),
    status: r.status,
    bankName: r.bankName || "Unknown Withdraw Bank",
    createdAt: r.createdAt,
    processedAt: r.processedAt,
    ...toPlayerMeta(Number(r.playerId)),
  }));

  const bonusDetails = bonusDetailRows.map((r: any) => ({
    id: r.id,
    bonusName: bonusConfigMap.get(Number(r.bonusConfigId)) || `Bonus#${r.bonusConfigId}`,
    amount: toNum(r.awardedAmount),
    status: r.status,
    claimedAt: r.claimedAt,
    ...toPlayerMeta(Number(r.playerId)),
  }));

  const newPlayerDetails = newPlayerDetailRows.map((r: any) => ({
    id: r.id,
    playerName:
      [r.telegramFirstName, r.telegramLastName].filter(Boolean).join(" ").trim() ||
      r.telegramFirstName ||
      r.telegramUsername ||
      `Player#${r.id}`,
    playerUsername: r.telegramUsername || "",
    phone: r.phone || "",
    invitedBy: r.invitedBy || null,
    createdAt: r.createdAt,
  }));

  const dayKey = (d: any) => {
    const t = d ? new Date(d) : null;
    if (!t || Number.isNaN(t.getTime())) return "";
    const y = t.getFullYear();
    const m = `${t.getMonth() + 1}`.padStart(2, "0");
    const day = `${t.getDate()}`.padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const money2 = (n: number) => Math.round((n || 0) * 100) / 100;

  const customerDaily = new Map<string, {
    date: string;
    newCustomers: number;
    repeatCustomer: number;
    totalCustomer: number;
    firstDepositCustomer: number;
    firstDepositAmount: number;
    depositCustomer: number;
    depositCount: number;
    depositAmount: number;
    withdrawCustomer: number;
    withdrawCount: number;
    withdrawAmount: number;
    netAmount: number;
    bonusAmount: number;
  }>();
  const ensureDaily = (date: string) => {
    if (!customerDaily.has(date)) {
      customerDaily.set(date, {
        date,
        newCustomers: 0,
        repeatCustomer: 0,
        totalCustomer: 0,
        firstDepositCustomer: 0,
        firstDepositAmount: 0,
        depositCustomer: 0,
        depositCount: 0,
        depositAmount: 0,
        withdrawCustomer: 0,
        withdrawCount: 0,
        withdrawAmount: 0,
        netAmount: 0,
        bonusAmount: 0,
      });
    }
    return customerDaily.get(date)!;
  };

  for (const row of newPlayerDetails) {
    const d = dayKey(row.createdAt);
    if (!d) continue;
    const daily = ensureDaily(d);
    daily.newCustomers += 1;
  }
  for (const row of approvedDepositDetails) {
    const d = dayKey(row.processedAt || row.createdAt);
    if (!d) continue;
    const daily = ensureDaily(d);
    daily.depositCount += 1;
    daily.depositAmount += toNum(row.amount);
  }
  const depCountByPlayer = new Map<string, number>();
  for (const row of approvedDepositDetails) {
    const d = dayKey(row.processedAt || row.createdAt);
    if (!d) continue;
    const key = `${d}::${row.playerName}::${row.playerUsername}`;
    depCountByPlayer.set(key, (depCountByPlayer.get(key) || 0) + 1);
  }
  for (const row of approvedDepositDetails) {
    const d = dayKey(row.processedAt || row.createdAt);
    if (!d) continue;
    const daily = ensureDaily(d);
    const pset = (daily as any)._depPlayers || new Set<string>();
    const pkey = `${row.playerName}::${row.playerUsername}`;
    if (!pset.has(pkey)) {
      pset.add(pkey);
      daily.depositCustomer += 1;
    }
    (daily as any)._depPlayers = pset;
  }
  for (const row of approvedWithdrawalDetails) {
    const d = dayKey(row.processedAt || row.createdAt);
    if (!d) continue;
    const daily = ensureDaily(d);
    daily.withdrawCount += 1;
    daily.withdrawAmount += toNum(row.amount);
    const pset = (daily as any)._wdPlayers || new Set<string>();
    const pkey = `${row.playerName}::${row.playerUsername}`;
    if (!pset.has(pkey)) {
      pset.add(pkey);
      daily.withdrawCustomer += 1;
    }
    (daily as any)._wdPlayers = pset;
  }
  for (const row of bonusDetails) {
    const d = dayKey(row.claimedAt);
    if (!d) continue;
    const daily = ensureDaily(d);
    daily.bonusAmount += toNum(row.amount);
  }
  customerDaily.forEach((daily, d) => {
    const depPlayers = ((daily as any)._depPlayers as Set<string> | undefined) || new Set<string>();
    const wdPlayers = ((daily as any)._wdPlayers as Set<string> | undefined) || new Set<string>();
    const all = new Set<string>(Array.from(depPlayers).concat(Array.from(wdPlayers)));
    daily.totalCustomer = all.size;
    daily.repeatCustomer = Array.from(depPlayers).filter((pkey) => (depCountByPlayer.get(`${d}::${pkey}`) || 0) > 1).length;
    daily.firstDepositCustomer = daily.newCustomers;
    daily.firstDepositAmount = 0;
    daily.netAmount = daily.depositAmount - daily.withdrawAmount;
    daily.depositAmount = money2(daily.depositAmount);
    daily.withdrawAmount = money2(daily.withdrawAmount);
    daily.netAmount = money2(daily.netAmount);
    daily.bonusAmount = money2(daily.bonusAmount);
    delete (daily as any)._depPlayers;
    delete (daily as any)._wdPlayers;
  });

  const customerReport = Array.from(customerDaily.values()).sort((a, b) => (a.date < b.date ? -1 : 1));

  const topCustomerMap = new Map<string, any>();
  const ensureTopCustomer = (row: any) => {
    const key = `${row.playerName}::${row.playerUsername}`;
    if (!topCustomerMap.has(key)) {
      topCustomerMap.set(key, {
        playerName: row.playerName,
        playerUsername: row.playerUsername || "",
        totalDeposit: 0,
        depositCount: 0,
        totalWithdraw: 0,
        withdrawCount: 0,
        bonusAmount: 0,
        netAmount: 0,
      });
    }
    return topCustomerMap.get(key);
  };
  for (const row of approvedDepositDetails) {
    const c = ensureTopCustomer(row);
    c.totalDeposit += toNum(row.amount);
    c.depositCount += 1;
  }
  for (const row of approvedWithdrawalDetails) {
    const c = ensureTopCustomer(row);
    c.totalWithdraw += toNum(row.amount);
    c.withdrawCount += 1;
  }
  for (const row of bonusDetails) {
    const c = ensureTopCustomer(row);
    c.bonusAmount += toNum(row.amount);
  }
  const topCustomerReport = Array.from(topCustomerMap.values())
    .map((row: any) => ({
      ...row,
      totalDeposit: money2(row.totalDeposit),
      totalWithdraw: money2(row.totalWithdraw),
      bonusAmount: money2(row.bonusAmount),
      netAmount: money2(row.totalDeposit - row.totalWithdraw - row.bonusAmount),
    }))
    .sort((a: any, b: any) => b.totalDeposit - a.totalDeposit)
    .slice(0, 200);

  const bonusPromotionDaily = new Map<string, any>();
  const ensurePromoDay = (date: string) => {
    if (!bonusPromotionDaily.has(date)) {
      bonusPromotionDaily.set(date, {
        date,
        count: 0,
        totalAmount: 0,
        forfeitedCount: 0,
        forfeitedAmount: 0,
        activeCount: 0,
        activeAmount: 0,
      });
    }
    return bonusPromotionDaily.get(date);
  };
  for (const row of bonusDetails) {
    const d = dayKey(row.claimedAt);
    if (!d) continue;
    const r = ensurePromoDay(d);
    const amt = toNum(row.amount);
    r.count += 1;
    r.totalAmount += amt;
    if (String(row.status).toLowerCase() === "forfeited") {
      r.forfeitedCount += 1;
      r.forfeitedAmount += amt;
    } else if (String(row.status).toLowerCase() === "active") {
      r.activeCount += 1;
      r.activeAmount += amt;
    }
  }
  const bonusPromotionReport = Array.from(bonusPromotionDaily.values())
    .map((r: any) => ({
      ...r,
      totalAmount: money2(r.totalAmount),
      forfeitedAmount: money2(r.forfeitedAmount),
      activeAmount: money2(r.activeAmount),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const refInviterIds = Array.from(new Set(newPlayerDetailRows.map((p: any) => Number((p as any).invitedBy || 0)).filter((id: number) => id > 0)));
  let topReferrerReport: any[] = [];
  if (refInviterIds.length > 0) {
    const inviterRows = await db.select({
      id: players.id,
      telegramUsername: players.telegramUsername,
      telegramFirstName: players.telegramFirstName,
      telegramLastName: players.telegramLastName,
    }).from(players).where(and(eq(players.adminId, adminId), inArray(players.id, refInviterIds)));
    const inviterMap = new Map<number, any>(inviterRows.map((r: any) => [Number(r.id), r]));
    const map = new Map<number, any>();
    for (const np of newPlayerDetailRows as any[]) {
      const inviterId = Number(np.invitedBy || 0);
      if (!inviterId) continue;
      if (!map.has(inviterId)) {
        const inv = inviterMap.get(inviterId);
        map.set(inviterId, {
          inviterId,
          inviterName:
            [inv?.telegramFirstName, inv?.telegramLastName].filter(Boolean).join(" ").trim() ||
            inv?.telegramFirstName ||
            inv?.telegramUsername ||
            `Player#${inviterId}`,
          inviterUsername: inv?.telegramUsername || "",
          newMembers: 0,
          totalDeposit: 0,
          totalWithdraw: 0,
          netAmount: 0,
        });
      }
      map.get(inviterId).newMembers += 1;
    }
    for (const row of topCustomerReport as any[]) {
      // best-effort by username string matching to invited player list in range
      const invited = (newPlayerDetailRows as any[]).find((p) => (p.telegramUsername || "") === (row.playerUsername || ""));
      const inviterId = Number((invited as any)?.invitedBy || 0);
      if (!inviterId || !map.has(inviterId)) continue;
      const item = map.get(inviterId);
      item.totalDeposit += toNum(row.totalDeposit);
      item.totalWithdraw += toNum(row.totalWithdraw);
    }
    topReferrerReport = Array.from(map.values())
      .map((r: any) => ({
        ...r,
        totalDeposit: money2(r.totalDeposit),
        totalWithdraw: money2(r.totalWithdraw),
        netAmount: money2(r.totalDeposit - r.totalWithdraw),
      }))
      .sort((a: any, b: any) => b.totalDeposit - a.totalDeposit)
      .slice(0, 200);
  }

  return {
    totalDeposits,
    depositCount,
    totalWithdrawals,
    withdrawalCount,
    newPlayers: newPlayers[0]?.cnt || 0,
    totalPlayers: totalPlayers[0]?.cnt || 0,
    activePlayers: Math.max(depositPlayers, withdrawalPlayers),
    depositedPlayers: depositPlayers,
    withdrawnPlayers: withdrawalPlayers,
    totalBonuses,
    bonusCount,
    pendingDepositAmount,
    pendingDepositCount: pendingDeposits[0]?.cnt || 0,
    pendingWithdrawalAmount,
    pendingWithdrawalCount: pendingWithdrawals[0]?.cnt || 0,
    rejectedDepositAmount,
    rejectedDepositCount: rejectedDeposits[0]?.cnt || 0,
    rejectedWithdrawalAmount,
    rejectedWithdrawalCount: rejectedWithdrawals[0]?.cnt || 0,
    avgDeposit,
    avgWithdrawal,
    bonusCostRate,
    withdrawalRate,
    netCashflow,
    netRevenue,
    bankBreakdown,
    bankTransactions,
    details: {
      approvedDeposits: approvedDepositDetails,
      pendingDeposits: pendingDepositDetails,
      approvedWithdrawals: approvedWithdrawalDetails,
      pendingWithdrawals: pendingWithdrawalDetails,
      bonuses: bonusDetails,
      newPlayers: newPlayerDetails,
    },
    customerReport,
    topCustomerReport,
    bonusPromotionReport,
    topReferrerReport,
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
  if (rows.length === 0) return null;
  const row: any = rows[0];
  if (typeof row.layoutInjections === "string") {
    try {
      row.layoutInjections = JSON.parse(row.layoutInjections);
    } catch {
      row.layoutInjections = {};
    }
  } else if (!row.layoutInjections || typeof row.layoutInjections !== "object") {
    row.layoutInjections = {};
  }
  return row;
}

export async function getAnyFrontendSettings() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(frontendSettings).limit(1);
  if (rows.length === 0) return null;
  const row: any = rows[0];
  if (typeof row.layoutInjections === "string") {
    try {
      row.layoutInjections = JSON.parse(row.layoutInjections);
    } catch {
      row.layoutInjections = {};
    }
  } else if (!row.layoutInjections || typeof row.layoutInjections !== "object") {
    row.layoutInjections = {};
  }
  return row;
}

export async function upsertFrontendSettings(adminId: number, data: {
  templateId?: string;
  customCss?: string | null;
  customHeadHtml?: string | null;
  customBodyJs?: string | null;
  layoutInjections?: Record<string, { css?: string; headHtml?: string; bodyHtml?: string; bodyJs?: string }> | null;
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
      layoutInjections: data.layoutInjections || null,
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
