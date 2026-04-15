import { useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Total Deposits" value={data ? `$${safeNum(data.totalDeposits).toFixed(2)}` : "--"} sub={`${data?.depositCount || 0} transactions`} icon={DollarSign} loading={summaryQuery.isLoading} />
            <StatCard title="Total Withdrawals" value={data ? `$${safeNum(data.totalWithdrawals).toFixed(2)}` : "--"} sub={`${data?.withdrawalCount || 0} transactions`} icon={DollarSign} loading={summaryQuery.isLoading} />
            <StatCard title="Net Revenue" value={data ? `$${safeNum(data.netRevenue).toFixed(2)}` : "--"} sub="Deposits - Withdrawals - Bonuses" icon={TrendingUp} loading={summaryQuery.isLoading} />
            <StatCard title="New Players" value={data?.newPlayers?.toString() || "--"} sub="In selected period" icon={Users} loading={summaryQuery.isLoading} />
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

          {data?.timezone && (
            <p className="text-xs text-muted-foreground text-right">
              Timezone: {data.timezone} | Query: {data.queryRange?.start} to {data.queryRange?.end}
            </p>
          )}
        </TabsContent>

        <TabsContent value="bank">
          <Card>
            <CardHeader><CardTitle>Bank In/Out Ledger</CardTitle></CardHeader>
            <CardContent>
              {summaryQuery.isLoading ? (
                <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Metric</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium text-green-600">Total Bank In (Deposits)</TableCell>
                      <TableCell className="text-right font-bold">${safeNum(data?.totalDeposits).toFixed(2)}</TableCell>
                      <TableCell className="text-right">{data?.depositCount || 0}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium text-red-600">Total Bank Out (Withdrawals)</TableCell>
                      <TableCell className="text-right font-bold">${safeNum(data?.totalWithdrawals).toFixed(2)}</TableCell>
                      <TableCell className="text-right">{data?.withdrawalCount || 0}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium text-purple-600">Total Bonuses Given</TableCell>
                      <TableCell className="text-right font-bold">${safeNum(data?.totalBonuses).toFixed(2)}</TableCell>
                      <TableCell className="text-right">{data?.bonusCount || 0}</TableCell>
                    </TableRow>
                    <TableRow className="border-t-2">
                      <TableCell className="font-bold">Net Position</TableCell>
                      <TableCell className={`text-right font-bold ${safeNum(data?.netRevenue) >= 0 ? "text-green-600" : "text-red-600"}`}>
                        ${safeNum(data?.netRevenue).toFixed(2)}
                      </TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
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
                    <p className="text-3xl font-bold">{data?.depositCount || 0}</p>
                    <p className="text-sm text-muted-foreground">Deposit Transactions</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50 text-center">
                    <p className="text-3xl font-bold">{data?.withdrawalCount || 0}</p>
                    <p className="text-sm text-muted-foreground">Withdrawal Transactions</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50 text-center">
                    <p className="text-3xl font-bold">{data?.bonusCount || 0}</p>
                    <p className="text-sm text-muted-foreground">Bonuses Claimed</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ title, value, sub, icon: Icon, loading }: { title: string; value: string; sub: string; icon: any; loading?: boolean }) {
  return (
    <Card>
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
