import { useState, useMemo } from "react";
import { usePlayerAuth } from "@/contexts/PlayerAuthContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Gamepad2, Search, Loader2, Flame, Dice1, Trophy,
  Spade, Monitor, Smartphone, Download, X,
} from "lucide-react";
import { toast } from "sonner";

const TYPE_ICONS: Record<string, any> = {
  Slot: Dice1,
  Live: Monitor,
  Sport: Trophy,
  Card: Spade,
  Fish: Flame,
};

export default function PlayerGames() {
  const { accessToken, isAuthenticated } = usePlayerAuth();
  const [search, setSearch] = useState("");
  const [activeType, setActiveType] = useState("all");
  const [launching, setLaunching] = useState<string | null>(null);

  const gamesQuery = trpc.player.gameList.useQuery(
    { token: accessToken || "" },
    { enabled: !!accessToken }
  );

  const launchMutation = trpc.player.launchGame.useMutation({
    onSuccess: (data: any) => {
      if (data.url) window.open(data.url, "_blank");
      setLaunching(null);
    },
    onError: (err: any) => { toast.error(err.message); setLaunching(null); },
  });

  const games = (gamesQuery.data as any)?.games || [];

  const gameTypes = useMemo(() => {
    const types: string[] = [];
    const seen = new Set<string>();
    games.forEach((g: any) => {
      const t = g.GameType || "Other";
      if (!seen.has(t)) { seen.add(t); types.push(t); }
    });
    return types;
  }, [games]);

  const filteredGames = useMemo(() => {
    let result = games;
    if (activeType !== "all") {
      result = result.filter((g: any) => (g.GameType || "Other") === activeType);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((g: any) =>
        g.GameName?.toLowerCase().includes(q) ||
        g.GameType?.toLowerCase().includes(q) ||
        g.Provider?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [games, activeType, search]);

  const handleLaunch = (game: any) => {
    if (!isAuthenticated) { toast.error("Please login first"); return; }
    setLaunching(game.GameCode);
    launchMutation.mutate({ token: accessToken!, provider: game.Provider || "", gameCode: game.GameCode });
  };

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <Gamepad2 className="w-10 h-10 text-primary" />
        </div>
        <h2 className="text-xl font-bold mb-2">Login Required</h2>
        <p className="text-muted-foreground text-sm mb-4">Please login to view and play games</p>
        <Link href="/login">
          <Button className="rounded-full px-8">Login Now</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-4">
      {/* Search Bar */}
      <div className="px-4 relative">
        <Search className="absolute left-7 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search games, providers..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 pr-9 rounded-xl bg-card border-white/10"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-7 top-1/2 -translate-y-1/2">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Category Tabs - Horizontal scroll */}
      <div className="flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide">
        <button
          onClick={() => setActiveType("all")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all flex-shrink-0 ${
            activeType === "all"
              ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
              : "bg-card border border-white/10 text-muted-foreground hover:text-foreground"
          }`}
        >
          <Flame className="w-3.5 h-3.5" />
          All ({games.length})
        </button>
        {gameTypes.map(type => {
          const Icon = TYPE_ICONS[type] || Gamepad2;
          const count = games.filter((g: any) => (g.GameType || "Other") === type).length;
          return (
            <button
              key={type}
              onClick={() => setActiveType(type)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                activeType === type
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                  : "bg-card border border-white/10 text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {type} ({count})
            </button>
          );
        })}
      </div>

      {/* Results count */}
      {search && (
        <div className="px-4">
          <p className="text-xs text-muted-foreground">
            {filteredGames.length} result{filteredGames.length !== 1 ? "s" : ""} for "{search}"
          </p>
        </div>
      )}

      {/* Game Grid */}
      <div className="px-4 pb-4">
        {gamesQuery.isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredGames.length > 0 ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2.5">
            {filteredGames.map((game: any) => (
              <Card
                key={game.GameCode}
                className="overflow-hidden cursor-pointer hover:ring-1 hover:ring-primary/40 transition-all group active:scale-95"
                onClick={() => handleLaunch(game)}
              >
                <div className="aspect-square bg-muted relative overflow-hidden">
                  {game.ImageUrl ? (
                    <img
                      src={game.ImageUrl}
                      alt={game.GameName}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
                      <Gamepad2 className="w-8 h-8 text-muted-foreground/40" />
                    </div>
                  )}
                  {/* Launch overlay */}
                  {launching === game.GameCode ? (
                    <div className="absolute inset-0 bg-black/70 flex items-center justify-center backdrop-blur-sm">
                      <Loader2 className="w-6 h-6 animate-spin text-white" />
                    </div>
                  ) : (
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-primary/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity scale-75 group-hover:scale-100">
                        <Gamepad2 className="w-5 h-5 text-white" />
                      </div>
                    </div>
                  )}
                  {/* Platform badges */}
                  {game.SupportedPlatforms && (
                    <div className="absolute top-1 right-1 flex gap-0.5">
                      {game.SupportedPlatforms.includes("Web") && (
                        <div className="w-5 h-5 rounded bg-black/50 backdrop-blur-sm flex items-center justify-center">
                          <Monitor className="w-3 h-3 text-white/80" />
                        </div>
                      )}
                      {game.SupportedPlatforms.includes("H5") && (
                        <div className="w-5 h-5 rounded bg-black/50 backdrop-blur-sm flex items-center justify-center">
                          <Smartphone className="w-3 h-3 text-white/80" />
                        </div>
                      )}
                      {game.SupportedPlatforms.includes("Download") && (
                        <div className="w-5 h-5 rounded bg-black/50 backdrop-blur-sm flex items-center justify-center">
                          <Download className="w-3 h-3 text-white/80" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <CardContent className="p-2">
                  <p className="text-[11px] font-medium truncate leading-tight">{game.GameName}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{game.Provider || game.GameType}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <Search className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No games found</p>
            {search && (
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setSearch("")}>
                Clear search
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
