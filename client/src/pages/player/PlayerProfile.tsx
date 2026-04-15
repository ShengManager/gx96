import { useState, useEffect } from "react";
import { usePlayerAuth } from "@/contexts/PlayerAuthContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "wouter";
import {
  User, Copy, LogOut, Save, Share2, Loader2,
  Building2, ChevronRight, History, Gift, Shield,
  Phone, Crown, Globe,
} from "lucide-react";
import { toast } from "sonner";

export default function PlayerProfile() {
  const { accessToken, isAuthenticated, user, logout } = usePlayerAuth();

  const meQuery = trpc.player.me.useQuery(undefined, { enabled: !!accessToken });
  const inviteQuery = trpc.player.inviteInfo.useQuery({ token: accessToken || "" }, { enabled: !!accessToken });
  const updateMutation = trpc.player.updateProfile.useMutation({
    onSuccess: () => toast.success("Bank info saved!"),
    onError: (err: any) => toast.error(err.message),
  });

  const playerData = (meQuery.data as any)?.player;

  const [form, setForm] = useState({
    bankName: "",
    bankAccountName: "",
    bankAccountNumber: "",
  });

  const [showBankEdit, setShowBankEdit] = useState(false);

  useEffect(() => {
    if (playerData) {
      setForm({
        bankName: playerData.bankName || "",
        bankAccountName: playerData.bankAccountName || "",
        bankAccountNumber: playerData.bankAccountNumber || "",
      });
    }
  }, [playerData]);

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <User className="w-10 h-10 text-primary" />
        </div>
        <h2 className="text-xl font-bold mb-2">Login Required</h2>
        <p className="text-muted-foreground text-sm mb-4">Please login to view your profile</p>
        <Link href="/login"><Button className="rounded-full px-8">Login Now</Button></Link>
      </div>
    );
  }

  const inviteCode = (inviteQuery.data as any)?.inviteCode;

  const copyInvite = () => {
    if (inviteCode) {
      navigator.clipboard.writeText(inviteCode);
      toast.success("Invite code copied!");
    }
  };

  return (
    <div className="space-y-4 pt-4 pb-4">
      {/* Profile Header */}
      <div className="px-4">
        <Card className="overflow-hidden border-0">
          <div className="relative overflow-hidden" style={{
            background: "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
          }}>
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 -translate-y-8 translate-x-8" />
            <div className="absolute bottom-0 left-0 w-20 h-20 rounded-full bg-white/5 translate-y-6 -translate-x-6" />
            <div className="relative z-10 p-5">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <User className="w-8 h-8 text-white" />
                </div>
                <div className="text-white flex-1 min-w-0">
                  <p className="font-bold text-lg truncate">
                    {playerData?.displayName || playerData?.username || user?.username || "Player"}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Phone className="w-3 h-3 text-white/70" />
                    <p className="text-sm text-white/80">{playerData?.phone || user?.phone || "N/A"}</p>
                  </div>
                  <div className="flex gap-1.5 mt-2">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/20 text-white flex items-center gap-1">
                      <Crown className="w-3 h-3" /> VIP {playerData?.vipLevel || 0}
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-500/30 text-white">
                      {playerData?.status || "active"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Invite Code Card */}
      {inviteCode && (
        <div className="px-4">
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Share2 className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">Your Invite Code</p>
                  <p className="text-xl font-mono font-bold text-primary tracking-wider">{inviteCode}</p>
                </div>
                <div className="flex gap-1.5">
                  <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={copyInvite}>
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button size="icon" className="h-9 w-9 rounded-xl" onClick={() => {
                    if (navigator.share) {
                      navigator.share({ title: "Join TgGaming", text: `Use my invite code: ${inviteCode}` });
                    } else copyInvite();
                  }}>
                    <Share2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Quick Links */}
      <div className="px-4 space-y-1.5">
        <Link href="/history">
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardContent className="py-3.5 px-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <History className="w-4.5 h-4.5 text-blue-500" />
              </div>
              <span className="font-medium text-sm flex-1">Transaction History</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>

        <Link href="/bonus">
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardContent className="py-3.5 px-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Gift className="w-4.5 h-4.5 text-amber-500" />
              </div>
              <span className="font-medium text-sm flex-1">My Bonuses</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>

        {/* Bank Info Toggle */}
        <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setShowBankEdit(!showBankEdit)}>
          <CardContent className="py-3.5 px-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-green-500/10 flex items-center justify-center">
              <Building2 className="w-4.5 h-4.5 text-green-500" />
            </div>
            <div className="flex-1">
              <span className="font-medium text-sm">Bank Information</span>
              {form.bankName && (
                <p className="text-[11px] text-muted-foreground">{form.bankName} - {form.bankAccountNumber}</p>
              )}
            </div>
            <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${showBankEdit ? "rotate-90" : ""}`} />
          </CardContent>
        </Card>
      </div>

      {/* Bank Edit Form */}
      {showBankEdit && (
        <div className="px-4">
          <Card>
            <CardContent className="pt-5 space-y-3">
              <div className="space-y-2">
                <Label className="text-xs">Bank Name</Label>
                <Input
                  value={form.bankName}
                  onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))}
                  placeholder="e.g. Maybank"
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Account Name</Label>
                <Input
                  value={form.bankAccountName}
                  onChange={e => setForm(f => ({ ...f, bankAccountName: e.target.value }))}
                  placeholder="Full name on account"
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Account Number</Label>
                <Input
                  value={form.bankAccountNumber}
                  onChange={e => setForm(f => ({ ...f, bankAccountNumber: e.target.value }))}
                  placeholder="Account number"
                  className="h-10"
                />
              </div>
              <Button
                className="w-full h-11 rounded-xl"
                disabled={updateMutation.isPending}
                onClick={() => updateMutation.mutate({ token: accessToken!, ...form })}
              >
                {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Save Bank Info
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Logout */}
      <div className="px-4 pt-4">
        <Button
          variant="ghost"
          className="w-full h-11 rounded-xl text-red-500 hover:text-red-600 hover:bg-red-500/10"
          onClick={logout}
        >
          <LogOut className="w-4 h-4 mr-2" /> Logout
        </Button>
      </div>
    </div>
  );
}
