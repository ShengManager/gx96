import { useState, useMemo } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Link } from "wouter";
import {
  DollarSign, Users, ArrowUpCircle, ArrowDownCircle,
  Gift, TrendingUp, Calendar, RefreshCw, Loader2,
  ArrowRight, Activity, Clock, Percent,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area, LineChart, Line,
} from "recharts";

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4"];

export default function AdminDashboard() {
  const { accessToken } = useAdminAuth();
  const [dateRange, setDateRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return {
      start: start.toISOString().split("T")[0],
      end: end.toISOString().split("T")[0],
    };
  });

  const reportQuery = trpc.adminReports.summary.useQuery(
    { token: accessToken || "", startDate: dateRange.start, endDate: dateRange.end },
    { enabled: !!accessToken }
  );

  const data = reportQuery.data as any;
  const sn = (v: any) => typeof v === "number" ? v : parseFloat(v) || 0;

  const statsCards = useMemo(() => [
    {
      title: "Total Deposits",
      value: data ? `$${sn(data.totalDeposits).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "--",
      icon: ArrowDownCircle,
      color: "text-green-500",
      bg: "bg-green-500/10",
      count: data?.depositCount || 0,
      label: "transactions",
      link: "/admin/deposits",
    },
    {
      title: "Total Withdrawals",
      value: data ? `$${sn(data.totalWithdrawals).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "--",
      icon: ArrowUpCircle,
      color: "text-red-500",
      bg: "bg-red-500/10",
      count: data?.withdrawalCount || 0,
      label: "transactions",
      link: "/admin/withdrawals",
    },
    {
      title: "Net Revenue",
      value: data ? `$${sn(data.netRevenue).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "--",
      icon: DollarSign,
      color: data && sn(data.netRevenue) >= 0 ? "text-green-500" : "text-red-500",
      bg: data && sn(data.netRevenue) >= 0 ? "bg-green-500/10" : "bg-red-500/10",
      count: null,
      label: "",
      link: "/admin/reports",
    },
    {
      title: "New Players",
      value: data?.newPlayers?.toString() || "--",
      icon: Users,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      count: null,
      label: "",
      link: "/admin/players",
    },
    {
      title: "Total Bonuses",
      value: data ? `$${sn(data.totalBonuses).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "--",
      icon: Gift,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
      count: data?.bonusCount || 0,
      label: "claimed",
      link: "/admin/bonuses",
    },
  ], [data]);

  const barData = useMemo(() => {
    if (!data) return [];
    return [
      { name: "Deposits", amount: sn(data.totalDeposits), fill: COLORS[1] },
      { name: "Withdrawals", amount: sn(data.totalWithdrawals), fill: COLORS[4] },
      { name: "Net Revenue", amount: sn(data.netRevenue), fill: COLORS[0] },
      { name: "Bonuses", amount: sn(data.totalBonuses), fill: COLORS[3] },
    ];
  }, [data]);

  const pieData = useMemo(() => {
    if (!data) return [];
    return [
      { name: "Deposits", value: sn(data.totalDeposits) },
      { name: "Withdrawals", value: sn(data.totalWithdrawals) },
      { name: "Bonuses", value: sn(data.totalBonuses) },
    ].filter(d => d.value > 0);
  }, [data]);

  // Calculate profit margin
  const profitMargin = useMemo(() => {
    if (!data || sn(data.totalDeposits) === 0) return 0;
    return ((sn(data.netRevenue) / sn(data.totalDeposits)) * 100);
  }, [data]);

  const quickPresets = [
    { label: "Today", days: 0 },
    { label: "7D", days: 7 },
    { label: "30D", days: 30 },
    { label: "90D", days: 90 },
  ];

  const setPreset = (days: number) => {
    const end = new Date();
    const start = new Date();
    if (days > 0) start.setDate(start.getDate() - days);
    setDateRange({
      start: start.toISOString().split("T")[0],
      end: end.toISOString().split("T")[0],
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your platform performance</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {quickPresets.map(p => (
            <Button key={p.label} variant="outline" size="sm" className="h-8 text-xs" onClick={() => setPreset(p.days)}>
              {p.label}
            </Button>
          ))}
          <Separator orientation="vertical" className="h-6 hidden sm:block" />
          <Input
            type="date"
            value={dateRange.start}
            onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
            className="w-36 h-8 text-xs"
          />
          <span className="text-muted-foreground text-xs">to</span>
          <Input
            type="date"
            value={dateRange.end}
            onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
            className="w-36 h-8 text-xs"
          />
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => reportQuery.refetch()} disabled={reportQuery.isFetching}>
            {reportQuery.isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {statsCards.map((stat, i) => (
          <Link key={i} href={stat.link}>
            <Card className="cursor-pointer hover:border-primary/30 transition-colors group">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium">{stat.title}</p>
                    <p className="text-xl font-bold tracking-tight">{stat.value}</p>
                    {stat.count !== null && stat.count > 0 && (
                      <p className="text-[11px] text-muted-foreground">{stat.count} {stat.label}</p>
                    )}
                  </div>
                  <div className={`w-9 h-9 rounded-lg ${stat.bg} flex items-center justify-center`}>
                    <stat.icon className={`w-4.5 h-4.5 ${stat.color}`} />
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                  View details <ArrowRight className="w-3 h-3" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Profit Margin Indicator */}
      {data && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-2">
                <Percent className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Profit Margin</span>
                <span className={`text-lg font-bold ${profitMargin >= 0 ? "text-green-500" : "text-red-500"}`}>
                  {profitMargin.toFixed(1)}%
                </span>
              </div>
              <Separator orientation="vertical" className="h-6" />
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Avg Deposit</span>
                <span className="text-sm font-bold">
                  ${data.depositCount > 0 ? (sn(data.totalDeposits) / data.depositCount).toFixed(2) : "0.00"}
                </span>
              </div>
              <Separator orientation="vertical" className="h-6" />
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Avg Withdrawal</span>
                <span className="text-sm font-bold">
                  ${data.withdrawalCount > 0 ? (sn(data.totalWithdrawals) / data.withdrawalCount).toFixed(2) : "0.00"}
                </span>
              </div>
              <Separator orientation="vertical" className="h-6" />
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Period</span>
                <span className="text-sm font-mono">{dateRange.start} ~ {dateRange.end}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="w-4 h-4" />
              Financial Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            {reportQuery.isLoading ? (
              <div className="h-[300px] flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : barData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={barData} barSize={48}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis dataKey="name" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={(v) => `$${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(value: any) => [`$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, "Amount"]}
                  />
                  <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                    {barData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">No data available</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="w-4 h-4" />
              Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {reportQuery.isLoading ? (
              <div className="h-[300px] flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="45%"
                    innerRadius={55}
                    outerRadius={90}
                    dataKey="value"
                    paddingAngle={3}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => [`$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, ""]} />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">No data available</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Link href="/admin/deposits">
          <Card className="cursor-pointer hover:border-green-500/30 transition-colors">
            <CardContent className="py-4 flex items-center gap-3">
              <ArrowDownCircle className="w-5 h-5 text-green-500" />
              <div>
                <p className="text-sm font-medium">Manage Deposits</p>
                <p className="text-xs text-muted-foreground">Review pending</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/admin/withdrawals">
          <Card className="cursor-pointer hover:border-red-500/30 transition-colors">
            <CardContent className="py-4 flex items-center gap-3">
              <ArrowUpCircle className="w-5 h-5 text-red-500" />
              <div>
                <p className="text-sm font-medium">Manage Withdrawals</p>
                <p className="text-xs text-muted-foreground">Process requests</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/admin/players">
          <Card className="cursor-pointer hover:border-blue-500/30 transition-colors">
            <CardContent className="py-4 flex items-center gap-3">
              <Users className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-sm font-medium">Player Management</p>
                <p className="text-xs text-muted-foreground">View all players</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/admin/reports">
          <Card className="cursor-pointer hover:border-purple-500/30 transition-colors">
            <CardContent className="py-4 flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-purple-500" />
              <div>
                <p className="text-sm font-medium">View Reports</p>
                <p className="text-xs text-muted-foreground">Detailed analytics</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
