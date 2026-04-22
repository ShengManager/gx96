import { useState, useMemo, useEffect } from "react";
import { usePlayerAuth } from "@/contexts/PlayerAuthContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Link, useLocation } from "wouter";
import {
  Gamepad2, Search, Loader2, Flame,
  Monitor, Smartphone, Download, X, Copy,
} from "lucide-react";
import { toast } from "sonner";

function getGameCode(game: any): string {
  return game?.gameCode || game?.GameCode || "";
}

function getGameName(game: any): string {
  return game?.gameName || game?.GameName || "Unknown Game";
}

function getGameType(game: any): string {
  return game?.gameTypeLabel || game?.gameType || game?.GameType || "Other";
}

function getGameProvider(game: any): string {
  return game?.provider || game?.Provider || "";
}

function getGameImage(game: any): string {
  return game?.imageUrl || game?.ImageUrl || "";
}

function getSupportedPlatforms(game: any): string[] {
  return game?.supportedPlatforms || game?.SupportedPlatforms || [];
}

function getProviderType(game: any): string {
  return String(game?.providerType || "").trim().toLowerCase();
}

export default function PlayerGames() {
  const { accessToken, isAuthenticated, loading: authLoading } = usePlayerAuth();
  const canFetch = !!accessToken && !authLoading;
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [launching, setLaunching] = useState<string | null>(null);
  const [bonusConfirmOpen, setBonusConfirmOpen] = useState(false);
  const [pendingGame, setPendingGame] = useState<any>(null);
  const [h5LoginDialogOpen, setH5LoginDialogOpen] = useState(false);
  const [h5LoginPayload, setH5LoginPayload] = useState<{
    gameName: string;
    provider: string;
    loginUrl: string;
    loginAccount?: string;
    loginPassword?: string;
  } | null>(null);

  const frontendLayoutQuery = trpc.player.frontendLayout.useQuery(
    { token: accessToken || "" },
    { enabled: true }
  );

  const gamesQuery = trpc.player.gameList.useQuery(
    { token: accessToken || "" },
    { enabled: canFetch, retry: 2 }
  );
  const balanceQuery = trpc.player.balance.useQuery(
    { token: accessToken || "" },
    { enabled: canFetch, refetchInterval: 30000 }
  );
  const bonusListQuery = trpc.player.bonusList.useQuery(
    { token: accessToken || "" },
    { enabled: canFetch, retry: 2 }
  );

  const launchMutation = trpc.player.launchGame.useMutation({
    onSuccess: (data: any) => {
      const providerType = String(data?.providerType || "").toLowerCase();
      if (providerType === "h5login") {
        setH5LoginPayload((prev) => prev ? {
          ...prev,
          loginUrl: data.url,
          loginAccount: data.loginAccount || prev.loginAccount,
          loginPassword: data.loginPassword || prev.loginPassword,
        } : null);
        setH5LoginDialogOpen(true);
      } else if (data.url) {
        window.open(data.url, "_blank");
      }
      setLaunching(null);
    },
    onError: (err: any) => { toast.error(err.message); setLaunching(null); },
  });

  const games = (gamesQuery.data as any)?.games || [];
  const layoutConfig = (frontendLayoutQuery.data as any) || null;
  const gameLayoutMode = useMemo<"top_tabs" | "left_sidebar">(() => {
    const map = (layoutConfig?.layoutInjections || {}) as Record<string, any>;
    const gameCode = map.game || map.games || {};
    const raw = String(gameCode?.dataJson || "").trim();
    if (!raw) return "top_tabs";
    try {
      const parsed = JSON.parse(raw);
      return String(parsed?.providerLayoutMode || "").trim() === "left_sidebar" ? "left_sidebar" : "top_tabs";
    } catch {
      return "top_tabs";
    }
  }, [layoutConfig]);
  const balanceNum = Math.max(0, Number((balanceQuery.data as any)?.balance || 0) || 0);

  const categories = useMemo(() => {
    const list: string[] = [];
    const seen = new Set<string>();
    games.forEach((g: any) => {
      const key = getGameProvider(g) || "Unknown";
      if (!seen.has(key)) { seen.add(key); list.push(key); }
    });
    return list;
  }, [games]);

  useEffect(() => {
    if (activeCategory === "all") return;
    if (!categories.includes(activeCategory)) {
      setActiveCategory("all");
    }
  }, [activeCategory, categories]);

  const filteredGames = useMemo(() => {
    let result = games;
    if (activeCategory !== "all") {
      result = result.filter((g: any) => {
        return (getGameProvider(g) || "Unknown") === activeCategory;
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((g: any) =>
        getGameName(g).toLowerCase().includes(q) ||
        getGameType(g).toLowerCase().includes(q) ||
        getGameProvider(g).toLowerCase().includes(q)
      );
    }
    return result;
  }, [games, activeCategory, search]);

  const doLaunch = (game: any) => {
    const gameCode = getGameCode(game);
    const provider = getGameProvider(game);
    if (!gameCode || !provider) {
      toast.error("Game data is incomplete (missing provider/gameCode)");
      return;
    }
    const providerType = getProviderType(game);
    if (providerType === "h5login") {
      setH5LoginPayload({
        gameName: getGameName(game),
        provider,
        loginUrl: "",
      });
      setH5LoginDialogOpen(true);
    }
    setLaunching(gameCode);
    launchMutation.mutate({ token: accessToken!, provider, gameCode });
  };

  const handleLaunch = (game: any) => {
    if (!isAuthenticated) { toast.error("Please login first"); return; }
    const availableBonuses = ((bonusListQuery.data as any[]) || []).filter((b: any) => b?.canClaim);
    // Only show this reminder when player has funds to actually start wagering.
    if (availableBonuses.length > 0 && balanceNum > 0.0001) {
      setPendingGame(game);
      setBonusConfirmOpen(true);
      return;
    }
    doLaunch(game);
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

      {gameLayoutMode === "top_tabs" && (
        <div className="flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide">
          <button
            onClick={() => setActiveCategory("all")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all flex-shrink-0 ${
              activeCategory === "all"
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                : "bg-card border border-white/10 text-muted-foreground hover:text-foreground"
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            All ({games.length})
          </button>
          {categories.map(category => {
            const count = games.filter((g: any) => (getGameProvider(g) || "Unknown") === category).length;
            return (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                  activeCategory === category
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                    : "bg-card border border-white/10 text-muted-foreground hover:text-foreground"
                }`}
              >
                <Gamepad2 className="w-3.5 h-3.5" />
                {category} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Results count */}
      {search && (
        <div className="px-4">
          <p className="text-xs text-muted-foreground">
            {filteredGames.length} result{filteredGames.length !== 1 ? "s" : ""} for "{search}"
          </p>
        </div>
      )}

      {/* Game Grid */}
      <div className={`pb-4 ${gameLayoutMode === "left_sidebar" ? "px-3 md:px-4" : "px-4"}`}>
        {gamesQuery.isPending ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : gamesQuery.isError ? (
          <div className="text-center py-16 space-y-2">
            <p className="text-sm text-destructive">Could not load games</p>
            <p className="text-xs text-muted-foreground">{gamesQuery.error?.message}</p>
            <Button variant="outline" size="sm" onClick={() => gamesQuery.refetch()}>Retry</Button>
          </div>
        ) : filteredGames.length > 0 ? (
          gameLayoutMode === "left_sidebar" ? (
            <div className="grid grid-cols-[120px_1fr] gap-3 md:grid-cols-[180px_1fr]">
              <div className="rounded-xl border border-white/10 bg-card/50 p-2 h-fit sticky top-[72px]">
                <div className="space-y-1">
                  <button
                    onClick={() => setActiveCategory("all")}
                    className={`w-full text-left rounded-lg px-2.5 py-2 text-xs transition ${
                      activeCategory === "all" ? "bg-primary text-primary-foreground" : "hover:bg-muted/60 text-muted-foreground"
                    }`}
                  >
                    All ({games.length})
                  </button>
                  {categories.map((category) => {
                    const count = games.filter((g: any) => (getGameProvider(g) || "Unknown") === category).length;
                    return (
                      <button
                        key={category}
                        onClick={() => setActiveCategory(category)}
                        className={`w-full text-left rounded-lg px-2.5 py-2 text-xs transition ${
                          activeCategory === category ? "bg-primary text-primary-foreground" : "hover:bg-muted/60 text-muted-foreground"
                        }`}
                      >
                        <div className="truncate">{category}</div>
                        <div className="text-[10px] opacity-80 mt-0.5">{count}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
                {filteredGames.map((game: any) => (
                  <Card
                    key={getGameCode(game)}
                    className="overflow-hidden cursor-pointer hover:ring-1 hover:ring-primary/40 transition-all group active:scale-95"
                    onClick={() => handleLaunch(game)}
                  >
                    <div className="aspect-square bg-muted relative overflow-hidden">
                      {getGameImage(game) ? (
                        <img
                          src={getGameImage(game)}
                          alt={getGameName(game)}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
                          <Gamepad2 className="w-8 h-8 text-muted-foreground/40" />
                        </div>
                      )}
                      {launching === getGameCode(game) ? (
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
                      {getSupportedPlatforms(game).length > 0 && (
                        <div className="absolute top-1 right-1 flex gap-0.5">
                          {getSupportedPlatforms(game).includes("Web") && (
                            <div className="w-5 h-5 rounded bg-black/50 backdrop-blur-sm flex items-center justify-center">
                              <Monitor className="w-3 h-3 text-white/80" />
                            </div>
                          )}
                          {getSupportedPlatforms(game).includes("H5") && (
                            <div className="w-5 h-5 rounded bg-black/50 backdrop-blur-sm flex items-center justify-center">
                              <Smartphone className="w-3 h-3 text-white/80" />
                            </div>
                          )}
                          {getSupportedPlatforms(game).includes("Download") && (
                            <div className="w-5 h-5 rounded bg-black/50 backdrop-blur-sm flex items-center justify-center">
                              <Download className="w-3 h-3 text-white/80" />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <CardContent className="p-2">
                      <p className="text-[11px] font-medium truncate leading-tight">{getGameName(game)}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{getGameProvider(game) || getGameType(game)}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2.5">
              {filteredGames.map((game: any) => (
                <Card
                  key={getGameCode(game)}
                  className="overflow-hidden cursor-pointer hover:ring-1 hover:ring-primary/40 transition-all group active:scale-95"
                  onClick={() => handleLaunch(game)}
                >
                  <div className="aspect-square bg-muted relative overflow-hidden">
                    {getGameImage(game) ? (
                      <img
                        src={getGameImage(game)}
                        alt={getGameName(game)}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
                        <Gamepad2 className="w-8 h-8 text-muted-foreground/40" />
                      </div>
                    )}
                    {launching === getGameCode(game) ? (
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
                    {getSupportedPlatforms(game).length > 0 && (
                      <div className="absolute top-1 right-1 flex gap-0.5">
                        {getSupportedPlatforms(game).includes("Web") && (
                          <div className="w-5 h-5 rounded bg-black/50 backdrop-blur-sm flex items-center justify-center">
                            <Monitor className="w-3 h-3 text-white/80" />
                          </div>
                        )}
                        {getSupportedPlatforms(game).includes("H5") && (
                          <div className="w-5 h-5 rounded bg-black/50 backdrop-blur-sm flex items-center justify-center">
                            <Smartphone className="w-3 h-3 text-white/80" />
                          </div>
                        )}
                        {getSupportedPlatforms(game).includes("Download") && (
                          <div className="w-5 h-5 rounded bg-black/50 backdrop-blur-sm flex items-center justify-center">
                            <Download className="w-3 h-3 text-white/80" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <CardContent className="p-2">
                    <p className="text-[11px] font-medium truncate leading-tight">{getGameName(game)}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{getGameProvider(game) || getGameType(game)}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        ) : (
          <div className="text-center py-16">
            <Search className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No games found</p>
            {!search && games.length === 0 && (
              <p className="text-xs text-muted-foreground mt-2 max-w-sm mx-auto">
                If this stays empty, ask the operator to set Middlewave API URL and project token in Admin → Settings, and confirm the upstream GameList API returns data.
              </p>
            )}
            {search && (
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setSearch("")}>
                Clear search
              </Button>
            )}
          </div>
        )}
      </div>

      <Dialog open={h5LoginDialogOpen} onOpenChange={setH5LoginDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>H5 Login · {h5LoginPayload?.provider || "-"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {h5LoginPayload?.gameName || "Game"} requires account/password login.
            </p>
            <div className="rounded-md border border-white/10 p-3 space-y-2">
              <div className="text-xs text-muted-foreground">Account</div>
              <div className="flex items-center justify-between gap-2">
                <div className="font-mono text-sm truncate">{h5LoginPayload?.loginAccount || "-"}</div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (!h5LoginPayload?.loginAccount) return;
                    navigator.clipboard.writeText(h5LoginPayload.loginAccount);
                    toast.success("Account copied");
                  }}
                >
                  <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy
                </Button>
              </div>
              <div className="text-xs text-muted-foreground mt-2">Password</div>
              <div className="flex items-center justify-between gap-2">
                <div className="font-mono text-sm truncate">{h5LoginPayload?.loginPassword || "-"}</div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (!h5LoginPayload?.loginPassword) return;
                    navigator.clipboard.writeText(h5LoginPayload.loginPassword);
                    toast.success("Password copied");
                  }}
                >
                  <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy
                </Button>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setH5LoginDialogOpen(false)}>Close</Button>
              <Button
                disabled={!h5LoginPayload?.loginUrl}
                onClick={() => {
                  if (!h5LoginPayload?.loginUrl) return;
                  window.open(h5LoginPayload.loginUrl, "_blank");
                }}
              >
                Login
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={bonusConfirmOpen}
        onOpenChange={(v) => {
          setBonusConfirmOpen(v);
          if (!v) setPendingGame(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Claim Bonus First?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              You still have available bonuses. If you enter a game first, some bonuses may become unavailable.
            </p>
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              Recommended: claim your bonus first, then enter game.
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setBonusConfirmOpen(false);
                  setPendingGame(null);
                  setLocation("/bonus");
                }}
              >
                Go Claim Bonus
              </Button>
              <Button
                onClick={() => {
                  const game = pendingGame;
                  setBonusConfirmOpen(false);
                  setPendingGame(null);
                  if (game) doLaunch(game);
                }}
              >
                Enter Game Anyway
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
