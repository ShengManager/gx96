import { useState, useEffect } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, Trash2, Building2 } from "lucide-react";
import { toast } from "sonner";

// Note: Banks are managed through adminSettings router since there's no dedicated adminBanks router.
// We'll use direct fetch calls to the bank endpoints.

export default function AdminBanks() {
  const { accessToken, hasPermission } = useAdminAuth();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  // Banks data fetched via REST since no dedicated tRPC router exists yet
  const [banks, setBanks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBanks = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/banks", { headers: { Authorization: `Bearer ${accessToken}` } });
      if (res.ok) setBanks(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { if (accessToken) fetchBanks(); }, [accessToken]);

  const handleCreate = async (data: any) => {
    try {
      const res = await fetch("/api/banks", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(data),
      });
      if (res.ok) { fetchBanks(); setShowForm(false); toast.success("Bank created"); }
      else toast.error("Failed to create bank");
    } catch (err: any) { toast.error(err.message); }
  };

  const handleUpdate = async (data: any) => {
    try {
      const res = await fetch(`/api/banks/${editing.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(data),
      });
      if (res.ok) { fetchBanks(); setEditing(null); toast.success("Bank updated"); }
      else toast.error("Failed to update bank");
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDelete = async (bankId: number) => {
    try {
      const res = await fetch(`/api/banks/${bankId}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) { fetchBanks(); toast.success("Bank deleted"); }
      else toast.error("Failed to delete bank");
    } catch (err: any) { toast.error(err.message); }
  };

  const canEdit = hasPermission("bank", "edit");
  const canDelete = hasPermission("bank", "delete");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bank Management</h1>
          <p className="text-muted-foreground">Manage platform bank accounts for deposits and withdrawals</p>
        </div>
        {canEdit && (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-2" /> Add Bank
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bank Name</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {banks.map((bank: any) => (
                <TableRow key={bank.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-primary" />
                      <div>
                        <p className="font-medium">{bank.bankName}</p>
                        <p className="text-xs text-muted-foreground">{bank.bankCode || ""}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-mono text-sm">{bank.accountNumber}</p>
                      <p className="text-xs text-muted-foreground">{bank.accountName}</p>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="outline">{bank.countryCode}</Badge></TableCell>
                  <TableCell>
                    <Badge variant={bank.bankType === "deposit" ? "default" : bank.bankType === "withdraw" ? "secondary" : "outline"}>
                      {bank.bankType}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className={`status-badge ${bank.status === "active" ? "status-approved" : bank.status === "closed" ? "status-rejected" : "status-pending"}`}>
                      {bank.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {canEdit && (
                        <Button variant="ghost" size="icon" onClick={() => setEditing(bank)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button variant="ghost" size="icon" onClick={() => {
                          if (confirm("Delete this bank?")) handleDelete(bank.id);
                        }}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {banks.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {loading ? "Loading..." : "No banks configured"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <BankFormDialog
        open={showForm}
        onOpenChange={setShowForm}
        onSubmit={(data) => handleCreate(data)}
        title="Add Bank"
      />

      {editing && (
        <BankFormDialog
          open={!!editing}
          onOpenChange={(open) => { if (!open) setEditing(null); }}
          onSubmit={(data) => handleUpdate(data)}
          title="Edit Bank"
          initialData={editing}
        />
      )}
    </div>
  );
}

function BankFormDialog({ open, onOpenChange, onSubmit, title, initialData }: {
  open: boolean; onOpenChange: (open: boolean) => void;
  onSubmit: (data: any) => void; title: string; initialData?: any;
}) {
  const [form, setForm] = useState({
    bankName: initialData?.bankName || "",
    bankCode: initialData?.bankCode || "",
    accountNumber: initialData?.accountNumber || "",
    accountName: initialData?.accountName || "",
    countryCode: initialData?.countryCode || "MY",
    bankType: initialData?.bankType || "both",
    status: initialData?.status || "active",
    minDeposit: initialData?.minDeposit ? parseFloat(initialData.minDeposit) : 0,
    maxDeposit: initialData?.maxDeposit ? parseFloat(initialData.maxDeposit) : 0,
    minWithdraw: initialData?.minWithdraw ? parseFloat(initialData.minWithdraw) : 0,
    maxWithdraw: initialData?.maxWithdraw ? parseFloat(initialData.maxWithdraw) : 0,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Bank Name</Label>
              <Input value={form.bankName} onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Bank Code</Label>
              <Input value={form.bankCode} onChange={e => setForm(f => ({ ...f, bankCode: e.target.value }))} placeholder="e.g. MBBEMYKL" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Account Number</Label>
              <Input value={form.accountNumber} onChange={e => setForm(f => ({ ...f, accountNumber: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Account Name</Label>
              <Input value={form.accountName} onChange={e => setForm(f => ({ ...f, accountName: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Country</Label>
              <Input value={form.countryCode} onChange={e => setForm(f => ({ ...f, countryCode: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.bankType} onValueChange={v => setForm(f => ({ ...f, bankType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="deposit">Deposit Only</SelectItem>
                  <SelectItem value="withdraw">Withdraw Only</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                  <SelectItem value="internal">Internal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                  <SelectItem value="hidden">Hidden</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Min Deposit</Label>
              <Input type="number" value={form.minDeposit} onChange={e => setForm(f => ({ ...f, minDeposit: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div className="space-y-2">
              <Label>Max Deposit</Label>
              <Input type="number" value={form.maxDeposit} onChange={e => setForm(f => ({ ...f, maxDeposit: parseFloat(e.target.value) || 0 }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Min Withdraw</Label>
              <Input type="number" value={form.minWithdraw} onChange={e => setForm(f => ({ ...f, minWithdraw: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div className="space-y-2">
              <Label>Max Withdraw</Label>
              <Input type="number" value={form.maxWithdraw} onChange={e => setForm(f => ({ ...f, maxWithdraw: parseFloat(e.target.value) || 0 }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button disabled={!form.bankName || !form.accountNumber} onClick={() => onSubmit(form)}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
