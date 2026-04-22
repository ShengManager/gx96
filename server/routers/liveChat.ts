import { z } from "zod";
import { and, count, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc";
import { requireAdmin, checkPermission } from "../services/middleware";
import * as db from "../db";
import { getDb } from "../db";
import { adminAccounts, liveChatThreads, players } from "../../drizzle/schema";
import { notifyAdminLiveChat, notifyPlayerLiveChat } from "../services/websocket";

export const adminLiveChatRouter = router({
  counts: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "livechat", "view");
      const unreadMessages = await db.countLiveChatUnreadForAdmin(admin.adminId!);
      const database = await getDb();
      if (!database) return { unreadMessages, openThreads: 0, badgeCount: unreadMessages };
      const openRows = await database
        .select({ n: count() })
        .from(liveChatThreads)
        .where(and(eq(liveChatThreads.adminId, admin.adminId!), eq(liveChatThreads.status, "open")));
      const openThreads = Number(openRows[0]?.n || 0);
      return {
        unreadMessages,
        openThreads,
        badgeCount: Math.max(unreadMessages, openThreads),
      };
    }),

  threads: router({
    list: publicProcedure
      .input(z.object({
        token: z.string(),
        status: z.enum(["all", "open", "handling", "finished"]).default("all"),
        keyword: z.string().optional(),
        assignee: z.enum(["all", "mine", "unassigned"]).default("all"),
        page: z.number().default(1),
        pageSize: z.number().default(20),
      }))
      .query(async ({ input, ctx }) => {
        const admin = requireAdmin(ctx);
        await checkPermission(admin.id, admin.role!, "livechat", "view");
        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const page = Math.max(1, input.page);
        const pageSize = Math.max(1, Math.min(100, input.pageSize));
        const offset = (page - 1) * pageSize;

        const conditions: any[] = [eq(liveChatThreads.adminId, admin.adminId!)];
        if (input.status !== "all") conditions.push(eq(liveChatThreads.status, input.status));
        if (input.assignee === "mine") conditions.push(eq(liveChatThreads.handledBy, admin.id));
        if (input.assignee === "unassigned") conditions.push(sql`${liveChatThreads.handledBy} IS NULL`);
        if (input.keyword?.trim()) {
          const k = `%${input.keyword.trim()}%`;
          conditions.push(or(
            like(players.phone, k),
            like(players.telegramUsername, k),
            like(players.telegramFirstName, k),
            like(players.inviteCode, k),
          ) as any);
        }

        const where = and(...conditions);
        const [rows, totalRows] = await Promise.all([
          database
            .select({
              id: liveChatThreads.id,
              adminId: liveChatThreads.adminId,
              playerId: liveChatThreads.playerId,
              status: liveChatThreads.status,
              handledBy: liveChatThreads.handledBy,
              handledAt: liveChatThreads.handledAt,
              finishedBy: liveChatThreads.finishedBy,
              finishedAt: liveChatThreads.finishedAt,
              lastMessageAt: liveChatThreads.lastMessageAt,
              unreadForAdmin: liveChatThreads.unreadForAdmin,
              unreadForPlayer: liveChatThreads.unreadForPlayer,
              createdAt: liveChatThreads.createdAt,
              updatedAt: liveChatThreads.updatedAt,
              playerPhone: players.phone,
              playerUsername: players.telegramUsername,
              playerFirstName: players.telegramFirstName,
              playerInviteCode: players.inviteCode,
            })
            .from(liveChatThreads)
            .leftJoin(players, eq(players.id, liveChatThreads.playerId))
            .where(where)
            .orderBy(desc(liveChatThreads.lastMessageAt), desc(liveChatThreads.id))
            .limit(pageSize)
            .offset(offset),
          database
            .select({ n: count() })
            .from(liveChatThreads)
            .leftJoin(players, eq(players.id, liveChatThreads.playerId))
            .where(where),
        ]);

        const handledIdSet = new Set(
          rows
            .map((row) => Number(row.handledBy || 0))
            .filter((id) => id > 0)
        );

        let handledMap = new Map<number, { displayName: string | null; username: string | null }>();
        if (handledIdSet.size > 0) {
          const handledIds = Array.from(handledIdSet);
          const adminRows = await database
            .select({
              id: adminAccounts.id,
              displayName: adminAccounts.displayName,
              username: adminAccounts.username,
            })
            .from(adminAccounts)
            .where(inArray(adminAccounts.id, handledIds));
          handledMap = new Map(
            adminRows.map((row) => [
              Number(row.id),
              { displayName: row.displayName, username: row.username },
            ])
          );
        }

        const threads = rows.map((row) => {
          const handled = handledMap.get(Number(row.handledBy || 0));
          return {
            ...row,
            handledByDisplayName: handled?.displayName ?? null,
            handledByUsername: handled?.username ?? null,
          };
        });

        return {
          page,
          pageSize,
          total: Number(totalRows[0]?.n || 0),
          threads,
        };
      }),

    detail: publicProcedure
      .input(z.object({
        token: z.string(),
        threadId: z.number(),
      }))
      .query(async ({ input, ctx }) => {
        const admin = requireAdmin(ctx);
        await checkPermission(admin.id, admin.role!, "livechat", "view");
        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const rows = await database
          .select({
            id: liveChatThreads.id,
            adminId: liveChatThreads.adminId,
            playerId: liveChatThreads.playerId,
            status: liveChatThreads.status,
            handledBy: liveChatThreads.handledBy,
            handledAt: liveChatThreads.handledAt,
            finishedBy: liveChatThreads.finishedBy,
            finishedAt: liveChatThreads.finishedAt,
            lastMessageAt: liveChatThreads.lastMessageAt,
            unreadForAdmin: liveChatThreads.unreadForAdmin,
            unreadForPlayer: liveChatThreads.unreadForPlayer,
            createdAt: liveChatThreads.createdAt,
            updatedAt: liveChatThreads.updatedAt,
            playerPhone: players.phone,
            playerUsername: players.telegramUsername,
            playerFirstName: players.telegramFirstName,
            playerInviteCode: players.inviteCode,
          })
          .from(liveChatThreads)
          .leftJoin(players, eq(players.id, liveChatThreads.playerId))
          .where(and(eq(liveChatThreads.id, input.threadId), eq(liveChatThreads.adminId, admin.adminId!)))
          .limit(1);
        const rawThread = rows[0];
        if (!rawThread) throw new TRPCError({ code: "NOT_FOUND", message: "Thread not found" });
        let handledByDisplayName: string | null = null;
        let handledByUsername: string | null = null;
        if (Number(rawThread.handledBy || 0) > 0) {
          const adminRows = await database
            .select({
              displayName: adminAccounts.displayName,
              username: adminAccounts.username,
            })
            .from(adminAccounts)
            .where(eq(adminAccounts.id, Number(rawThread.handledBy)))
            .limit(1);
          handledByDisplayName = adminRows[0]?.displayName ?? null;
          handledByUsername = adminRows[0]?.username ?? null;
        }
        const thread = {
          ...rawThread,
          handledByDisplayName,
          handledByUsername,
        };
        const messages = await db.listLiveChatMessages(thread.id, 100);
        return { thread, messages };
      }),

    markRead: publicProcedure
      .input(z.object({ token: z.string(), threadId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const admin = requireAdmin(ctx);
        await checkPermission(admin.id, admin.role!, "livechat", "view");
        await db.markLiveChatReadByAdmin(input.threadId, admin.adminId!);
        notifyAdminLiveChat(admin.adminId!, "chat:thread_updated", { threadId: input.threadId });
        return { success: true };
      }),

    openByPlayer: publicProcedure
      .input(z.object({ token: z.string(), playerId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const admin = requireAdmin(ctx);
        await checkPermission(admin.id, admin.role!, "livechat", "edit");
        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const pRows = await database
          .select({ id: players.id })
          .from(players)
          .where(and(eq(players.id, input.playerId), eq(players.adminId, admin.adminId!)))
          .limit(1);
        if (!pRows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Player not found" });
        const thread = await db.getOrCreateLiveChatThread(admin.adminId!, input.playerId);
        if (thread.status === "finished") {
          await database
            .update(liveChatThreads)
            .set({
              status: "open",
              handledBy: null,
              handledAt: null,
              finishedBy: null,
              finishedAt: null,
            })
            .where(eq(liveChatThreads.id, thread.id));
        }
        const refreshed = await db.getLiveChatThreadByIdForAdmin(thread.id, admin.adminId!);
        const resultThread = refreshed || thread;
        notifyAdminLiveChat(admin.adminId!, "chat:thread_updated", { threadId: resultThread.id });
        notifyPlayerLiveChat(input.playerId, "chat:thread_updated", { threadId: resultThread.id });
        return { thread: resultThread };
      }),

    handle: publicProcedure
      .input(z.object({ token: z.string(), threadId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const admin = requireAdmin(ctx);
        await checkPermission(admin.id, admin.role!, "livechat", "edit");
        await db.handleLiveChatThread(input.threadId, admin.adminId!, admin.id);
        notifyAdminLiveChat(admin.adminId!, "chat:thread_updated", { threadId: input.threadId });
        return { success: true };
      }),

    finish: publicProcedure
      .input(z.object({ token: z.string(), threadId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const admin = requireAdmin(ctx);
        await checkPermission(admin.id, admin.role!, "livechat", "edit");
        const thread = await db.getLiveChatThreadByIdForAdmin(input.threadId, admin.adminId!);
        if (!thread) throw new TRPCError({ code: "NOT_FOUND", message: "Thread not found" });
        await db.finishLiveChatThread(input.threadId, admin.adminId!, admin.id);
        notifyAdminLiveChat(admin.adminId!, "chat:thread_updated", { threadId: input.threadId });
        notifyPlayerLiveChat(thread.playerId, "chat:thread_updated", { threadId: input.threadId });
        return { success: true };
      }),
  }),

  messages: router({
    list: publicProcedure
      .input(z.object({
        token: z.string(),
        threadId: z.number(),
        beforeId: z.number().optional(),
        limit: z.number().default(50),
      }))
      .query(async ({ input, ctx }) => {
        const admin = requireAdmin(ctx);
        await checkPermission(admin.id, admin.role!, "livechat", "view");
        const thread = await db.getLiveChatThreadByIdForAdmin(input.threadId, admin.adminId!);
        if (!thread) throw new TRPCError({ code: "NOT_FOUND", message: "Thread not found" });
        const messages = await db.listLiveChatMessages(input.threadId, input.limit, input.beforeId);
        return { messages };
      }),

    send: publicProcedure
      .input(z.object({
        token: z.string(),
        threadId: z.number(),
        body: z.string().min(1).max(2000),
      }))
      .mutation(async ({ input, ctx }) => {
        const admin = requireAdmin(ctx);
        await checkPermission(admin.id, admin.role!, "livechat", "edit");
        const thread = await db.getLiveChatThreadByIdForAdmin(input.threadId, admin.adminId!);
        if (!thread) throw new TRPCError({ code: "NOT_FOUND", message: "Thread not found" });
        if (thread.handledBy && thread.handledBy !== admin.id && admin.role !== "master") {
          throw new TRPCError({ code: "FORBIDDEN", message: "This thread is handled by another admin" });
        }
        const result = await db.sendLiveChatMessageAsAdmin(
          input.threadId,
          admin.adminId!,
          admin.id,
          input.body.trim()
        );
        notifyAdminLiveChat(admin.adminId!, "chat:new_message", {
          threadId: result.threadId,
          messageId: result.messageId,
          senderType: "admin",
          senderAdminId: admin.id,
        });
        notifyAdminLiveChat(admin.adminId!, "chat:thread_updated", { threadId: result.threadId });
        notifyPlayerLiveChat(thread.playerId, "chat:new_message", {
          threadId: result.threadId,
          messageId: result.messageId,
        });
        notifyPlayerLiveChat(thread.playerId, "chat:thread_updated", { threadId: result.threadId });
        return { success: true, threadId: result.threadId, messageId: result.messageId };
      }),
  }),
});
