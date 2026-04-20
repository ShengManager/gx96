import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { COOKIE_NAME } from "@shared/const";
import type { User } from "../../drizzle/schema";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const { user, clearSessionCookie } = await sdk.resolveSessionUser(opts.req);

  if (clearSessionCookie) {
    opts.res.clearCookie(COOKIE_NAME, {
      ...getSessionCookieOptions(opts.req),
      maxAge: 0,
    });
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
