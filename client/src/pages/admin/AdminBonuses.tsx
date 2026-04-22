import { useEffect, useMemo, useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ImageUrlField } from "@/components/admin/ImageUrlField";
import { FolderPlus, Plus } from "lucide-react";
import { toast } from "sonner";
import { AdminBonusDraggableList } from "./AdminBonusDraggableList";

function buildAdminBonusGroups(
  list: any[],
  groupRows: { groupKey: string; title: string | null; bannerUrl: string | null; sortIndex: number }[]
) {
  const rowMap = new Map(groupRows.map((r) => [String(r.groupKey).trim(), r]));
  const sorted = [...list].sort((a, b) => {
    const ga = Number(a.promoGroupSort) || 0;
    const gb = Number(b.promoGroupSort) || 0;
    if (ga !== gb) return ga - gb;
    return (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0);
  });
  const buckets = new Map<string, any[]>();
  for (const b of sorted) {
    const k = String(b.promoGroupKey ?? "").trim() || "__ungrouped__";
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(b);
  }
  const unionKeys = new Set<string>();
  groupRows.forEach((r) => unionKeys.add(String(r.groupKey).trim()));
  buckets.forEach((_, k) => unionKeys.add(k));

  const keys = Array.from(unionKeys).sort((a, b) => {
    if (a === "__ungrouped__") return 1;
    if (b === "__ungrouped__") return -1;
    const ra = rowMap.get(a);
    const rb = rowMap.get(b);
    const sa = ra
      ? ra.sortIndex
      : Math.min(...(buckets.get(a) || []).map((x: any) => Number(x.promoGroupSort) || 0), 1e9);
    const sb = rb
      ? rb.sortIndex
      : Math.min(...(buckets.get(b) || []).map((x: any) => Number(x.promoGroupSort) || 0), 1e9);
    if (sa !== sb) return sa - sb;
    return String(a).localeCompare(String(b));
  });

  return keys.map((key) => {
    const items = buckets.get(key) || [];
    const row = rowMap.get(key);
    return {
      key,
      items,
      title: row?.title ?? items.find((x: any) => x.promoGroupTitle)?.promoGroupTitle ?? null,
      bannerUrl: row?.bannerUrl ?? items.find((x: any) => x.promoGroupBannerUrl)?.promoGroupBannerUrl ?? null,
      groupSort: row ? row.sortIndex : Math.min(...(items.length ? items.map((x: any) => Number(x.promoGroupSort) || 0) : [0])),
    };
  });
}

export default function AdminBonuses() {
  const { accessToken, hasPermission } = useAdminAuth();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showCreateGroupDialog, setShowCreateGroupDialog] = useState(false);
  const [editingBonus, setEditingBonus] = useState<any>(null);
  const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null);

  const bonusQuery = trpc.adminBonus.list.useQuery(
    { token: accessToken || "" },
    { enabled: !!accessToken }
  );

  const promoGroupsQuery = trpc.adminBonus.listPromoGroups.useQuery(
    { token: accessToken || "" },
    { enabled: !!accessToken }
  );

  const refetchBonusPage = () => {
    void bonusQuery.refetch();
    void promoGroupsQuery.refetch();
  };

  const bonusGroups = useMemo(
    () =>
      buildAdminBonusGroups((bonusQuery.data as any[]) || [], (promoGroupsQuery.data as any[]) || []),
    [bonusQuery.data, promoGroupsQuery.data]
  );

  const groupKeyOptions = useMemo(() => {
    const fromTable = ((promoGroupsQuery.data as any[]) || []).map((r) => String(r.groupKey).trim()).filter(Boolean);
    const s = new Set<string>(fromTable);
    for (const b of (bonusQuery.data as any[]) || []) {
      const k = String(b.promoGroupKey ?? "").trim();
      if (k) s.add(k);
    }
    return Array.from(s).sort();
  }, [bonusQuery.data, promoGroupsQuery.data]);

  const preserveEmptyGroupKeys = useMemo(
    () => new Set(((promoGroupsQuery.data as any[]) || []).map((r) => String(r.groupKey).trim()).filter(Boolean)),
    [promoGroupsQuery.data]
  );

  const createMutation = trpc.adminBonus.create.useMutation({
    onSuccess: () => {
      refetchBonusPage();
      setShowCreateDialog(false);
      toast.success("Bonus created");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.adminBonus.update.useMutation({
    onSuccess: () => {
      refetchBonusPage();
      setEditingBonus(null);
      toast.success("Bonus updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.adminBonus.delete.useMutation({
    onSuccess: () => {
      refetchBonusPage();
      toast.success("Bonus deleted");
    },
    onError: (err) => toast.error(err.message),
  });

  const createPromoGroupMutation = trpc.adminBonus.createPromoGroup.useMutation({
    onSuccess: () => {
      refetchBonusPage();
      setShowCreateGroupDialog(false);
      toast.success("Promo group created. Assign promotions by key or drag them into this group.");
    },
    onError: (err) => toast.error(err.message),
  });

  const updatePromoGroupMutation = trpc.adminBonus.updatePromoGroup.useMutation({
    onSuccess: () => {
      refetchBonusPage();
      setEditingGroupKey(null);
      toast.success("Promo group display saved");
    },
    onError: (err) => toast.error(err.message),
  });

  const applyLayoutMutation = trpc.adminBonus.applyBonusLayout.useMutation({
    onSuccess: () => {
      refetchBonusPage();
      toast.success("Order saved");
    },
    onError: (err) => toast.error(err.message),
  });

  const canEdit = hasPermission("bonus", "edit");
  const canDelete = hasPermission("bonus", "delete");
  const todayDate = new Date().toISOString().slice(0, 10);
  const yesterdayDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const referralRuleQuery = trpc.adminBonus.getReferralRule.useQuery(
    { token: accessToken || "" },
    { enabled: !!accessToken }
  );
  const referralLedgerQuery = trpc.adminBonus.listReferralLedger.useQuery(
    { token: accessToken || "", limit: 80 },
    { enabled: !!accessToken }
  );
  const [rebateSettleDate, setRebateSettleDate] = useState(yesterdayDate);
  const [referralForm, setReferralForm] = useState({
    commissionEnabled: false,
    inviteRewardEnabled: false,
    inviteRewardThreshold: 0,
    inviteRewardAmount: 0,
    firstDepositRewardEnabled: false,
    firstDepositPercent: 0,
    firstDepositMaxAmount: 0,
    rebateEnabled: false,
    rebatePercent: 0,
    rebateBase: "valid_bet" as "valid_bet" | "net_loss",
    rebateMinBase: 0,
  });

  useEffect(() => {
    if (!referralRuleQuery.data) return;
    setReferralForm({
      commissionEnabled: !!referralRuleQuery.data.commissionEnabled,
      inviteRewardEnabled: !!referralRuleQuery.data.inviteRewardEnabled,
      inviteRewardThreshold: Number(referralRuleQuery.data.inviteRewardThreshold || 0),
      inviteRewardAmount: Number(referralRuleQuery.data.inviteRewardAmount || 0),
      firstDepositRewardEnabled: !!referralRuleQuery.data.firstDepositRewardEnabled,
      firstDepositPercent: Number(referralRuleQuery.data.firstDepositPercent || 0),
      firstDepositMaxAmount: Number(referralRuleQuery.data.firstDepositMaxAmount || 0),
      rebateEnabled: !!referralRuleQuery.data.rebateEnabled,
      rebatePercent: Number(referralRuleQuery.data.rebatePercent || 0),
      rebateBase: referralRuleQuery.data.rebateBase === "net_loss" ? "net_loss" : "valid_bet",
      rebateMinBase: Number(referralRuleQuery.data.rebateMinBase || 0),
    });
  }, [referralRuleQuery.data]);

  const saveReferralRuleMutation = trpc.adminBonus.updateReferralRule.useMutation({
    onSuccess: () => {
      void referralRuleQuery.refetch();
      toast.success("Commission / rebate rule saved");
    },
    onError: (err) => toast.error(err.message),
  });
  const settleRebateMutation = trpc.adminBonus.settleReferralRebate.useMutation({
    onSuccess: (res) => {
      void referralLedgerQuery.refetch();
      toast.success(`Rebate settled: ${res.settledRows} rows, total ${Number(res.totalAmount || 0).toFixed(2)}`);
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bonus Management</h1>
          <p className="text-muted-foreground">Configure bonus campaigns and claim rules</p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowCreateGroupDialog(true)}>
              <FolderPlus className="w-4 h-4 mr-2" /> New promo group
            </Button>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" /> Create Bonus
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="pt-6 space-y-2">
          <p className="text-xs text-muted-foreground">
            Manage <strong>promo group</strong> title and banner under <strong>New promo group</strong>. Assign promotions by group key or drag them into a group. Use the <strong>left handle</strong> to reorder groups or move promotions. Order saves automatically.
          </p>
          {bonusQuery.isLoading || promoGroupsQuery.isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : !bonusQuery.data?.length && !((promoGroupsQuery.data as any[]) || []).length ? (
            <div className="text-center py-12 text-muted-foreground space-y-3">
              <p>No promotions or promo groups yet</p>
              {canEdit && (
                <div className="flex gap-2 justify-center">
                  <Button variant="outline" size="sm" onClick={() => setShowCreateGroupDialog(true)}>
                    New promo group
                  </Button>
                  <Button size="sm" onClick={() => setShowCreateDialog(true)}>
                    Create Bonus
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <AdminBonusDraggableList
              groups={bonusGroups}
              preserveEmptyGroupKeys={preserveEmptyGroupKeys}
              accessToken={accessToken || ""}
              canEdit={canEdit}
              canDelete={!!canDelete}
              dataUpdatedAt={bonusQuery.dataUpdatedAt}
              onEdit={(b) => setEditingBonus(b)}
              onDelete={(id) => {
                if (confirm("Delete this bonus?")) deleteMutation.mutate({ token: accessToken!, bonusId: id });
              }}
              onEditGroup={(key) => setEditingGroupKey(key)}
              onApplyLayout={async (groupsPayload) => {
                await applyLayoutMutation.mutateAsync({ token: accessToken!, groups: groupsPayload });
              }}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Commission & Rebate</h2>
            <p className="text-xs text-muted-foreground">
              Referral rewards are credited to inviter wallet balance and written into immutable referral ledger entries.
            </p>
          </div>
          {referralRuleQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading referral rule…</div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border border-white/10 p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={referralForm.commissionEnabled}
                    onCheckedChange={(v) => setReferralForm((f) => ({ ...f, commissionEnabled: v }))}
                    disabled={!canEdit}
                  />
                  <Label>Enable Commission Engine</Label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={referralForm.inviteRewardEnabled}
                      onCheckedChange={(v) => setReferralForm((f) => ({ ...f, inviteRewardEnabled: v }))}
                      disabled={!canEdit}
                    />
                    <Label>Invite milestone reward</Label>
                  </div>
                  <div className="space-y-2">
                    <Label>Invite threshold</Label>
                    <Input
                      type="number"
                      value={referralForm.inviteRewardThreshold}
                      onChange={(e) =>
                        setReferralForm((f) => ({ ...f, inviteRewardThreshold: parseInt(e.target.value) || 0 }))
                      }
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Reward amount</Label>
                    <Input
                      type="number"
                      value={referralForm.inviteRewardAmount}
                      onChange={(e) =>
                        setReferralForm((f) => ({ ...f, inviteRewardAmount: parseFloat(e.target.value) || 0 }))
                      }
                      disabled={!canEdit}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={referralForm.firstDepositRewardEnabled}
                      onCheckedChange={(v) => setReferralForm((f) => ({ ...f, firstDepositRewardEnabled: v }))}
                      disabled={!canEdit}
                    />
                    <Label>First deposit commission</Label>
                  </div>
                  <div className="space-y-2">
                    <Label>Percent (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={referralForm.firstDepositPercent}
                      onChange={(e) =>
                        setReferralForm((f) => ({ ...f, firstDepositPercent: parseFloat(e.target.value) || 0 }))
                      }
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max amount (0 = no cap)</Label>
                    <Input
                      type="number"
                      value={referralForm.firstDepositMaxAmount}
                      onChange={(e) =>
                        setReferralForm((f) => ({ ...f, firstDepositMaxAmount: parseFloat(e.target.value) || 0 }))
                      }
                      disabled={!canEdit}
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-white/10 p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={referralForm.rebateEnabled}
                    onCheckedChange={(v) => setReferralForm((f) => ({ ...f, rebateEnabled: v }))}
                    disabled={!canEdit}
                  />
                  <Label>Enable Rebate</Label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="space-y-2">
                    <Label>Rebate percent (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={referralForm.rebatePercent}
                      onChange={(e) =>
                        setReferralForm((f) => ({ ...f, rebatePercent: parseFloat(e.target.value) || 0 }))
                      }
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Base</Label>
                    <Select
                      value={referralForm.rebateBase}
                      onValueChange={(v) =>
                        setReferralForm((f) => ({
                          ...f,
                          rebateBase: v === "net_loss" ? "net_loss" : "valid_bet",
                        }))
                      }
                      disabled={!canEdit}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="valid_bet">Valid Bet</SelectItem>
                        <SelectItem value="net_loss">Net Loss</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Min base amount</Label>
                    <Input
                      type="number"
                      value={referralForm.rebateMinBase}
                      onChange={(e) =>
                        setReferralForm((f) => ({ ...f, rebateMinBase: parseFloat(e.target.value) || 0 }))
                      }
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Settle date</Label>
                    <Input
                      type="date"
                      max={todayDate}
                      value={rebateSettleDate}
                      onChange={(e) => setRebateSettleDate(e.target.value)}
                      disabled={!canEdit}
                    />
                  </div>
                </div>
              </div>

              {canEdit && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => saveReferralRuleMutation.mutate({ token: accessToken!, ...referralForm })}
                    disabled={saveReferralRuleMutation.isPending}
                  >
                    {saveReferralRuleMutation.isPending ? "Saving…" : "Save Commission/Rebate Rule"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => settleRebateMutation.mutate({ token: accessToken!, targetDate: rebateSettleDate })}
                    disabled={settleRebateMutation.isPending || !rebateSettleDate}
                  >
                    {settleRebateMutation.isPending ? "Settling…" : "Settle Rebate For Date"}
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Referral Ledger</h3>
            <div className="overflow-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left p-2">Time</th>
                    <th className="text-left p-2">Type</th>
                    <th className="text-left p-2">Inviter</th>
                    <th className="text-left p-2">Invitee</th>
                    <th className="text-left p-2">Base</th>
                    <th className="text-left p-2">Reward</th>
                    <th className="text-left p-2">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {(referralLedgerQuery.data as any[] | undefined)?.length ? (
                    (referralLedgerQuery.data as any[]).map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="p-2 whitespace-nowrap">{new Date(row.createdAt).toLocaleString()}</td>
                        <td className="p-2">{String(row.rewardType || "-")}</td>
                        <td className="p-2">{row.inviterPlayerId}</td>
                        <td className="p-2">{row.inviteePlayerId || "-"}</td>
                        <td className="p-2">{Number(row.baseAmount || 0).toFixed(2)}</td>
                        <td className="p-2 font-medium">{Number(row.rewardAmount || 0).toFixed(2)}</td>
                        <td className="p-2">{row.note || "-"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="p-3 text-muted-foreground" colSpan={7}>
                        No referral rewards yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      {editingGroupKey && editingGroupKey !== "__ungrouped__" && (
        <PromoGroupEditDialog
          key={editingGroupKey}
          open={!!editingGroupKey}
          onOpenChange={(o) => { if (!o) setEditingGroupKey(null); }}
          groupKey={editingGroupKey}
          initialTitle={
            ((promoGroupsQuery.data as any[]) || []).find((r) => r.groupKey === editingGroupKey)?.title
            ?? bonusGroups.find((g) => g.key === editingGroupKey)?.title
            ?? ""
          }
          initialBannerUrl={
            ((promoGroupsQuery.data as any[]) || []).find((r) => r.groupKey === editingGroupKey)?.bannerUrl
            ?? bonusGroups.find((g) => g.key === editingGroupKey)?.bannerUrl
            ?? ""
          }
          onSave={(payload) => {
            updatePromoGroupMutation.mutate({
              token: accessToken!,
              promoGroupKey: editingGroupKey,
              ...payload,
            });
          }}
          accessToken={accessToken!}
          loading={updatePromoGroupMutation.isPending}
        />
      )}

      {showCreateGroupDialog && canEdit && (
        <CreatePromoGroupDialog
          open={showCreateGroupDialog}
          onOpenChange={setShowCreateGroupDialog}
          onSave={(payload) => {
            createPromoGroupMutation.mutate({ token: accessToken!, ...payload });
          }}
          accessToken={accessToken!}
          loading={createPromoGroupMutation.isPending}
        />
      )}

      {/* Create Dialog */}
      <BonusFormDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSubmit={(data) => createMutation.mutate({ token: accessToken!, ...data })}
        title="Create Bonus"
        groupKeyOptions={groupKeyOptions}
        accessToken={accessToken!}
      />

      {/* Edit Dialog */}
      {editingBonus && (
        <BonusFormDialog
          open={!!editingBonus}
          onOpenChange={(open) => { if (!open) setEditingBonus(null); }}
          onSubmit={(data) => updateMutation.mutate({ token: accessToken!, bonusId: editingBonus.id, ...data })}
          title="Edit Bonus"
          initialData={editingBonus}
          groupKeyOptions={groupKeyOptions}
          accessToken={accessToken!}
        />
      )}
    </div>
  );
}

function PromoGroupEditDialog({
  open,
  onOpenChange,
  groupKey,
  initialTitle,
  initialBannerUrl,
  onSave,
  accessToken,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupKey: string;
  initialTitle: string;
  initialBannerUrl: string;
  onSave: (payload: {
    promoGroupTitle: string | null;
    promoGroupBannerUrl: string | null;
  }) => void;
  accessToken: string;
  loading: boolean;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [bannerUrl, setBannerUrl] = useState(initialBannerUrl);

  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      setBannerUrl(initialBannerUrl);
    }
  }, [open, initialTitle, initialBannerUrl]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit promo group</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Group key: <span className="font-mono font-medium text-foreground">{groupKey}</span>
          <br />
          Title and banner are stored on the <strong>group record</strong> (not on each promotion). Reorder groups by dragging the whole block in the list.
        </p>
        <div className="space-y-3 pt-1">
          <div className="space-y-2">
            <Label>Section title (above the grid)</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Daily deals" />
          </div>
          <div className="space-y-2">
            <Label>Banner image URL</Label>
            <ImageUrlField
              accessToken={accessToken}
              value={bannerUrl}
              onChange={setBannerUrl}
              placeholder="https://..."
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={loading}
            onClick={() =>
              onSave({
                promoGroupTitle: title.trim() ? title.trim() : null,
                promoGroupBannerUrl: bannerUrl.trim() ? bannerUrl.trim() : null,
              })
            }
          >
            {loading ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreatePromoGroupDialog({
  open,
  onOpenChange,
  onSave,
  accessToken,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (payload: { groupKey: string; title: string | null; bannerUrl: string | null }) => void;
  accessToken: string;
  loading: boolean;
}) {
  const [groupKey, setGroupKey] = useState("");
  const [title, setTitle] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");

  useEffect(() => {
    if (open) {
      setGroupKey("");
      setTitle("");
      setBannerUrl("");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New promo group</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Create the group first, then <strong>drag</strong> promotions into it or set the same key when editing a promotion.
        </p>
        <div className="space-y-3 pt-1">
          <div className="space-y-2">
            <Label>Group key *</Label>
            <Input
              value={groupKey}
              onChange={(e) => setGroupKey(e.target.value)}
              placeholder="e.g. daily, vip (letters, numbers, underscore; no spaces)"
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label>Section title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Shown on the promotions page" />
          </div>
          <div className="space-y-2">
            <Label>Banner URL (optional)</Label>
            <ImageUrlField
              accessToken={accessToken}
              value={bannerUrl}
              onChange={setBannerUrl}
              placeholder="https://..."
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={loading || !groupKey.trim()}
            onClick={() =>
              onSave({
                groupKey: groupKey.trim().slice(0, 128),
                title: title.trim() ? title.trim() : null,
                bannerUrl: bannerUrl.trim() ? bannerUrl.trim() : null,
              })
            }
          >
            {loading ? "Creating…" : "Create"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BonusFormDialog({ open, onOpenChange, onSubmit, title, initialData, groupKeyOptions = [], accessToken }: {
  open: boolean; onOpenChange: (open: boolean) => void;
  onSubmit: (data: any) => void; title: string; initialData?: any;
  groupKeyOptions?: string[];
  accessToken: string;
}) {
  const toInputDatetime = (value?: string | null) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };
  const toNumber = (v: any, fallback: number = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const buildState = (src?: any) => {
    const cfg = (src?.claimConfig || {}) as any;
    return {
      name: src?.name || "",
      description: src?.description || "",
      bonusType: src?.bonusType ?? 0,
      fixedAmount: src?.fixedAmount ? parseFloat(src.fixedAmount) : 0,
      percentage: src?.percentage ? parseFloat(src.percentage) : 0,
      randomMin: src?.randomMin ? parseFloat(src.randomMin) : 0,
      randomMax: src?.randomMax ? parseFloat(src.randomMax) : 0,
      rolloverMultiplier: src?.rolloverMultiplier ? parseFloat(src.rolloverMultiplier) : 0,
      turnoverTarget: src?.turnoverTarget ? parseFloat(src.turnoverTarget) : 0,
      maxWithdraw: src?.maxWithdraw ? parseFloat(src.maxWithdraw) : 0,
      isActive: src?.isActive ?? true,
      promoGroupKey: src?.promoGroupKey ?? "",
      cardImageUrl: src?.cardImageUrl || "",
      detailImageUrl: src?.detailImageUrl || "",
      claimStartDate: toInputDatetime(cfg.startDate),
      claimEndDate: toInputDatetime(cfg.endDate),
      claimTimeStart: cfg.ClaimTime?.start || "",
      claimTimeEnd: cfg.ClaimTime?.end || "",
      claimReset: cfg.ClaimReset || "none",
      claimLimit: toNumber(cfg.ClaimLimit, 0),
      minDeposit: toNumber(cfg.minDeposit, 0),
      maxDeposit: toNumber(cfg.maxDeposit, 0),
      depositTarget: toNumber(cfg.depositTarget, 0),
      vipLevelMin: toNumber(cfg.vipLevelMin, 0),
      vipLevelMax: toNumber(cfg.vipLevelMax, 0),
      requireKyc: Boolean(cfg.requireKyc),
      creditLessThan: toNumber(cfg.creditLessThan, 0),
      maxBonus: toNumber(cfg.maxBonus, 0),
      excludeTagsText: Array.isArray(cfg.excludeTags) ? cfg.excludeTags.join(", ") : "",
    };
  };

  const [form, setForm] = useState(buildState(initialData));

  useEffect(() => {
    if (open) setForm(buildState(initialData));
  }, [open, initialData]);

  const handleSubmit = () => {
    const claimConfig: Record<string, any> = {};
    if (form.claimStartDate) claimConfig.startDate = new Date(form.claimStartDate).toISOString();
    if (form.claimEndDate) claimConfig.endDate = new Date(form.claimEndDate).toISOString();
    if (form.claimTimeStart && form.claimTimeEnd) {
      claimConfig.ClaimTime = { start: form.claimTimeStart, end: form.claimTimeEnd };
    }
    if (form.claimReset && form.claimReset !== "none") claimConfig.ClaimReset = form.claimReset;
    if (form.claimLimit > 0) claimConfig.ClaimLimit = form.claimLimit;
    if (form.minDeposit > 0) claimConfig.minDeposit = form.minDeposit;
    if (form.maxDeposit > 0) claimConfig.maxDeposit = form.maxDeposit;
    if (form.depositTarget > 0) claimConfig.depositTarget = form.depositTarget;
    if (form.vipLevelMin > 0) claimConfig.vipLevelMin = form.vipLevelMin;
    if (form.vipLevelMax > 0) claimConfig.vipLevelMax = form.vipLevelMax;
    if (form.requireKyc) claimConfig.requireKyc = true;
    if (form.creditLessThan > 0) claimConfig.creditLessThan = form.creditLessThan;
    if (form.maxBonus > 0) claimConfig.maxBonus = form.maxBonus;
    const tags = form.excludeTagsText
      .split(",")
      .map((x: string) => x.trim())
      .filter(Boolean);
    if (tags.length > 0) claimConfig.excludeTags = tags;

    onSubmit({
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      bonusType: form.bonusType,
      fixedAmount: form.fixedAmount,
      percentage: form.percentage,
      randomMin: form.randomMin,
      randomMax: form.randomMax,
      rolloverMultiplier: form.rolloverMultiplier,
      turnoverTarget: form.turnoverTarget,
      maxWithdraw: form.maxWithdraw,
      isActive: form.isActive,
      promoGroupKey: form.promoGroupKey.trim() || undefined,
      cardImageUrl: form.cardImageUrl.trim() || undefined,
      detailImageUrl: form.detailImageUrl.trim() || undefined,
      claimConfig,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ width: "98vw", maxWidth: "1200px" }} className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border border-white/10 p-3 space-y-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Basic</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                <p className="text-[11px] text-muted-foreground">Promotion name shown on the bonus page.</p>
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
                <p className="text-[11px] text-muted-foreground">Fixed amount, percentage, or random range.</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="min-h-20"
              />
              <p className="text-[11px] text-muted-foreground">Description and rules shown to players.</p>
            </div>
            {form.bonusType === 0 && (
              <div className="space-y-2">
                <Label>Fixed Amount</Label>
                <Input type="number" value={form.fixedAmount} onChange={e => setForm(f => ({ ...f, fixedAmount: parseFloat(e.target.value) || 0 }))} />
                <p className="text-[11px] text-muted-foreground">Fixed MYR amount per claim.</p>
              </div>
            )}
            {form.bonusType === 1 && (
              <div className="space-y-2">
                <Label>Percentage (%)</Label>
                <Input type="number" value={form.percentage} onChange={e => setForm(f => ({ ...f, percentage: parseFloat(e.target.value) || 0 }))} />
                <p className="text-[11px] text-muted-foreground">Award = current deposit × percentage.</p>
              </div>
            )}
            {form.bonusType === 2 && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Min Amount</Label>
                  <Input type="number" value={form.randomMin} onChange={e => setForm(f => ({ ...f, randomMin: parseFloat(e.target.value) || 0 }))} />
                  <p className="text-[11px] text-muted-foreground">Random range lower bound (MYR).</p>
                </div>
                <div className="space-y-2">
                  <Label>Max Amount</Label>
                  <Input type="number" value={form.randomMax} onChange={e => setForm(f => ({ ...f, randomMax: parseFloat(e.target.value) || 0 }))} />
                  <p className="text-[11px] text-muted-foreground">Random range upper bound (MYR).</p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-2">
                <Label>Rollover (x)</Label>
                <Input type="number" step="0.1" value={form.rolloverMultiplier} onChange={e => setForm(f => ({ ...f, rolloverMultiplier: parseFloat(e.target.value) || 0 }))} />
                <p className="text-[11px] text-muted-foreground">Target = (deposit + bonus) × rollover multiplier.</p>
              </div>
              <div className="space-y-2">
                <Label>Turnover (x)</Label>
                <Input type="number" value={form.turnoverTarget} onChange={e => setForm(f => ({ ...f, turnoverTarget: parseFloat(e.target.value) || 0 }))} />
                <p className="text-[11px] text-muted-foreground">Multiplier mode: target = (deposit + bonus) × turnover multiplier.</p>
              </div>
              <div className="space-y-2">
                <Label>Max Withdraw</Label>
                <Input type="number" value={form.maxWithdraw} onChange={e => setForm(f => ({ ...f, maxWithdraw: parseFloat(e.target.value) || 0 }))} />
                <p className="text-[11px] text-muted-foreground">Max withdrawal cap for this bonus (optional).</p>
              </div>
              <div className="space-y-2">
                <Label>Max Bonus</Label>
                <Input type="number" value={form.maxBonus} onChange={e => setForm(f => ({ ...f, maxBonus: parseFloat(e.target.value) || 0 }))} />
                <p className="text-[11px] text-muted-foreground">Cap for percentage/random awards (optional).</p>
              </div>
            </div>
          </div>

          <Accordion type="multiple" defaultValue={["claim-rule"]} className="rounded-md border border-white/10 px-3">
            <AccordionItem value="claim-rule">
              <AccordionTrigger className="py-3 text-xs uppercase tracking-wide text-muted-foreground hover:no-underline">
                Claim Rule (Advanced)
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pb-3">
                <p className="text-[11px] text-muted-foreground">
                  Eligibility: time window, claim counts, deposit thresholds, VIP/KYC/tags. Leave unset to skip that rule.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Start Date (optional)</Label>
                    <Input type="datetime-local" value={form.claimStartDate} onChange={e => setForm(f => ({ ...f, claimStartDate: e.target.value }))} />
                    <p className="text-[11px] text-muted-foreground">Campaign starts; claims blocked before this time.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>End Date (optional)</Label>
                    <Input type="datetime-local" value={form.claimEndDate} onChange={e => setForm(f => ({ ...f, claimEndDate: e.target.value }))} />
                    <p className="text-[11px] text-muted-foreground">Campaign ends; no claims after this time.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Claim Reset</Label>
                    <Select value={form.claimReset} onValueChange={v => setForm(f => ({ ...f, claimReset: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">
                      Reset cadence. If Daily/Weekly/Monthly and claim limit is 0, defaults to one claim per period.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Claim Limit</Label>
                    <Input type="number" value={form.claimLimit} onChange={e => setForm(f => ({ ...f, claimLimit: parseInt(e.target.value) || 0 }))} />
                    <p className="text-[11px] text-muted-foreground">Claims per reset period. 0 follows reset rules or unlimited.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Credit Less Than</Label>
                    <Input type="number" value={form.creditLessThan} onChange={e => setForm(f => ({ ...f, creditLessThan: parseFloat(e.target.value) || 0 }))} />
                    <p className="text-[11px] text-muted-foreground">
                      Balance must be below this value to claim (e.g. 5 means credit &lt; 5).
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Claim Time Start (UTC)</Label>
                    <Input type="time" value={form.claimTimeStart} onChange={e => setForm(f => ({ ...f, claimTimeStart: e.target.value }))} />
                    <p className="text-[11px] text-muted-foreground">Daily claim window start (UTC); pair with end.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Claim Time End (UTC)</Label>
                    <Input type="time" value={form.claimTimeEnd} onChange={e => setForm(f => ({ ...f, claimTimeEnd: e.target.value }))} />
                    <p className="text-[11px] text-muted-foreground">Daily claim window end (UTC).</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="space-y-2">
                    <Label>Min Deposit</Label>
                    <Input type="number" value={form.minDeposit} onChange={e => setForm(f => ({ ...f, minDeposit: parseFloat(e.target.value) || 0 }))} />
                    <p className="text-[11px] text-muted-foreground">Min deposit amount for the active cycle.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Max Deposit</Label>
                    <Input type="number" value={form.maxDeposit} onChange={e => setForm(f => ({ ...f, maxDeposit: parseFloat(e.target.value) || 0 }))} />
                    <p className="text-[11px] text-muted-foreground">Max deposit amount for the active cycle.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Deposit Target</Label>
                    <Input type="number" value={form.depositTarget} onChange={e => setForm(f => ({ ...f, depositTarget: parseInt(e.target.value) || 0 }))} />
                    <p className="text-[11px] text-muted-foreground">Required count of approved deposits (all-time).</p>
                  </div>
                  <div className="space-y-2">
                    <Label>VIP Min</Label>
                    <Input type="number" value={form.vipLevelMin} onChange={e => setForm(f => ({ ...f, vipLevelMin: parseInt(e.target.value) || 0 }))} />
                    <p className="text-[11px] text-muted-foreground">Minimum VIP level.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>VIP Max</Label>
                    <Input type="number" value={form.vipLevelMax} onChange={e => setForm(f => ({ ...f, vipLevelMax: parseInt(e.target.value) || 0 }))} />
                    <p className="text-[11px] text-muted-foreground">Maximum VIP level (above cannot claim).</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Exclude Tags (comma separated)</Label>
                    <Input value={form.excludeTagsText} onChange={e => setForm(f => ({ ...f, excludeTagsText: e.target.value }))} placeholder="vip_blocked, test_user" />
                    <p className="text-[11px] text-muted-foreground">Players with any of these tags cannot claim. Comma-separated.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.requireKyc} onCheckedChange={v => setForm(f => ({ ...f, requireKyc: v }))} />
                  <Label>Require KYC</Label>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  KYC (Know Your Customer): when on, only verified players may claim.
                </p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="display-setting">
              <AccordionTrigger className="py-3 text-xs uppercase tracking-wide text-muted-foreground hover:no-underline">
                Display
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pb-3">
                <p className="text-[11px] text-muted-foreground">
                  Group title and banner are edited under <strong>New promo group</strong> or <strong>Edit title / banner</strong>. Set only the <strong>group key</strong> here; leave empty for ungrouped.
                </p>
                {groupKeyOptions.length > 0 && (
                  <div className="space-y-2">
                    <Label>Quick-select group key</Label>
                    <Select
                      value={
                        groupKeyOptions.includes(form.promoGroupKey)
                          ? form.promoGroupKey
                          : "__manual__"
                      }
                      onValueChange={(v) =>
                        setForm((f) => ({ ...f, promoGroupKey: v === "__manual__" ? f.promoGroupKey : v }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pick a key (editable below)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__manual__">(keep manual input below)</SelectItem>
                        {groupKeyOptions.map((k) => (
                          <SelectItem key={k} value={k}>
                            {k}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Promo Group Key</Label>
                  <Input
                    value={form.promoGroupKey}
                    onChange={e => setForm(f => ({ ...f, promoGroupKey: e.target.value }))}
                    placeholder="e.g. daily / vip / opening"
                  />
                  <p className="text-[11px] text-muted-foreground">Must match a promo group key; leave empty for ungrouped.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Card Image URL</Label>
                    <ImageUrlField
                      accessToken={accessToken}
                      value={form.cardImageUrl}
                      onChange={(next) => setForm((f) => ({ ...f, cardImageUrl: next }))}
                      placeholder="https://..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Detail Image URL</Label>
                    <ImageUrlField
                      accessToken={accessToken}
                      value={form.detailImageUrl}
                      onChange={(next) => setForm((f) => ({ ...f, detailImageUrl: next }))}
                      placeholder="https://..."
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} />
                  <Label>Active</Label>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button disabled={!form.name.trim()} onClick={handleSubmit}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
