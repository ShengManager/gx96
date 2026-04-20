import { useMemo, useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, Users, DollarSign, RefreshCw, Loader2 } from "lucide-react";

const TIMEZONES = [
  "UTC", "Asia/Kuala_Lumpur", "Asia/Singapore", "Asia/Shanghai",
  "Asia/Tokyo", "Asia/Bangkok", "Asia/Jakarta", "America/New_York",
  "Europe/London", "Australia/Sydney",
];

export default function AdminReports() {
  const { accessToken } = useAdminAuth();
  const [timezone, setTimezone] = useState("Asia/Kuala_Lumpur");
  const [selectedBankKey, setSelectedBankKey] = useState<string>("all");
  const [detailDialog, setDetailDialog] = useState<{ open: boolean; type: string; title: string }>({
    open: false,
    type: "",
    title: "",
  });
  const [dateRange, setDateRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return { start: start.toISOString().split("T")[0], end: end.toISOString().split("T")[0] };
  });

  const summaryQuery = trpc.adminReports.summary.useQuery(
    { token: accessToken || "", startDate: dateRange.start, endDate: dateRange.end, timezone },
    { enabled: !!accessToken }
  );

  const data = summaryQuery.data as any;

  const safeNum = (val: any) => typeof val === "number" ? val : parseFloat(val) || 0;
  const fmtDate = (val: any) => {
    if (!val) return "-";
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString();
  };
  const txTypeLabel = (v: string) => (v === "deposit" ? "Deposit" : "Withdrawal");
  const sourceLabel = (kind: string) => {
    if (kind === "admin_manual") return "Admin Manual";
    if (kind === "api_deposit") return "API Deposit";
    return "Player Deposit";
  };
  const selectedBankName = useMemo(() => {
    if (selectedBankKey === "all") return "All Banks";
    const row = (data?.bankBreakdown || []).find((b: any) => b.bankKey === selectedBankKey);
    return row?.bankName || "Selected Bank";
  }, [data, selectedBankKey]);
  const filteredBankTransactions = useMemo(() => {
    const rows = data?.bankTransactions || [];
    if (selectedBankKey === "all") return rows;
    return rows.filter((tx: any) => tx.bankKey === selectedBankKey);
  }, [data, selectedBankKey]);
  const pendingQueueRows = useMemo(
    () =>
      [
        ...(data?.details?.pendingDeposits || []).map((r: any) => ({ ...r, txType: "deposit" })),
        ...(data?.details?.pendingWithdrawals || []).map((r: any) => ({ ...r, txType: "withdrawal" })),
      ]
        .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
        .slice(0, 120),
    [data]
  );
  const openDetail = (type: string, title: string) => setDetailDialog({ open: true, type, title });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-muted-foreground">Financial and operational reports</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input type="date" value={dateRange.start} onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))} className="w-36" />
          <span className="text-muted-foreground">to</span>
          <Input type="date" value={dateRange.end} onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))} className="w-36" />
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIMEZONES.map(tz => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => summaryQuery.refetch()} disabled={summaryQuery.isFetching}>
            {summaryQuery.isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview"><TrendingUp className="w-4 h-4 mr-1" /> Overview</TabsTrigger>
          <TabsTrigger value="bank"><DollarSign className="w-4 h-4 mr-1" /> Bank Ledger</TabsTrigger>
          <TabsTrigger value="players"><Users className="w-4 h-4 mr-1" /> Players</TabsTrigger>
          <TabsTrigger value="customer">Customer Report</TabsTrigger>
          <TabsTrigger value="topCustomer">Top Customer</TabsTrigger>
          <TabsTrigger value="promotion">Bonus</TabsTrigger>
          <TabsTrigger value="referrer">Top Referrer</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Total Deposits" value={data ? `$${safeNum(data.totalDeposits).toFixed(2)}` : "--"} sub={`${data?.depositCount || 0} transactions`} icon={DollarSign} loading={summaryQuery.isLoading} onClick={() => openDetail("approvedDeposits", "Approved Deposits Detail")} />
            <StatCard title="Total Withdrawals" value={data ? `$${safeNum(data.totalWithdrawals).toFixed(2)}` : "--"} sub={`${data?.withdrawalCount || 0} transactions`} icon={DollarSign} loading={summaryQuery.isLoading} onClick={() => openDetail("approvedWithdrawals", "Approved Withdrawals Detail")} />
            <StatCard title="Net Cashflow" value={data ? `$${safeNum(data.netCashflow).toFixed(2)}` : "--"} sub="Approved deposits - approved withdrawals" icon={TrendingUp} loading={summaryQuery.isLoading} onClick={() => openDetail("netCashflow", "Net Cashflow Components")} />
            <StatCard title="Net Revenue" value={data ? `$${safeNum(data.netRevenue).toFixed(2)}` : "--"} sub="Net cashflow - bonuses" icon={TrendingUp} loading={summaryQuery.isLoading} onClick={() => openDetail("netRevenue", "Net Revenue Components")} />
            <StatCard title="Pending Deposits" value={data ? `$${safeNum(data.pendingDepositAmount).toFixed(2)}` : "--"} sub={`${data?.pendingDepositCount || 0} pending`} icon={DollarSign} loading={summaryQuery.isLoading} onClick={() => openDetail("pendingDeposits", "Pending Deposits Detail")} />
            <StatCard title="Pending Withdrawals" value={data ? `$${safeNum(data.pendingWithdrawalAmount).toFixed(2)}` : "--"} sub={`${data?.pendingWithdrawalCount || 0} pending`} icon={DollarSign} loading={summaryQuery.isLoading} onClick={() => openDetail("pendingWithdrawals", "Pending Withdrawals Detail")} />
            <StatCard title="Bonus Cost" value={data ? `$${safeNum(data.totalBonuses).toFixed(2)}` : "--"} sub={`${safeNum(data?.bonusCostRate).toFixed(2)}% of deposits`} icon={DollarSign} loading={summaryQuery.isLoading} onClick={() => openDetail("bonuses", "Bonuses Awarded Detail")} />
            <StatCard title="New Players" value={data?.newPlayers?.toString() || "--"} sub="In selected period" icon={Users} loading={summaryQuery.isLoading} onClick={() => openDetail("newPlayers", "New Players Detail")} />
          </div>

          <Card className="mt-6">
            <CardHeader><CardTitle>Financial Summary</CardTitle></CardHeader>
            <CardContent>
              {summaryQuery.isLoading ? (
                <div className="h-[350px] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
              ) : data ? (
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={[
                    { name: "Deposits", amount: safeNum(data.totalDeposits) },
                    { name: "Withdrawals", amount: safeNum(data.totalWithdrawals) },
                    { name: "Pending In", amount: safeNum(data.pendingDepositAmount) },
                    { name: "Pending Out", amount: safeNum(data.pendingWithdrawalAmount) },
                    { name: "Bonuses", amount: safeNum(data.totalBonuses) },
                    { name: "Net Revenue", amount: safeNum(data.netRevenue) },
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                    <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[350px] flex items-center justify-center text-muted-foreground">No data available</div>
              )}
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader><CardTitle>Business Insights</CardTitle></CardHeader>
            <CardContent>
              {summaryQuery.isLoading ? (
                <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Avg Deposit Size</p>
                    <p className="text-xl font-semibold">${safeNum(data?.avgDeposit).toFixed(2)}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Avg Withdrawal Size</p>
                    <p className="text-xl font-semibold">${safeNum(data?.avgWithdrawal).toFixed(2)}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Withdrawal Rate</p>
                    <p className="text-xl font-semibold">{safeNum(data?.withdrawalRate).toFixed(2)}%</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Rejected Txn Amount</p>
                    <p className="text-xl font-semibold">
                      ${(safeNum(data?.rejectedDepositAmount) + safeNum(data?.rejectedWithdrawalAmount)).toFixed(2)}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground mt-3">
            Click any metric card above to open its detailed records in a dialog.
          </p>

          {data?.timezone && (
            <p className="text-xs text-muted-foreground text-right">
              Timezone: {data.timezone} | Query: {data.queryRange?.start} to {data.queryRange?.end}
            </p>
          )}
        </TabsContent>

        <TabsContent value="bank">
          <Card>
            <CardHeader><CardTitle>Bank In/Out Ledger (Detailed)</CardTitle></CardHeader>
            <CardContent>
              {summaryQuery.isLoading ? (
                <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                      <p className="text-xs text-muted-foreground">Approved Bank In</p>
                      <p className="text-xl font-semibold text-green-600">${safeNum(data?.totalDeposits).toFixed(2)}</p>
                    </div>
                    <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                      <p className="text-xs text-muted-foreground">Approved Bank Out</p>
                      <p className="text-xl font-semibold text-red-600">${safeNum(data?.totalWithdrawals).toFixed(2)}</p>
                    </div>
                    <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                      <p className="text-xs text-muted-foreground">Pending Float</p>
                      <p className="text-xl font-semibold text-blue-600">
                        ${(safeNum(data?.pendingDepositAmount) - safeNum(data?.pendingWithdrawalAmount)).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bank</TableHead>
                        <TableHead>Account Name</TableHead>
                        <TableHead>Account Number</TableHead>
                        <TableHead className="text-right">In (Approved)</TableHead>
                        <TableHead className="text-right">In (Pending)</TableHead>
                        <TableHead className="text-right">Out (Approved)</TableHead>
                        <TableHead className="text-right">Out (Pending)</TableHead>
                        <TableHead className="text-right">Net (Approved)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(data?.bankBreakdown || []).length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground">No bank records in this period.</TableCell>
                        </TableRow>
                      )}
                      {(data?.bankBreakdown || []).map((row: any) => (
                        <TableRow
                          key={`${row.bankId || "na"}-${row.bankName}`}
                          className={`cursor-pointer ${selectedBankKey === row.bankKey ? "bg-muted/60" : ""}`}
                          onClick={() => setSelectedBankKey(row.bankKey || "all")}
                        >
                          <TableCell className="font-medium">{row.bankName || "-"}</TableCell>
                          <TableCell>{row.accountName || "-"}</TableCell>
                          <TableCell>{row.accountNumber || "-"}</TableCell>
                          <TableCell className="text-right text-green-600">${safeNum(row.depositApprovedAmount).toFixed(2)}</TableCell>
                          <TableCell className="text-right">${safeNum(row.depositPendingAmount).toFixed(2)}</TableCell>
                          <TableCell className="text-right text-red-600">${safeNum(row.withdrawalApprovedAmount).toFixed(2)}</TableCell>
                          <TableCell className="text-right">${safeNum(row.withdrawalPendingAmount).toFixed(2)}</TableCell>
                          <TableCell className={`text-right font-semibold ${safeNum(row.netApproved) >= 0 ? "text-green-600" : "text-red-600"}`}>
                            ${safeNum(row.netApproved).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <div className="pt-3">
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <h3 className="text-sm font-semibold">
                        Bank Transaction Details - {selectedBankName}
                      </h3>
                      <Button
                        type="button"
                        variant={selectedBankKey === "all" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedBankKey("all")}
                      >
                        Show All Banks
                      </Button>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date Time</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Player</TableHead>
                          <TableHead>Bank</TableHead>
                          <TableHead>Account</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredBankTransactions.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-muted-foreground">No transaction details in this period.</TableCell>
                          </TableRow>
                        )}
                        {filteredBankTransactions.map((tx: any) => (
                          <TableRow key={tx.id}>
                            <TableCell>{fmtDate(tx.eventAt || tx.createdAt)}</TableCell>
                            <TableCell>{txTypeLabel(tx.txType)}</TableCell>
                            <TableCell className="uppercase">{tx.status || "-"}</TableCell>
                            <TableCell>
                              <div className="font-medium">{tx.playerName || "-"}</div>
                              <div className="text-xs text-muted-foreground">{tx.playerUsername || ""}</div>
                            </TableCell>
                            <TableCell>{tx.bankName || "-"}</TableCell>
                            <TableCell>
                              <div>{tx.bankAccountName || "-"}</div>
                              <div className="text-xs text-muted-foreground">{tx.bankAccountNumber || ""}</div>
                            </TableCell>
                            <TableCell className={`text-right font-semibold ${tx.txType === "deposit" ? "text-green-600" : "text-red-600"}`}>
                              ${safeNum(tx.amount).toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <p className="text-xs text-muted-foreground mt-2">
                      Showing latest {filteredBankTransactions.length} records within selected date range.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="players">
          <Card>
            <CardHeader><CardTitle>Player Statistics</CardTitle></CardHeader>
            <CardContent>
              {summaryQuery.isLoading ? (
                <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-lg bg-muted/50 text-center">
                    <p className="text-3xl font-bold">{data?.newPlayers || 0}</p>
                    <p className="text-sm text-muted-foreground">New Players</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50 text-center">
                    <p className="text-3xl font-bold">{data?.totalPlayers || 0}</p>
                    <p className="text-sm text-muted-foreground">Total Players</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50 text-center">
                    <p className="text-3xl font-bold">{data?.depositedPlayers || 0}</p>
                    <p className="text-sm text-muted-foreground">Depositing Players</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50 text-center">
                    <p className="text-3xl font-bold">{data?.withdrawnPlayers || 0}</p>
                    <p className="text-sm text-muted-foreground">Withdrawing Players</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="customer">
          <Card>
            <CardHeader><CardTitle>Customer Report</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">New</TableHead>
                    <TableHead className="text-right">Repeat</TableHead>
                    <TableHead className="text-right">Total Customers</TableHead>
                    <TableHead className="text-right">Deposit Count</TableHead>
                    <TableHead className="text-right">Deposit Amount</TableHead>
                    <TableHead className="text-right">Withdraw Count</TableHead>
                    <TableHead className="text-right">Withdraw Amount</TableHead>
                    <TableHead className="text-right">Bonus Amount</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.customerReport || []).length === 0 && (
                    <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">No data in selected period.</TableCell></TableRow>
                  )}
                  {(data?.customerReport || []).map((r: any) => (
                    <TableRow key={`cr-${r.date}`}>
                      <TableCell>{r.date}</TableCell>
                      <TableCell className="text-right">{r.newCustomers || 0}</TableCell>
                      <TableCell className="text-right">{r.repeatCustomer || 0}</TableCell>
                      <TableCell className="text-right">{r.totalCustomer || 0}</TableCell>
                      <TableCell className="text-right">{r.depositCount || 0}</TableCell>
                      <TableCell className="text-right text-green-600">${safeNum(r.depositAmount).toFixed(2)}</TableCell>
                      <TableCell className="text-right">{r.withdrawCount || 0}</TableCell>
                      <TableCell className="text-right text-red-600">${safeNum(r.withdrawAmount).toFixed(2)}</TableCell>
                      <TableCell className="text-right text-purple-600">${safeNum(r.bonusAmount).toFixed(2)}</TableCell>
                      <TableCell className={`text-right font-semibold ${safeNum(r.netAmount) >= 0 ? "text-green-600" : "text-red-600"}`}>${safeNum(r.netAmount).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="topCustomer">
          <Card>
            <CardHeader><CardTitle>Top Customer Report</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Player</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead className="text-right">Deposit Count</TableHead>
                    <TableHead className="text-right">Deposit Amount</TableHead>
                    <TableHead className="text-right">Withdraw Count</TableHead>
                    <TableHead className="text-right">Withdraw Amount</TableHead>
                    <TableHead className="text-right">Bonus</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.topCustomerReport || []).length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No data in selected period.</TableCell></TableRow>
                  )}
                  {(data?.topCustomerReport || []).map((r: any, idx: number) => (
                    <TableRow key={`tcr-${idx}-${r.playerUsername || r.playerName}`}>
                      <TableCell className="font-medium">{r.playerName || "-"}</TableCell>
                      <TableCell>{r.playerUsername || "-"}</TableCell>
                      <TableCell className="text-right">{r.depositCount || 0}</TableCell>
                      <TableCell className="text-right text-green-600">${safeNum(r.totalDeposit).toFixed(2)}</TableCell>
                      <TableCell className="text-right">{r.withdrawCount || 0}</TableCell>
                      <TableCell className="text-right text-red-600">${safeNum(r.totalWithdraw).toFixed(2)}</TableCell>
                      <TableCell className="text-right text-purple-600">${safeNum(r.bonusAmount).toFixed(2)}</TableCell>
                      <TableCell className={`text-right font-semibold ${safeNum(r.netAmount) >= 0 ? "text-green-600" : "text-red-600"}`}>${safeNum(r.netAmount).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="promotion">
          <Card>
            <CardHeader><CardTitle>Bonus Report</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                    <TableHead className="text-right">Total Bonus</TableHead>
                    <TableHead className="text-right">Forfeited Count</TableHead>
                    <TableHead className="text-right">Forfeited Amount</TableHead>
                    <TableHead className="text-right">Active Count</TableHead>
                    <TableHead className="text-right">Active Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.bonusPromotionReport || []).length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No bonus data in selected period.</TableCell></TableRow>
                  )}
                  {(data?.bonusPromotionReport || []).map((r: any) => (
                    <TableRow key={`pr-${r.date}`}>
                      <TableCell>{r.date}</TableCell>
                      <TableCell className="text-right">{r.count || 0}</TableCell>
                      <TableCell className="text-right text-purple-600">${safeNum(r.totalAmount).toFixed(2)}</TableCell>
                      <TableCell className="text-right">{r.forfeitedCount || 0}</TableCell>
                      <TableCell className="text-right text-red-600">${safeNum(r.forfeitedAmount).toFixed(2)}</TableCell>
                      <TableCell className="text-right">{r.activeCount || 0}</TableCell>
                      <TableCell className="text-right text-blue-600">${safeNum(r.activeAmount).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="referrer">
          <Card>
            <CardHeader><CardTitle>Top Referrer Report</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead className="text-right">New Members</TableHead>
                    <TableHead className="text-right">Total Deposit</TableHead>
                    <TableHead className="text-right">Total Withdraw</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.topReferrerReport || []).length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No referrer data in selected period.</TableCell></TableRow>
                  )}
                  {(data?.topReferrerReport || []).map((r: any) => (
                    <TableRow key={`rr-${r.inviterId}`}>
                      <TableCell className="font-medium">{r.inviterName || "-"}</TableCell>
                      <TableCell>{r.inviterUsername || "-"}</TableCell>
                      <TableCell className="text-right">{r.newMembers || 0}</TableCell>
                      <TableCell className="text-right text-green-600">${safeNum(r.totalDeposit).toFixed(2)}</TableCell>
                      <TableCell className="text-right text-red-600">${safeNum(r.totalWithdraw).toFixed(2)}</TableCell>
                      <TableCell className={`text-right font-semibold ${safeNum(r.netAmount) >= 0 ? "text-green-600" : "text-red-600"}`}>${safeNum(r.netAmount).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={detailDialog.open} onOpenChange={(open) => setDetailDialog((prev) => ({ ...prev, open }))}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>{detailDialog.title}</DialogTitle>
          </DialogHeader>
          <MetricDetailTable
            type={detailDialog.type}
            data={data}
            fmtDate={fmtDate}
            safeNum={safeNum}
            sourceLabel={sourceLabel}
            txTypeLabel={txTypeLabel}
            pendingQueueRows={pendingQueueRows}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ title, value, sub, icon: Icon, loading, onClick }: { title: string; value: string; sub: string; icon: any; loading?: boolean; onClick?: () => void }) {
  return (
    <Card className={onClick ? "cursor-pointer hover:border-primary/40 transition-colors" : ""} onClick={onClick}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            {loading ? (
              <div className="h-8 mt-1 flex items-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : (
              <p className="text-2xl font-bold mt-1">{value}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">{sub}</p>
          </div>
          <Icon className="w-8 h-8 text-primary opacity-60" />
        </div>
      </CardContent>
    </Card>
  );
}

function MetricDetailTable({
  type,
  data,
  fmtDate,
  safeNum,
  sourceLabel,
  txTypeLabel,
  pendingQueueRows,
}: {
  type: string;
  data: any;
  fmtDate: (val: any) => string;
  safeNum: (val: any) => number;
  sourceLabel: (kind: string) => string;
  txTypeLabel: (v: string) => string;
  pendingQueueRows: any[];
}) {
  if (type === "netCashflow" || type === "netRevenue") {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Metric</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow><TableCell>Approved Deposits</TableCell><TableCell className="text-right text-green-600">${safeNum(data?.totalDeposits).toFixed(2)}</TableCell></TableRow>
          <TableRow><TableCell>Approved Withdrawals</TableCell><TableCell className="text-right text-red-600">${safeNum(data?.totalWithdrawals).toFixed(2)}</TableCell></TableRow>
          <TableRow><TableCell>Net Cashflow</TableCell><TableCell className="text-right font-semibold">${safeNum(data?.netCashflow).toFixed(2)}</TableCell></TableRow>
          <TableRow><TableCell>Bonuses</TableCell><TableCell className="text-right text-purple-600">${safeNum(data?.totalBonuses).toFixed(2)}</TableCell></TableRow>
          <TableRow><TableCell>Net Revenue</TableCell><TableCell className="text-right font-semibold">${safeNum(data?.netRevenue).toFixed(2)}</TableCell></TableRow>
        </TableBody>
      </Table>
    );
  }

  if (type === "approvedDeposits" || type === "pendingDeposits") {
    const rows = type === "approvedDeposits" ? (data?.details?.approvedDeposits || []) : (data?.details?.pendingDeposits || []);
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead><TableHead>Player</TableHead><TableHead>Source</TableHead><TableHead>Bank</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No records in period.</TableCell></TableRow>}
          {rows.map((row: any) => (
            <TableRow key={`${type}-${row.id}`}>
              <TableCell>{fmtDate(row.processedAt || row.createdAt)}</TableCell>
              <TableCell>{row.playerName}</TableCell>
              <TableCell>{sourceLabel(row.sourceKind)}</TableCell>
              <TableCell>{row.bankName || "-"}</TableCell>
              <TableCell className="uppercase">{row.status}</TableCell>
              <TableCell className="text-right text-green-600">${safeNum(row.amount).toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  if (type === "approvedWithdrawals" || type === "pendingWithdrawals") {
    const rows = type === "approvedWithdrawals" ? (data?.details?.approvedWithdrawals || []) : (data?.details?.pendingWithdrawals || []);
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead><TableHead>Player</TableHead><TableHead>Bank</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No records in period.</TableCell></TableRow>}
          {rows.map((row: any) => (
            <TableRow key={`${type}-${row.id}`}>
              <TableCell>{fmtDate(row.processedAt || row.createdAt)}</TableCell>
              <TableCell>{row.playerName}</TableCell>
              <TableCell>{row.bankName || "-"}</TableCell>
              <TableCell className="uppercase">{row.status}</TableCell>
              <TableCell className="text-right text-red-600">${safeNum(row.amount).toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  if (type === "bonuses") {
    const rows = data?.details?.bonuses || [];
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead><TableHead>Player</TableHead><TableHead>Bonus</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No records in period.</TableCell></TableRow>}
          {rows.map((row: any) => (
            <TableRow key={`bonus-${row.id}`}>
              <TableCell>{fmtDate(row.claimedAt)}</TableCell>
              <TableCell>{row.playerName}</TableCell>
              <TableCell>{row.bonusName}</TableCell>
              <TableCell className="uppercase">{row.status}</TableCell>
              <TableCell className="text-right text-purple-600">${safeNum(row.amount).toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  if (type === "newPlayers") {
    const rows = data?.details?.newPlayers || [];
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead><TableHead>Player</TableHead><TableHead>Username</TableHead><TableHead>Phone</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No records in period.</TableCell></TableRow>}
          {rows.map((row: any) => (
            <TableRow key={`np-${row.id}`}>
              <TableCell>{fmtDate(row.createdAt)}</TableCell>
              <TableCell>{row.playerName}</TableCell>
              <TableCell>{row.playerUsername || "-"}</TableCell>
              <TableCell>{row.phone || "-"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  if (type === "pendingQueue") {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead><TableHead>Type</TableHead><TableHead>Player</TableHead><TableHead>Bank</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pendingQueueRows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No records in period.</TableCell></TableRow>}
          {pendingQueueRows.map((row: any) => (
            <TableRow key={`pending-${row.txType}-${row.id}`}>
              <TableCell>{fmtDate(row.createdAt)}</TableCell>
              <TableCell>{txTypeLabel(row.txType)}</TableCell>
              <TableCell>{row.playerName}</TableCell>
              <TableCell>{row.bankName || "-"}</TableCell>
              <TableCell className="uppercase">{row.status}</TableCell>
              <TableCell className={`text-right ${row.txType === "deposit" ? "text-green-600" : "text-red-600"}`}>${safeNum(row.amount).toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return <p className="text-sm text-muted-foreground">No detail available.</p>;
}
