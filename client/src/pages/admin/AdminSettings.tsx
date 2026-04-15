import { useState, useEffect } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Settings, Globe, Bot, Users, Plus, Save, Trash2, Eye, Shield, Palette, Lock, Clock } from "lucide-react";
import { toast } from "sonner";

const MODULES = ["dashboard", "player", "deposit", "withdraw", "bonus", "bank", "setting", "telegram", "report", "banner", "subaccount", "log"];

const TIMEZONE_OPTIONS = [
  { value: "UTC", city: "UTC" },
  { value: "Asia/Kuala_Lumpur", city: "Kuala Lumpur" },
  { value: "Asia/Singapore", city: "Singapore" },
  { value: "Asia/Bangkok", city: "Bangkok" },
  { value: "Asia/Tokyo", city: "Tokyo" },
  { value: "Australia/Sydney", city: "Sydney (DST auto)" },
  { value: "America/New_York", city: "New York (DST auto)" },
  { value: "America/Los_Angeles", city: "Los Angeles (DST auto)" },
  { value: "Europe/London", city: "London (DST auto)" },
];

function getTimezoneOffsetLabel(timezone: string): string {
  try {
    const now = new Date();
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour12: false,
      timeZoneName: "shortOffset",
    });
    const parts = dtf.formatToParts(now);
    const tzName = parts.find((p) => p.type === "timeZoneName")?.value || "UTC";
    return tzName.replace("GMT", "UTC");
  } catch {
    return "UTC";
  }
}

function normalizeLegacyTimezone(value: string | undefined): string {
  if (!value) return "Asia/Kuala_Lumpur";
  if (value.includes("/")) return value;
  const n = Number(value);
  if (!Number.isFinite(n)) return "Asia/Kuala_Lumpur";
  if (n >= 10) return "Australia/Sydney";
  if (n >= 8) return "Asia/Kuala_Lumpur";
  if (n >= 7) return "Asia/Bangkok";
  if (n <= -4) return "America/New_York";
  if (n <= -7) return "America/Los_Angeles";
  return "UTC";
}

export default function AdminSettings() {
  const { accessToken, user, hasPermission } = useAdminAuth();
  const canEdit = hasPermission("setting", "edit");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">System configuration and management</p>
      </div>

      <Tabs defaultValue="system" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="system"><Settings className="w-4 h-4 mr-1" /> System</TabsTrigger>
          <TabsTrigger value="countries"><Globe className="w-4 h-4 mr-1" /> Countries</TabsTrigger>
          <TabsTrigger value="telegram"><Bot className="w-4 h-4 mr-1" /> Telegram</TabsTrigger>
          <TabsTrigger value="frontend"><Palette className="w-4 h-4 mr-1" /> Frontend</TabsTrigger>
          <TabsTrigger value="domains"><Lock className="w-4 h-4 mr-1" /> Domain ACL</TabsTrigger>
          <TabsTrigger value="password"><Lock className="w-4 h-4 mr-1" /> Password</TabsTrigger>
          {user?.role === "master" && (
            <TabsTrigger value="subaccounts"><Users className="w-4 h-4 mr-1" /> Sub-Accounts</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="system"><SystemSettings accessToken={accessToken!} canEdit={canEdit} /></TabsContent>
        <TabsContent value="countries"><CountrySettings accessToken={accessToken!} canEdit={canEdit} /></TabsContent>
        <TabsContent value="telegram"><TelegramSettings accessToken={accessToken!} canEdit={canEdit} /></TabsContent>
        <TabsContent value="frontend"><FrontendSettingsTab accessToken={accessToken!} canEdit={canEdit} /></TabsContent>
        <TabsContent value="domains"><DomainAclSettings accessToken={accessToken!} canEdit={canEdit} /></TabsContent>
        <TabsContent value="password"><PasswordChangeTab accessToken={accessToken!} /></TabsContent>
        {user?.role === "master" && (
          <TabsContent value="subaccounts"><SubAccountSettings accessToken={accessToken!} /></TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// ─── System Settings ───
function SystemSettings({ accessToken, canEdit }: { accessToken: string; canEdit: boolean }) {
  const settingsQuery = trpc.adminSettings.getAll.useQuery({ token: accessToken }, { enabled: !!accessToken });
  const setMutation = trpc.adminSettings.set.useMutation({
    onSuccess: () => { settingsQuery.refetch(); toast.success("Setting saved"); },
    onError: (err: any) => toast.error(err.message),
  });

  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (settingsQuery.data) {
      const obj: Record<string, string> = {};
      (settingsQuery.data as any[]).forEach((s: any) => { obj[s.settingKey] = s.settingValue || ""; });
      obj["timezone"] = normalizeLegacyTimezone(obj["timezone"]);
      setForm(obj);
    }
  }, [settingsQuery.data]);

  const SETTINGS_KEYS = [
    { key: "middlewave_token", label: "Middlewave API Token", type: "password" },
    { key: "middlewave_prefix", label: "Middlewave Player Prefix", type: "text" },
    { key: "default_language", label: "Default Language (en/zh)", type: "text" },
    { key: "min_deposit", label: "Min Deposit Amount", type: "number" },
    { key: "max_deposit", label: "Max Deposit Amount", type: "number" },
    { key: "min_withdraw", label: "Min Withdraw Amount", type: "number" },
    { key: "max_withdraw", label: "Max Withdraw Amount", type: "number" },
    { key: "default_rollover_multiplier", label: "Default Rollover Multiplier", type: "number" },
    { key: "default_turnover_target", label: "Default Turnover Target", type: "number" },
    { key: "site_name", label: "Site Name", type: "text" },
    { key: "support_link", label: "Support Link", type: "text" },
  ];

  if (settingsQuery.isLoading) return <Card><CardContent className="p-8 text-center text-muted-foreground">Loading settings...</CardContent></Card>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Settings className="w-5 h-5" /> System Configuration</CardTitle>
        <CardDescription>Core platform settings including Middlewave integration</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Timezone selector */}
        <div className="grid grid-cols-3 gap-4 items-center">
          <Label className="text-right text-sm flex items-center justify-end gap-1"><Clock className="w-4 h-4" /> Display Timezone</Label>
          <Select value={form["timezone"] || "Asia/Kuala_Lumpur"} onValueChange={v => setForm(f => ({ ...f, timezone: v }))} disabled={!canEdit}>
            <SelectTrigger className="col-span-2"><SelectValue placeholder="Select timezone" /></SelectTrigger>
            <SelectContent>
              {TIMEZONE_OPTIONS.map(tz => (
                <SelectItem key={tz.value} value={tz.value}>
                  {getTimezoneOffsetLabel(tz.value)} ({tz.city})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {SETTINGS_KEYS.map(sk => (
          <div key={sk.key} className="grid grid-cols-3 gap-4 items-center">
            <Label className="text-right text-sm">{sk.label}</Label>
            <Input
              type={sk.type}
              value={form[sk.key] || ""}
              onChange={e => setForm(f => ({ ...f, [sk.key]: e.target.value }))}
              disabled={!canEdit}
              className="col-span-2"
            />
          </div>
        ))}
        {canEdit && (
          <div className="flex justify-end gap-3 pt-4">
            <TestMiddlewaveButton accessToken={accessToken} />
            <Button onClick={() => {
              Object.entries(form).forEach(([key, value]) => {
                setMutation.mutate({ token: accessToken, key, value });
              });
            }} disabled={setMutation.isPending}>
              <Save className="w-4 h-4 mr-2" /> Save All Settings
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Country Settings ───
function CountrySettings({ accessToken, canEdit }: { accessToken: string; canEdit: boolean }) {
  const countriesQuery = trpc.adminSettings.countries.list.useQuery({ token: accessToken }, { enabled: !!accessToken });
  const saveMutation = trpc.adminSettings.countries.save.useMutation({
    onSuccess: () => { countriesQuery.refetch(); toast.success("Countries saved"); },
    onError: (err: any) => toast.error(err.message),
  });

  const [countries, setCountries] = useState<any[]>([]);

  useEffect(() => {
    if (countriesQuery.data) setCountries(countriesQuery.data as any[]);
  }, [countriesQuery.data]);

  if (countriesQuery.isLoading) return <Card><CardContent className="p-8 text-center text-muted-foreground">Loading countries...</CardContent></Card>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Globe className="w-5 h-5" /> Country Configuration</CardTitle>
        <CardDescription>Manage allowed countries and phone prefixes for registration</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Country Code</TableHead>
              <TableHead>Phone Prefix</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead>Allowed</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {countries.map((c, idx) => (
              <TableRow key={idx}>
                <TableCell>
                  <Input value={c.countryCode} onChange={e => { const u = [...countries]; u[idx] = { ...c, countryCode: e.target.value }; setCountries(u); }} placeholder="MY" className="w-20" disabled={!canEdit} />
                </TableCell>
                <TableCell>
                  <Input value={c.phonePrefix} onChange={e => { const u = [...countries]; u[idx] = { ...c, phonePrefix: e.target.value }; setCountries(u); }} placeholder="+60" className="w-24" disabled={!canEdit} />
                </TableCell>
                <TableCell>
                  <Input value={c.currency} onChange={e => { const u = [...countries]; u[idx] = { ...c, currency: e.target.value }; setCountries(u); }} placeholder="MYR" className="w-20" disabled={!canEdit} />
                </TableCell>
                <TableCell>
                  <Switch checked={c.isAllowed} onCheckedChange={v => { const u = [...countries]; u[idx] = { ...c, isAllowed: v }; setCountries(u); }} disabled={!canEdit} />
                </TableCell>
                <TableCell className="text-right">
                  {canEdit && <Button variant="ghost" size="icon" onClick={() => setCountries(p => p.filter((_, i) => i !== idx))}><Trash2 className="w-4 h-4 text-red-500" /></Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {countries.length === 0 && <p className="text-center text-muted-foreground py-4">No countries configured. Add one to restrict registration by phone prefix.</p>}
        {canEdit && (
          <div className="flex justify-between mt-4">
            <Button variant="outline" onClick={() => setCountries(p => [...p, { countryCode: "", phonePrefix: "", currency: "", isAllowed: true }])}><Plus className="w-4 h-4 mr-2" /> Add Country</Button>
            <Button onClick={() => saveMutation.mutate({ token: accessToken, countries })} disabled={saveMutation.isPending}><Save className="w-4 h-4 mr-2" /> Save Countries</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Telegram Settings ───
function TelegramSettings({ accessToken, canEdit }: { accessToken: string; canEdit: boolean }) {
  const botsQuery = trpc.adminTelegram.bots.list.useQuery({ token: accessToken }, { enabled: !!accessToken });
  const createMutation = trpc.adminTelegram.bots.create.useMutation({
    onSuccess: () => { botsQuery.refetch(); toast.success("Bot added"); setNewToken(""); setNewName(""); },
    onError: (err: any) => toast.error(err.message),
  });
  const deleteMutation = trpc.adminTelegram.bots.delete.useMutation({
    onSuccess: () => { botsQuery.refetch(); toast.success("Bot removed"); },
    onError: (err: any) => toast.error(err.message),
  });

  const [newToken, setNewToken] = useState("");
  const [newName, setNewName] = useState("");

  if (botsQuery.isLoading) return <Card><CardContent className="p-8 text-center text-muted-foreground">Loading bots...</CardContent></Card>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bot className="w-5 h-5" /> Telegram Bot Management</CardTitle>
          <CardDescription>Manage your Telegram bots for player interaction. After adding a bot, use "Test" to verify connectivity and "Diagnose" for detailed status.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bot Name</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Token (masked)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(botsQuery.data as any[])?.map((bot: any) => (
                <TableRow key={bot.id}>
                  <TableCell className="font-medium">{bot.botName || "Unnamed"}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {bot.botUsername ? (
                      <a href={`https://t.me/${bot.botUsername}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">@{bot.botUsername}</a>
                    ) : (
                      <span className="text-muted-foreground">Not verified</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {bot.botToken ? `${bot.botToken.slice(0, 8)}...${bot.botToken.slice(-4)}` : "N/A"}
                  </TableCell>
                  <TableCell>
                    <span className={`status-badge ${bot.isActive ? "status-approved" : "status-rejected"}`}>
                      {bot.isActive ? "Active" : "Inactive"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <TestTelegramButton accessToken={accessToken} botId={bot.id} onRefresh={() => botsQuery.refetch()} />
                      {canEdit && (
                        <Button variant="ghost" size="icon" onClick={() => {
                          if (confirm("Remove this bot?")) deleteMutation.mutate({ token: accessToken, botId: bot.id });
                        }}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {(botsQuery.data as any[])?.length === 0 && <p className="text-center text-muted-foreground py-4">No bots configured yet.</p>}

          {canEdit && (
            <div className="flex gap-2 items-end">
              <div className="space-y-1 flex-1">
                <Label className="text-xs">Bot Name</Label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="My Game Bot" />
              </div>
              <div className="space-y-1 flex-[2]">
                <Label className="text-xs">Bot Token</Label>
                <Input value={newToken} onChange={e => setNewToken(e.target.value)} placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz" />
              </div>
              <Button disabled={!newToken || createMutation.isPending} onClick={() => {
                createMutation.mutate({ token: accessToken, botToken: newToken, botName: newName || undefined });
              }}>
                <Plus className="w-4 h-4 mr-2" /> Add
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bot Usage Guide */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">How to use your Telegram Bot</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>1. Create a bot via <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">@BotFather</a> on Telegram and copy the token.</p>
          <p>2. Paste the token above and click "Add".</p>
          <p>3. Click "Test" to verify the bot is connected and polling.</p>
          <p>4. Open your bot on Telegram and send <code className="bg-muted px-1 rounded">/start</code> to test the registration flow.</p>
          <p>5. If the bot doesn't respond, click "Diagnose" to check for errors.</p>
          <p className="text-yellow-500/80 pt-2">Note: Each bot token can only be used by one server at a time. If you're running this bot elsewhere, stop the other instance first.</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Test Telegram Connection ───
function TestTelegramButton({ accessToken, botId, onRefresh }: { accessToken: string; botId: number; onRefresh?: () => void }) {
  const testMutation = trpc.adminTelegram.bots.testConnection.useMutation();
  const [showDiag, setShowDiag] = useState(false);
  const [diagData, setDiagData] = useState<any>(null);

  const runTest = () => {
    testMutation.mutate({ token: accessToken, botId }, {
      onSuccess: (data: any) => {
        setDiagData(data);
        if (data.success) {
          toast.success(`Connected! Bot: @${data.botInfo?.username || 'unknown'} | Polling: ${data.isPolling ? 'Active' : 'Starting...'}`);
          onRefresh?.(); // Refresh bot list to show updated username
        } else {
          toast.error(`Connection failed: ${data.error}`);
        }
      },
      onError: (err: any) => toast.error(err.message),
    });
  };

  return (
    <>
      <Button variant="outline" size="sm" disabled={testMutation.isPending} onClick={runTest}>
        {testMutation.isPending ? "Testing..." : "Test"}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => { runTest(); setShowDiag(true); }}>
        Diagnose
      </Button>

      <Dialog open={showDiag} onOpenChange={setShowDiag}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bot Diagnostics</DialogTitle>
          </DialogHeader>
          {testMutation.isPending ? (
            <div className="py-8 text-center text-muted-foreground">Running diagnostics...</div>
          ) : diagData ? (
            <div className="space-y-3 text-sm">
              {/* Connection Status */}
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${diagData.success ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="font-medium">{diagData.success ? 'Connected' : 'Connection Failed'}</span>
              </div>

              {diagData.success && diagData.botInfo && (
                <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Bot Username:</span><span className="font-mono">@{diagData.botInfo.username}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Bot ID:</span><span className="font-mono">{diagData.botInfo.id}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Polling Active:</span><span className={diagData.isPolling ? 'text-green-400' : 'text-yellow-400'}>{diagData.isPolling ? 'Yes' : 'No'}</span></div>
                </div>
              )}

              {diagData.diagnostics && (
                <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                  <p className="font-medium text-xs uppercase text-muted-foreground mb-2">Runtime Stats</p>
                  <div className="flex justify-between"><span className="text-muted-foreground">Started:</span><span>{new Date(diagData.diagnostics.startedAt).toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Messages Received:</span><span>{diagData.diagnostics.messageCount}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Last Message:</span><span>{diagData.diagnostics.lastMessageAt ? new Date(diagData.diagnostics.lastMessageAt).toLocaleString() : 'None yet'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Polling Errors:</span><span className={diagData.diagnostics.pollingErrorCount > 0 ? 'text-yellow-400' : ''}>{diagData.diagnostics.pollingErrorCount}</span></div>
                  {diagData.diagnostics.lastPollingError && (
                    <div className="mt-1"><span className="text-muted-foreground">Last Error:</span><p className="text-xs text-red-400 font-mono mt-1 break-all">{diagData.diagnostics.lastPollingError}</p></div>
                  )}
                </div>
              )}

              {diagData.webhookInfo && (
                <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                  <p className="font-medium text-xs uppercase text-muted-foreground mb-2">Webhook Info</p>
                  <div className="flex justify-between"><span className="text-muted-foreground">Webhook URL:</span><span className="font-mono text-xs">{diagData.webhookInfo.url || '(none - good for polling)'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Pending Updates:</span><span>{diagData.webhookInfo.pendingUpdateCount}</span></div>
                </div>
              )}

              {!diagData.success && diagData.error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  <p className="text-red-400 font-mono text-xs break-all">{diagData.error}</p>
                </div>
              )}

              {/* Send Test Message */}
              {diagData.success && (
                <SendTestMessageSection accessToken={accessToken} botId={botId} />
              )}

              {/* Troubleshooting tips */}
              <div className="border-t border-border pt-3 space-y-1">
                <p className="font-medium text-xs uppercase text-muted-foreground">Troubleshooting</p>
                <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                  <li>If "Messages Received" is 0, try sending /start to the bot on Telegram</li>
                  <li>If polling errors show 409, another instance may be using this token</li>
                  <li>If webhook URL is set, the bot may be in webhook mode (not polling)</li>
                  <li>Make sure the bot token is from @BotFather and not revoked</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">Click "Diagnose" to run diagnostics</div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Send Test Message ───
function SendTestMessageSection({ accessToken, botId }: { accessToken: string; botId: number }) {
  const sendMutation = trpc.adminTelegram.bots.sendTestMessage.useMutation();
  const [chatId, setChatId] = useState("");

  return (
    <div className="border-t border-border pt-3 space-y-2">
      <p className="font-medium text-xs uppercase text-muted-foreground">Send Test Message</p>
      <p className="text-xs text-muted-foreground">Enter a Telegram Chat ID to send a test message. You can find your Chat ID by sending /start to the bot and checking the server logs.</p>
      <div className="flex gap-2">
        <Input
          value={chatId}
          onChange={e => setChatId(e.target.value)}
          placeholder="Chat ID (e.g. 123456789)"
          className="text-sm"
        />
        <Button
          size="sm"
          disabled={!chatId || sendMutation.isPending}
          onClick={() => {
            sendMutation.mutate({ token: accessToken, botId, chatId }, {
              onSuccess: (data: any) => {
                if (data.success) {
                  toast.success("Test message sent successfully!");
                } else {
                  toast.error(`Failed: ${data.error}`);
                }
              },
              onError: (err: any) => toast.error(err.message),
            });
          }}
        >
          {sendMutation.isPending ? "Sending..." : "Send"}
        </Button>
      </div>
    </div>
  );
}

// ─── Test Middlewave Connection ───
function TestMiddlewaveButton({ accessToken }: { accessToken: string }) {
  const testMutation = trpc.adminSettings.testMiddlewave.useMutation();
  return (
    <Button
      variant="outline"
      disabled={testMutation.isPending}
      onClick={() => {
        testMutation.mutate({ token: accessToken }, {
          onSuccess: (data: any) => {
            if (data.success) {
              toast.success(data.message);
              if (data.sampleGames?.length > 0) {
                toast.info(`Sample games: ${data.sampleGames.map((g: any) => g.name).join(', ')}`);
              }
            } else {
              toast.error(data.error);
            }
          },
          onError: (err: any) => toast.error(err.message),
        });
      }}
    >
      {testMutation.isPending ? "Testing Middlewave..." : "Test Middlewave Connection"}
    </Button>
  );
}

// ─── Frontend Settings ───
function FrontendSettingsTab({ accessToken, canEdit }: { accessToken: string; canEdit: boolean }) {
  const settingsQuery = trpc.adminFrontend.get.useQuery({ token: accessToken }, { enabled: !!accessToken });
  const saveMutation = trpc.adminFrontend.save.useMutation({
    onSuccess: () => { settingsQuery.refetch(); toast.success("Frontend settings saved"); },
    onError: (err: any) => toast.error(err.message),
  });

  const [form, setForm] = useState({
    templateId: "default",
    primaryColor: "",
    siteName: "",
    logoUrl: "",
    faviconUrl: "",
    footerText: "",
    customCss: "",
    customHeadHtml: "",
    customBodyJs: "",
  });

  useEffect(() => {
    if (settingsQuery.data) {
      const d = settingsQuery.data as any;
      setForm({
        templateId: d.templateId || "default",
        primaryColor: d.primaryColor || "",
        siteName: d.siteName || "",
        logoUrl: d.logoUrl || "",
        faviconUrl: d.faviconUrl || "",
        footerText: d.footerText || "",
        customCss: d.customCss || "",
        customHeadHtml: d.customHeadHtml || "",
        customBodyJs: d.customBodyJs || "",
      });
    }
  }, [settingsQuery.data]);

  if (settingsQuery.isLoading) return <Card><CardContent className="p-8 text-center text-muted-foreground">Loading frontend settings...</CardContent></Card>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Palette className="w-5 h-5" /> Branding & Theme</CardTitle>
          <CardDescription>Customize the player-facing frontend appearance</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Template</Label>
              <Select value={form.templateId} onValueChange={v => setForm(f => ({ ...f, templateId: v }))} disabled={!canEdit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default (Dark Gaming)</SelectItem>
                  <SelectItem value="classic">Classic</SelectItem>
                  <SelectItem value="modern">Modern</SelectItem>
                  <SelectItem value="minimal">Minimal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Primary Color</Label>
              <div className="flex gap-2">
                <Input type="color" value={form.primaryColor || "#6366f1"} onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))} className="w-12 h-10 p-1" disabled={!canEdit} />
                <Input value={form.primaryColor} onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))} placeholder="#6366f1" disabled={!canEdit} />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Site Name</Label>
              <Input value={form.siteName} onChange={e => setForm(f => ({ ...f, siteName: e.target.value }))} placeholder="My Gaming Platform" disabled={!canEdit} />
            </div>
            <div className="space-y-2">
              <Label>Footer Text</Label>
              <Input value={form.footerText} onChange={e => setForm(f => ({ ...f, footerText: e.target.value }))} placeholder="© 2025 My Platform" disabled={!canEdit} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Logo URL</Label>
              <Input value={form.logoUrl} onChange={e => setForm(f => ({ ...f, logoUrl: e.target.value }))} placeholder="https://..." disabled={!canEdit} />
            </div>
            <div className="space-y-2">
              <Label>Favicon URL</Label>
              <Input value={form.faviconUrl} onChange={e => setForm(f => ({ ...f, faviconUrl: e.target.value }))} placeholder="https://..." disabled={!canEdit} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Custom Code Injection</CardTitle>
          <CardDescription>Inject custom CSS, HTML head, and JavaScript into the player frontend</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Custom CSS</Label>
            <Textarea value={form.customCss} onChange={e => setForm(f => ({ ...f, customCss: e.target.value }))} placeholder=".my-class { color: red; }" rows={4} className="font-mono text-sm" disabled={!canEdit} />
          </div>
          <div className="space-y-2">
            <Label>Custom Head HTML</Label>
            <Textarea value={form.customHeadHtml} onChange={e => setForm(f => ({ ...f, customHeadHtml: e.target.value }))} placeholder='<meta name="..." content="...">' rows={3} className="font-mono text-sm" disabled={!canEdit} />
          </div>
          <div className="space-y-2">
            <Label>Custom Body JavaScript</Label>
            <Textarea value={form.customBodyJs} onChange={e => setForm(f => ({ ...f, customBodyJs: e.target.value }))} placeholder="console.log('loaded');" rows={3} className="font-mono text-sm" disabled={!canEdit} />
          </div>
        </CardContent>
      </Card>

      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={() => saveMutation.mutate({ token: accessToken, ...form })} disabled={saveMutation.isPending}>
            <Save className="w-4 h-4 mr-2" /> Save Frontend Settings
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Domain ACL ───
function DomainAclSettings({ accessToken, canEdit }: { accessToken: string; canEdit: boolean }) {
  const domainsQuery = trpc.adminDomainAcl.list.useQuery({ token: accessToken }, { enabled: !!accessToken });
  const addMutation = trpc.adminDomainAcl.add.useMutation({
    onSuccess: () => { domainsQuery.refetch(); toast.success("Domain added"); setNewDomain(""); },
    onError: (err: any) => toast.error(err.message),
  });
  const updateMutation = trpc.adminDomainAcl.update.useMutation({
    onSuccess: () => { domainsQuery.refetch(); toast.success("Domain updated"); },
    onError: (err: any) => toast.error(err.message),
  });
  const deleteMutation = trpc.adminDomainAcl.delete.useMutation({
    onSuccess: () => { domainsQuery.refetch(); toast.success("Domain removed"); },
    onError: (err: any) => toast.error(err.message),
  });

  const [newDomain, setNewDomain] = useState("");
  const [newPurpose, setNewPurpose] = useState<"admin" | "player" | "both">("both");

  if (domainsQuery.isLoading) return <Card><CardContent className="p-8 text-center text-muted-foreground">Loading domains...</CardContent></Card>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Lock className="w-5 h-5" /> Domain Access Control</CardTitle>
        <CardDescription>Restrict which domains can access admin panel and player frontend. If no domains are configured, all domains are allowed.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Domain</TableHead>
              <TableHead>Purpose</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(domainsQuery.data as any[])?.map((d: any) => (
              <TableRow key={d.id}>
                <TableCell className="font-mono">{d.domain}</TableCell>
                <TableCell>
                  <Select value={d.purpose} onValueChange={v => updateMutation.mutate({ token: accessToken, id: d.id, purpose: v as any })} disabled={!canEdit}>
                    <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="player">Player</SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Switch checked={d.isActive} onCheckedChange={v => updateMutation.mutate({ token: accessToken, id: d.id, isActive: v })} disabled={!canEdit} />
                </TableCell>
                <TableCell className="text-right">
                  {canEdit && (
                    <Button variant="ghost" size="icon" onClick={() => {
                      if (confirm("Remove this domain?")) deleteMutation.mutate({ token: accessToken, id: d.id });
                    }}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {(domainsQuery.data as any[])?.length === 0 && <p className="text-center text-muted-foreground py-4">No domain restrictions configured. All domains are currently allowed.</p>}

        {canEdit && (
          <div className="flex gap-2 items-end">
            <div className="space-y-1 flex-[2]">
              <Label className="text-xs">Domain</Label>
              <Input value={newDomain} onChange={e => setNewDomain(e.target.value)} placeholder="admin.example.com" />
            </div>
            <div className="space-y-1 flex-1">
              <Label className="text-xs">Purpose</Label>
              <Select value={newPurpose} onValueChange={v => setNewPurpose(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="player">Player</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button disabled={!newDomain || addMutation.isPending} onClick={() => {
              addMutation.mutate({ token: accessToken, domain: newDomain, purpose: newPurpose });
            }}>
              <Plus className="w-4 h-4 mr-2" /> Add
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Sub-Account Settings ───
function SubAccountSettings({ accessToken }: { accessToken: string }) {
  const subsQuery = trpc.adminSubAccounts.list.useQuery({ token: accessToken }, { enabled: !!accessToken });
  const updatePermsMutation = trpc.adminSubAccounts.updatePermissions.useMutation({
    onSuccess: () => { subsQuery.refetch(); toast.success("Permissions updated"); },
    onError: (err: any) => toast.error(err.message),
  });
  const toggleMutation = trpc.adminSubAccounts.toggleActive.useMutation({
    onSuccess: () => { subsQuery.refetch(); toast.success("Status updated"); },
    onError: (err: any) => toast.error(err.message),
  });

  const [editingSub, setEditingSub] = useState<any>(null);
  const [perms, setPerms] = useState<Record<string, { canView: boolean; canEdit: boolean; canDelete: boolean }>>({});

  const openPermEditor = (sub: any) => {
    setEditingSub(sub);
    const p: Record<string, { canView: boolean; canEdit: boolean; canDelete: boolean }> = {};
    MODULES.forEach(m => {
      const existing = sub.permissions?.find((pp: any) => pp.module === m);
      p[m] = existing ? { canView: existing.canView, canEdit: existing.canEdit, canDelete: existing.canDelete } : { canView: false, canEdit: false, canDelete: false };
    });
    setPerms(p);
  };

  const savePerms = () => {
    if (!editingSub) return;
    const permissions = Object.entries(perms).map(([module, p]) => ({ module, ...p }));
    updatePermsMutation.mutate({ token: accessToken, subAccountId: editingSub.id, permissions });
    setEditingSub(null);
  };

  if (subsQuery.isLoading) return <Card><CardContent className="p-8 text-center text-muted-foreground">Loading sub-accounts...</CardContent></Card>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5" /> Sub-Account Management</CardTitle>
        <CardDescription>Manage sub-accounts and their module-level permissions</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead>Display Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(subsQuery.data as any[])?.map((sub: any) => (
              <TableRow key={sub.id}>
                <TableCell className="font-mono">{sub.username}</TableCell>
                <TableCell>{sub.displayName || sub.username}</TableCell>
                <TableCell>
                  <span className={`status-badge ${sub.isActive ? "status-approved" : "status-rejected"}`}>
                    {sub.isActive ? "Active" : "Inactive"}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openPermEditor(sub)}>
                      <Shield className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => toggleMutation.mutate({ token: accessToken, subAccountId: sub.id, isActive: !sub.isActive })}>
                      {sub.isActive ? <Eye className="w-4 h-4 text-red-500" /> : <Eye className="w-4 h-4 text-green-500" />}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {(subsQuery.data as any[])?.length === 0 && <p className="text-center text-muted-foreground py-4">No sub-accounts found. Create one via the admin auth API.</p>}

        <Dialog open={!!editingSub} onOpenChange={(open) => { if (!open) setEditingSub(null); }}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Permissions for {editingSub?.username}</DialogTitle>
            </DialogHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Module</TableHead>
                  <TableHead className="text-center">View</TableHead>
                  <TableHead className="text-center">Edit</TableHead>
                  <TableHead className="text-center">Delete</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {MODULES.map(m => (
                  <TableRow key={m}>
                    <TableCell className="capitalize font-medium">{m}</TableCell>
                    <TableCell className="text-center">
                      <Checkbox checked={perms[m]?.canView || false} onCheckedChange={(v) => setPerms(p => ({ ...p, [m]: { ...p[m], canView: !!v } }))} />
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox checked={perms[m]?.canEdit || false} onCheckedChange={(v) => setPerms(p => ({ ...p, [m]: { ...p[m], canEdit: !!v } }))} />
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox checked={perms[m]?.canDelete || false} onCheckedChange={(v) => setPerms(p => ({ ...p, [m]: { ...p[m], canDelete: !!v } }))} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditingSub(null)}>Cancel</Button>
              <Button onClick={savePerms} disabled={updatePermsMutation.isPending}><Save className="w-4 h-4 mr-2" /> Save Permissions</Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// ─── Password Change ───
function PasswordChangeTab({ accessToken }: { accessToken: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const changeMutation = trpc.adminAuth.changePassword.useMutation({
    onSuccess: () => {
      toast.success("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleSubmit = () => {
    if (!currentPassword || !newPassword) {
      toast.error("Please fill in all fields");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    changeMutation.mutate({ token: accessToken, currentPassword, newPassword });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Lock className="w-5 h-5" /> Change Password</CardTitle>
        <CardDescription>Update your admin account password</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 max-w-md">
        <div className="space-y-2">
          <Label>Current Password</Label>
          <Input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="Enter current password" />
        </div>
        <div className="space-y-2">
          <Label>New Password</Label>
          <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Enter new password (min 6 chars)" />
        </div>
        <div className="space-y-2">
          <Label>Confirm New Password</Label>
          <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm new password" />
        </div>
        <Button onClick={handleSubmit} disabled={changeMutation.isPending}>
          <Save className="w-4 h-4 mr-2" />
          {changeMutation.isPending ? "Changing..." : "Change Password"}
        </Button>
      </CardContent>
    </Card>
  );
}
