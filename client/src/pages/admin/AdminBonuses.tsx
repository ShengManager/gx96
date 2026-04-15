import { useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, Trash2, Gift } from "lucide-react";
import { toast } from "sonner";

const BONUS_TYPES = ["Fixed Amount", "Percentage", "Random Range"];

export default function AdminBonuses() {
  const { accessToken, hasPermission } = useAdminAuth();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingBonus, setEditingBonus] = useState<any>(null);

  const bonusQuery = trpc.adminBonus.list.useQuery(
    { token: accessToken || "" },
    { enabled: !!accessToken }
  );

  const createMutation = trpc.adminBonus.create.useMutation({
    onSuccess: () => { bonusQuery.refetch(); setShowCreateDialog(false); toast.success("Bonus created"); },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.adminBonus.update.useMutation({
    onSuccess: () => { bonusQuery.refetch(); setEditingBonus(null); toast.success("Bonus updated"); },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.adminBonus.delete.useMutation({
    onSuccess: () => { bonusQuery.refetch(); toast.success("Bonus deleted"); },
    onError: (err) => toast.error(err.message),
  });

  const canEdit = hasPermission("bonus", "edit");
  const canDelete = hasPermission("bonus", "delete");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bonus Management</h1>
          <p className="text-muted-foreground">Configure bonus campaigns and claim rules</p>
        </div>
        {canEdit && (
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" /> Create Bonus
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Rollover</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Order</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bonusQuery.data?.map((bonus: any) => (
                <TableRow key={bonus.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Gift className="w-4 h-4 text-primary" />
                      <div>
                        <p className="font-medium">{bonus.name}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">{bonus.description || "No description"}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="outline">{BONUS_TYPES[bonus.bonusType] || "Unknown"}</Badge></TableCell>
                  <TableCell className="font-mono text-sm">
                    {bonus.bonusType === 0 && `$${parseFloat(bonus.fixedAmount || "0").toFixed(2)}`}
                    {bonus.bonusType === 1 && `${parseFloat(bonus.percentage || "0").toFixed(1)}%`}
                    {bonus.bonusType === 2 && `$${parseFloat(bonus.randomMin || "0").toFixed(2)} - $${parseFloat(bonus.randomMax || "0").toFixed(2)}`}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{bonus.rolloverMultiplier ? `${parseFloat(bonus.rolloverMultiplier).toFixed(1)}x` : "N/A"}</TableCell>
                  <TableCell>
                    <span className={`status-badge ${bonus.isActive ? "status-approved" : "status-rejected"}`}>
                      {bonus.isActive ? "Active" : "Inactive"}
                    </span>
                  </TableCell>
                  <TableCell>{bonus.sortOrder}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {canEdit && (
                        <Button variant="ghost" size="icon" onClick={() => setEditingBonus(bonus)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button variant="ghost" size="icon" onClick={() => {
                          if (confirm("Delete this bonus?")) deleteMutation.mutate({ token: accessToken!, bonusId: bonus.id });
                        }}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(!bonusQuery.data || bonusQuery.data.length === 0) && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {bonusQuery.isLoading ? "Loading..." : "No bonuses configured"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <BonusFormDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSubmit={(data) => createMutation.mutate({ token: accessToken!, ...data })}
        title="Create Bonus"
      />

      {/* Edit Dialog */}
      {editingBonus && (
        <BonusFormDialog
          open={!!editingBonus}
          onOpenChange={(open) => { if (!open) setEditingBonus(null); }}
          onSubmit={(data) => updateMutation.mutate({ token: accessToken!, bonusId: editingBonus.id, ...data })}
          title="Edit Bonus"
          initialData={editingBonus}
        />
      )}
    </div>
  );
}

function BonusFormDialog({ open, onOpenChange, onSubmit, title, initialData }: {
  open: boolean; onOpenChange: (open: boolean) => void;
  onSubmit: (data: any) => void; title: string; initialData?: any;
}) {
  const [form, setForm] = useState({
    name: initialData?.name || "",
    description: initialData?.description || "",
    bonusType: initialData?.bonusType ?? 0,
    fixedAmount: initialData?.fixedAmount ? parseFloat(initialData.fixedAmount) : 0,
    percentage: initialData?.percentage ? parseFloat(initialData.percentage) : 0,
    randomMin: initialData?.randomMin ? parseFloat(initialData.randomMin) : 0,
    randomMax: initialData?.randomMax ? parseFloat(initialData.randomMax) : 0,
    rolloverMultiplier: initialData?.rolloverMultiplier ? parseFloat(initialData.rolloverMultiplier) : 0,
    turnoverTarget: initialData?.turnoverTarget ? parseFloat(initialData.turnoverTarget) : 0,
    maxWithdraw: initialData?.maxWithdraw ? parseFloat(initialData.maxWithdraw) : 0,
    isActive: initialData?.isActive ?? true,
    sortOrder: initialData?.sortOrder ?? 0,
    cardImageUrl: initialData?.cardImageUrl || "",
    detailImageUrl: initialData?.detailImageUrl || "",
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Bonus Type</Label>
            <Select value={String(form.bonusType)} onValueChange={v => setForm(f => ({ ...f, bonusType: parseInt(v) }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Fixed Amount</SelectItem>
                <SelectItem value="1">Percentage</SelectItem>
                <SelectItem value="2">Random Range</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.bonusType === 0 && (
            <div className="space-y-2">
              <Label>Fixed Amount</Label>
              <Input type="number" value={form.fixedAmount} onChange={e => setForm(f => ({ ...f, fixedAmount: parseFloat(e.target.value) || 0 }))} />
            </div>
          )}
          {form.bonusType === 1 && (
            <div className="space-y-2">
              <Label>Percentage (%)</Label>
              <Input type="number" value={form.percentage} onChange={e => setForm(f => ({ ...f, percentage: parseFloat(e.target.value) || 0 }))} />
            </div>
          )}
          {form.bonusType === 2 && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Min Amount</Label>
                <Input type="number" value={form.randomMin} onChange={e => setForm(f => ({ ...f, randomMin: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-2">
                <Label>Max Amount</Label>
                <Input type="number" value={form.randomMax} onChange={e => setForm(f => ({ ...f, randomMax: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Rollover Multiplier</Label>
              <Input type="number" step="0.1" value={form.rolloverMultiplier} onChange={e => setForm(f => ({ ...f, rolloverMultiplier: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div className="space-y-2">
              <Label>Max Withdraw</Label>
              <Input type="number" value={form.maxWithdraw} onChange={e => setForm(f => ({ ...f, maxWithdraw: parseFloat(e.target.value) || 0 }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Card Image URL</Label>
              <Input value={form.cardImageUrl} onChange={e => setForm(f => ({ ...f, cardImageUrl: e.target.value }))} placeholder="https://..." />
            </div>
            <div className="space-y-2">
              <Label>Detail Image URL</Label>
              <Input value={form.detailImageUrl} onChange={e => setForm(f => ({ ...f, detailImageUrl: e.target.value }))} placeholder="https://..." />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Sort Order</Label>
              <Input type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} />
              <Label>Active</Label>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button disabled={!form.name} onClick={() => onSubmit(form)}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
