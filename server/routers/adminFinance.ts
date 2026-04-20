import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { requireAdmin, checkPermission } from "../services/middleware";
import * as db from "../db";
import { getDb } from "../db";
import {
  approveDeposit,
  rejectDeposit,
  handleDeposit,
  approveWithdrawal,
  rejectWithdrawal,
} from "../services/depositCycle";
import {
  notifyAdminNewDeposit,
  notifyAdminNewWithdrawal,
  bridgeNotifyDepositStatus,
  bridgeNotifyWithdrawalStatus,
} from "../services/websocket";
import { deposits, withdrawals, banks, depositPresets } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

export const adminFinanceRouter = router({
  /** Sidebar badges: counts of deposits/withdrawals awaiting handle or approve/reject */
  pendingActionCounts: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx }) => {
      const admin = requireAdmin(ctx);
      let deposits = 0;
      let withdrawals = 0;
      try {
        await checkPermission(admin.id, admin.role!, "deposit", "view");
        deposits = await db.countDepositsPendingAction(admin.adminId!);
      } catch {
        deposits = 0;
      }
      try {
        await checkPermission(admin.id, admin.role!, "withdraw", "view");
        withdrawals = await db.countWithdrawalsPendingAction(admin.adminId!);
      } catch {
        withdrawals = 0;
      }
      return { deposits, withdrawals };
    }),

  // ─── Deposits ───
  deposits: router({
    list: publicProcedure
      .input(z.object({ token: z.string(), status: z.string().optional(), page: z.number().default(1), pageSize: z.number().default(20) }))
      .query(async ({ input, ctx }) => {
        const admin = requireAdmin(ctx);
        await checkPermission(admin.id, admin.role!, "deposit", "view");
        return db.getDepositsByAdmin(admin.adminId!, { status: input.status, page: input.page, pageSize: input.pageSize });
      }),

    handle: publicProcedure
      .input(z.object({ token: z.string(), depositId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const admin = requireAdmin(ctx);
        await checkPermission(admin.id, admin.role!, "deposit", "edit");
        const result = await handleDeposit(input.depositId, admin.id);
        if (!result.success) throw new TRPCError({ code: "BAD_REQUEST", message: result.error });
        await db.createAdminLog({ adminId: admin.id, action: "handle_deposit", module: "deposit", targetId: input.depositId, targetType: "deposit" });
        return result;
      }),

    approve: publicProcedure
      .input(z.object({ token: z.string(), depositId: z.number(), note: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const admin = requireAdmin(ctx);
        await checkPermission(admin.id, admin.role!, "deposit", "edit");
        const result = await approveDeposit(input.depositId, admin.id, input.note);
        if (!result.success) throw new TRPCError({ code: "BAD_REQUEST", message: result.error });

        // Get deposit to notify player
        const database = await getDb();
        if (database) {
          const dep = await database.select().from(deposits).where(eq(deposits.id, input.depositId)).limit(1);
          if (dep[0]) {
            bridgeNotifyDepositStatus(dep[0].playerId, { depositId: input.depositId, status: "approved", amount: dep[0].amount });
          }
        }

        await db.createAdminLog({ adminId: admin.id, action: "approve_deposit", module: "deposit", targetId: input.depositId, targetType: "deposit", details: { note: input.note } });
        return result;
      }),

    reject: publicProcedure
      .input(z.object({ token: z.string(), depositId: z.number(), reason: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const admin = requireAdmin(ctx);
        await checkPermission(admin.id, admin.role!, "deposit", "edit");
        const result = await rejectDeposit(input.depositId, admin.id, input.reason);
        if (!result.success) throw new TRPCError({ code: "BAD_REQUEST", message: result.error });

        const database = await getDb();
        if (database) {
          const dep = await database.select().from(deposits).where(eq(deposits.id, input.depositId)).limit(1);
          if (dep[0]) {
            bridgeNotifyDepositStatus(dep[0].playerId, { depositId: input.depositId, status: "rejected", remark: input.reason });
          }
        }

        await db.createAdminLog({ adminId: admin.id, action: "reject_deposit", module: "deposit", targetId: input.depositId, targetType: "deposit", details: { reason: input.reason } });
        return result;
      }),
  }),

  // ─── Withdrawals ───
  withdrawals: router({
    list: publicProcedure
      .input(
        z.object({
          token: z.string(),
          status: z.string().optional(),
          page: z.number().default(1),
          pageSize: z.number().default(20),
          listKind: z.enum(["withdrawals", "forfeits", "all"]).optional().default("withdrawals"),
        })
      )
      .query(async ({ input, ctx }) => {
        const admin = requireAdmin(ctx);
        await checkPermission(admin.id, admin.role!, "withdraw", "view");
        return db.getWithdrawalsByAdmin(admin.adminId!, {
          status: input.status,
          page: input.page,
          pageSize: input.pageSize,
          listKind: input.listKind,
        });
      }),

    handle: publicProcedure
      .input(z.object({
        token: z.string(),
        withdrawalId: z.number(),
        bankId: z.number(),
        note: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const admin = requireAdmin(ctx);
        await checkPermission(admin.id, admin.role!, "withdraw", "edit");

        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const wdRows = await database
          .select()
          .from(withdrawals)
          .where(and(eq(withdrawals.id, input.withdrawalId), eq(withdrawals.adminId, admin.adminId!)))
          .limit(1);
        const wd = wdRows[0];
        if (!wd) throw new TRPCError({ code: "NOT_FOUND", message: "Withdrawal not found" });
        if (wd.status !== "pending") {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Only pending withdrawal can be handled (current: ${wd.status})` });
        }

        const bankRows = await database
          .select()
          .from(banks)
          .where(and(eq(banks.id, input.bankId), eq(banks.adminId, admin.adminId!)))
          .limit(1);
        const selectedBank = bankRows[0];
        if (!selectedBank || selectedBank.status !== "active" || (selectedBank.usageType !== "withdraw" && selectedBank.usageType !== "both")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Selected payout bank is invalid or inactive" });
        }

        await database
          .update(withdrawals)
          .set({
            status: "processing",
            handledBy: admin.id,
            bankName: selectedBank.bankName,
            bankAccountName: selectedBank.accountName,
            bankAccountNumber: selectedBank.accountNumber,
            handleNote: input.note || wd.handleNote || null,
          })
          .where(eq(withdrawals.id, input.withdrawalId));

        await db.createAdminLog({
          adminId: admin.id,
          action: "handle_withdrawal",
          module: "withdraw",
          targetId: input.withdrawalId,
          targetType: "withdrawal",
          details: { bankId: input.bankId, note: input.note || null },
        });
        return { success: true };
      }),

    approve: publicProcedure
      .input(z.object({ token: z.string(), withdrawalId: z.number(), note: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const admin = requireAdmin(ctx);
        await checkPermission(admin.id, admin.role!, "withdraw", "edit");
        const result = await approveWithdrawal(input.withdrawalId, admin.id, input.note);
        if (!result.success) throw new TRPCError({ code: "BAD_REQUEST", message: result.error });

        const database = await getDb();
        if (database) {
          const wd = await database.select().from(withdrawals).where(eq(withdrawals.id, input.withdrawalId)).limit(1);
          if (wd[0]) {
            bridgeNotifyWithdrawalStatus(wd[0].playerId, { withdrawalId: input.withdrawalId, status: "approved", amount: wd[0].amount });
          }
        }

        await db.createAdminLog({ adminId: admin.id, action: "approve_withdrawal", module: "withdraw", targetId: input.withdrawalId, targetType: "withdrawal" });
        return result;
      }),

    reject: publicProcedure
      .input(z.object({ token: z.string(), withdrawalId: z.number(), reason: z.string(), pointsRecovered: z.number().optional() }))
      .mutation(async ({ input, ctx }) => {
        const admin = requireAdmin(ctx);
        await checkPermission(admin.id, admin.role!, "withdraw", "edit");
        const result = await rejectWithdrawal(input.withdrawalId, admin.id, input.reason, input.pointsRecovered);
        if (!result.success) throw new TRPCError({ code: "BAD_REQUEST", message: result.error });

        const database = await getDb();
        if (database) {
          const wd = await database.select().from(withdrawals).where(eq(withdrawals.id, input.withdrawalId)).limit(1);
          if (wd[0]) {
            bridgeNotifyWithdrawalStatus(wd[0].playerId, { withdrawalId: input.withdrawalId, status: "rejected", remark: input.reason });
          }
        }

        await db.createAdminLog({ adminId: admin.id, action: "reject_withdrawal", module: "withdraw", targetId: input.withdrawalId, targetType: "withdrawal" });
        return result;
      }),
  }),

  // ─── Banks ───
  banks: router({
    catalog: publicProcedure
      .input(z.object({ token: z.string(), country: z.string().default("MY") }))
      .query(async ({ input, ctx }) => {
        const admin = requireAdmin(ctx);
        await checkPermission(admin.id, admin.role!, "bank", "view");
        return db.getBankCatalog(input.country);
      }),

    list: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input, ctx }) => {
        const admin = requireAdmin(ctx);
        await checkPermission(admin.id, admin.role!, "bank", "view");
        return db.getBanksByAdmin(admin.adminId!);
      }),

    create: publicProcedure
      .input(z.object({
        token: z.string(),
        country: z.string(),
        bankName: z.string(),
        accountName: z.string(),
        accountNumber: z.string(),
        usageType: z.enum(["deposit", "withdraw", "both", "internal"]),
        status: z.enum(["active", "closed", "hidden"]).default("active"),
        sortOrder: z.number().default(0),
      }))
      .mutation(async ({ input, ctx }) => {
        const admin = requireAdmin(ctx);
        await checkPermission(admin.id, admin.role!, "bank", "edit");

        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const result = await database.insert(banks).values({
          adminId: admin.adminId!,
          country: input.country,
          bankName: input.bankName,
          accountName: input.accountName,
          accountNumber: input.accountNumber,
          usageType: input.usageType,
          status: input.status,
          sortOrder: input.sortOrder,
        });

        await db.createAdminLog({ adminId: admin.id, action: "create_bank", module: "bank", targetId: result[0].insertId, targetType: "bank" });
        return { success: true, bankId: result[0].insertId };
      }),

    update: publicProcedure
      .input(z.object({
        token: z.string(),
        bankId: z.number(),
        bankName: z.string().optional(),
        accountName: z.string().optional(),
        accountNumber: z.string().optional(),
        usageType: z.enum(["deposit", "withdraw", "both", "internal"]).optional(),
        status: z.enum(["active", "closed", "hidden"]).optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const admin = requireAdmin(ctx);
        await checkPermission(admin.id, admin.role!, "bank", "edit");

        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const updateData: any = {};
        if (input.bankName !== undefined) updateData.bankName = input.bankName;
        if (input.accountName !== undefined) updateData.accountName = input.accountName;
        if (input.accountNumber !== undefined) updateData.accountNumber = input.accountNumber;
        if (input.usageType !== undefined) updateData.usageType = input.usageType;
        if (input.status !== undefined) updateData.status = input.status;
        if (input.sortOrder !== undefined) updateData.sortOrder = input.sortOrder;

        await database.update(banks).set(updateData).where(and(eq(banks.id, input.bankId), eq(banks.adminId, admin.adminId!)));
        await db.createAdminLog({ adminId: admin.id, action: "update_bank", module: "bank", targetId: input.bankId, targetType: "bank" });
        return { success: true };
      }),

    delete: publicProcedure
      .input(z.object({ token: z.string(), bankId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const admin = requireAdmin(ctx);
        await checkPermission(admin.id, admin.role!, "bank", "delete");

        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await database.delete(banks).where(and(eq(banks.id, input.bankId), eq(banks.adminId, admin.adminId!)));
        await db.createAdminLog({ adminId: admin.id, action: "delete_bank", module: "bank", targetId: input.bankId, targetType: "bank" });
        return { success: true };
      }),
  }),

  // ─── Deposit Presets ───
  presets: router({
    list: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input, ctx }) => {
        const admin = requireAdmin(ctx);
        return db.getDepositPresets(admin.adminId!);
      }),

    save: publicProcedure
      .input(z.object({
        token: z.string(),
        presets: z.array(z.object({ amount: z.number(), sortOrder: z.number() })),
      }))
      .mutation(async ({ input, ctx }) => {
        const admin = requireAdmin(ctx);
        await checkPermission(admin.id, admin.role!, "setting", "edit");

        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // Delete existing and re-insert
        await database.delete(depositPresets).where(eq(depositPresets.adminId, admin.adminId!));
        if (input.presets.length > 0) {
          await database.insert(depositPresets).values(
            input.presets.map(p => ({
              adminId: admin.adminId!,
              amount: p.amount.toFixed(4),
              sortOrder: p.sortOrder,
              isActive: true,
            }))
          );
        }
        return { success: true };
      }),
  }),
});
