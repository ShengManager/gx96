import { useEffect, useState } from "react";
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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
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
                <TableHead>Rollover / Turnover</TableHead>
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
                  <TableCell className="font-mono text-sm">
                    {bonus.rolloverMultiplier ? `${parseFloat(bonus.rolloverMultiplier).toFixed(1)}x` : "0x"}
                    {" / "}
                    {bonus.turnoverTarget ? `${parseFloat(bonus.turnoverTarget).toFixed(1)}x` : "0x"}
                  </TableCell>
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
      sortOrder: src?.sortOrder ?? 0,
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
      sortOrder: form.sortOrder,
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
                <p className="text-[11px] text-muted-foreground">活动名称，玩家在 Bonus 页面看到的标题。</p>
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
                <p className="text-[11px] text-muted-foreground">固定金额 / 百分比 / 随机区间 三种奖励方式。</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="min-h-20"
              />
              <p className="text-[11px] text-muted-foreground">活动描述与领取条件说明，建议写清规则。</p>
            </div>
            {form.bonusType === 0 && (
              <div className="space-y-2">
                <Label>Fixed Amount</Label>
                <Input type="number" value={form.fixedAmount} onChange={e => setForm(f => ({ ...f, fixedAmount: parseFloat(e.target.value) || 0 }))} />
                <p className="text-[11px] text-muted-foreground">每次领取发固定金额（MYR）。</p>
              </div>
            )}
            {form.bonusType === 1 && (
              <div className="space-y-2">
                <Label>Percentage (%)</Label>
                <Input type="number" value={form.percentage} onChange={e => setForm(f => ({ ...f, percentage: parseFloat(e.target.value) || 0 }))} />
                <p className="text-[11px] text-muted-foreground">奖励 = 当前 Deposit 金额 × 百分比。</p>
              </div>
            )}
            {form.bonusType === 2 && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Min Amount</Label>
                  <Input type="number" value={form.randomMin} onChange={e => setForm(f => ({ ...f, randomMin: parseFloat(e.target.value) || 0 }))} />
                  <p className="text-[11px] text-muted-foreground">随机奖励下限（MYR）。</p>
                </div>
                <div className="space-y-2">
                  <Label>Max Amount</Label>
                  <Input type="number" value={form.randomMax} onChange={e => setForm(f => ({ ...f, randomMax: parseFloat(e.target.value) || 0 }))} />
                  <p className="text-[11px] text-muted-foreground">随机奖励上限（MYR）。</p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-2">
                <Label>Rollover (x)</Label>
                <Input type="number" step="0.1" value={form.rolloverMultiplier} onChange={e => setForm(f => ({ ...f, rolloverMultiplier: parseFloat(e.target.value) || 0 }))} />
                <p className="text-[11px] text-muted-foreground">目标 = (Deposit + Bonus) × Rollover 倍率。</p>
              </div>
              <div className="space-y-2">
                <Label>Turnover (x)</Label>
                <Input type="number" value={form.turnoverTarget} onChange={e => setForm(f => ({ ...f, turnoverTarget: parseFloat(e.target.value) || 0 }))} />
                <p className="text-[11px] text-muted-foreground">乘法模式：目标 = (Deposit + Bonus) × Turnover 倍率。</p>
              </div>
              <div className="space-y-2">
                <Label>Max Withdraw</Label>
                <Input type="number" value={form.maxWithdraw} onChange={e => setForm(f => ({ ...f, maxWithdraw: parseFloat(e.target.value) || 0 }))} />
                <p className="text-[11px] text-muted-foreground">该 Bonus 对应的最大可提限额（可选）。</p>
              </div>
              <div className="space-y-2">
                <Label>Max Bonus</Label>
                <Input type="number" value={form.maxBonus} onChange={e => setForm(f => ({ ...f, maxBonus: parseFloat(e.target.value) || 0 }))} />
                <p className="text-[11px] text-muted-foreground">百分比/随机奖励上限封顶（可选）。</p>
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
                  这里是领取资格控制：时间窗、次数、充值门槛、VIP/KYC/标签过滤。未设置表示不限制该项。
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Start Date (optional)</Label>
                    <Input type="datetime-local" value={form.claimStartDate} onChange={e => setForm(f => ({ ...f, claimStartDate: e.target.value }))} />
                    <p className="text-[11px] text-muted-foreground">活动开始时间。未到时间时不可领取。</p>
                  </div>
                  <div className="space-y-2">
                    <Label>End Date (optional)</Label>
                    <Input type="datetime-local" value={form.claimEndDate} onChange={e => setForm(f => ({ ...f, claimEndDate: e.target.value }))} />
                    <p className="text-[11px] text-muted-foreground">活动结束时间。超过时间后不可领取。</p>
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
                      领取周期重置方式。若设置为 Daily/Weekly/Monthly 且 Claim Limit=0，系统默认每周期限领 1 次。
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Claim Limit</Label>
                    <Input type="number" value={form.claimLimit} onChange={e => setForm(f => ({ ...f, claimLimit: parseInt(e.target.value) || 0 }))} />
                    <p className="text-[11px] text-muted-foreground">每个重置周期可领取次数。0 表示由 Reset 规则自动决定（或无限制）。</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Credit Less Than</Label>
                    <Input type="number" value={form.creditLessThan} onChange={e => setForm(f => ({ ...f, creditLessThan: parseFloat(e.target.value) || 0 }))} />
                    <p className="text-[11px] text-muted-foreground">
                      当前余额必须小于该值才可领取。例：填 5，只有余额 &lt; 5 才能领。
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Claim Time Start (UTC)</Label>
                    <Input type="time" value={form.claimTimeStart} onChange={e => setForm(f => ({ ...f, claimTimeStart: e.target.value }))} />
                    <p className="text-[11px] text-muted-foreground">UTC 每日可领取时间窗口开始（需与 End 搭配）。</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Claim Time End (UTC)</Label>
                    <Input type="time" value={form.claimTimeEnd} onChange={e => setForm(f => ({ ...f, claimTimeEnd: e.target.value }))} />
                    <p className="text-[11px] text-muted-foreground">UTC 每日可领取时间窗口结束（超出区间不可领）。</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="space-y-2">
                    <Label>Min Deposit</Label>
                    <Input type="number" value={form.minDeposit} onChange={e => setForm(f => ({ ...f, minDeposit: parseFloat(e.target.value) || 0 }))} />
                    <p className="text-[11px] text-muted-foreground">要求当前 active cycle 的 Deposit 金额不低于该值。</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Max Deposit</Label>
                    <Input type="number" value={form.maxDeposit} onChange={e => setForm(f => ({ ...f, maxDeposit: parseFloat(e.target.value) || 0 }))} />
                    <p className="text-[11px] text-muted-foreground">要求当前 active cycle 的 Deposit 金额不高于该值。</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Deposit Target</Label>
                    <Input type="number" value={form.depositTarget} onChange={e => setForm(f => ({ ...f, depositTarget: parseInt(e.target.value) || 0 }))} />
                    <p className="text-[11px] text-muted-foreground">玩家历史“已通过”充值次数需达到该值。</p>
                  </div>
                  <div className="space-y-2">
                    <Label>VIP Min</Label>
                    <Input type="number" value={form.vipLevelMin} onChange={e => setForm(f => ({ ...f, vipLevelMin: parseInt(e.target.value) || 0 }))} />
                    <p className="text-[11px] text-muted-foreground">最低 VIP 等级门槛。</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>VIP Max</Label>
                    <Input type="number" value={form.vipLevelMax} onChange={e => setForm(f => ({ ...f, vipLevelMax: parseInt(e.target.value) || 0 }))} />
                    <p className="text-[11px] text-muted-foreground">最高 VIP 等级上限（超过则不可领）。</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Exclude Tags (comma separated)</Label>
                    <Input value={form.excludeTagsText} onChange={e => setForm(f => ({ ...f, excludeTagsText: e.target.value }))} placeholder="vip_blocked, test_user" />
                    <p className="text-[11px] text-muted-foreground">命中任一标签即不可领取，多个标签用逗号分隔。</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.requireKyc} onCheckedChange={v => setForm(f => ({ ...f, requireKyc: v }))} />
                  <Label>Require KYC</Label>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  KYC = 实名/身份验证（Know Your Customer）。开启后，只有完成实名审核的玩家可领取。
                </p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="display-setting">
              <AccordionTrigger className="py-3 text-xs uppercase tracking-wide text-muted-foreground hover:no-underline">
                Display & Order
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pb-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
