import { useState, useRef, useCallback } from "react";
import { usePlayerAuth } from "@/contexts/PlayerAuthContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import {
  ArrowDownCircle, ArrowUpCircle, Gamepad2, ChevronLeft, ChevronRight,
  History, Loader2, TrendingUp, TrendingDown, RefreshCw,
} from "lucide-react";

const statusColor = (s: string) => {
  switch (s) {
    case "approved": return "bg-green-500/10 text-green-500 border-green-500/20";
    case "pending": return "bg-amber-500/10 text-amber-500 border-amber-500/20";
    case "processing": return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    case "rejected": return "bg-red-500/10 text-red-500 border-red-500/20";
    default: return "bg-muted text-muted-foreground";
  }
};

function isForfeitedWithdrawal(row: any): boolean {
  const note = String(row?.handleNote || row?.note || "").toLowerCase();
  return note.includes("forfeit");
}

export default function PlayerHistory() {
  const { accessToken, isAuthenticated } = usePlayerAuth();

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <History className="w-10 h-10 text-primary" />
        </div>
        <h2 className="text-xl font-bold mb-2">Login Required</h2>
        <p className="text-muted-foreground text-sm mb-4">Please login to view history</p>
        <Link href="/login"><Button className="rounded-full px-8">Login Now</Button></Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 pt-4 pb-4">
      <h2 className="text-xl font-bold">Transaction History</h2>
      <Tabs defaultValue="deposits" className="space-y-4">
        <TabsList className="w-full">
          <TabsTrigger value="deposits" className="flex-1">
            <ArrowDownCircle className="w-3.5 h-3.5 mr-1.5" /> Deposits
          </TabsTrigger>
          <TabsTrigger value="withdrawals" className="flex-1">
            <ArrowUpCircle className="w-3.5 h-3.5 mr-1.5" /> Withdrawals
          </TabsTrigger>
          <TabsTrigger value="games" className="flex-1">
            <Gamepad2 className="w-3.5 h-3.5 mr-1.5" /> Games
          </TabsTrigger>
        </TabsList>
        <TabsContent value="deposits"><DepositHistory token={accessToken!} /></TabsContent>
        <TabsContent value="withdrawals"><WithdrawalHistory token={accessToken!} /></TabsContent>
        <TabsContent value="games"><GameLogHistory token={accessToken!} /></TabsContent>
      </Tabs>
    </div>
  );
}

function RefreshButton({ isFetching, onRefresh }: { isFetching: boolean; onRefresh: () => void }) {
  return (
    <div className="flex justify-end">
      <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={onRefresh} disabled={isFetching}>
        <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} />
        {isFetching ? "Refreshing..." : "Refresh"}
      </Button>
    </div>
  );
}

function DepositHistory({ token }: { token: string }) {
  const query = trpc.player.depositHistory.useQuery({ token });
  const deposits = (query.data as any[]) || [];

  if (query.isLoading) return <LoadingState />;

  return (
    <div className="space-y-2">
      <RefreshButton isFetching={query.isFetching} onRefresh={() => query.refetch()} />
      {deposits.map((d: any) => (
        <Card key={d.id} className="overflow-hidden">
          <CardContent className="py-3.5 px-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center flex-shrink-0">
              <ArrowDownCircle className="w-5 h-5 text-green-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">MYR {parseFloat(d.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              <p className="text-[11px] text-muted-foreground">{new Date(d.createdAt).toLocaleString()}</p>
              {d.bankName && <p className="text-[10px] text-muted-foreground/70">{d.bankName}</p>}
            </div>
            <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full border flex-shrink-0 capitalize ${statusColor(d.status)}`}>
              {d.status}
            </span>
          </CardContent>
        </Card>
      ))}
      {deposits.length === 0 && (
        <EmptyState icon={ArrowDownCircle} message="No deposit history" sub="Your deposit records will appear here" />
      )}
    </div>
  );
}

function WithdrawalHistory({ token }: { token: string }) {
  const query = trpc.player.withdrawalHistory.useQuery({ token });
  const withdrawals = (query.data as any[]) || [];

  if (query.isLoading) return <LoadingState />;

  return (
    <div className="space-y-2">
      <RefreshButton isFetching={query.isFetching} onRefresh={() => query.refetch()} />
      {withdrawals.map((w: any) => (
        <Card key={w.id} className="overflow-hidden">
          <CardContent className="py-3.5 px-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              isForfeitedWithdrawal(w) ? "bg-rose-500/10" : "bg-orange-500/10"
            }`}>
              <ArrowUpCircle className={`w-5 h-5 ${isForfeitedWithdrawal(w) ? "text-rose-500" : "text-orange-500"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">MYR {parseFloat(w.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              <p className="text-[11px] text-muted-foreground">{new Date(w.createdAt).toLocaleString()}</p>
              <p className={`text-[11px] mt-0.5 ${isForfeitedWithdrawal(w) ? "text-rose-400" : "text-muted-foreground"}`}>
                {isForfeitedWithdrawal(w) ? "Forfeited" : "Withdrawal"} · Order #{w.id}
              </p>
              {w.handleNote && (
                <p className="text-[10px] text-muted-foreground/70 truncate">{w.handleNote}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              {isForfeitedWithdrawal(w) && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-rose-500/30 text-rose-400 bg-rose-500/10">
                  forfeited
                </span>
              )}
              <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full border flex-shrink-0 capitalize ${statusColor(w.status)}`}>
                {w.status}
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
      {withdrawals.length === 0 && (
        <EmptyState icon={ArrowUpCircle} message="No withdrawal history" sub="Your withdrawal records will appear here" />
      )}
    </div>
  );
}

function GameLogHistory({ token }: { token: string }) {
  const [page, setPage] = useState(1);
  const query = trpc.player.gameLogs.useQuery({ token, page, pageSize: 20 });
  const data = query.data as any;
  const logs = data?.logs || [];
  const totalPages = data ? Math.ceil((data.total || 0) / 20) : 0;

  if (query.isLoading) return <LoadingState />;

  return (
    <div className="space-y-2">
      <RefreshButton isFetching={query.isFetching} onRefresh={() => query.refetch()} />
      {logs.map((log: any, idx: number) => {
        const winLoss = parseFloat(log.winLoss || 0);
        const isWin = winLoss >= 0;
        return (
          <Card key={log.id || idx} className="overflow-hidden">
            <CardContent className="py-3.5 px-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                isWin ? "bg-green-500/10" : "bg-red-500/10"
              }`}>
                {isWin ? <TrendingUp className="w-5 h-5 text-green-500" /> : <TrendingDown className="w-5 h-5 text-red-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{log.gameName || log.gameCode}</p>
                <p className="text-[11px] text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className={`text-sm font-bold ${isWin ? "text-green-500" : "text-red-500"}`}>
                  {isWin ? "+" : ""}{winLoss.toFixed(2)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Bet: {parseFloat(log.betAmount || 0).toFixed(2)}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
      {logs.length === 0 && (
        <EmptyState icon={Gamepad2} message="No game logs" sub="Play some games and your history will appear here" />
      )}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" size="sm" className="rounded-xl" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Prev
          </Button>
          <span className="text-xs text-muted-foreground font-medium">
            Page {page} of {totalPages}
          </span>
          <Button variant="outline" size="sm" className="rounded-xl" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            Next <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );
}

function EmptyState({ icon: Icon, message, sub }: { icon: any; message: string; sub: string }) {
  return (
    <div className="text-center py-16">
      <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-3">
        <Icon className="w-8 h-8 text-muted-foreground/30" />
      </div>
      <p className="text-muted-foreground text-sm font-medium">{message}</p>
      <p className="text-xs text-muted-foreground/60 mt-1">{sub}</p>
    </div>
  );
}
