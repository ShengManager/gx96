import { nanoid } from "nanoid";

function normalizeSeed(seed: string): string {
  return seed
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 12) || "player";
}

export function generateMiddlewavePlayerId(adminId: number, seed: string): string {
  const safeSeed = normalizeSeed(seed);
  const ts = Date.now().toString(36);
  const rand = nanoid(6).toLowerCase();
  return `gx${adminId}_${safeSeed}_${ts}${rand}`;
}

