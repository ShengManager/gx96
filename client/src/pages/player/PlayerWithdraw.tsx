import { useState } from "react";
import { usePlayerAuth } from "@/contexts/PlayerAuthContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";
import {
  ArrowUpCircle, AlertCircle, Loader2, Target,
  CheckCircle, Shield, DollarSign,
} from "lucide-react";
import { toast } from "sonner";

export default function PlayerWithdraw() {
  const { accessToken, isAuthenticated, refreshBalance } = usePlayerAuth();
  const [amount, setAmount] = useState("");

  const checkQuery = trpc.player.withdrawalCheck.useQuery(
    { token: accessToken || "" },
    { enabled: !!accessToken, refetchInterval: 15000, refetchOnWindowFocus: true }
  );

  const createMutation = trpc.player.createWithdrawal.useMutation({
    onSuccess: () => {
      toast.success("Withdrawal submitted!");
      setAmount("");
      checkQuery.refetch();
      refreshBalance();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const historyQuery = trpc.player.withdrawalHistory.useQuery(
    { token: accessToken || "" },
    { enabled: !!accessToken }
  );

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <div className="w-20 h-20 rounded-full bg-orange-500/10 flex items-center justify-center mb-4">
          <ArrowUpCircle className="w-10 h-10 text-orange-500" />
        </div>
        <h2 className="text-xl font-bold mb-2">Login Required</h2>
        <p className="text-muted-foreground text-sm mb-4">Please login to make a withdrawal</p>
        <Link href="/login"><Button className="rounded-full px-8">Login Now</Button></Link>
      </div>
    );
  }

  const checkData = checkQuery.data as any;
  const canWithdraw = checkData?.canWithdraw === true;
  const rolloverPct = checkData?.rolloverProgress?.percentage !== undefined
    ? Math.min(100, Number(checkData.rolloverProgress.percentage))
    : null;
  const turnoverPct = checkData?.turnoverProgress?.percentage !== undefined
    ? Math.min(100, Number(checkData.turnoverProgress.percentage))
    : null;
  const rolloverCurrent = Number(checkData?.rolloverProgress?.current || 0);
  const rolloverTarget = Number(checkData?.rolloverProgress?.target || 0);
  const turnoverCurrent = Number(checkData?.turnoverProgress?.current || 0);
  const turnoverTarget = Number(checkData?.turnoverProgress?.target || 0);
  const rolloverRemaining = Math.max(0, rolloverTarget - rolloverCurrent);
  const turnoverRemaining = Math.max(0, turnoverTarget - turnoverCurrent);

  return (
    <div className="space-y-4 px-4 pt-4 pb-4">
      <h2 className="text-xl font-bold">Withdraw</h2>

      {/* Conditions Progress */}
      {checkData && (rolloverPct !== null || turnoverPct !== null) && (
        <Card>
          <CardContent className="pt-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-4 h-4 text-primary" />
              <p className="font-semibold text-sm">Withdrawal Conditions</p>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Rollover = multiplier mode ({Number(checkData?.rolloverMultiplier || 0).toFixed(2)}x). Turnover = multiplier mode ({Number((checkData?.turnoverMultiplier ?? checkData?.turnoverConfiguredTarget) || 0).toFixed(2)}x, cumulative positive win/lose only).
            </p>

            {rolloverPct !== null && (
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Target className="w-3 h-3" /> Rollover
                  </span>
                  <span className={`font-mono font-semibold ${rolloverPct >= 100 ? "text-green-500" : "text-foreground"}`}>
                    {rolloverPct.toFixed(1)}%
                  </span>
                </div>
                <div className="relative">
                  <Progress value={rolloverPct} className="h-3" />
                  {rolloverPct >= 100 && (
                    <CheckCircle className="w-4 h-4 text-green-500 absolute right-0 top-1/2 -translate-y-1/2 translate-x-5" />
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Current: {rolloverCurrent.toFixed(2)} / Target: {rolloverTarget.toFixed(2)} ·
                  {" "}Remaining: {rolloverRemaining.toFixed(2)}
                </p>
              </div>
            )}

            {turnoverPct !== null && (
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Target className="w-3 h-3" /> Turnover
                  </span>
                  <span className={`font-mono font-semibold ${turnoverPct >= 100 ? "text-green-500" : "text-foreground"}`}>
                    {turnoverPct.toFixed(1)}%
                  </span>
                </div>
                <div className="relative">
                  <Progress value={turnoverPct} className="h-3" />
                  {turnoverPct >= 100 && (
                    <CheckCircle className="w-4 h-4 text-green-500 absolute right-0 top-1/2 -translate-y-1/2 translate-x-5" />
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Current: {turnoverCurrent.toFixed(2)} / Target: {turnoverTarget.toFixed(2)} ·
                  {" "}Remaining: {turnoverRemaining.toFixed(2)}
                </p>
              </div>
            )}

            {checkData.maxWithdrawable !== undefined && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                <span className="text-sm text-muted-foreground">Max Withdrawable</span>
                <span className="text-lg font-bold">MYR {parseFloat(String(checkData.maxWithdrawable)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            {checkData.minWithdraw !== undefined && checkData.minWithdraw > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Min per request: MYR {parseFloat(String(checkData.minWithdraw)).toFixed(2)} (from settings)
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Cannot withdraw warning */}
      {checkData && !canWithdraw && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="pt-5 pb-5 flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="font-semibold text-sm">Cannot Withdraw Yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                {checkData.reason || "Rollover/turnover conditions not met. Keep playing to unlock withdrawals."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Withdrawal Form */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="text-center mb-2">
            <DollarSign className="w-8 h-8 text-primary mx-auto mb-2" />
            <p className="font-semibold">Withdrawal Amount</p>
            <p className="text-xs text-muted-foreground">Enter the amount you wish to withdraw</p>
          </div>

          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">MYR</span>
            <Input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              disabled={!canWithdraw}
              className="pl-14 text-lg font-semibold h-12"
            />
          </div>

          {checkData?.minWithdraw !== undefined && amount && parseFloat(amount) > 0 && parseFloat(amount) + 1e-9 < parseFloat(String(checkData.minWithdraw)) && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Amount is below minimum withdrawal
            </p>
          )}
          {checkData?.maxWithdrawable !== undefined && amount && parseFloat(amount) > parseFloat(String(checkData.maxWithdrawable)) + 1e-9 && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Amount exceeds maximum withdrawable
            </p>
          )}

          <Button
            className="w-full h-12 rounded-xl text-base"
            style={{ background: canWithdraw ? "linear-gradient(135deg, #f97316 0%, #ea580c 100%)" : undefined }}
            variant={canWithdraw ? "default" : "secondary"}
            disabled={
              !amount || parseFloat(amount) <= 0 || createMutation.isPending || !canWithdraw ||
              (checkData?.minWithdraw !== undefined && parseFloat(amount) + 1e-9 < parseFloat(String(checkData.minWithdraw))) ||
              (checkData?.maxWithdrawable !== undefined && parseFloat(amount) > parseFloat(String(checkData.maxWithdrawable)) + 1e-9)
            }
            onClick={() => createMutation.mutate({ token: accessToken!, amount: parseFloat(amount) })}
          >
            {createMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
            ) : (
              <ArrowUpCircle className="w-5 h-5 mr-2" />
            )}
            Submit Withdrawal
          </Button>
        </CardContent>
      </Card>

      {/* Recent Withdrawals */}
      <RecentWithdrawals withdrawals={(historyQuery.data as any[]) || []} />
    </div>
  );
}

function RecentWithdrawals({ withdrawals }: { withdrawals: any[] }) {
  if (withdrawals.length === 0) return null;

  const statusColor = (s: string) => {
    switch (s) {
      case "approved": return "bg-green-500/10 text-green-500 border-green-500/20";
      case "pending": return "bg-amber-500/10 text-amber-500 border-amber-500/20";
      case "rejected": return "bg-red-500/10 text-red-500 border-red-500/20";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <Card>
      <CardContent className="pt-5">
        <p className="font-semibold text-sm mb-3">Recent Withdrawals</p>
        <div className="space-y-2">
          {withdrawals.slice(0, 10).map((w: any) => (
            <div key={w.id} className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
              <div>
                <p className="text-sm font-semibold">MYR {parseFloat(w.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                <p className="text-[11px] text-muted-foreground">{new Date(w.createdAt).toLocaleString()}</p>
              </div>
              <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full border ${statusColor(w.status)}`}>
                {w.status}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
