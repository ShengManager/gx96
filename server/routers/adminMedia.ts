import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { requireAdmin, checkPermission } from "../services/middleware";
import { getDb, createAdminLog } from "../db";
import { adminMediaLibrary } from "../../drizzle/schema";
import { eq, and, desc, count } from "drizzle-orm";
import { isCloudwaveS3Configured, cloudwaveS3Delete } from "../s3Cloudwave";

function previewUrlForRow(row: { objectKey: string; publicUrl: string | null }): string {
  if (isCloudwaveS3Configured()) {
    return `/api/media/s3?key=${encodeURIComponent(row.objectKey)}`;
  }
  return row.publicUrl || row.objectKey;
}

export const adminMediaRouter = router({
  list: publicProcedure
    .input(
      z.object({
        token: z.string(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(24),
      })
    )
    .query(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "banner", "view");

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const page = input.page;
      const pageSize = input.pageSize;
      const offset = (page - 1) * pageSize;

      const where = eq(adminMediaLibrary.adminId, admin.adminId!);

      const [rows, countRows] = await Promise.all([
        db
          .select()
          .from(adminMediaLibrary)
          .where(where)
          .orderBy(desc(adminMediaLibrary.createdAt))
          .limit(pageSize)
          .offset(offset),
        db.select({ cnt: count() }).from(adminMediaLibrary).where(where),
      ]);

      const total = Number(countRows[0]?.cnt || 0);
      return {
        total,
        page,
        pageSize,
        items: rows.map((r) => ({
          id: r.id,
          objectKey: r.objectKey,
          originalName: r.originalName,
          contentType: r.contentType,
          byteSize: r.byteSize,
          createdAt: r.createdAt,
          previewUrl: previewUrlForRow(r),
        })),
      };
    }),

  delete: publicProcedure
    .input(z.object({ token: z.string(), id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const admin = requireAdmin(ctx);
      await checkPermission(admin.id, admin.role!, "banner", "delete");

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const rows = await db
        .select()
        .from(adminMediaLibrary)
        .where(and(eq(adminMediaLibrary.id, input.id), eq(adminMediaLibrary.adminId, admin.adminId!)))
        .limit(1);
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Image not found" });

      if (isCloudwaveS3Configured()) {
        try {
          await cloudwaveS3Delete(row.objectKey);
        } catch (e) {
          console.error("[adminMedia] S3 delete failed:", e);
        }
      }

      await db
        .delete(adminMediaLibrary)
        .where(and(eq(adminMediaLibrary.id, input.id), eq(adminMediaLibrary.adminId, admin.adminId!)));

      await createAdminLog({
        adminId: admin.id,
        action: "delete_media",
        module: "banner",
        targetId: input.id,
        targetType: "admin_media",
        details: { objectKey: row.objectKey },
      });

      return { success: true as const };
    }),
});
