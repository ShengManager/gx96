import { useState, useEffect } from "react";
import { usePlayerAuth } from "@/contexts/PlayerAuthContext";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Gamepad2, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export default function PlayerLogin() {
  const { login, isAuthenticated } = usePlayerAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const [loading, setLoading] = useState(false);
  const [autoLoginLoading, setAutoLoginLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  // Login form
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

  // Handle auto-login token from Telegram
  useEffect(() => {
    const params = new URLSearchParams(search);
    const token = params.get("token");
    if (token && !isAuthenticated) {
      handleAutoLogin(token);
    }
  }, [search]);

  const handleAutoLogin = async (token: string) => {
    setAutoLoginLoading(true);
    try {
      const params = new URLSearchParams(search);
      const redirect = params.get("redirect") || "/";
      const safeRedirect = redirect.startsWith("/") ? redirect : "/";
      const res = await fetch(`/api/player/auto-login?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (res.ok && data.accessToken) {
        login(data.accessToken, data.refreshToken, data.player);
        toast.success("Welcome back!");
        setLocation(safeRedirect);
      } else {
        toast.error(data.error || "Auto-login failed. Please login manually.");
      }
    } catch (err: any) {
      toast.error("Auto-login failed. Please login manually.");
    }
    setAutoLoginLoading(false);
  };

  const handleLogin = async () => {
    if (!loginForm.username.trim()) { toast.error("Username is required"); return; }
    if (!loginForm.password) { toast.error("Password is required"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/trpc/adminAuth.playerLogin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: loginForm }),
      });
      const data = await res.json();
      if (data?.result?.data?.json?.accessToken) {
        const result = data.result.data.json;
        login(result.accessToken, result.refreshToken, result.player);
        toast.success("Login successful!");
        setLocation("/");
      } else {
        const errMsg = data?.error?.json?.message || data?.error?.message || "Invalid username or password";
        toast.error(errMsg);
      }
    } catch (err: any) {
      toast.error("Network error. Please try again.");
    }
    setLoading(false);
  };

  // Show loading spinner during auto-login
  if (autoLoginLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Logging you in...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl gaming-gradient flex items-center justify-center mx-auto mb-3">
            <Gamepad2 className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-2xl font-bold">TgGaming</h1>
          <p className="text-muted-foreground text-sm mt-1">Your premium gaming platform</p>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <p className="text-sm text-muted-foreground">
              Registration is only available via Telegram bot.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Username</Label>
              <Input
                value={loginForm.username}
                onChange={e => setLoginForm(f => ({ ...f, username: e.target.value }))}
                placeholder="Enter username"
                onKeyDown={e => e.key === "Enter" && handleLogin()}
              />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"}
                  value={loginForm.password}
                  onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Enter password"
                  onKeyDown={e => e.key === "Enter" && handleLogin()}
                />
                <Button variant="ghost" size="icon" className="absolute right-0 top-0 h-full" onClick={() => setShowPw(!showPw)}>
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            <Button className="w-full gaming-gradient text-white" disabled={loading} onClick={handleLogin}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Login
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
