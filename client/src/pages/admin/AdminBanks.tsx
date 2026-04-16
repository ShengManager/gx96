import { useEffect, useMemo, useState } from "react";
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

export default function AdminBanks() {
  const { accessToken, hasPermission } = useAdminAuth();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const banksQuery = trpc.adminFinance.banks.list.useQuery(
    { token: accessToken || "" },
    { enabled: !!accessToken }
  );

  const createMutation = trpc.adminFinance.banks.create.useMutation({
    onSuccess: () => {
      banksQuery.refetch();
      setShowForm(false);
      toast.success("Bank created");
    },
    onError: (err: any) => toast.error(err.message || "Failed to create bank"),
  });

  const updateMutation = trpc.adminFinance.banks.update.useMutation({
    onSuccess: () => {
      banksQuery.refetch();
      setEditing(null);
      toast.success("Bank updated");
    },
    onError: (err: any) => toast.error(err.message || "Failed to update bank"),
  });

  const deleteMutation = trpc.adminFinance.banks.delete.useMutation({
    onSuccess: () => {
      banksQuery.refetch();
      toast.success("Bank deleted");
    },
    onError: (err: any) => toast.error(err.message || "Failed to delete bank"),
  });

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
              {(banksQuery.data || []).map((bank: any) => (
                <TableRow key={bank.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-primary" />
                      <div>
                        <p className="font-medium">{bank.bankName}</p>
                        <p className="text-xs text-muted-foreground">{bank.country}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-mono text-sm">{bank.accountNumber}</p>
                      <p className="text-xs text-muted-foreground">{bank.accountName}</p>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="outline">{bank.country}</Badge></TableCell>
                  <TableCell>
                    <Badge variant={bank.usageType === "deposit" ? "default" : bank.usageType === "withdraw" ? "secondary" : "outline"}>
                      {bank.usageType}
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
                          if (confirm("Delete this bank?")) deleteMutation.mutate({ token: accessToken!, bankId: bank.id });
                        }}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(!banksQuery.data || banksQuery.data.length === 0) && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {banksQuery.isLoading ? "Loading..." : "No banks configured"}
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
        accessToken={accessToken || ""}
        onSubmit={(data) => createMutation.mutate({ token: accessToken!, ...data })}
        title="Add Bank"
      />

      {editing && (
        <BankFormDialog
          open={!!editing}
          onOpenChange={(open) => { if (!open) setEditing(null); }}
          accessToken={accessToken || ""}
          onSubmit={(data) => updateMutation.mutate({ token: accessToken!, bankId: editing.id, ...data })}
          title="Edit Bank"
          initialData={editing}
        />
      )}
    </div>
  );
}

function BankFormDialog({ open, onOpenChange, onSubmit, title, initialData, accessToken }: {
  open: boolean; onOpenChange: (open: boolean) => void;
  onSubmit: (data: any) => void; title: string; initialData?: any; accessToken: string;
}) {
  const [country, setCountry] = useState(initialData?.country || "MY");
  const bankCatalogQuery = trpc.adminFinance.banks.catalog.useQuery(
    { token: accessToken || "", country },
    { enabled: !!accessToken }
  );
  const catalog = bankCatalogQuery.data || [];
  const initialCode = useMemo(() => {
    const found = catalog.find((b: any) => b.bankName === initialData?.bankName);
    return found?.bankCode || "";
  }, [catalog, initialData?.bankName]);

  const [form, setForm] = useState({
    bankName: initialData?.bankName || "",
    bankCode: initialCode,
    accountNumber: initialData?.accountNumber || "",
    accountName: initialData?.accountName || "",
    usageType: initialData?.usageType || "both",
    status: initialData?.status || "active",
    sortOrder: initialData?.sortOrder || 0,
  });

  useEffect(() => {
    if (initialData?.bankName && !form.bankCode && initialCode) {
      setForm((f) => ({ ...f, bankCode: initialCode }));
    }
  }, [initialData?.bankName, form.bankCode, initialCode]);

  const countryOptions = [
    { code: "MY", label: "Malaysia" },
    { code: "SG", label: "Singapore" },
    { code: "TH", label: "Thailand" },
    { code: "AU", label: "Australia" },
    { code: "US", label: "United States" },
  ];

  const onSelectBankCode = (code: string) => {
    const selected = catalog.find((b: any) => b.bankCode === code);
    setForm((f) => ({
      ...f,
      bankCode: code,
      bankName: selected?.bankName || "",
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Country</Label>
              <Select value={country} onValueChange={(v) => {
                setCountry(v);
                setForm((f) => ({ ...f, bankCode: "", bankName: "" }));
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {countryOptions.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.code} - {c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Bank</Label>
              <Select value={form.bankCode} onValueChange={onSelectBankCode}>
                <SelectTrigger><SelectValue placeholder={bankCatalogQuery.isLoading ? "Loading banks..." : "Select a bank"} /></SelectTrigger>
                <SelectContent>
                  {catalog.map((b: any) => (
                    <SelectItem key={b.bankCode} value={b.bankCode}>{b.bankName} ({b.bankCode})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Bank Name</Label>
            <Input value={form.bankName} readOnly />
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
              <Label>Type</Label>
              <Select value={form.usageType} onValueChange={v => setForm(f => ({ ...f, usageType: v }))}>
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
              <Label>Sort Order</Label>
              <Input type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: parseInt(e.target.value || "0", 10) }))} />
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
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              disabled={!form.bankName || !form.accountNumber || !form.accountName || !country}
              onClick={() => onSubmit({
                country,
                bankName: form.bankName,
                accountName: form.accountName,
                accountNumber: form.accountNumber,
                usageType: form.usageType,
                status: form.status,
                sortOrder: form.sortOrder,
              })}
            >
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
