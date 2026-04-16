import { ReactNode } from "react";
import { useLocation, Link } from "wouter";
import { usePlayerAuth } from "@/contexts/PlayerAuthContext";
import { trpc } from "@/lib/trpc";
import {
  Gamepad2, Gift, ArrowDownCircle, ArrowUpCircle, User,
  Home, Wallet, Bell, History,
} from "lucide-react";

const NAV_ITEMS = [
  { path: "/", label: "Home", icon: Home },
  { path: "/games", label: "Games", icon: Gamepad2 },
  { path: "/deposit", label: "Deposit", icon: ArrowDownCircle, isCenter: true },
  { path: "/bonus", label: "Bonus", icon: Gift },
  { path: "/profile", label: "Profile", icon: User },
];

export default function PlayerLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { isAuthenticated, accessToken } = usePlayerAuth();

  const balanceQuery = trpc.player.balance.useQuery(
    { token: accessToken || "" },
    { enabled: !!accessToken, refetchInterval: 30000 }
  );

  const balance = (balanceQuery.data as any)?.balance;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top header */}
      <header className="sticky top-0 z-40 bg-card/80 backdrop-blur-xl border-b border-white/5 px-4 py-2.5 flex items-center justify-between">
        <Link href="/">
          <div className="flex items-center gap-2.5 cursor-pointer">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{
              background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
            }}>
              <Gamepad2 className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">TgGaming</span>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          {isAuthenticated && balance !== undefined && (
            <Link href="/deposit">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 cursor-pointer">
                <Wallet className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-bold text-primary">
                  {parseFloat(balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </Link>
          )}

          {isAuthenticated ? (
            <div className="flex items-center gap-2">
              <Link href="/history">
                <div className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center cursor-pointer hover:bg-muted transition-colors">
                  <History className="w-4 h-4 text-muted-foreground" />
                </div>
              </Link>
              <Link href="/profile">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center cursor-pointer hover:bg-primary/30 transition-colors">
                  <User className="w-4 h-4 text-primary" />
                </div>
              </Link>
            </div>
          ) : (
            <Link href="/login">
              <span className="text-sm text-primary font-semibold cursor-pointer px-3 py-1.5 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors">
                Login
              </span>
            </Link>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 pb-24 w-full max-w-[1280px] mx-auto">
        {children}
      </main>

      {/* Bottom navbar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/90 backdrop-blur-xl border-t border-white/5">
        <div className="flex items-end justify-around pb-[env(safe-area-inset-bottom)] max-w-lg mx-auto">
          {NAV_ITEMS.map(item => {
            const isActive = item.path === "/"
              ? location === "/"
              : location.startsWith(item.path);

            if (item.isCenter) {
              return (
                <Link key={item.path} href={item.path}>
                  <div className="flex flex-col items-center -mt-4 cursor-pointer">
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-transform active:scale-90"
                      style={{
                        background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
                        boxShadow: isActive ? "0 4px 20px rgba(34, 197, 94, 0.4)" : "0 4px 12px rgba(34, 197, 94, 0.2)",
                      }}
                    >
                      <item.icon className="w-6 h-6 text-white" />
                    </div>
                    <span className={`text-[10px] font-semibold mt-1 ${isActive ? "text-green-500" : "text-muted-foreground"}`}>
                      {item.label}
                    </span>
                  </div>
                </Link>
              );
            }

            return (
              <Link key={item.path} href={item.path}>
                <div className={`flex flex-col items-center gap-0.5 px-4 py-2.5 cursor-pointer transition-all ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}>
                  <div className="relative">
                    <item.icon className={`w-5 h-5 transition-all ${isActive ? "scale-110" : ""}`} />
                    {isActive && (
                      <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                    )}
                  </div>
                  <span className={`text-[10px] ${isActive ? "font-semibold" : "font-medium"}`}>{item.label}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
