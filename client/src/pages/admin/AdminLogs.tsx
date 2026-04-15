import { useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, ChevronRight } from "lucide-react";

const MODULES = ["all", "player", "deposit", "withdraw", "bonus", "bank", "setting", "telegram", "subaccount", "banner"];

export default function AdminLogs() {
  const { accessToken } = useAdminAuth();
  const [module, setModule] = useState("all");
  const [page, setPage] = useState(1);

  const logsQuery = trpc.adminLogs.list.useQuery(
    { token: accessToken || "", page, pageSize: 30, module: module === "all" ? undefined : module },
    { enabled: !!accessToken }
  );

  const data = logsQuery.data;
  const totalPages = data ? Math.ceil(data.total / 30) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit Logs</h1>
        <p className="text-muted-foreground">Track all admin operations</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Select value={module} onValueChange={v => { setModule(v); setPage(1); }}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Filter module" /></SelectTrigger>
              <SelectContent>
                {MODULES.map(m => (
                  <SelectItem key={m} value={m}>{m === "all" ? "All Modules" : m.charAt(0).toUpperCase() + m.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="secondary">{data?.total || 0} logs</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.logs?.map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</TableCell>
                  <TableCell className="font-mono text-sm">#{log.adminId}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{log.module}</Badge></TableCell>
                  <TableCell className="text-sm">{log.action}</TableCell>
                  <TableCell className="text-sm font-mono">{log.targetType ? `${log.targetType}#${log.targetId}` : "-"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{log.ipAddress || "-"}</TableCell>
                </TableRow>
              ))}
              {(!data?.logs || data.logs.length === 0) && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {logsQuery.isLoading ? "Loading..." : "No logs found"}
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
    </div>
  );
}
