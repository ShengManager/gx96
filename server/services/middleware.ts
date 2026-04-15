import { TRPCError } from "@trpc/server";
import { verifyAccessToken, TokenPayload } from "./auth";
import { getPermissions } from "../db";

// Extract token payload from request
export function extractTokenFromRequest(req: any): TokenPayload | null {
  const authHeader = req.headers?.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  return verifyAccessToken(authHeader.slice(7));
}

// Require admin auth
export function requireAdmin(ctx: any): TokenPayload {
  const payload = extractTokenFromRequest(ctx.req);
  if (!payload || payload.type !== "admin") {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Admin authentication required" });
  }
  return payload;
}

// Require master admin
export function requireMasterAdmin(ctx: any): TokenPayload {
  const payload = requireAdmin(ctx);
  if (payload.role !== "master") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Master admin required" });
  }
  return payload;
}

// Require player auth
export function requirePlayer(ctx: any): TokenPayload {
  const payload = extractTokenFromRequest(ctx.req);
  if (!payload || payload.type !== "player") {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Player authentication required" });
  }
  return payload;
}

// Check module permission for sub-accounts
export async function checkPermission(
  adminId: number,
  role: string,
  module: string,
  action: "view" | "edit" | "delete"
): Promise<void> {
  // Master admin has all permissions
  if (role === "master") return;

  const permissions = await getPermissions(adminId);
  const perm = permissions.find(p => p.module === module);

  if (!perm) {
    throw new TRPCError({ code: "FORBIDDEN", message: `No permission for module: ${module}` });
  }

  if (action === "view" && !perm.canView) {
    throw new TRPCError({ code: "FORBIDDEN", message: `No view permission for: ${module}` });
  }
  if (action === "edit" && !perm.canEdit) {
    throw new TRPCError({ code: "FORBIDDEN", message: `No edit permission for: ${module}` });
  }
  if (action === "delete" && !perm.canDelete) {
    throw new TRPCError({ code: "FORBIDDEN", message: `No delete permission for: ${module}` });
  }
}
