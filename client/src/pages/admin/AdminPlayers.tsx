import { useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Search, Eye, UserCheck, UserX, Tag, Star, ChevronLeft, ChevronRight, AlertTriangle, RefreshCw, Loader2, Phone, Globe, Wallet, Calendar, Copy, Shield } from "lucide-react";
import { toast } from "sonner";

export default function AdminPlayers() {
  const { accessToken, hasPermission } = useAdminAuth();
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
      <Dialog open={detailOpen} onOpenChange={(v) => { setDetailOpen(v); if (!v) setSelectedPlayer(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" /> Player Detail #{selectedPlayer}
            </DialogTitle>
          </DialogHeader>
          {detailQuery.isLoading ? (
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

function PlayerDetail({ data, accessToken, onVipChange, canEdit }: {
  data: any; accessToken: string; onVipChange: (level: number) => void; canEdit: boolean;
}) {
  const p = data.player;
  const sn = (v: any) => typeof v === "number" ? v : parseFloat(v) || 0;

  return (
    <div className="space-y-6">
      {/* Player Info Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xl font-bold">
                {(p.telegramFirstName || "?")[0]}
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <h3 className="text-lg font-bold">{p.telegramFirstName} {p.telegramLastName || ""}</h3>
                  <p className="text-sm text-muted-foreground">@{p.telegramUsername || "N/A"} | TG ID: {p.telegramId}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-muted-foreground" /> {p.phone || "N/A"}</div>
                  <div className="flex items-center gap-2"><Globe className="w-3.5 h-3.5 text-muted-foreground" /> {p.countryCode || "N/A"}</div>
                  <div className="flex items-center gap-2">
                    <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="font-mono">{p.inviteCode}</span>
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => { navigator.clipboard.writeText(p.inviteCode); toast.success("Copied"); }}>
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5 text-muted-foreground" /> {new Date(p.createdAt).toLocaleString()}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <span className={`status-badge ${p.isActive ? "status-approved" : "status-rejected"}`}>
                {p.isActive ? "Active" : "Inactive"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">VIP Level</span>
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 text-yellow-500" />
                <span className="font-bold">{p.vipLevel}</span>
              </div>
            </div>
            {canEdit && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Set VIP Level</p>
                <div className="flex gap-1">
                  {[0, 1, 2, 3, 4, 5].map(l => (
                    <Button key={l} variant={p.vipLevel === l ? "default" : "outline"} size="sm" className="w-8 h-8 p-0 text-xs" onClick={() => onVipChange(l)}>
                      {l}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Bank</span>
              <span className="text-sm font-mono">{p.bankName || "N/A"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Account</span>
              <span className="text-sm font-mono">{p.bankAccountNumber || "N/A"}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Deposit Cycle */}
      {data.activeCycle && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wallet className="w-4 h-4" /> Active Deposit Cycle
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Deposit</p>
                <p className="text-lg font-bold text-green-500">${sn(data.activeCycle.depositAmount).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Bonus</p>
                <p className="text-lg font-bold text-purple-500">${sn(data.activeCycle.bonusAmount).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Withdrawn</p>
                <p className="text-lg font-bold text-red-500">${sn(data.activeCycle.totalWithdrawn).toFixed(2)}</p>
              </div>
              <div className="md:col-span-3 space-y-2">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span>Rollover</span>
                    <span className="font-mono">{sn(data.activeCycle.currentRollover).toFixed(2)} / {sn(data.activeCycle.targetRollover).toFixed(2)}</span>
                  </div>
                  <Progress value={sn(data.activeCycle.targetRollover) > 0 ? Math.min(100, (sn(data.activeCycle.currentRollover) / sn(data.activeCycle.targetRollover)) * 100) : 100} className="h-2" />
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span>Turnover</span>
                    <span className="font-mono">{sn(data.activeCycle.currentTurnover).toFixed(2)} / {sn(data.activeCycle.targetTurnover).toFixed(2)}</span>
                  </div>
                  <Progress value={sn(data.activeCycle.targetTurnover) > 0 ? Math.min(100, (sn(data.activeCycle.currentTurnover) / sn(data.activeCycle.targetTurnover)) * 100) : 100} className="h-2" />
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Shield className="w-3.5 h-3.5" />
                  Game Entered: <Badge variant={data.activeCycle.hasEnteredGame ? "default" : "secondary"}>{data.activeCycle.hasEnteredGame ? "Yes" : "No"}</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tags */}
      {data.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {data.tags.map((t: any) => (
            <Badge key={t.id} variant="secondary" className="gap-1"><Tag className="w-3 h-3" />{t.tag}</Badge>
          ))}
        </div>
      )}

      {/* Tabbed History */}
      <Tabs defaultValue="deposits" className="space-y-3">
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="deposits">Deposits ({data.depositHistory?.length || 0})</TabsTrigger>
          <TabsTrigger value="withdrawals">Withdrawals ({data.withdrawHistory?.length || 0})</TabsTrigger>
          <TabsTrigger value="bonuses">Bonuses ({data.bonusHistory?.length || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="deposits">
          <div className="max-h-64 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.depositHistory?.map((d: any) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-xs">#{d.id}</TableCell>
                    <TableCell className="font-bold">${sn(d.amount).toFixed(2)}</TableCell>
                    <TableCell className="text-sm">{d.paymentMethod || "bank"}</TableCell>
                    <TableCell>
                      <span className={`status-badge ${d.status === "approved" ? "status-approved" : d.status === "rejected" ? "status-rejected" : "status-pending"}`}>{d.status}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(d.createdAt).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {(!data.depositHistory || data.depositHistory.length === 0) && (
                  <TableRow><TableCell colSpan={5} className="text-center py-4 text-muted-foreground">No deposit history</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="withdrawals">
          <div className="max-h-64 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.withdrawHistory?.map((w: any) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-mono text-xs">#{w.id}</TableCell>
                    <TableCell className="font-bold">${sn(w.amount).toFixed(2)}</TableCell>
                    <TableCell>
                      <span className={`status-badge ${w.status === "approved" ? "status-approved" : w.status === "rejected" ? "status-rejected" : "status-pending"}`}>{w.status}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(w.createdAt).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {(!data.withdrawHistory || data.withdrawHistory.length === 0) && (
                  <TableRow><TableCell colSpan={4} className="text-center py-4 text-muted-foreground">No withdrawal history</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="bonuses">
          <div className="max-h-64 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bonus</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Rollover</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Claimed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.bonusHistory?.map((b: any) => (
                  <TableRow key={b.id}>
                    <TableCell className="text-sm">{b.bonusName || `Bonus #${b.bonusConfigId}`}</TableCell>
                    <TableCell className="font-bold">${sn(b.bonusAmount).toFixed(2)}</TableCell>
                    <TableCell className="font-mono text-xs">{sn(b.currentRollover).toFixed(0)} / {sn(b.targetRollover).toFixed(0)}</TableCell>
                    <TableCell>
                      <span className={`status-badge ${b.status === "completed" ? "status-approved" : b.status === "active" ? "status-pending" : "status-rejected"}`}>{b.status}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(b.claimedAt).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {(!data.bonusHistory || data.bonusHistory.length === 0) && (
                  <TableRow><TableCell colSpan={5} className="text-center py-4 text-muted-foreground">No bonus history</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
