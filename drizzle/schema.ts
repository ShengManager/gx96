import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
  decimal,
  json,
  bigint,
  uniqueIndex,
  index,
} from "drizzle-orm/mysql-core";

// ─── 1. Users (Manus OAuth - kept for scaffold compatibility) ───
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── 2. Admin Accounts (Custom auth, NOT Manus OAuth) ───
export const adminAccounts = mysqlTable("admin_accounts", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 256 }).notNull(),
  displayName: varchar("displayName", { length: 128 }),
  role: mysqlEnum("role", ["master", "sub"]).default("sub").notNull(),
  parentId: int("parentId"), // null for master, master's id for sub
  isActive: boolean("isActive").default(true).notNull(),
  lastLoginAt: timestamp("lastLoginAt"),
  lastLoginIp: varchar("lastLoginIp", { length: 64 }),
  lastLoginUa: text("lastLoginUa"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AdminAccount = typeof adminAccounts.$inferSelect;
export type InsertAdminAccount = typeof adminAccounts.$inferInsert;

// ─── 3. Sub-Account Permissions ───
export const subAccountPermissions = mysqlTable("sub_account_permissions", {
  id: int("id").autoincrement().primaryKey(),
  adminId: int("adminId").notNull(),
  module: varchar("module", { length: 64 }).notNull(), // dashboard, player, deposit, withdraw, bonus, telegram, bank, report, setting, subaccount
  canView: boolean("canView").default(false).notNull(),
  canEdit: boolean("canEdit").default(false).notNull(),
  canDelete: boolean("canDelete").default(false).notNull(),
});

export type SubAccountPermission = typeof subAccountPermissions.$inferSelect;

// ─── 4. Telegram Bots ───
export const telegramBots = mysqlTable("telegram_bots", {
  id: int("id").autoincrement().primaryKey(),
  adminId: int("adminId").notNull(), // which master admin owns this bot
  botToken: varchar("botToken", { length: 256 }).notNull(),
  botUsername: varchar("botUsername", { length: 128 }),
  botName: varchar("botName", { length: 128 }),
  isActive: boolean("isActive").default(true).notNull(),
  webhookUrl: varchar("webhookUrl", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TelegramBot = typeof telegramBots.$inferSelect;

// ─── 5. Telegram Bot Messages (per language) ───
export const telegramBotMessages = mysqlTable("telegram_bot_messages", {
  id: int("id").autoincrement().primaryKey(),
  botId: int("botId").notNull(),
  lang: varchar("lang", { length: 10 }).default("en").notNull(),
  section: varchar("section", { length: 64 }).notNull(), // welcome, game, bonus, share, contact, deposit, withdraw, setting
  title: text("title"),
  body: text("body"),
  imageUrl: text("imageUrl"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── 6. Players ───
export const players = mysqlTable("players", {
  id: int("id").autoincrement().primaryKey(),
  adminId: int("adminId").notNull(), // tenant isolation
  telegramId: varchar("telegramId", { length: 64 }).notNull(),
  telegramUsername: varchar("telegramUsername", { length: 128 }),
  telegramFirstName: varchar("telegramFirstName", { length: 128 }),
  telegramLastName: varchar("telegramLastName", { length: 128 }),
  phone: varchar("phone", { length: 32 }),
  countryCode: varchar("countryCode", { length: 10 }),
  bankName: varchar("bankName", { length: 128 }),
  bankAccountName: varchar("bankAccountName", { length: 128 }),
  bankAccountNumber: varchar("bankAccountNumber", { length: 64 }),
  passwordHash: varchar("passwordHash", { length: 256 }),
  inviteCode: varchar("inviteCode", { length: 32 }).notNull(),
  invitedBy: int("invitedBy"), // player id who invited
  vipLevel: int("vipLevel").default(0).notNull(),
  kycVerified: boolean("kycVerified").default(false).notNull(),
  lang: varchar("lang", { length: 10 }).default("en").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  middlewavePlayerId: varchar("middlewavePlayerId", { length: 128 }),
  lastLoginAt: timestamp("lastLoginAt"),
  lastLoginIp: varchar("lastLoginIp", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("uq_admin_telegram").on(table.adminId, table.telegramId),
  index("idx_invite_code").on(table.inviteCode),
]);

export type Player = typeof players.$inferSelect;
export type InsertPlayer = typeof players.$inferInsert;

// ─── 7. Player Tags ───
export const playerTags = mysqlTable("player_tags", {
  id: int("id").autoincrement().primaryKey(),
  playerId: int("playerId").notNull(),
  tag: varchar("tag", { length: 64 }).notNull(), // risk, bonus_abuser, vip, etc.
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── 8. Invite Relations ───
export const inviteRelations = mysqlTable("invite_relations", {
  id: int("id").autoincrement().primaryKey(),
  inviterId: int("inviterId").notNull(),
  inviteeId: int("inviteeId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── 8b. Bank Catalog (Reference bank names per country) ───
export const bankCatalog = mysqlTable("bank_catalog", {
  id: int("id").autoincrement().primaryKey(),
  country: varchar("country", { length: 10 }).notNull(), // MY, SG, etc.
  bankCode: varchar("bankCode", { length: 32 }).notNull(),
  bankName: varchar("bankName", { length: 128 }).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
}, (table) => [
  uniqueIndex("uq_country_code").on(table.country, table.bankCode),
]);
export type BankCatalog = typeof bankCatalog.$inferSelect;

// ─── 9. Banks ───
export const banks = mysqlTable("banks", {
  id: int("id").autoincrement().primaryKey(),
  adminId: int("adminId").notNull(),
  country: varchar("country", { length: 10 }).notNull(), // MY, SG, etc.
  bankName: varchar("bankName", { length: 128 }).notNull(),
  accountName: varchar("accountName", { length: 128 }).notNull(),
  accountNumber: varchar("accountNumber", { length: 64 }).notNull(),
  usageType: mysqlEnum("usageType", ["deposit", "withdraw", "both", "internal"]).default("both").notNull(),
  status: mysqlEnum("status", ["active", "closed", "hidden"]).default("active").notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Bank = typeof banks.$inferSelect;

// ─── 10. Deposit Cycles ───
export const depositCycles = mysqlTable("deposit_cycles", {
  id: int("id").autoincrement().primaryKey(),
  playerId: int("playerId").notNull(),
  adminId: int("adminId").notNull(),
  status: mysqlEnum("status", ["active", "completed"]).default("active").notNull(),
  depositAmount: decimal("depositAmount", { precision: 14, scale: 4 }).default("0").notNull(),
  bonusAmount: decimal("bonusAmount", { precision: 14, scale: 4 }).default("0").notNull(),
  totalWithdrawn: decimal("totalWithdrawn", { precision: 14, scale: 4 }).default("0").notNull(),
  hasEnteredGame: boolean("hasEnteredGame").default(false).notNull(),
  targetRollover: decimal("targetRollover", { precision: 14, scale: 4 }).default("0").notNull(),
  currentRollover: decimal("currentRollover", { precision: 14, scale: 4 }).default("0").notNull(),
  targetTurnover: decimal("targetTurnover", { precision: 14, scale: 4 }).default("0").notNull(),
  currentTurnover: decimal("currentTurnover", { precision: 14, scale: 4 }).default("0").notNull(),
  rolloverMultiplierSnapshot: decimal("rolloverMultiplierSnapshot", { precision: 10, scale: 4 }),
  turnoverMultiplierSnapshot: decimal("turnoverMultiplierSnapshot", { precision: 10, scale: 4 }),
  minWithdrawSnapshot: decimal("minWithdrawSnapshot", { precision: 14, scale: 4 }),
  maxWithdrawSnapshot: decimal("maxWithdrawSnapshot", { precision: 14, scale: 4 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_player_status").on(table.playerId, table.status),
]);

export type DepositCycle = typeof depositCycles.$inferSelect;

// ─── 11. Deposits ───
export const deposits = mysqlTable("deposits", {
  id: int("id").autoincrement().primaryKey(),
  playerId: int("playerId").notNull(),
  adminId: int("adminId").notNull(),
  cycleId: int("cycleId"),
  amount: decimal("amount", { precision: 14, scale: 4 }).notNull(),
  paymentMethod: mysqlEnum("paymentMethod", ["bank_transfer", "api_payment"]).default("bank_transfer").notNull(),
  bankId: int("bankId"),
  receiptUrl: text("receiptUrl"),
  apiPaymentRef: varchar("apiPaymentRef", { length: 256 }),
  apiPaymentUrl: text("apiPaymentUrl"),
  status: mysqlEnum("status", ["pending", "processing", "approved", "rejected", "cancelled"]).default("pending").notNull(),
  handledBy: int("handledBy"), // admin account id
  handleNote: text("handleNote"),
  rejectionReason: text("rejectionReason"),
  processedAt: timestamp("processedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_player_deposits").on(table.playerId, table.status),
  index("idx_admin_deposits").on(table.adminId, table.status),
]);

export type Deposit = typeof deposits.$inferSelect;

// ─── 12. Withdrawals ───
export const withdrawals = mysqlTable("withdrawals", {
  id: int("id").autoincrement().primaryKey(),
  playerId: int("playerId").notNull(),
  adminId: int("adminId").notNull(),
  cycleId: int("cycleId"),
  amount: decimal("amount", { precision: 14, scale: 4 }).notNull(),
  bankName: varchar("bankName", { length: 128 }),
  bankAccountName: varchar("bankAccountName", { length: 128 }),
  bankAccountNumber: varchar("bankAccountNumber", { length: 64 }),
  status: mysqlEnum("status", ["pending", "processing", "approved", "rejected"]).default("pending").notNull(),
  handledBy: int("handledBy"),
  handleNote: text("handleNote"),
  rejectionReason: text("rejectionReason"),
  pointsRecovered: decimal("pointsRecovered", { precision: 14, scale: 4 }),
  usedBonus: boolean("usedBonus").default(false).notNull(),
  rolloverMet: boolean("rolloverMet").default(false).notNull(),
  turnoverMet: boolean("turnoverMet").default(false).notNull(),
  processedAt: timestamp("processedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_player_withdrawals").on(table.playerId, table.status),
  index("idx_admin_withdrawals").on(table.adminId, table.status),
]);

export type Withdrawal = typeof withdrawals.$inferSelect;

// ─── 13. Bonus Configs ───
export const bonusConfigs = mysqlTable("bonus_configs", {
  id: int("id").autoincrement().primaryKey(),
  adminId: int("adminId").notNull(),
  name: varchar("name", { length: 256 }).notNull(),
  description: text("description"),
  bonusType: int("bonusType").default(0).notNull(), // 0=fixed, 1=percentage, 2=random
  fixedAmount: decimal("fixedAmount", { precision: 14, scale: 4 }),
  percentage: decimal("percentage", { precision: 8, scale: 4 }),
  randomMin: decimal("randomMin", { precision: 14, scale: 4 }),
  randomMax: decimal("randomMax", { precision: 14, scale: 4 }),
  cardImageUrl: text("cardImageUrl"),
  detailImageUrl: text("detailImageUrl"),
  /** Same key = same promo section on player /bonus (optional) */
  promoGroupKey: varchar("promoGroupKey", { length: 128 }).default("").notNull(),
  promoGroupTitle: varchar("promoGroupTitle", { length: 256 }),
  promoGroupBannerUrl: text("promoGroupBannerUrl"),
  promoGroupSort: int("promoGroupSort").default(0).notNull(),
  claimConfig: json("claimConfig"), // full ClaimConfig JSON
  rolloverMultiplier: decimal("rolloverMultiplier", { precision: 8, scale: 2 }),
  turnoverTarget: decimal("turnoverTarget", { precision: 14, scale: 4 }),
  maxWithdraw: decimal("maxWithdraw", { precision: 14, scale: 4 }),
  ruleVersion: int("ruleVersion").default(1).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BonusConfig = typeof bonusConfigs.$inferSelect;

/** 前台 Bonus 分组（标题/横幅/排序）；活动通过 bonus_configs.promoGroupKey 关联此处的 groupKey */
export const bonusPromoGroups = mysqlTable(
  "bonus_promo_groups",
  {
    id: int("id").autoincrement().primaryKey(),
    adminId: int("adminId").notNull(),
    groupKey: varchar("groupKey", { length: 128 }).notNull(),
    title: varchar("title", { length: 256 }),
    bannerUrl: text("bannerUrl"),
    /** 与拖拽布局同步：分组条在页面上的顺序 */
    sortIndex: int("sortIndex").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_bonus_promo_groups_admin_key").on(table.adminId, table.groupKey),
    index("idx_bonus_promo_groups_admin").on(table.adminId),
  ]
);

export type BonusPromoGroup = typeof bonusPromoGroups.$inferSelect;

// ─── 14. Player Bonuses (claimed) ───
export const playerBonuses = mysqlTable("player_bonuses", {
  id: int("id").autoincrement().primaryKey(),
  playerId: int("playerId").notNull(),
  adminId: int("adminId").notNull(),
  bonusConfigId: int("bonusConfigId").notNull(),
  cycleId: int("cycleId"),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }),
  claimPeriodKey: varchar("claimPeriodKey", { length: 64 }),
  sourceEvent: varchar("sourceEvent", { length: 64 }).default("manual_claim"),
  sourceRef: varchar("sourceRef", { length: 128 }),
  ruleVersion: int("ruleVersion").default(1).notNull(),
  claimMeta: json("claimMeta"),
  awardedAmount: decimal("awardedAmount", { precision: 14, scale: 4 }).notNull(),
  targetRollover: decimal("targetRollover", { precision: 14, scale: 4 }).default("0").notNull(),
  currentRollover: decimal("currentRollover", { precision: 14, scale: 4 }).default("0").notNull(),
  targetTurnover: decimal("targetTurnover", { precision: 14, scale: 4 }).default("0").notNull(),
  currentTurnover: decimal("currentTurnover", { precision: 14, scale: 4 }).default("0").notNull(),
  status: mysqlEnum("status", ["active", "completed", "expired", "forfeited"]).default("active").notNull(),
  claimedAt: timestamp("claimedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
}, (table) => [
  uniqueIndex("uq_bonus_claim_idempotency").on(table.adminId, table.playerId, table.bonusConfigId, table.idempotencyKey),
  index("idx_bonus_claim_period").on(table.adminId, table.playerId, table.bonusConfigId, table.claimPeriodKey),
]);

export type PlayerBonus = typeof playerBonuses.$inferSelect;

// ─── 15. Bonus Ledger (immutable audit events) ───
export const bonusLedger = mysqlTable("bonus_ledger", {
  id: int("id").autoincrement().primaryKey(),
  adminId: int("adminId").notNull(),
  playerId: int("playerId").notNull(),
  bonusConfigId: int("bonusConfigId").notNull(),
  playerBonusId: int("playerBonusId"),
  eventType: mysqlEnum("eventType", ["claim_attempt", "claim_awarded", "claim_rejected", "claim_duplicate"]).notNull(),
  status: mysqlEnum("status", ["success", "failed"]).notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }),
  claimPeriodKey: varchar("claimPeriodKey", { length: 64 }),
  ruleVersion: int("ruleVersion"),
  requestSource: varchar("requestSource", { length: 64 }),
  reasonCode: varchar("reasonCode", { length: 64 }),
  message: text("message"),
  inputSnapshot: json("inputSnapshot"),
  outputSnapshot: json("outputSnapshot"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_bonus_ledger_claim").on(table.adminId, table.playerId, table.bonusConfigId, table.createdAt),
  index("idx_bonus_ledger_idem").on(table.idempotencyKey),
]);

// ─── 15. Game Logs Cache (synced from Middlewave) ───
export const gameLogsCache = mysqlTable("game_logs_cache", {
  id: int("id").autoincrement().primaryKey(),
  adminId: int("adminId").notNull(),
  playerId: int("playerId").notNull(),
  provider: varchar("provider", { length: 64 }).notNull(),
  gameCode: varchar("gameCode", { length: 64 }),
  gameName: varchar("gameName", { length: 256 }),
  betAmount: decimal("betAmount", { precision: 14, scale: 4 }).default("0").notNull(),
  validBet: decimal("validBet", { precision: 14, scale: 4 }).default("0").notNull(),
  payout: decimal("payout", { precision: 14, scale: 4 }).default("0").notNull(),
  winLose: decimal("winLose", { precision: 14, scale: 4 }).default("0").notNull(),
  providerTranId: varchar("providerTranId", { length: 128 }),
  transactionDate: timestamp("transactionDate"),
  rawData: json("rawData"),
  syncedAt: timestamp("syncedAt").defaultNow().notNull(),
}, (table) => [
  index("idx_player_gamelogs").on(table.playerId, table.provider),
  index("idx_admin_gamelogs").on(table.adminId, table.provider),
]);

// ─── 16. Admin Operation Logs ───
export const adminLogs = mysqlTable("admin_logs", {
  id: int("id").autoincrement().primaryKey(),
  adminId: int("adminId").notNull(),
  action: varchar("action", { length: 128 }).notNull(),
  module: varchar("module", { length: 64 }).notNull(),
  targetId: int("targetId"),
  targetType: varchar("targetType", { length: 64 }),
  details: json("details"),
  ipAddress: varchar("ipAddress", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── 17. System Settings (key-value per admin) ───
export const systemSettings = mysqlTable("system_settings", {
  id: int("id").autoincrement().primaryKey(),
  adminId: int("adminId").notNull(),
  settingKey: varchar("settingKey", { length: 128 }).notNull(),
  settingValue: text("settingValue"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("uq_admin_setting").on(table.adminId, table.settingKey),
]);

// ─── 18a. Admin media library (uploaded images per tenant) ───
export const adminMediaLibrary = mysqlTable("admin_media_library", {
  id: int("id").autoincrement().primaryKey(),
  adminId: int("adminId").notNull(),
  objectKey: varchar("objectKey", { length: 512 }).notNull(),
  /** When using Forge proxy storage, browser loads this URL directly */
  publicUrl: text("publicUrl"),
  originalName: varchar("originalName", { length: 256 }),
  contentType: varchar("contentType", { length: 128 }),
  byteSize: int("byteSize"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_admin_media_admin").on(table.adminId),
]);

export type AdminMediaLibraryRow = typeof adminMediaLibrary.$inferSelect;

// ─── 18. Banners ───
export const banners = mysqlTable("banners", {
  id: int("id").autoincrement().primaryKey(),
  adminId: int("adminId").notNull(),
  title: varchar("title", { length: 256 }),
  imageUrl: text("imageUrl").notNull(),
  linkUrl: text("linkUrl"),
  sortOrder: int("sortOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── 19. Deposit Preset Amounts ───
export const depositPresets = mysqlTable("deposit_presets", {
  id: int("id").autoincrement().primaryKey(),
  adminId: int("adminId").notNull(),
  amount: decimal("amount", { precision: 14, scale: 4 }).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
});

// ─── 20. Country Config ───
export const countryConfigs = mysqlTable("country_configs", {
  id: int("id").autoincrement().primaryKey(),
  adminId: int("adminId").notNull(),
  countryCode: varchar("countryCode", { length: 10 }).notNull(), // MY, SG
  phonePrefix: varchar("phonePrefix", { length: 10 }).notNull(), // +60, +65
  currency: varchar("currency", { length: 10 }).default("MYR").notNull(),
  isAllowed: boolean("isAllowed").default(true).notNull(),
});

// ─── 21. Refresh Tokens ───
export const refreshTokens = mysqlTable("refresh_tokens", {
  id: int("id").autoincrement().primaryKey(),
  tokenHash: varchar("tokenHash", { length: 256 }).notNull().unique(),
  accountType: mysqlEnum("accountType", ["admin", "player"]).notNull(),
  accountId: int("accountId").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── 22. Frontend Settings (per admin/tenant) ───
export const frontendSettings = mysqlTable("frontend_settings", {
  id: int("id").autoincrement().primaryKey(),
  adminId: int("adminId").notNull(),
  templateId: varchar("templateId", { length: 64 }).default("default").notNull(),
  customCss: text("customCss"),
  customHeadHtml: text("customHeadHtml"),
  customBodyJs: text("customBodyJs"),
  layoutInjections: json("layoutInjections"),
  primaryColor: varchar("primaryColor", { length: 32 }),
  logoUrl: text("logoUrl"),
  faviconUrl: text("faviconUrl"),
  siteName: varchar("siteName", { length: 128 }),
  footerText: text("footerText"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("uq_admin_frontend").on(table.adminId),
]);

export type FrontendSetting = typeof frontendSettings.$inferSelect;

// ─── 23. Domain ACL (per admin/tenant) ───
export const domainAcl = mysqlTable("domain_acl", {
  id: int("id").autoincrement().primaryKey(),
  adminId: int("adminId").notNull(),
  domain: varchar("domain", { length: 256 }).notNull(),
  purpose: mysqlEnum("purpose", ["admin", "player", "both"]).default("both").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_admin_domain").on(table.adminId, table.domain),
]);

export type DomainAclEntry = typeof domainAcl.$inferSelect;
