import { useState } from "react";
import { usePlayerAuth } from "@/contexts/PlayerAuthContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  ArrowDownCircle, Upload, Loader2, AlertCircle, CheckCircle,
  ChevronRight, Building2, DollarSign, Camera, ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";

const QUICK_AMOUNTS = [50, 100, 200, 500, 1000, 2000];

export default function PlayerDeposit() {
  const { accessToken, isAuthenticated, refreshBalance } = usePlayerAuth();
  const [step, setStep] = useState(1); // 1=amount, 2=bank, 3=receipt, 4=confirm
  const [amount, setAmount] = useState("");
  const [selectedBank, setSelectedBank] = useState<any>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);

  const checkQuery = trpc.player.depositCheck.useQuery(
    { token: accessToken || "" },
    { enabled: !!accessToken }
  );

  const createMutation = trpc.player.createDeposit.useMutation({
    onSuccess: () => {
      toast.success("Deposit submitted successfully!");
      setAmount(""); setSelectedBank(null); setReceiptFile(null); setReceiptPreview(null); setStep(1);
      checkQuery.refetch();
      refreshBalance();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const historyQuery = trpc.player.depositHistory.useQuery(
    { token: accessToken || "" },
    { enabled: !!accessToken }
  );

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
          <ArrowDownCircle className="w-10 h-10 text-green-500" />
        </div>
        <h2 className="text-xl font-bold mb-2">Login Required</h2>
        <p className="text-muted-foreground text-sm mb-4">Please login to make a deposit</p>
        <Link href="/login"><Button className="rounded-full px-8">Login Now</Button></Link>
      </div>
    );
  }

  const checkData = checkQuery.data as any;
  const banks = checkData?.banks || [];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReceiptFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setReceiptPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    if (!amount || !selectedBank) { toast.error("Please complete all steps"); return; }

    let receiptUrl: string | undefined;
    if (receiptFile) {
      const formData = new FormData();
      formData.append("file", receiptFile);
      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: formData,
        });
        const data = await res.json();
        receiptUrl = data.url;
      } catch {
        toast.error("Failed to upload receipt");
        return;
      }
    }

    createMutation.mutate({
      token: accessToken!,
      amount: parseFloat(amount),
      bankId: selectedBank.id,
      receiptUrl,
    });
  };

  // Cannot deposit warning
  if (checkData && !checkData.canDeposit) {
    return (
      <div className="space-y-4 px-4 pt-4">
        <h2 className="text-xl font-bold">Deposit</h2>
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="pt-6 pb-6 flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center">
              <AlertCircle className="w-7 h-7 text-amber-500" />
            </div>
            <div>
              <p className="font-semibold">Cannot Deposit Right Now</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                {checkData.reason || "You have an active deposit cycle. Please complete your current cycle or withdraw first."}
              </p>
            </div>
            <Link href="/withdraw">
              <Button variant="outline" size="sm" className="mt-2">Go to Withdraw</Button>
            </Link>
          </CardContent>
        </Card>
        <RecentDeposits deposits={(historyQuery.data as any[]) || []} />
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 pt-4 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Deposit</h2>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className={`w-2 h-2 rounded-full transition-colors ${s <= step ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>
      </div>

      {/* Step 1: Amount */}
      {step === 1 && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="text-center mb-2">
              <DollarSign className="w-8 h-8 text-primary mx-auto mb-2" />
              <p className="font-semibold">Enter Amount</p>
              <p className="text-xs text-muted-foreground">Select or enter your deposit amount</p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {QUICK_AMOUNTS.map(a => (
                <button
                  key={a}
                  onClick={() => setAmount(a.toString())}
                  className={`py-3 rounded-xl text-sm font-semibold transition-all ${
                    amount === a.toString()
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                      : "bg-card border border-white/10 text-foreground hover:border-primary/30"
                  }`}
                >
                  {a.toLocaleString()}
                </button>
              ))}
            </div>

            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">MYR</span>
              <Input
                type="number"
                placeholder="Custom amount"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="pl-14 text-lg font-semibold h-12"
              />
            </div>

            <Button
              className="w-full h-11 rounded-xl"
              disabled={!amount || parseFloat(amount) <= 0}
              onClick={() => setStep(2)}
            >
              Continue <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Select Bank */}
      {step === 2 && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <button onClick={() => setStep(1)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <div className="text-center mb-2">
              <Building2 className="w-8 h-8 text-primary mx-auto mb-2" />
              <p className="font-semibold">Select Bank</p>
              <p className="text-xs text-muted-foreground">Transfer MYR {parseFloat(amount).toLocaleString()} to one of these accounts</p>
            </div>

            <div className="space-y-2">
              {banks.map((bank: any) => (
                <button
                  key={bank.id}
                  onClick={() => { setSelectedBank(bank); setStep(3); }}
                  className={`w-full p-4 rounded-xl border text-left transition-all flex items-center gap-3 ${
                    selectedBank?.id === bank.id
                      ? "border-primary bg-primary/5"
                      : "border-white/10 bg-card hover:border-white/20"
                  }`}
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{bank.bankName}</p>
                    <p className="text-xs text-muted-foreground font-mono">{bank.accountNumber}</p>
                    {bank.accountName && <p className="text-xs text-muted-foreground">{bank.accountName}</p>}
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </button>
              ))}
              {banks.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-6">No bank accounts available. Please contact support.</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Upload Receipt */}
      {step === 3 && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <button onClick={() => setStep(2)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <div className="text-center mb-2">
              <Camera className="w-8 h-8 text-primary mx-auto mb-2" />
              <p className="font-semibold">Upload Receipt</p>
              <p className="text-xs text-muted-foreground">Upload your transfer receipt for faster processing</p>
            </div>

            {/* Transfer info summary */}
            <div className="p-3 rounded-xl bg-muted/50 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-semibold">MYR {parseFloat(amount).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Bank</span>
                <span className="font-medium">{selectedBank?.bankName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Account</span>
                <span className="font-mono text-xs">{selectedBank?.accountNumber}</span>
              </div>
            </div>

            <div
              className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => document.getElementById("receipt-input")?.click()}
            >
              {receiptPreview ? (
                <div className="space-y-2">
                  <img src={receiptPreview} alt="Receipt" className="max-h-40 mx-auto rounded-lg" />
                  <p className="text-xs text-muted-foreground">{receiptFile?.name}</p>
                  <p className="text-xs text-primary">Tap to change</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Upload className="w-6 h-6 text-primary" />
                  </div>
                  <p className="text-sm font-medium">Tap to upload receipt</p>
                  <p className="text-xs text-muted-foreground">JPG, PNG up to 5MB</p>
                </div>
              )}
            </div>
            <input id="receipt-input" type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 h-11 rounded-xl" onClick={() => setStep(4)}>
                Skip
              </Button>
              <Button className="flex-1 h-11 rounded-xl" onClick={() => setStep(4)} disabled={!receiptFile}>
                Continue <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Confirm */}
      {step === 4 && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <button onClick={() => setStep(3)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <div className="text-center mb-2">
              <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <p className="font-semibold">Confirm Deposit</p>
              <p className="text-xs text-muted-foreground">Please review your deposit details</p>
            </div>

            <div className="p-4 rounded-xl bg-muted/50 space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Amount</span>
                <span className="text-lg font-bold">MYR {parseFloat(amount).toLocaleString()}</span>
              </div>
              <div className="border-t border-border" />
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Bank</span>
                <span className="text-sm font-medium">{selectedBank?.bankName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Account</span>
                <span className="text-sm font-mono">{selectedBank?.accountNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Receipt</span>
                <span className="text-sm">{receiptFile ? "Uploaded" : "Not uploaded"}</span>
              </div>
            </div>

            <Button
              className="w-full h-12 rounded-xl text-base"
              style={{ background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)" }}
              disabled={createMutation.isPending}
              onClick={handleSubmit}
            >
              {createMutation.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
              ) : (
                <ArrowDownCircle className="w-5 h-5 mr-2" />
              )}
              Confirm Deposit
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Recent Deposits */}
      <RecentDeposits deposits={(historyQuery.data as any[]) || []} />
    </div>
  );
}

function RecentDeposits({ deposits }: { deposits: any[] }) {
  if (deposits.length === 0) return null;

  const statusColor = (s: string) => {
    switch (s) {
      case "approved": return "bg-green-500/10 text-green-500 border-green-500/20";
      case "pending": return "bg-amber-500/10 text-amber-500 border-amber-500/20";
      case "rejected": return "bg-red-500/10 text-red-500 border-red-500/20";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <Card>
      <CardContent className="pt-5">
        <p className="font-semibold text-sm mb-3">Recent Deposits</p>
        <div className="space-y-2">
          {deposits.slice(0, 10).map((dep: any) => (
            <div key={dep.id} className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
              <div>
                <p className="text-sm font-semibold">MYR {parseFloat(dep.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                <p className="text-[11px] text-muted-foreground">{new Date(dep.createdAt).toLocaleString()}</p>
              </div>
              <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full border ${statusColor(dep.status)}`}>
                {dep.status}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
