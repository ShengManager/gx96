import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { eq, and, lt } from "drizzle-orm";
import { getDb } from "../db";
import { JWT_SECRET } from "../_core/env";
import { adminAccounts, refreshTokens, players } from "../../drizzle/schema";
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY_DAYS = 30;

export type TokenPayload = {
  id: number;
  type: "admin" | "player";
  role?: string;
  adminId?: number; // for tenant isolation
};

// ─── Password Hashing ───
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ─── Token Generation ───
export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString("hex");
}

export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

// ─── Refresh Token Storage ───
export async function storeRefreshToken(
  token: string,
  accountType: "admin" | "player",
  accountId: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(refreshTokens).values({
    tokenHash,
    accountType,
    accountId,
    expiresAt,
  });
}

export async function validateRefreshToken(
  token: string
): Promise<{ accountType: "admin" | "player"; accountId: number } | null> {
  const db = await getDb();
  if (!db) return null;

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const rows = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1);

  if (rows.length === 0) return null;
  const row = rows[0];

  if (new Date(row.expiresAt) < new Date()) {
    await db.delete(refreshTokens).where(eq(refreshTokens.id, row.id));
    return null;
  }

  return { accountType: row.accountType, accountId: row.accountId };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));
}

export async function cleanExpiredTokens(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(refreshTokens).where(lt(refreshTokens.expiresAt, new Date()));
}

// ─── Admin Auth ───
export async function adminLogin(
  username: string,
  password: string,
  ip?: string,
  ua?: string
): Promise<{
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  admin?: any;
  error?: string;
}> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  const rows = await db
    .select()
    .from(adminAccounts)
    .where(eq(adminAccounts.username, username))
    .limit(1);

  if (rows.length === 0) return { success: false, error: "Invalid credentials" };
  const admin = rows[0];

  if (!admin.isActive) return { success: false, error: "Account is disabled" };

  const valid = await verifyPassword(password, admin.passwordHash);
  if (!valid) return { success: false, error: "Invalid credentials" };

  // Determine the master admin id for tenant isolation
  const masterAdminId = admin.role === "master" ? admin.id : admin.parentId!;

  const payload: TokenPayload = {
    id: admin.id,
    type: "admin",
    role: admin.role,
    adminId: masterAdminId,
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken();
  await storeRefreshToken(refreshToken, "admin", admin.id);

  // Update last login
  await db
    .update(adminAccounts)
    .set({
      lastLoginAt: new Date(),
      lastLoginIp: ip || null,
      lastLoginUa: ua || null,
    })
    .where(eq(adminAccounts.id, admin.id));

  return {
    success: true,
    accessToken,
    refreshToken,
    admin: {
      id: admin.id,
      username: admin.username,
      displayName: admin.displayName,
      role: admin.role,
      parentId: admin.parentId,
    },
  };
}

// ─── Player Auth (via Telegram) ───
export async function playerLogin(
  playerId: number,
  adminId: number
): Promise<{ accessToken: string; refreshToken: string }> {
  const payload: TokenPayload = {
    id: playerId,
    type: "player",
    adminId,
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken();
  await storeRefreshToken(refreshToken, "player", playerId);

  return { accessToken, refreshToken };
}

// ─── Token Refresh ───
export async function refreshAccessToken(
  oldRefreshToken: string
): Promise<{
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  error?: string;
}> {
  const result = await validateRefreshToken(oldRefreshToken);
  if (!result) return { success: false, error: "Invalid or expired refresh token" };

  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  // Revoke old token
  await revokeRefreshToken(oldRefreshToken);

  let payload: TokenPayload;

  if (result.accountType === "admin") {
    const rows = await db
      .select()
      .from(adminAccounts)
      .where(eq(adminAccounts.id, result.accountId))
      .limit(1);
    if (rows.length === 0) return { success: false, error: "Account not found" };
    const admin = rows[0];
    const masterAdminId = admin.role === "master" ? admin.id : admin.parentId!;
    payload = { id: admin.id, type: "admin", role: admin.role, adminId: masterAdminId };
  } else {
    const rows = await db
      .select()
      .from(players)
      .where(eq(players.id, result.accountId))
      .limit(1);
    if (rows.length === 0) return { success: false, error: "Player not found" };
    const player = rows[0];
    payload = { id: player.id, type: "player", adminId: player.adminId };
  }

  const accessToken = generateAccessToken(payload);
  const newRefreshToken = generateRefreshToken();
  await storeRefreshToken(newRefreshToken, result.accountType, result.accountId);

  return { success: true, accessToken, refreshToken: newRefreshToken };
}

// ─── Create Initial Master Admin ───
export async function createMasterAdmin(
  username: string,
  password: string,
  displayName?: string
): Promise<{ success: boolean; adminId?: number; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  const existing = await db
    .select()
    .from(adminAccounts)
    .where(eq(adminAccounts.username, username))
    .limit(1);
  if (existing.length > 0) return { success: false, error: "Username already exists" };

  const passwordHash = await hashPassword(password);
  const result = await db.insert(adminAccounts).values({
    username,
    passwordHash,
    displayName: displayName || username,
    role: "master",
    parentId: null,
    isActive: true,
  });

  return { success: true, adminId: result[0].insertId };
}

// ─── Auto-Login Token (Telegram → Web) ───
// Short-lived signed token with nonce for one-time-use protection

const AUTO_LOGIN_EXPIRY = "5m"; // 5 minutes

// In-memory nonce set for one-time-use enforcement
// In production, use Redis or DB for multi-instance support
const usedNonces = new Set<string>();

// Periodic cleanup of old nonces (every 10 minutes)
setInterval(() => {
  usedNonces.clear();
}, 10 * 60 * 1000);

export function generateAutoLoginToken(playerId: number, adminId: number): string {
  const nonce = crypto.randomBytes(16).toString("hex");
  return jwt.sign(
    { playerId, adminId, purpose: "auto_login", nonce },
    JWT_SECRET,
    { expiresIn: AUTO_LOGIN_EXPIRY }
  );
}

export async function verifyAutoLoginToken(
  token: string
): Promise<{ accessToken: string; refreshToken: string; player: any } | null> {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (decoded.purpose !== "auto_login") return null;
    if (!decoded.nonce) return null;

    // One-time-use: reject if nonce already consumed
    if (usedNonces.has(decoded.nonce)) return null;
    usedNonces.add(decoded.nonce);

    const db = await getDb();
    if (!db) return null;

    const rows = await db
      .select()
      .from(players)
      .where(and(eq(players.id, decoded.playerId), eq(players.adminId, decoded.adminId)))
      .limit(1);

    if (rows.length === 0) return null;
    const player = rows[0];
    if (!player.isActive) return null;

    // Generate real session tokens
    const { accessToken, refreshToken } = await playerLogin(player.id, player.adminId);

    return {
      accessToken,
      refreshToken,
      player: {
        id: player.id,
        telegramId: player.telegramId,
        phone: player.phone,
        displayName: player.telegramFirstName || player.telegramUsername || "Player",
        lang: player.lang,
        vipLevel: player.vipLevel,
      },
    };
  } catch {
    return null;
  }
}
