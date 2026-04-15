import { useState, useEffect, useRef, useCallback } from "react";
import { usePlayerAuth } from "@/contexts/PlayerAuthContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Gamepad2, Gift, Star, ChevronRight, Wallet, ChevronLeft,
  Loader2, Trophy, Zap, Sparkles,
} from "lucide-react";

export default function PlayerHome() {
  const { isAuthenticated, user, accessToken } = usePlayerAuth();

  const bannersQuery = trpc.player.banners.useQuery(
    { token: accessToken || "" },
    { enabled: !!accessToken }
  );
  const gamesQuery = trpc.player.gameList.useQuery(
    { token: accessToken || "" },
    { enabled: !!accessToken }
  );

  const banners = (bannersQuery.data as any) || [];
  const games = (gamesQuery.data as any)?.games || [];

  // Group games by type
  const gamesByType: Record<string, any[]> = {};
  games.forEach((g: any) => {
    const t = g.GameType || "Other";
    if (!gamesByType[t]) gamesByType[t] = [];
    gamesByType[t].push(g);
  });

  return (
    <div className="space-y-5 pb-4">
      {/* Balance Card */}
      {isAuthenticated && (
        <div className="mx-4 mt-4">
          <div className="relative overflow-hidden rounded-2xl p-5" style={{
            background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)",
          }}>
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 -translate-y-8 translate-x-8" />
            <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full bg-white/5 translate-y-6 -translate-x-6" />
            <div className="relative z-10">
              <p className="text-sm text-white/70">Welcome back</p>
              <p className="text-white font-semibold mt-0.5">{user?.displayName || user?.username || "Player"}</p>
              <div className="flex items-baseline gap-1 mt-3">
                <span className="text-3xl font-bold text-white tracking-tight">
                  {user?.balance ? parseFloat(user.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}
                </span>
                <span className="text-sm text-white/60">MYR</span>
              </div>
              <div className="flex gap-2 mt-4">
                <Link href="/deposit">
                  <Button size="sm" className="bg-white/20 hover:bg-white/30 text-white border-0 backdrop-blur-sm rounded-lg">
                    <Wallet className="w-3.5 h-3.5 mr-1.5" /> Deposit
                  </Button>
                </Link>
                <Link href="/withdraw">
                  <Button size="sm" className="bg-white/20 hover:bg-white/30 text-white border-0 backdrop-blur-sm rounded-lg">
                    <Zap className="w-3.5 h-3.5 mr-1.5" /> Withdraw
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Banner Carousel */}
      <BannerCarousel banners={banners} />

      {/* Quick Actions Grid */}
      <div className="px-4 grid grid-cols-4 gap-3">
        {[
          { icon: Gamepad2, label: "Games", href: "/games", gradient: "from-blue-500/20 to-blue-600/10", color: "text-blue-400" },
          { icon: Gift, label: "Bonus", href: "/bonus", gradient: "from-amber-500/20 to-amber-600/10", color: "text-amber-400" },
          { icon: Trophy, label: "History", href: "/history", gradient: "from-emerald-500/20 to-emerald-600/10", color: "text-emerald-400" },
          { icon: Sparkles, label: "Profile", href: "/profile", gradient: "from-purple-500/20 to-purple-600/10", color: "text-purple-400" },
        ].map(item => (
          <Link key={item.href} href={item.href}>
            <div className={`flex flex-col items-center gap-2 p-3.5 rounded-xl bg-gradient-to-b ${item.gradient} border border-white/5 hover:border-white/10 transition-all cursor-pointer active:scale-95`}>
              <item.icon className={`w-6 h-6 ${item.color}`} />
              <span className="text-[11px] font-medium text-foreground/80">{item.label}</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Popular Games Section */}
      <div className="px-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" /> Popular Games
          </h2>
          <Link href="/games">
            <span className="text-sm text-primary flex items-center cursor-pointer hover:underline">
              View All <ChevronRight className="w-4 h-4" />
            </span>
          </Link>
        </div>

        {gamesQuery.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : games.length > 0 ? (
          <div className="grid grid-cols-3 gap-2.5">
            {games.slice(0, 9).map((game: any) => (
              <GameCard key={game.GameCode} game={game} />
            ))}
          </div>
        ) : (
          <div className="text-center py-10 text-muted-foreground text-sm">
            {isAuthenticated ? "No games available yet" : "Login to explore games"}
          </div>
        )}
      </div>

      {/* Game Categories */}
      {Object.entries(gamesByType).slice(0, 3).map(([type, typeGames]) => (
        <div key={type} className="px-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold capitalize">{type}</h2>
            <Link href="/games">
              <span className="text-xs text-primary flex items-center cursor-pointer hover:underline">
                More <ChevronRight className="w-3 h-3" />
              </span>
            </Link>
          </div>
          <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
            {typeGames.slice(0, 8).map((game: any) => (
              <div key={game.GameCode} className="flex-shrink-0 w-[110px]">
                <GameCard game={game} />
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Not logged in CTA */}
      {!isAuthenticated && (
        <div className="mx-4 p-6 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10 text-center">
          <Gamepad2 className="w-10 h-10 text-primary mx-auto mb-3" />
          <h3 className="text-lg font-bold mb-1">Ready to Play?</h3>
          <p className="text-sm text-muted-foreground mb-4">Join now and get exclusive welcome bonuses!</p>
          <Link href="/login">
            <Button className="rounded-full px-8">Get Started</Button>
          </Link>
        </div>
      )}
    </div>
  );
}

// ─── Banner Carousel ───
function BannerCarousel({ banners }: { banners: any[] }) {
  const [current, setCurrent] = useState(0);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const autoPlayRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startAutoPlay = useCallback(() => {
    if (banners.length <= 1) return;
    if (autoPlayRef.current) clearInterval(autoPlayRef.current);
    autoPlayRef.current = setInterval(() => {
      setCurrent(prev => (prev + 1) % banners.length);
    }, 4500);
  }, [banners.length]);

  const stopAutoPlay = useCallback(() => {
    if (autoPlayRef.current) {
      clearInterval(autoPlayRef.current);
      autoPlayRef.current = null;
    }
  }, []);

  useEffect(() => {
    startAutoPlay();
    return stopAutoPlay;
  }, [startAutoPlay, stopAutoPlay]);

  const handleTouchStart = (e: React.TouchEvent) => {
    stopAutoPlay();
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    touchEndX.current = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 50) {
      if (diff > 0) setCurrent(prev => (prev + 1) % banners.length);
      else setCurrent(prev => (prev - 1 + banners.length) % banners.length);
    }
    startAutoPlay();
  };

  const goTo = (idx: number) => {
    stopAutoPlay();
    setCurrent(idx);
    startAutoPlay();
  };

  if (banners.length === 0) {
    return (
      <div className="mx-4 rounded-2xl aspect-[16/7] bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-white/5">
        <div className="text-center">
          <Gamepad2 className="w-10 h-10 text-primary/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Welcome to TgGaming</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="mx-4 relative overflow-hidden rounded-2xl aspect-[16/7]"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="flex h-full transition-transform duration-500 ease-out"
        style={{ transform: `translateX(-${current * 100}%)` }}
      >
        {banners.map((banner: any) => (
          <div key={banner.id} className="w-full h-full flex-shrink-0 relative">
            <img
              src={banner.imageUrl}
              alt={banner.title || ""}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            {banner.title && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pt-8">
                <p className="text-white text-sm font-semibold">{banner.title}</p>
                {banner.linkUrl && (
                  <p className="text-white/60 text-xs mt-0.5">Tap to learn more</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Navigation arrows (desktop) */}
      {banners.length > 1 && (
        <>
          <button
            onClick={() => goTo((current - 1 + banners.length) % banners.length)}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white/80 hover:bg-black/50 transition-colors hidden sm:flex"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => goTo((current + 1) % banners.length)}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white/80 hover:bg-black/50 transition-colors hidden sm:flex"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </>
      )}

      {/* Indicators */}
      {banners.length > 1 && (
        <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex gap-1.5">
          {banners.map((_: any, idx: number) => (
            <button
              key={idx}
              onClick={() => goTo(idx)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                idx === current ? "w-5 bg-white" : "w-1.5 bg-white/40"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Game Card ───
function GameCard({ game }: { game: any }) {
  return (
    <Card className="overflow-hidden hover:ring-1 hover:ring-primary/40 transition-all cursor-pointer group active:scale-95">
      <div className="aspect-square bg-muted relative overflow-hidden">
        {game.ImageUrl ? (
          <img
            src={game.ImageUrl}
            alt={game.GameName}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
            <Gamepad2 className="w-8 h-8 text-muted-foreground/50" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <CardContent className="p-2">
        <p className="text-[11px] font-medium truncate leading-tight">{game.GameName}</p>
        <p className="text-[10px] text-muted-foreground truncate">{game.GameType}</p>
      </CardContent>
    </Card>
  );
}
