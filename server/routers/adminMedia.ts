import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { requireAdmin, checkPermission } from "../services/middleware";
import { getDb, createAdminLog, getDomainAcl } from "../db";
import { adminMediaLibrary } from "../../drizzle/schema";
import { eq, and, desc, count, asc, like, gte, lte, or } from "drizzle-orm";
import { isCloudwaveS3Configured, cloudwaveS3Delete } from "../s3Cloudwave";

function previewUrlForRow(row: { objectKey: string; publicUrl: string | null }): string {
  if (isCloudwaveS3Configured()) {
    return `/api/media/s3?key=${encodeURIComponent(row.objectKey)}`;
  }
  return row.publicUrl || row.objectKey;
}

function normalizeOrigin(raw: string): string {
  const v = String(raw || "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      return `${u.protocol}//${u.host}`;
    } catch {
      return "";
    }
  }
  return `https://${v.replace(/^\/+|\/+$/g, "")}`;
}

export const adminMediaRouter = router({
  list: publicProcedure
    .input(
      z.object({
        token: z.string(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(24),
        keyword: z.string().optional(),
        fileType: z.enum(["all", "png", "jpg", "webp", "gif", "other"]).optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        sortBy: z.enum(["createdAt_desc", "createdAt_asc", "name_asc", "name_desc", "size_desc", "size_asc"]).optional(),
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
      const acl = await getDomainAcl(admin.adminId!);
      const playerDomain = acl.find((d: any) => d.isActive && (d.purpose === "player" || d.purpose === "both"))?.domain || "";
      const frontendBaseUrl = normalizeOrigin(playerDomain) || normalizeOrigin(process.env.FRONTEND_URL || "");
      const conds: any[] = [eq(adminMediaLibrary.adminId, admin.adminId!)];
      const keyword = String(input.keyword || "").trim();
      if (keyword) {
        conds.push(
          or(
            like(adminMediaLibrary.originalName, `%${keyword}%`),
            like(adminMediaLibrary.objectKey, `%${keyword}%`)
          )
        );
      }
      const fileType = input.fileType || "all";
      if (fileType !== "all") {
        if (fileType === "png") conds.push(like(adminMediaLibrary.contentType, "%png%"));
        else if (fileType === "jpg") conds.push(or(like(adminMediaLibrary.contentType, "%jpeg%"), like(adminMediaLibrary.contentType, "%jpg%")));
        else if (fileType === "webp") conds.push(like(adminMediaLibrary.contentType, "%webp%"));
        else if (fileType === "gif") conds.push(like(adminMediaLibrary.contentType, "%gif%"));
        else conds.push(
          and(
            or(eq(adminMediaLibrary.contentType, null as any), like(adminMediaLibrary.contentType, "application/%")),
            eq(adminMediaLibrary.adminId, admin.adminId!)
          )
        );
      }
      if (input.dateFrom) {
        const from = new Date(`${input.dateFrom}T00:00:00.000Z`);
        if (!Number.isNaN(from.getTime())) conds.push(gte(adminMediaLibrary.createdAt, from));
      }
      if (input.dateTo) {
        const to = new Date(`${input.dateTo}T23:59:59.999Z`);
        if (!Number.isNaN(to.getTime())) conds.push(lte(adminMediaLibrary.createdAt, to));
      }
      const where = and(...conds);
      const sortBy = input.sortBy || "createdAt_desc";
      const orderBy =
        sortBy === "createdAt_asc" ? [asc(adminMediaLibrary.createdAt)] :
        sortBy === "name_asc" ? [asc(adminMediaLibrary.originalName), desc(adminMediaLibrary.createdAt)] :
        sortBy === "name_desc" ? [desc(adminMediaLibrary.originalName), desc(adminMediaLibrary.createdAt)] :
        sortBy === "size_asc" ? [asc(adminMediaLibrary.byteSize), desc(adminMediaLibrary.createdAt)] :
        sortBy === "size_desc" ? [desc(adminMediaLibrary.byteSize), desc(adminMediaLibrary.createdAt)] :
        [desc(adminMediaLibrary.createdAt)];

      const [rows, countRows] = await Promise.all([
        db
          .select()
          .from(adminMediaLibrary)
          .where(where)
          .orderBy(...orderBy)
          .limit(pageSize)
          .offset(offset),
        db.select({ cnt: count() }).from(adminMediaLibrary).where(where),
      ]);

      const total = Number(countRows[0]?.cnt || 0);
      return {
        total,
        page,
        pageSize,
        frontendBaseUrl,
        items: rows.map((r) => ({
          previewPath: previewUrlForRow(r),
          id: r.id,
          objectKey: r.objectKey,
          originalName: r.originalName,
          contentType: r.contentType,
          byteSize: r.byteSize,
          createdAt: r.createdAt,
          previewUrl: previewUrlForRow(r),
          frontendPreviewUrl: (() => {
            const p = previewUrlForRow(r);
            if (/^https?:\/\//i.test(p)) return p;
            return frontendBaseUrl ? `${frontendBaseUrl}${p.startsWith("/") ? p : `/${p}`}` : p;
          })(),
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
