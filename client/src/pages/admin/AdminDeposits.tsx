import { useState, useEffect } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Check, X, Eye, Clock, ChevronLeft, ChevronRight, Bell, ImageIcon } from "lucide-react";
import { toast } from "sonner";

function resolveReceiptSrc(input?: string | null): string {
  const src = String(input || "").trim();
  if (!src) return "";
  if (src.startsWith("/api/media/s3?")) return src;
  try {
    const u = new URL(src, window.location.origin);
    if (u.pathname.startsWith("/api/media/s3")) return u.pathname + u.search;
    if (u.host.includes("cloudwave-s3.com")) {
      return `/api/media/s3?url=${encodeURIComponent(u.toString())}`;
    }
    return u.toString();
  } catch {
    return src;
  }
}

export default function AdminDeposits() {
  const { accessToken, hasPermission } = useAdminAuth();
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedDeposit, setSelectedDeposit] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [approveNote, setApproveNote] = useState("");
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);

  const depositsQuery = trpc.adminFinance.deposits.list.useQuery(
    { token: accessToken || "", status: status === "all" ? undefined : status, page, pageSize: 20 },
    { enabled: !!accessToken, refetchInterval: 10000 }
  );

  const handleMutation = trpc.adminFinance.deposits.handle.useMutation({
    onSuccess: () => { depositsQuery.refetch(); toast.success("Deposit marked as processing"); },
    onError: (err) => toast.error(err.message),
  });

  const approveMutation = trpc.adminFinance.deposits.approve.useMutation({
    onSuccess: () => { depositsQuery.refetch(); setShowApproveDialog(false); toast.success("Deposit approved"); },
    onError: (err) => toast.error(err.message),
  });

  const rejectMutation = trpc.adminFinance.deposits.reject.useMutation({
    onSuccess: () => { depositsQuery.refetch(); setShowRejectDialog(false); toast.success("Deposit rejected"); },
    onError: (err) => toast.error(err.message),
  });

  const data = depositsQuery.data;
  const totalPages = data ? Math.ceil(data.total / 20) : 0;
  const canEdit = hasPermission("deposit", "edit");
  const selectedReceiptSrc = resolveReceiptSrc(selectedDeposit?.receiptUrl);

  const statusColor = (s: string) => {
    switch (s) {
      case "pending": return "status-pending";
      case "processing": return "status-processing";
      case "approved": return "status-approved";
      case "rejected": return "status-rejected";
      default: return "";
    }
  };

  const sourceLabel = (dep: any) => {
    const kind = String(dep?.sourceKind || "");
    if (kind === "admin_manual") return "Admin Manual";
    if (kind === "api_deposit") return "API Deposit";
    return "Player Deposit";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Deposit Management</h1>
          <p className="text-muted-foreground">Review and process player deposits</p>
        </div>
        <Badge variant="outline" className="gap-1">
          <Bell className="w-3 h-3" /> Real-time
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Select value={status} onValueChange={v => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="secondary">{data?.total || 0} deposits</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Player</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Receipt</TableHead>
                <TableHead>Time</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.deposits?.map((dep: any) => (
                <TableRow key={dep.id} className={dep.status === "pending" ? "bg-yellow-50/50 dark:bg-yellow-900/5" : ""}>
                  <TableCell className="font-mono text-sm">{dep.id}</TableCell>
                  <TableCell className="font-mono text-sm">#{dep.playerId}</TableCell>
                  <TableCell className="font-bold">${parseFloat(dep.amount).toFixed(2)}</TableCell>
                  <TableCell className="text-sm">
                    <Badge variant="outline">{sourceLabel(dep)}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{dep.paymentMethod === "bank_transfer" ? "Bank" : "API"}</TableCell>
                  <TableCell>
                    <span className={`status-badge ${statusColor(dep.status)}`}>{dep.status}</span>
                  </TableCell>
                  <TableCell>
                    {dep.receiptUrl ? (
                      <Button variant="ghost" size="sm" onClick={() => { setSelectedDeposit(dep); setShowReceiptDialog(true); }}>
                        <ImageIcon className="w-4 h-4" />
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">None</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(dep.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {canEdit && dep.status === "pending" && (
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => handleMutation.mutate({ token: accessToken!, depositId: dep.id })}>
                          <Clock className="w-3 h-3 mr-1" /> Handle
                        </Button>
                      </div>
                    )}
                    {canEdit && dep.status === "processing" && (
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="default" onClick={() => { setSelectedDeposit(dep); setShowApproveDialog(true); }}>
                          <Check className="w-3 h-3 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => { setSelectedDeposit(dep); setShowRejectDialog(true); }}>
                          <X className="w-3 h-3 mr-1" /> Reject
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {(!data?.deposits || data.deposits.length === 0) && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    {depositsQuery.isLoading ? "Loading..." : "No deposits found"}
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

      {/* Approve Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Deposit #{selectedDeposit?.id}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p>Amount: <strong>${selectedDeposit ? parseFloat(selectedDeposit.amount).toFixed(2) : ""}</strong></p>
            <Textarea placeholder="Note (optional)" value={approveNote} onChange={e => setApproveNote(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowApproveDialog(false)}>Cancel</Button>
              <Button onClick={() => approveMutation.mutate({ token: accessToken!, depositId: selectedDeposit.id, note: approveNote })}>
                Confirm Approve
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Deposit #{selectedDeposit?.id}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea placeholder="Rejection reason (required)" value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowRejectDialog(false)}>Cancel</Button>
              <Button variant="destructive" disabled={!rejectReason} onClick={() => rejectMutation.mutate({ token: accessToken!, depositId: selectedDeposit.id, reason: rejectReason })}>
                Confirm Reject
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Receipt Dialog */}
      <Dialog open={showReceiptDialog} onOpenChange={setShowReceiptDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Deposit Receipt #{selectedDeposit?.id}</DialogTitle>
          </DialogHeader>
          {selectedReceiptSrc && (
            <img
              src={selectedReceiptSrc}
              alt="Receipt"
              className="w-full rounded-lg"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          )}
          {!selectedReceiptSrc && <p className="text-sm text-muted-foreground">No receipt image URL</p>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
