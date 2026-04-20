/**
 * Rows in `withdrawals` include player requests, admin manual payouts, and bonus forfeits.
 * Forfeits are stored with status approved and a handleNote mentioning "forfeit".
 */
export type WithdrawalEntryKind = "forfeit" | "manual_withdraw" | "player_withdraw";

export function withdrawalEntryKind(handleNote: string | null | undefined): WithdrawalEntryKind {
  const n = String(handleNote ?? "").toLowerCase();
  if (n.includes("forfeit")) return "forfeit";
  if (n.includes("manual withdrawal")) return "manual_withdraw";
  return "player_withdraw";
}
