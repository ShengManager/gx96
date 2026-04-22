import { useEffect, useMemo, useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Eye, UserCheck, UserX, Star, ChevronLeft, ChevronRight, AlertTriangle, RefreshCw, Loader2, Phone, Globe, Wallet, Calendar, Copy, LogIn, Users, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function AdminPlayers() {
  const { accessToken, hasPermission } = useAdminAuth();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedPlayer, setSelectedPlayer] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const playersQuery = trpc.adminPlayers.list.useQuery(
    { token: accessToken || "", search, page, pageSize: 20 },
    { enabled: !!accessToken }
  );

  const detailQuery = trpc.adminPlayers.detail.useQuery(
    { token: accessToken || "", playerId: selectedPlayer! },
    { enabled: !!accessToken && !!selectedPlayer && detailOpen }
  );

  const toggleMutation = trpc.adminPlayers.toggleActive.useMutation({
    onSuccess: () => { playersQuery.refetch(); toast.success("Player status updated"); },
    onError: (err: any) => toast.error(err.message),
  });

  const vipMutation = trpc.adminPlayers.updateVipLevel.useMutation({
    onSuccess: () => { detailQuery.refetch(); toast.success("VIP level updated"); },
    onError: (err: any) => toast.error(err.message),
  });

  const manualCreditMutation = trpc.adminPlayers.manualCredit.useMutation({
    onSuccess: () => {
      detailQuery.refetch();
      playersQuery.refetch();
      toast.success("Credit added to wallet");
    },
    onError: (err: any) => toast.error(err.message || "Failed to add credit"),
  });

  const manualWithdrawMutation = trpc.adminPlayers.manualWithdraw.useMutation({
    onSuccess: () => {
      detailQuery.refetch();
      playersQuery.refetch();
      toast.success("Wallet withdrawn successfully");
    },
    onError: (err: any) => toast.error(err.message || "Failed to withdraw wallet"),
  });

  const forfeitBonusMutation = trpc.adminPlayers.forfeitBonuses.useMutation({
    onSuccess: (res: any) => {
      detailQuery.refetch();
      playersQuery.refetch();
      toast.success(`Forfeited ${res?.forfeitedCount || 0} bonus record(s)`);
    },
    onError: (err: any) => toast.error(err.message || "Failed to forfeit bonuses"),
  });

  const loginAsPlayerMutation = trpc.adminPlayers.loginAsPlayer.useMutation({
    onError: (err: any) => toast.error(err.message || "Failed to open frontend login"),
  });
  const startChatMutation = trpc.adminLiveChat.threads.openByPlayer.useMutation({
    onError: (err: any) => toast.error(err.message || "Failed to start chat"),
  });

  const [showAnomalies, setShowAnomalies] = useState(false);
  const [scanEnabled, setScanEnabled] = useState(false);

  const anomalyQuery = trpc.adminPlayers.scanAnomalies.useQuery(
    { token: accessToken! },
    { enabled: !!accessToken && scanEnabled, retry: false }
  );

  const data = playersQuery.data;
  const totalPages = data ? Math.ceil(data.total / 20) : 0;

  const openPlayerDetail = (playerId: number) => {
    setSelectedPlayer(playerId);
    setDetailOpen(true);
  };

  const handleFrontendLogin = async (playerId: number) => {
    try {
      const res = await loginAsPlayerMutation.mutateAsync({ token: accessToken!, playerId });
      if (res?.loginUrl) {
        window.open(res.loginUrl, "_blank", "noopener,noreferrer");
      } else {
        toast.error("No frontend login URL returned");
      }
    } catch {
      // handled in mutation onError
    }
  };
  const handleStartChat = async (playerId: number) => {
    if (!accessToken) return;
    try {
      const res = await startChatMutation.mutateAsync({ token: accessToken, playerId });
      const threadId = Number((res as any)?.thread?.id || 0);
      if (!threadId) {
        toast.error("Failed to open chat thread");
        return;
      }
      setLocation(`/admin/live-chat?threadId=${threadId}`);
    } catch {
      // handled by mutation onError
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Player Management</h1>
          <p className="text-muted-foreground">Manage all registered players</p>
        </div>
        <Button
          variant="outline"
          onClick={() => { setScanEnabled(true); setShowAnomalies(true); anomalyQuery.refetch(); }}
          disabled={anomalyQuery.isFetching}
          className="gap-2"
        >
          {anomalyQuery.isFetching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4 text-amber-500" />}
          Check Anomalous Credits
        </Button>
      </div>

      {/* Anomalous Credits Dialog */}
      <Dialog open={showAnomalies && !!anomalyQuery.data} onOpenChange={(v) => { setShowAnomalies(v); if (!v) setScanEnabled(false); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" /> Anomalous Credit Detection
            </DialogTitle>
          </DialogHeader>
          {anomalyQuery.data && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Scanned {(anomalyQuery.data as any).scanned} players. Found {(anomalyQuery.data as any).anomalies?.length || 0} anomalies.
              </p>
              {(anomalyQuery.data as any).anomalies?.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Player</TableHead>
                      <TableHead>Local Balance</TableHead>
                      <TableHead>MW Balance</TableHead>
                      <TableHead>Diff</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(anomalyQuery.data as any).anomalies.map((a: any) => (
                      <TableRow key={a.playerId}>
                        <TableCell className="font-mono text-sm">#{a.playerId} ({a.phone})</TableCell>
                        <TableCell>${a.localBalance}</TableCell>
                        <TableCell>${a.mwBalance}</TableCell>
                        <TableCell className="text-red-500 font-bold">${a.diff}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center py-4 text-green-500">No anomalies detected. All balances match.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Player Detail Dialog */}
      <Dialog  open={detailOpen} onOpenChange={(v) => { setDetailOpen(v); if (!v) setSelectedPlayer(null); }}>
        <DialogContent
          style={{ width: "98vw", maxWidth: "1200px" }}
          className="max-h-[92vh] overflow-y-auto overflow-x-hidden p-6"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" /> Player Detail #{selectedPlayer}
            </DialogTitle>
          </DialogHeader>
          {detailQuery.isPending ? (
            <div className="py-12 flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading player details...</p>
            </div>
          ) : detailQuery.data ? (
            <PlayerDetail
              data={detailQuery.data}
              accessToken={accessToken!}
              onVipChange={(level) => vipMutation.mutate({ token: accessToken!, playerId: selectedPlayer!, vipLevel: level })}
              canEdit={hasPermission("player", "edit")}
              canManualCredit={hasPermission("deposit", "edit")}
              onManualCredit={(amount, note, bankId) => manualCreditMutation.mutate({
                token: accessToken!,
                playerId: selectedPlayer!,
                amount,
                bankId,
                note,
              })}
              creditLoading={manualCreditMutation.isPending}
              canManualWithdraw={hasPermission("withdraw", "edit")}
              onManualWithdraw={(amount, note, bankId) => manualWithdrawMutation.mutate({
                token: accessToken!,
                playerId: selectedPlayer!,
                amount,
                bankId,
                note,
              })}
              withdrawLoading={manualWithdrawMutation.isPending}
              canForfeitBonus={hasPermission("bonus", "edit")}
              onForfeitBonus={(amount, note) => forfeitBonusMutation.mutate({
                token: accessToken!,
                playerId: selectedPlayer!,
                amount,
                note,
              })}
              forfeitLoading={forfeitBonusMutation.isPending}
            />
          ) : (
            <div className="py-8 text-center text-muted-foreground">Failed to load player details</div>
          )}
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by username, phone, invite code..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            <Badge variant="secondary">{data?.total || 0} players</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Telegram</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>VIP</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Registered</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.players?.map((player: any) => (
                <TableRow key={player.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openPlayerDetail(player.id)}>
                  <TableCell className="font-mono text-sm">{player.id}</TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{player.telegramFirstName} {player.telegramLastName || ""}</p>
                      <p className="text-xs text-muted-foreground">@{player.telegramUsername || "N/A"}</p>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{player.phone || "N/A"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="gap-1">
                      <Star className="w-3 h-3 text-yellow-500" /> {player.vipLevel}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className={`status-badge ${player.isActive ? "status-approved" : "status-rejected"}`}>
                      {player.isActive ? "Active" : "Inactive"}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(player.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openPlayerDetail(player.id)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Login to frontend as this player"
                        onClick={() => handleFrontendLogin(player.id)}
                        disabled={loginAsPlayerMutation.isPending}
                      >
                        <LogIn className="w-4 h-4 text-primary" />
                      </Button>
                      {hasPermission("livechat", "edit") && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Start live chat"
                          onClick={() => handleStartChat(player.id)}
                          disabled={startChatMutation.isPending}
                        >
                          {startChatMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                          ) : (
                            <MessageSquare className="w-4 h-4 text-cyan-400" />
                          )}
                        </Button>
                      )}
                      {hasPermission("player", "edit") && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleMutation.mutate({ token: accessToken!, playerId: player.id, isActive: !player.isActive })}
                        >
                          {player.isActive ? <UserX className="w-4 h-4 text-red-500" /> : <UserCheck className="w-4 h-4 text-green-500" />}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(!data?.players || data.players.length === 0) && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {playersQuery.isLoading ? (
                      <div className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
                    ) : "No players found"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
              <div className="flex gap-1">
                <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PlayerDetail({
  data,
  accessToken,
  onVipChange,
  canEdit,
  canManualCredit,
  onManualCredit,
  creditLoading,
  canManualWithdraw,
  onManualWithdraw,
  withdrawLoading,
  canForfeitBonus,
  onForfeitBonus,
  forfeitLoading,
}: {
  data: any;
  accessToken: string;
  onVipChange: (level: number) => void;
  canEdit: boolean;
  canManualCredit: boolean;
  onManualCredit: (amount: number, note: string | undefined, bankId: number) => void;
  creditLoading: boolean;
  canManualWithdraw: boolean;
  onManualWithdraw: (amount: number, note: string | undefined, bankId: number) => void;
  withdrawLoading: boolean;
  canForfeitBonus: boolean;
  onForfeitBonus: (amount: number, note?: string) => void;
  forfeitLoading: boolean;
}) {
  const p = data.player;
  const [opType, setOpType] = useState<"deposit" | "withdraw" | "forfeit">("deposit");
  const [opAmount, setOpAmount] = useState("");
  const [opNote, setOpNote] = useState("");
  const [opBankId, setOpBankId] = useState<string>("");
  const [logScope, setLogScope] = useState<"all" | "current_cycle">("current_cycle");
  const [logPage, setLogPage] = useState(1);
  const logPageSize = 20;
  const sn = (v: any) => typeof v === "number" ? v : parseFloat(v) || 0;
  const fmtCurrency = (v: any) => `$${sn(v).toFixed(2)}`;
  const walletBalanceNum = sn(data.walletBalance || 0);
  const localBookNum = sn(data.localWalletBalance ?? data.walletBalance ?? 0);
  const providerBalances = Array.isArray(data.providerBalances) ? data.providerBalances : [];
  const invitedCount = Number(data.invitedCount ?? 0);
  const [detailTab, setDetailTab] = useState("transaction");
  const [invitedListPage, setInvitedListPage] = useState(1);
  const invitedListPageSize = 15;
  const invitedListQuery = trpc.adminPlayers.invitedList.useQuery(
    {
      token: accessToken,
      playerId: Number(p.id),
      page: invitedListPage,
      pageSize: invitedListPageSize,
    },
    { enabled: !!accessToken && !!p.id && detailTab === "invited" }
  );
  const invitedListTotal = Number((invitedListQuery.data as any)?.total || 0);
  const invitedListRows = Array.isArray((invitedListQuery.data as any)?.rows)
    ? (invitedListQuery.data as any).rows
    : [];
  const invitedListTotalPages = Math.max(1, Math.ceil(invitedListTotal / invitedListPageSize));

  useEffect(() => {
    setDetailTab("transaction");
    setInvitedListPage(1);
  }, [p.id]);
  const middlewaveLogsQuery = trpc.adminPlayers.middlewaveGameLogs.useQuery(
    {
      token: accessToken,
      playerId: Number(data?.player?.id || 0),
      page: logPage,
      pageSize: logPageSize,
      scope: logScope,
    },
    { enabled: !!accessToken && !!data?.player?.id }
  );
  const middlewaveGameLogs = Array.isArray((middlewaveLogsQuery.data as any)?.logs)
    ? (middlewaveLogsQuery.data as any).logs
    : [];
  const middlewaveGameLogError = (middlewaveLogsQuery.data as any)?.error as string | undefined;
  const middlewaveTotal = Number((middlewaveLogsQuery.data as any)?.total || 0);
  const middlewaveTotalPages = Math.max(1, Math.ceil(middlewaveTotal / logPageSize));
  const depositBanks = Array.isArray(data.depositBanks) ? data.depositBanks : [];
  const withdrawBanks = Array.isArray(data.withdrawBanks) ? data.withdrawBanks : [];
  const providerCredits = providerBalances.reduce((sum: number, b: any) => sum + Math.max(0, sn(b.balance)), 0);
  const realtimeWalletNum = providerCredits > 0 ? providerCredits : localBookNum;
  const hasAnyCredits = localBookNum > 0 || providerCredits > 0;
  const activeProviderBalances = providerBalances.filter((b: any) => sn(b.balance) > 0);
  const sortedProviderBalances = [...providerBalances].sort((a: any, b: any) => String(a.provider).localeCompare(String(b.provider)));
  const withdrawalCheck = data?.withdrawalCheck || null;
  const canWithdrawNow = Boolean(withdrawalCheck?.canWithdraw);
  const withdrawConditionReason = String(withdrawalCheck?.reason || "Withdrawal conditions not met");
  const withdrawableByCondition = sn(withdrawalCheck?.maxWithdrawable ?? data.walletBalance ?? 0);
  const effectiveWithdrawLimit = Math.max(0, Math.min(walletBalanceNum, withdrawableByCondition));
  const wcHasEnteredGame = Boolean(withdrawalCheck?.hasEnteredGame);
  const wcRolloverCurrent = sn(withdrawalCheck?.rolloverProgress?.current);
  const wcRolloverTarget = sn(withdrawalCheck?.rolloverProgress?.target);
  const wcTurnoverCurrent = sn(withdrawalCheck?.turnoverProgress?.current);
  const wcTurnoverTarget = sn(withdrawalCheck?.turnoverProgress?.target);
  const hasRolloverTarget = wcRolloverTarget > 0;
  const hasTurnoverTarget = wcTurnoverTarget > 0;
  const wcRolloverMet = !hasRolloverTarget || wcRolloverCurrent + 1e-9 >= wcRolloverTarget;
  const wcTurnoverMet = !hasTurnoverTarget || wcTurnoverCurrent + 1e-9 >= wcTurnoverTarget;
  const wcMinWithdraw = typeof withdrawalCheck?.minWithdraw === "number" ? Math.max(0, sn(withdrawalCheck.minWithdraw)) : undefined;
  const wcMinWithdrawMet = wcMinWithdraw === undefined || walletBalanceNum + 1e-9 >= wcMinWithdraw;

  useEffect(() => {
    if (!hasAnyCredits && opType !== "deposit") {
      setOpType("deposit");
      setOpBankId("");
      setOpAmount("");
    }
    if (hasAnyCredits && opType === "deposit") {
      setOpType(canManualWithdraw ? "withdraw" : "forfeit");
      setOpBankId("");
      setOpAmount(walletBalanceNum > 0 ? Number(walletBalanceNum.toFixed(4)).toString() : "");
    }
    if (hasAnyCredits && (opType === "withdraw" || opType === "forfeit")) {
      setOpAmount(walletBalanceNum > 0 ? Number(walletBalanceNum.toFixed(4)).toString() : "");
    }
  }, [hasAnyCredits, opType, canManualWithdraw, walletBalanceNum]);

  useEffect(() => {
    setLogPage(1);
  }, [data?.player?.id, logScope]);

  const transactions = useMemo(() => {
    const deposits = (data.depositHistory || []).map((d: any) => ({
      id: `deposit-${d.id}`,
      rawId: d.id,
      type: "deposit" as const,
      amount: sn(d.amount),
      status: d.status || "pending",
      time: d.createdAt,
      ts: new Date(d.createdAt).getTime(),
      note: d.paymentMethod || "bank",
    }));

    const withdrawals = (data.withdrawHistory || []).map((w: any) => {
      const handleNote = String(w.handleNote || "").toLowerCase();
      const isForfeitedOp = handleNote.includes("forfeit");
      return ({
      id: `withdraw-${w.id}`,
      rawId: w.id,
      type: isForfeitedOp ? "forfeited" as const : "withdraw" as const,
      amount: sn(w.amount),
      status: w.status || "pending",
      time: w.createdAt,
      ts: new Date(w.createdAt).getTime(),
      note: isForfeitedOp ? "forfeited" : "withdraw",
    });
    });

    const bonuses = (data.bonuses || []).map((b: any) => ({
      id: `bonus-${b.id}`,
      rawId: b.id,
      // 始终标为 bonus；是否已没收由 Status 列与第二个标签表示
      type: "bonus" as const,
      amount: sn(b.awardedAmount ?? b.bonusAmount ?? 0),
      status: b.status || "active",
      time: b.claimedAt,
      ts: new Date(b.claimedAt).getTime(),
      note: b.bonusName || `Bonus #${b.bonusConfigId}`,
    }));

    return [...deposits, ...withdrawals, ...bonuses]
      .filter((t) => Number.isFinite(t.ts))
      .sort((a, b) => a.ts - b.ts);
  }, [data, sn]);

  const transactionTypeClass: Record<string, string> = {
    deposit: "text-emerald-400",
    withdraw: "text-red-400",
    bonus: "text-amber-400",
    forfeited: "text-rose-400",
  };

  const transactionTypeLabel: Record<string, string> = {
    deposit: "Deposit",
    withdraw: "Withdraw",
    bonus: "Bonus",
    forfeited: "Forfeited",
  };

  const txIsNegativeAmount = (tx: { type: string; status?: string }) => {
    if (tx.type === "withdraw" || tx.type === "forfeited") return true;
    if (tx.type === "bonus" && String(tx.status || "").toLowerCase() === "forfeited") return true;
    return false;
  };

  const txAmountClassName = (tx: { type: string; status?: string }) => {
    if (tx.type === "withdraw" || tx.type === "forfeited") return transactionTypeClass[tx.type];
    if (tx.type === "bonus" && String(tx.status || "").toLowerCase() === "forfeited") {
      return transactionTypeClass.forfeited;
    }
    return transactionTypeClass[tx.type] ?? "";
  };

  const submitOperation = () => {
    if (opType === "forfeit") {
      const amount = Number(opAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error("Please input a valid forfeited amount");
        return;
      }
      if (amount > walletBalanceNum + 0.0001) {
        toast.error(`Forfeited amount cannot exceed wallet balance (${walletBalanceNum.toFixed(2)})`);
        return;
      }
      onForfeitBonus(amount, opNote.trim() || undefined);
      setOpAmount("");
      setOpNote("");
      return;
    }

    const amount = Number(opAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Please input a valid amount");
      return;
    }

    if (opType === "deposit") {
      if (!opBankId) {
        toast.error("Please select a deposit bank");
        return;
      }
      onManualCredit(amount, opNote.trim() || undefined, Number(opBankId));
    } else {
      if (!canWithdrawNow) {
        toast.error(withdrawConditionReason);
        return;
      }
      if (!opBankId) {
        toast.error("Please select a withdraw bank");
        return;
      }
      if (amount > effectiveWithdrawLimit + 0.0001) {
        toast.error(`Withdraw amount cannot exceed withdrawable balance (${effectiveWithdrawLimit.toFixed(4)})`);
        return;
      }
      onManualWithdraw(amount, opNote.trim() || undefined, Number(opBankId));
    }
    setOpAmount("");
    setOpNote("");
    if (opType === "deposit") setOpBankId("");
  };

  const canSubmitOperation =
    opType === "forfeit"
      ? canForfeitBonus && !forfeitLoading
      : opType === "deposit"
        ? canManualCredit && !creditLoading
        : canManualWithdraw && !withdrawLoading && canWithdrawNow;

  return (
    <div className="space-y-4">
      <Card className="border-white/10">
        <CardContent className="pt-4 pb-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-7 flex items-start gap-3 min-w-0">
              <div className="w-11 h-11 rounded-full bg-primary/20 flex items-center justify-center text-primary text-base font-bold shrink-0">
                {(p.telegramFirstName || "?").slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div>
                  <h3 className="text-base font-semibold leading-tight">
                    {p.telegramFirstName} {p.telegramLastName || ""}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    @{p.telegramUsername || "N/A"} · TG {p.telegramId}
                  </p>
                  {data.inviter && (
                    <p className="text-xs mt-1.5 text-foreground/90">
                      <span className="text-muted-foreground">邀请人</span>{" "}
                      <span className="font-medium">#{data.inviter.id}</span>
                      <span className="text-muted-foreground mx-1">·</span>
                      <span>{data.inviter.label}</span>
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] sm:text-xs rounded-md border border-white/10 bg-black/20 p-2">
                  <div className="flex items-center gap-1.5 min-w-0 col-span-2 sm:col-span-1">
                    <Phone className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="truncate">{p.phone || "N/A"}</span>
                  </div>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Globe className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="truncate">{p.countryCode || "N/A"}</span>
                  </div>
                  <div className="flex items-center gap-1.5 min-w-0 col-span-2 sm:col-span-2">
                    <Copy className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="font-mono truncate">{data.telegramInviteLink || p.inviteCode || "N/A"}</span>
                    {!!(data.telegramInviteLink || p.inviteCode) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => {
                          navigator.clipboard.writeText(data.telegramInviteLink || p.inviteCode);
                          toast.success("Copied");
                        }}
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 min-w-0 col-span-2 sm:col-span-2">
                    <Calendar className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="truncate">{new Date(p.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="lg:col-span-5 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs rounded-md border border-white/10 bg-card/40 p-2.5">
              <div className="flex items-center justify-between gap-2 sm:col-span-1">
                <span className="text-muted-foreground shrink-0">Status</span>
                <Badge variant={p.isActive ? "default" : "destructive"} className="text-[10px] px-1.5 py-0 h-5">
                  {p.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground shrink-0">VIP</span>
                <span className="flex items-center gap-0.5 font-semibold">
                  <Star className="w-3 h-3 text-yellow-500 shrink-0" />
                  {p.vipLevel}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground shrink-0">Invited</span>
                <span className="font-mono font-semibold">{invitedCount}</span>
              </div>
              {canEdit && (
                <div className="col-span-2 sm:col-span-3 flex flex-wrap items-center gap-1 pt-1 border-t border-white/10">
                  <span className="text-muted-foreground mr-1 w-full sm:w-auto shrink-0">等级</span>
                  {[0, 1, 2, 3, 4, 5].map((l) => (
                    <Button
                      key={l}
                      type="button"
                      variant={p.vipLevel === l ? "default" : "outline"}
                      size="sm"
                      className="h-7 w-7 p-0 text-[10px]"
                      onClick={() => onVipChange(l)}
                    >
                      {l}
                    </Button>
                  ))}
                </div>
              )}
              <div className="col-span-2 sm:col-span-3 space-y-1 pt-1 border-t border-white/10 min-w-0">
                <div className="flex gap-1 min-w-0">
                  <span className="text-muted-foreground shrink-0">Bank</span>
                  <span className="font-mono truncate text-foreground/90">{p.bankName || "N/A"}</span>
                </div>
                <div className="flex gap-1 min-w-0">
                  <span className="text-muted-foreground shrink-0">Acct</span>
                  <span className="font-mono truncate text-foreground/90">{p.bankAccountNumber || "N/A"}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={detailTab} onValueChange={setDetailTab} className="space-y-3">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto gap-1 p-1">
          <TabsTrigger value="transaction" className="text-[10px] sm:text-xs px-1">
            TRANSACTION
          </TabsTrigger>
          <TabsTrigger value="credits" className="text-[10px] sm:text-xs px-1">
            CREDIT
          </TabsTrigger>
          <TabsTrigger value="logs" className="text-[10px] sm:text-xs px-1">
            GAME LOG
          </TabsTrigger>
          <TabsTrigger value="invited" className="text-[10px] sm:text-xs px-1 gap-1">
            <Users className="w-3 h-3 shrink-0 opacity-70" />
            INVITED
            {invitedCount > 0 && (
              <Badge variant="secondary" className="ml-0.5 h-4 min-w-4 px-1 text-[9px] py-0">
                {invitedCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="transaction" className="mt-0">
          <div className="rounded-lg border border-white/10 bg-card/30 p-3">
            <div className="text-xs text-muted-foreground mb-3">
              Ordered by datetime (oldest → newest)
            </div>
            <div className="max-h-[340px] overflow-y-auto overflow-x-auto rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-xs font-mono whitespace-nowrap">
                        {new Date(tx.time).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          {String(tx.id).startsWith("bonus-") ? (
                            <>
                              <Badge variant="outline" className={`${transactionTypeClass.bonus} border-current/40`}>
                                {transactionTypeLabel.bonus}
                              </Badge>
                              {String(tx.status || "").toLowerCase() === "forfeited" && (
                                <Badge variant="outline" className={`${transactionTypeClass.forfeited} border-current/40`}>
                                  {transactionTypeLabel.forfeited}
                                </Badge>
                              )}
                            </>
                          ) : (
                            <Badge variant="outline" className={`${transactionTypeClass[tx.type]} border-current/40`}>
                              {transactionTypeLabel[tx.type]}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${txAmountClassName(tx)}`}>
                        {txIsNegativeAmount(tx) ? "-" : "+"}
                        {fmtCurrency(tx.amount)}
                      </TableCell>
                      <TableCell>
                        <span className={`status-badge ${tx.status === "approved" || tx.status === "completed" ? "status-approved" : tx.status === "rejected" ? "status-rejected" : "status-pending"}`}>
                          {tx.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        Order #{tx.rawId} · {tx.note}
                      </TableCell>
                    </TableRow>
                  ))}
                  {transactions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No transaction history
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="credits" className="mt-0">
          <Card className="border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-primary" />
                  Current Game Credits (All Providers)
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono">
                    Wallet: {fmtCurrency(realtimeWalletNum)}
                  </Badge>
                  <Badge variant="secondary" className="font-mono">
                    Withdrawable: {fmtCurrency(data.walletBalance || 0)}
                  </Badge>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xs text-muted-foreground">
                Wallet is real-time provider credits. Withdrawable is capped by cycle book (risk-control rule).
              </div>
              <div className={`rounded-md border px-3 py-2 text-xs ${
                canWithdrawNow
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-300"
              }`}>
                {canWithdrawNow
                  ? `Withdraw Conditions: Passed · Max withdrawable ${fmtCurrency(withdrawableByCondition)}`
                  : `Withdraw Conditions: Not met · ${withdrawConditionReason}`}
              </div>
              <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs space-y-1.5">
                <div className="font-medium text-white/90">Condition Breakdown</div>
                <div className={wcHasEnteredGame ? "text-emerald-300" : "text-amber-300"}>
                  {wcHasEnteredGame ? "PASS" : "FAIL"} · Entered game
                </div>
                {hasRolloverTarget && (
                  <div className={wcRolloverMet ? "text-emerald-300" : "text-amber-300"}>
                    {wcRolloverMet ? "PASS" : "FAIL"} · Rollover {wcRolloverCurrent.toFixed(2)} / {wcRolloverTarget.toFixed(2)}
                  </div>
                )}
                {hasTurnoverTarget && (
                  <div className={wcTurnoverMet ? "text-emerald-300" : "text-amber-300"}>
                    {wcTurnoverMet ? "PASS" : "FAIL"} · Turnover {wcTurnoverCurrent.toFixed(2)} / {wcTurnoverTarget.toFixed(2)}
                  </div>
                )}
                {wcMinWithdraw !== undefined && (
                  <div className={wcMinWithdrawMet ? "text-emerald-300" : "text-amber-300"}>
                    {wcMinWithdrawMet ? "PASS" : "FAIL"} · Min withdraw {fmtCurrency(wcMinWithdraw)} (wallet {fmtCurrency(walletBalanceNum)})
                  </div>
                )}
                <div className="text-white/70">
                  Current max withdrawable: {fmtCurrency(effectiveWithdrawLimit)}
                </div>
              </div>
              {(canManualCredit || canManualWithdraw || canForfeitBonus) && (
                <div className="rounded-md border border-primary/25 bg-primary/5 p-3 space-y-2">
                  <div className="text-xs uppercase tracking-wide text-primary/90">Credit Operation</div>
                  <div className="grid grid-cols-1 md:grid-cols-[160px_180px_1fr_auto] gap-2">
                    <select
                      value={opType}
                      onChange={(e) => {
                        const next = e.target.value as "deposit" | "withdraw" | "forfeit";
                        setOpType(next);
                        if (next !== "deposit") setOpBankId("");
                      }}
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {canManualCredit && !hasAnyCredits && <option value="deposit">DEPOSIT</option>}
                      {canManualWithdraw && hasAnyCredits && <option value="withdraw">WITHDRAW</option>}
                      {canForfeitBonus && hasAnyCredits && <option value="forfeit">FORFEITED</option>}
                    </select>
                    <Input
                      placeholder="Amount"
                      inputMode="decimal"
                      value={opAmount}
                      onChange={(e) => setOpAmount(e.target.value)}
                    />
                    <Input
                      placeholder="Remarks (optional)"
                      value={opNote}
                      onChange={(e) => setOpNote(e.target.value)}
                    />
                    <Button
                      onClick={submitOperation}
                      disabled={!canSubmitOperation}
                      variant="default"
                    >
                      {(creditLoading || withdrawLoading || forfeitLoading) ? <Loader2 className="w-4 h-4 animate-spin" /> : "CONFIRM"}
                    </Button>
                  </div>
                  {(opType === "deposit" || opType === "withdraw") && (
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Transfer Bank</div>
                      <select
                        value={opBankId}
                        onChange={(e) => setOpBankId(e.target.value)}
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="">
                          {opType === "deposit" ? "Select deposit bank..." : "Select withdraw bank..."}
                        </option>
                        {(opType === "deposit" ? depositBanks : withdrawBanks).map((b: any) => (
                          <option key={b.id} value={String(b.id)}>
                            {b.bankName} ({b.accountName} / {b.accountNumber})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {canManualCredit && hasAnyCredits && opType === "deposit" && (
                    <p className="text-xs text-amber-500">
                      Deposit is allowed only when wallet and provider credits are both zero.
                    </p>
                  )}
                  {(opType === "withdraw" || opType === "forfeit") && (
                    <p className="text-xs text-muted-foreground">
                      {opType === "forfeit"
                        ? `Forfeited amount max: ${fmtCurrency(walletBalanceNum)}`
                        : `Withdraw up to ${fmtCurrency(effectiveWithdrawLimit)} (partial allowed). Cycle book: ${fmtCurrency(localBookNum)} · Providers total: ${fmtCurrency(data.providerBalanceTotal || 0)}`}
                    </p>
                  )}
                  {opType === "withdraw" && !canWithdrawNow && (
                    <p className="text-xs text-amber-400">{withdrawConditionReason}</p>
                  )}
                </div>
              )}

              {data.providerBalanceError && (
                <div className="text-xs text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
                  {data.providerBalanceError}
                </div>
              )}
              {sortedProviderBalances.length > 0 ? (
                <div className="rounded-md border border-white/10 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Provider</th>
                        <th className="text-right px-3 py-2 font-medium">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedProviderBalances.map((b: any) => (
                        <tr key={b.provider} className="border-t border-white/10">
                          <td className="px-3 py-2">
                            <div className="truncate">{b.provider}</div>
                            {b.error && <div className="text-[11px] text-muted-foreground truncate">{b.error}</div>}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">{fmtCurrency(b.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No provider balance data</div>
              )}
              {activeProviderBalances.length > 1 && (
                <p className="text-xs text-amber-500">
                  This player currently has credits in multiple providers ({activeProviderBalances.length}).
                </p>
              )}

            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="logs" className="mt-0">
          <Card className="border-white/10">
            <CardContent className="pt-4 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs uppercase tracking-wide text-primary/90">Middlewave Game Logs</div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={logScope === "current_cycle" ? "default" : "outline"}
                    onClick={() => setLogScope("current_cycle")}
                  >
                    This Deposit
                  </Button>
                  <Button
                    size="sm"
                    variant={logScope === "all" ? "default" : "outline"}
                    onClick={() => setLogScope("all")}
                  >
                    All
                  </Button>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {logScope === "current_cycle"
                  ? "Showing games under current active deposit cycle."
                  : "Showing all available game logs for this player."}
              </div>
              {middlewaveGameLogError && (
                <div className="text-xs text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
                  {middlewaveGameLogError}
                </div>
              )}
              <div className="rounded-md border border-white/10 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left px-2 py-2 font-medium">Time</th>
                      <th className="text-left px-2 py-2 font-medium">Provider</th>
                      <th className="text-left px-2 py-2 font-medium">Game</th>
                      <th className="text-right px-2 py-2 font-medium">Bet</th>
                      <th className="text-right px-2 py-2 font-medium">Payout</th>
                      <th className="text-right px-2 py-2 font-medium">Win/Loss</th>
                      <th className="text-right px-2 py-2 font-medium">Balance</th>
                      <th className="text-left px-2 py-2 font-medium">Ref</th>
                    </tr>
                  </thead>
                  <tbody>
                    {middlewaveGameLogs.slice(0, 50).map((g: any, idx: number) => {
                      const entryType = String(g.entryType || "game");
                      const isDepositMarker = entryType === "deposit";
                      const isBonusMarker = entryType === "bonus";
                      const isForfeitMarker = entryType === "forfeited";
                      const isWithdrawMarker = entryType === "withdraw";
                      const bonusStatus = String(g.bonusStatus || "").toLowerCase();
                      const wl = sn(g.winLose);
                      const markerAmount = sn(g.eventAmount || 0);
                      return (
                        <tr key={`${g.providerTranId || "mw"}-${idx}`} className="border-t border-white/10">
                          <td className="px-2 py-2 whitespace-nowrap">{g.transactionDate ? new Date(g.transactionDate).toLocaleString() : "-"}</td>
                          <td className="px-2 py-2">{g.provider || "-"}</td>
                          <td className="px-2 py-2">
                            <div className={`truncate max-w-[260px] ${
                              isDepositMarker
                                ? "text-emerald-300 font-semibold"
                                : isBonusMarker
                                  ? "text-amber-300 font-semibold"
                                  : isForfeitMarker || isWithdrawMarker
                                    ? "text-rose-300 font-semibold"
                                    : ""
                            }`}>
                              {isDepositMarker ? (
                                "DEPOSIT"
                              ) : isBonusMarker ? (
                                <span className="inline-flex flex-wrap items-center gap-1">
                                  <span>BONUS</span>
                                  {bonusStatus === "forfeited" && (
                                    <span className="text-rose-300/90 text-[10px] font-normal normal-case">（记录已没收）</span>
                                  )}
                                </span>
                              ) : isForfeitMarker ? (
                                "FORFEITED"
                              ) : isWithdrawMarker ? (
                                "WITHDRAW"
                              ) : (
                                g.gameName || g.gameCode || "-"
                              )}
                            </div>
                          </td>
                          <td className="px-2 py-2 text-right font-mono">
                            {isDepositMarker || isBonusMarker || isForfeitMarker || isWithdrawMarker ? fmtCurrency(markerAmount) : fmtCurrency(g.betAmount || 0)}
                          </td>
                          <td className="px-2 py-2 text-right font-mono">
                            {isDepositMarker || isBonusMarker || isForfeitMarker || isWithdrawMarker ? "-" : fmtCurrency(g.payout || 0)}
                          </td>
                          <td className={`px-2 py-2 text-right font-mono ${
                            isForfeitMarker || isWithdrawMarker
                              ? "text-rose-400"
                              : isBonusMarker
                                ? "text-amber-400"
                                : wl >= 0
                                  ? "text-emerald-400"
                                  : "text-red-400"
                          }`}>
                            {isDepositMarker
                              ? "-"
                              : isBonusMarker
                                ? `+${markerAmount.toFixed(2)}`
                                : isForfeitMarker || isWithdrawMarker
                                  ? `-${markerAmount.toFixed(2)}`
                                  : `${wl >= 0 ? "+" : ""}${wl.toFixed(2)}`}
                          </td>
                          <td className="px-2 py-2 text-right font-mono">
                            {fmtCurrency(g.balanceAfter || 0)}
                          </td>
                          <td className="px-2 py-2 truncate max-w-[160px]">{g.eventRef || g.providerTranId || "-"}</td>
                        </tr>
                      );
                    })}
                    {middlewaveGameLogs.length === 0 && (
                      <tr>
                        <td className="px-2 py-4 text-center text-muted-foreground" colSpan={8}>
                          {middlewaveLogsQuery.isLoading ? "Loading..." : "No Middlewave game logs found"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Page {logPage} / {middlewaveTotalPages} · {middlewaveTotal} records
                </p>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={logPage <= 1 || middlewaveLogsQuery.isFetching}
                    onClick={() => setLogPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={logPage >= middlewaveTotalPages || middlewaveLogsQuery.isFetching}
                    onClick={() => setLogPage((p) => p + 1)}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invited" className="mt-0">
          <div className="rounded-lg border border-white/10 bg-card/30 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs text-muted-foreground">
                由 <span className="font-mono text-foreground">#{p.id}</span>{" "}
                {p.telegramFirstName || ""} 邀请注册的玩家（按注册时间倒序）
              </p>
              {invitedCount > 0 && (
                <Badge variant="outline" className="font-mono text-xs">
                  共 {invitedCount} 人
                </Badge>
              )}
            </div>
            {invitedListQuery.isLoading ? (
              <div className="py-12 flex justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="rounded-md border border-white/10 overflow-x-auto max-h-[min(420px,50vh)] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-14">ID</TableHead>
                        <TableHead>姓名 / TG</TableHead>
                        <TableHead>手机</TableHead>
                        <TableHead>邀请码</TableHead>
                        <TableHead>注册时间</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invitedListRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                            暂无邀请记录
                          </TableCell>
                        </TableRow>
                      ) : (
                        invitedListRows.map((ip: any) => (
                          <TableRow key={ip.id}>
                            <TableCell className="font-mono text-xs">{ip.id}</TableCell>
                            <TableCell className="text-sm">
                              <div className="font-medium truncate max-w-[140px]">
                                {[ip.telegramFirstName, ip.telegramLastName].filter(Boolean).join(" ") || "—"}
                              </div>
                              <div className="text-[11px] text-muted-foreground truncate">@{ip.telegramUsername || "N/A"}</div>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{ip.phone || "—"}</TableCell>
                            <TableCell className="font-mono text-xs">{ip.inviteCode || "—"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {ip.createdAt ? new Date(ip.createdAt).toLocaleString() : "—"}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                {invitedListTotal > 0 && (
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-xs text-muted-foreground">
                      第 {invitedListPage} / {invitedListTotalPages} 页 · 每页 {invitedListPageSize} 条
                    </p>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        disabled={invitedListPage <= 1 || invitedListQuery.isFetching}
                        onClick={() => setInvitedListPage((x) => Math.max(1, x - 1))}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        disabled={invitedListPage >= invitedListTotalPages || invitedListQuery.isFetching}
                        onClick={() => setInvitedListPage((x) => x + 1)}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
