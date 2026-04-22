import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { verifyAccessToken, TokenPayload } from "./auth";

let io: Server | null = null;

export function initWebSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    path: "/ws",
  });

  // Auth middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error("Authentication required"));

    const payload = verifyAccessToken(token as string);
    if (!payload) return next(new Error("Invalid token"));

    (socket as any).user = payload;
    next();
  });

  io.on("connection", (socket: Socket) => {
    const user = (socket as any).user as TokenPayload;

    // Join room based on user type and admin scope
    if (user.type === "admin" && user.adminId) {
      socket.join(`admin:${user.adminId}`);
      socket.join(`admin-user:${user.id}`);
    } else if (user.type === "player" && user.adminId) {
      socket.join(`player:${user.id}`);
      socket.join(`tenant:${user.adminId}`);
    }

    socket.on("disconnect", () => {
      // Cleanup handled by socket.io
    });
  });

  return io;
}

export function getIO(): Server | null {
  return io;
}

// ─── Notification Helpers ───

// Notify all admins of a tenant about new deposit
export function notifyAdminNewDeposit(adminId: number, deposit: any): void {
  io?.to(`admin:${adminId}`).emit("new_deposit", deposit);
}

// Notify all admins of a tenant about new withdrawal
export function notifyAdminNewWithdrawal(adminId: number, withdrawal: any): void {
  io?.to(`admin:${adminId}`).emit("new_withdrawal", withdrawal);
}

// Notify a specific player about deposit status change
export function notifyPlayerDepositStatus(playerId: number, data: any): void {
  io?.to(`player:${playerId}`).emit("deposit_status", data);
}

// Notify a specific player about withdrawal status change
export function notifyPlayerWithdrawalStatus(playerId: number, data: any): void {
  io?.to(`player:${playerId}`).emit("withdrawal_status", data);
}

// Broadcast to all players of a tenant
export function broadcastToTenant(adminId: number, event: string, data: any): void {
  io?.to(`tenant:${adminId}`).emit(event, data);
}

// Notify specific admin user
export function notifyAdminUser(adminUserId: number, event: string, data: any): void {
  io?.to(`admin-user:${adminUserId}`).emit(event, data);
}

// Live chat events
export function notifyAdminLiveChat(adminId: number, event: string, data: any): void {
  io?.to(`admin:${adminId}`).emit(event, data);
}

export function notifyPlayerLiveChat(playerId: number, event: string, data: any): void {
  io?.to(`player:${playerId}`).emit(event, data);
}

// ─── WebSocket → Telegram Notification Bridge ───
// These functions emit WS events AND push Telegram messages to the player's chat

import { activeBots, notifyPlayerViaTelegram } from "./telegramBot";
import { getDb } from "../db";
import { players } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

async function getPlayerTelegramInfo(playerId: number): Promise<{ playerId: number; adminId: number; lang: string } | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  if (rows.length === 0) return null;
  const p = rows[0];
  if (!p.telegramId) return null;
  return { playerId: p.id, adminId: p.adminId, lang: p.lang || "en" };
}

// Bridge: notify player deposit status via WS + Telegram
export async function bridgeNotifyDepositStatus(playerId: number, data: { depositId: number; status: string; amount?: string; remark?: string }): Promise<void> {
  // 1. WS notification
  notifyPlayerDepositStatus(playerId, data);

  // 2. Telegram push
  try {
    const info = await getPlayerTelegramInfo(playerId);
    if (!info) return;
    const statusEmoji = data.status === "approved" ? "✅" : "❌";
    const msg = `${statusEmoji} Deposit #${data.depositId} ${data.status}${data.amount ? ` (${data.amount})` : ""}${data.remark ? `\nNote: ${data.remark}` : ""}`;
    await notifyPlayerViaTelegram(info.adminId, info.playerId, msg);
  } catch (err) {
    console.error("[WS→TG Bridge] Failed to send deposit notification:", err);
  }
}

// Bridge: notify player withdrawal status via WS + Telegram
export async function bridgeNotifyWithdrawalStatus(playerId: number, data: { withdrawalId: number; status: string; amount?: string; remark?: string }): Promise<void> {
  // 1. WS notification
  notifyPlayerWithdrawalStatus(playerId, data);

  // 2. Telegram push
  try {
    const info = await getPlayerTelegramInfo(playerId);
    if (!info) return;
    const statusEmoji = data.status === "approved" ? "✅" : "❌";
    const msg = `${statusEmoji} Withdrawal #${data.withdrawalId} ${data.status}${data.amount ? ` (${data.amount})` : ""}${data.remark ? `\nNote: ${data.remark}` : ""}`;
    await notifyPlayerViaTelegram(info.adminId, info.playerId, msg);
  } catch (err) {
    console.error("[WS→TG Bridge] Failed to send withdrawal notification:", err);
  }
}

// Bridge: send custom admin message to player via Telegram
export async function bridgeAdminMessageToPlayer(playerId: number, message: string): Promise<boolean> {
  try {
    const info = await getPlayerTelegramInfo(playerId);
    if (!info) return false;
    await notifyPlayerViaTelegram(info.adminId, info.playerId, message);
    return true;
  } catch (err) {
    console.error("[WS→TG Bridge] Failed to send admin message:", err);
    return false;
  }
}
