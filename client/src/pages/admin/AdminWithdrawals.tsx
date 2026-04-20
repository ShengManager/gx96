import { useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Check, X, Bell, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const entryKindLabel: Record<string, string> = {
  player_withdraw: "Withdrawal",
  manual_withdraw: "Manual payout",
  forfeit: "Bonus forfeit",
};

function entryKindBadgeClass(kind: string) {
  if (kind === "forfeit") return "border-rose-400/60 text-rose-400 bg-rose-500/10";
  if (kind === "manual_withdraw") return "border-sky-400/50 text-sky-300 bg-sky-500/10";
  return "border-emerald-400/40 text-emerald-400/90 bg-emerald-500/10";
}

export default function AdminWithdrawals() {
  const { accessToken, hasPermission } = useAdminAuth();
  const [status, setStatus] = useState("all");
  const [listKind, setListKind] = useState<"withdrawals" | "forfeits" | "all">("withdrawals");
  const [page, setPage] = useState(1);
  const [selectedWd, setSelectedWd] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [pointsRecovered, setPointsRecovered] = useState("");
  const [approveNote, setApproveNote] = useState("");
  const [handleNote, setHandleNote] = useState("");
  const [handleBankId, setHandleBankId] = useState("");
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showHandleDialog, setShowHandleDialog] = useState(false);

  const wdQuery = trpc.adminFinance.withdrawals.list.useQuery(
    {
      token: accessToken || "",
      status: status === "all" ? undefined : status,
      listKind,
      page,
      pageSize: 20,
    },
    { enabled: !!accessToken, refetchInterval: 10000 }
  );

  const approveMutation = trpc.adminFinance.withdrawals.approve.useMutation({
    onSuccess: () => { wdQuery.refetch(); setShowApproveDialog(false); toast.success("Withdrawal approved"); },
    onError: (err) => toast.error(err.message),
  });

  const rejectMutation = trpc.adminFinance.withdrawals.reject.useMutation({
    onSuccess: () => { wdQuery.refetch(); setShowRejectDialog(false); toast.success("Withdrawal rejected"); },
    onError: (err) => toast.error(err.message),
  });
  const handleMutation = trpc.adminFinance.withdrawals.handle.useMutation({
    onSuccess: () => {
      wdQuery.refetch();
      setShowHandleDialog(false);
      setHandleNote("");
      setHandleBankId("");
      toast.success("Withdrawal moved to processing");
    },
    onError: (err) => toast.error(err.message),
  });
  const bankQuery = trpc.adminFinance.banks.list.useQuery(
    { token: accessToken || "" },
    { enabled: !!accessToken }
  );
  const withdrawBanks = ((bankQuery.data as any[]) || []).filter((b: any) =>
    b.status === "active" && (b.usageType === "withdraw" || b.usageType === "both")
  );

  const data = wdQuery.data;
  const totalPages = data ? Math.ceil(data.total / 20) : 0;
  const canEdit = hasPermission("withdraw", "edit");

  const statusColor = (s: string) => {
    switch (s) {
      case "pending": return "status-pending";
      case "processing": return "status-processing";
      case "approved": return "status-approved";
      case "rejected": return "status-rejected";
      default: return "";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Withdrawal Management</h1>
          <p className="text-muted-foreground">
            Player withdrawals and manual payouts. Bonus forfeits are listed separately — use the type filter below.
          </p>
        </div>
        <Badge variant="outline" className="gap-1"><Bell className="w-3 h-3" /> Real-time</Badge>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={listKind} onValueChange={v => { setListKind(v as typeof listKind); setPage(1); }}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Record type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="withdrawals">Withdrawals &amp; manual payouts</SelectItem>
                <SelectItem value="forfeits">Bonus forfeits only</SelectItem>
                <SelectItem value="all">All record types</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={v => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Filter status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="secondary">{data?.total || 0} rows</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Player</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Bank</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Rollover</TableHead>
                <TableHead>Turnover</TableHead>
                <TableHead>Time</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.withdrawals?.map((wd: any) => (
                <TableRow key={wd.id} className={wd.status === "pending" ? "bg-yellow-50/50 dark:bg-yellow-900/5" : ""}>
                  <TableCell className="font-mono text-sm">{wd.id}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-medium ${entryKindBadgeClass(wd.entryKind || "player_withdraw")}`}
                    >
                      {entryKindLabel[wd.entryKind] ?? "Withdrawal"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">#{wd.playerId}</TableCell>
                  <TableCell className="font-bold">${parseFloat(wd.amount).toFixed(2)}</TableCell>
                  <TableCell className="text-sm">
                    <div>
                      <p>{wd.bankName || "N/A"}</p>
                      <p className="text-xs text-muted-foreground">{wd.bankAccountNumber || ""}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`status-badge ${statusColor(wd.status)}`}>{wd.status}</span>
                  </TableCell>
                  <TableCell>
                    {wd.rolloverMet ? (
                      <Badge variant="outline" className="text-green-600 border-green-300">Met</Badge>
                    ) : (
                      <Badge variant="outline" className="text-red-600 border-red-300 gap-1"><AlertTriangle className="w-3 h-3" />Not Met</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {wd.turnoverMet ? (
                      <Badge variant="outline" className="text-green-600 border-green-300">Met</Badge>
                    ) : (
                      <Badge variant="outline" className="text-red-600 border-red-300 gap-1"><AlertTriangle className="w-3 h-3" />Not Met</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(wd.createdAt).toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    {canEdit && (wd.status === "pending" || wd.status === "processing") && (
                      <div className="flex items-center justify-end gap-1">
                        {wd.status === "pending" && (
                          <Button size="sm" variant="outline" onClick={() => { setSelectedWd(wd); setShowHandleDialog(true); }}>
                            Handle
                          </Button>
                        )}
                        {wd.status === "processing" && (
                          <>
                            <Button size="sm" variant="default" onClick={() => { setSelectedWd(wd); setShowApproveDialog(true); }}>
                              <Check className="w-3 h-3 mr-1" /> Approve
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => { setSelectedWd(wd); setShowRejectDialog(true); }}>
                              <X className="w-3 h-3 mr-1" /> Reject
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {(!data?.withdrawals || data.withdrawals.length === 0) && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    {wdQuery.isLoading ? "Loading..." : "No withdrawals found"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
              <div className="flex gap-1">
                <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
                <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Approve Withdrawal #{selectedWd?.id}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p>Amount: <strong>${selectedWd ? parseFloat(selectedWd.amount).toFixed(2) : ""}</strong></p>
            <p>Bank: {selectedWd?.bankName} - {selectedWd?.bankAccountNumber}</p>
            <p>Account Name: {selectedWd?.bankAccountName}</p>
            <p className="text-xs text-muted-foreground">Only processing withdrawals can be approved.</p>
            <Textarea placeholder="Note (optional)" value={approveNote} onChange={e => setApproveNote(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowApproveDialog(false)}>Cancel</Button>
              <Button onClick={() => approveMutation.mutate({ token: accessToken!, withdrawalId: selectedWd.id, note: approveNote })}>Confirm Approve</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showHandleDialog} onOpenChange={setShowHandleDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Handle Withdrawal #{selectedWd?.id}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Staff should verify player game logs and risk condition, then choose payout bank.
            </p>
            <div className="space-y-2">
              <Label>Payout Bank (required)</Label>
              <Select value={handleBankId} onValueChange={setHandleBankId}>
                <SelectTrigger><SelectValue placeholder="Select withdraw bank..." /></SelectTrigger>
                <SelectContent>
                  {withdrawBanks.map((b: any) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.bankName} ({b.accountName} / {b.accountNumber})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Handle Note (gamelog/risk check)</Label>
              <Textarea
                placeholder="Example: Checked GameLog, no anomaly. Ready for payout."
                value={handleNote}
                onChange={e => setHandleNote(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowHandleDialog(false)}>Cancel</Button>
              <Button
                disabled={!handleBankId || handleMutation.isPending}
                onClick={() => handleMutation.mutate({
                  token: accessToken!,
                  withdrawalId: selectedWd.id,
                  bankId: Number(handleBankId),
                  note: handleNote || undefined,
                })}
              >
                Confirm Handle
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Withdrawal #{selectedWd?.id}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Rejection Reason</Label>
              <Textarea placeholder="Reason (required)" value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Points Recovered (optional)</Label>
              <Input type="number" placeholder="0.00" value={pointsRecovered} onChange={e => setPointsRecovered(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowRejectDialog(false)}>Cancel</Button>
              <Button variant="destructive" disabled={!rejectReason} onClick={() => rejectMutation.mutate({
                token: accessToken!, withdrawalId: selectedWd.id, reason: rejectReason,
                pointsRecovered: pointsRecovered ? parseFloat(pointsRecovered) : undefined,
              })}>Confirm Reject</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
