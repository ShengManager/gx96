import { useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Shield, Loader2, LogOut, KeyRound } from "lucide-react";

const TOKEN_KEY = "topadmin_token";

const CURRENCY_PRESET: Record<string, { timezone: string; countryCode: string; phonePrefix: string }> = {
  MYR: { timezone: "8", countryCode: "MY", phonePrefix: "+60" },
  AUD: { timezone: "10", countryCode: "AU", phonePrefix: "+61" },
  SGD: { timezone: "8", countryCode: "SG", phonePrefix: "+65" },
  THB: { timezone: "7", countryCode: "TH", phonePrefix: "+66" },
  USD: { timezone: "0", countryCode: "US", phonePrefix: "+1" },
};

function buildRandomPassword(length = 14) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export default function TopAdminPage() {
  const [token, setToken] = useState<string>(() => localStorage.getItem(TOKEN_KEY) || "");
  const [topUser, setTopUser] = useState("");
  const [topPass, setTopPass] = useState("");

  const [masterUsername, setMasterUsername] = useState("Topadmin0018");
  const [masterPassword, setMasterPassword] = useState(buildRandomPassword());
  const [displayName, setDisplayName] = useState("Topadmin0018");
  const [adminDomain, setAdminDomain] = useState("megah5.gx96.net");
  const [playerDomain, setPlayerDomain] = useState("front.gx96.net");
  const [siteName, setSiteName] = useState("MegaH5");
  const [currency, setCurrency] = useState("MYR");
  const [countryCode, setCountryCode] = useState("MY");
  const [phonePrefix, setPhonePrefix] = useState("+60");
  const [timezone, setTimezone] = useState("8");
  const [defaultLanguage, setDefaultLanguage] = useState("zh");

  const [created, setCreated] = useState<{ adminId: number; masterUsername: string; masterPassword: string } | null>(null);

  const loginMutation = trpc.topAdmin.login.useMutation({
    onSuccess: (res) => {
      localStorage.setItem(TOKEN_KEY, res.token);
      setToken(res.token);
      toast.success("TopAdmin 登录成功");
    },
    onError: (err) => toast.error(err.message),
  });

  const createMutation = trpc.topAdmin.createMasterTenant.useMutation({
    onSuccess: (res) => {
      setCreated({
        adminId: res.adminId,
        masterUsername: res.masterUsername,
        masterPassword,
      });
      toast.success("后台创建成功");
    },
    onError: (err) => toast.error(err.message),
  });

  const suggestedTimezoneLabel = useMemo(() => `UTC${Number(timezone) >= 0 ? "+" : ""}${timezone}`, [timezone]);

  const applyCurrencyPreset = (value: string) => {
    const c = value.toUpperCase();
    setCurrency(c);
    const preset = CURRENCY_PRESET[c];
    if (!preset) return;
    setTimezone(preset.timezone);
    setCountryCode(preset.countryCode);
    setPhonePrefix(preset.phonePrefix);
  };

  const handleCreate = () => {
    createMutation.mutate({
      token,
      masterUsername,
      masterPassword,
      displayName,
      adminDomain,
      playerDomain,
      siteName,
      currency,
      countryCode,
      phonePrefix,
      timezone,
      defaultLanguage,
    });
  };

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setCreated(null);
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" /> TopAdmin Login
            </CardTitle>
            <CardDescription>Use TopAdmin credentials from .env</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Username</Label>
              <Input value={topUser} onChange={(e) => setTopUser(e.target.value)} placeholder="TOPADMIN_USERNAME" />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input type="password" value={topPass} onChange={(e) => setTopPass(e.target.value)} placeholder="TOPADMIN_PASSWORD" />
            </div>
            <Button
              className="w-full"
              onClick={() => loginMutation.mutate({ username: topUser.trim(), password: topPass })}
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="mx-auto max-w-3xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2"><KeyRound className="w-5 h-5" /> TopAdmin Provision Center</span>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="w-4 h-4 mr-1" /> Logout
              </Button>
            </CardTitle>
            <CardDescription>
              This page will create: master account + domain ACL + system settings + country/currency rules.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Master Username</Label>
              <Input value={masterUsername} onChange={(e) => setMasterUsername(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Master Password</Label>
              <div className="flex gap-2">
                <Input value={masterPassword} onChange={(e) => setMasterPassword(e.target.value)} />
                <Button type="button" variant="outline" onClick={() => setMasterPassword(buildRandomPassword())}>生成</Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Display Name</Label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Site Name</Label>
              <Input value={siteName} onChange={(e) => setSiteName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Admin Domain</Label>
              <Input value={adminDomain} onChange={(e) => setAdminDomain(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Player Domain</Label>
              <Input value={playerDomain} onChange={(e) => setPlayerDomain(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Input value={currency} onChange={(e) => applyCurrencyPreset(e.target.value)} placeholder="MYR / AUD / SGD..." />
            </div>
            <div className="space-y-2">
              <Label>Timezone Offset (hour)</Label>
              <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="8" />
              <p className="text-xs text-muted-foreground">Current: {suggestedTimezoneLabel}</p>
            </div>
            <div className="space-y-2">
              <Label>Country Code</Label>
              <Input value={countryCode} onChange={(e) => setCountryCode(e.target.value)} placeholder="MY" />
            </div>
            <div className="space-y-2">
              <Label>Phone Prefix</Label>
              <Input value={phonePrefix} onChange={(e) => setPhonePrefix(e.target.value)} placeholder="+60" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Default Language</Label>
              <Input value={defaultLanguage} onChange={(e) => setDefaultLanguage(e.target.value)} placeholder="zh / en" />
            </div>
            <div className="md:col-span-2">
              <Button className="w-full" onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create Master Tenant
              </Button>
            </div>
          </CardContent>
        </Card>

        {created && (
          <Card>
            <CardHeader>
              <CardTitle>创建完成</CardTitle>
              <CardDescription>请立即保存以下主后台账号信息。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><strong>Admin ID:</strong> {created.adminId}</p>
              <p><strong>Master Username:</strong> {created.masterUsername}</p>
              <p><strong>Master Password:</strong> {created.masterPassword}</p>
              <p><strong>Admin URL:</strong> https://{adminDomain}</p>
              <p><strong>Player URL:</strong> https://{playerDomain}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

