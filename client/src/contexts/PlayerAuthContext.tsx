import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";

interface PlayerUser {
  id: number;
  username: string;
  phone: string;
  displayName?: string;
  vipLevel?: number;
  balance?: string;
}

interface PlayerAuthContextType {
  user: PlayerUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (token: string, refreshToken: string, user: PlayerUser) => void;
  logout: () => void;
  refreshBalance: () => Promise<void>;
}

const PlayerAuthContext = createContext<PlayerAuthContextType>({
  user: null, accessToken: null, isAuthenticated: false, loading: true,
  login: () => {}, logout: () => {}, refreshBalance: async () => {},
});

export function usePlayerAuth() { return useContext(PlayerAuthContext); }

export function PlayerAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PlayerUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshingRef = useRef<Promise<boolean> | null>(null);

  const clearPlayerAuth = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    setAccessToken(null);
    setUser(null);
    localStorage.removeItem("player_token");
    localStorage.removeItem("player_refresh");
    localStorage.removeItem("player_user");
  }, []);

  const getJwtExpMs = (token: string): number => {
    try {
      const payloadBase64 = token.split(".")[1];
      if (!payloadBase64) return 0;
      const normalized = payloadBase64.replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(atob(normalized));
      const exp = typeof payload?.exp === "number" ? payload.exp : 0;
      return exp > 0 ? exp * 1000 : 0;
    } catch {
      return 0;
    }
  };

  const isJwtExpired = useCallback((token: string): boolean => {
    const expMs = getJwtExpMs(token);
    return !expMs || expMs <= Date.now();
  }, []);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    const current = refreshingRef.current;
    if (current) return current;
    const refreshToken = localStorage.getItem("player_refresh");
    if (!refreshToken) return false;

    const task = (async () => {
      try {
        const res = await fetch("/api/player/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        const nextAccessToken = typeof data?.accessToken === "string" ? data.accessToken : "";
        const nextRefreshToken = typeof data?.refreshToken === "string" ? data.refreshToken : "";
        if (!nextAccessToken || !nextRefreshToken) return false;
        localStorage.setItem("player_token", nextAccessToken);
        localStorage.setItem("player_refresh", nextRefreshToken);
        setAccessToken(nextAccessToken);
        return true;
      } catch {
        return false;
      } finally {
        refreshingRef.current = null;
      }
    })();

    refreshingRef.current = task;
    return task;
  }, []);

  const scheduleRefresh = useCallback((token: string) => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    const expMs = getJwtExpMs(token);
    if (!expMs) return;
    const msUntilRefresh = expMs - Date.now() - 60_000; // refresh 1 minute before expiry
    if (msUntilRefresh <= 0) {
      void refreshSession().then((ok) => {
        if (!ok) clearPlayerAuth();
      });
      return;
    }
    refreshTimerRef.current = setTimeout(() => {
      void refreshSession().then((ok) => {
        if (!ok) clearPlayerAuth();
      });
    }, msUntilRefresh);
  }, [clearPlayerAuth, refreshSession]);

  useEffect(() => {
    (async () => {
      const stored = localStorage.getItem("player_token");
      const storedUser = localStorage.getItem("player_user");
      if (stored && storedUser) {
        try {
          setUser(JSON.parse(storedUser));
          if (isJwtExpired(stored)) {
            const refreshed = await refreshSession();
            if (!refreshed) {
              clearPlayerAuth();
              setLoading(false);
              return;
            }
          } else {
            setAccessToken(stored);
            scheduleRefresh(stored);
          }
        } catch {
          clearPlayerAuth();
        }
      }
      setLoading(false);
    })();
  }, [clearPlayerAuth, isJwtExpired, refreshSession, scheduleRefresh]);

  useEffect(() => {
    if (!accessToken) return;
    scheduleRefresh(accessToken);
  }, [accessToken, scheduleRefresh]);

  const login = useCallback((token: string, refreshToken: string, userData: PlayerUser) => {
    setAccessToken(token);
    setUser(userData);
    localStorage.setItem("player_token", token);
    localStorage.setItem("player_refresh", refreshToken);
    localStorage.setItem("player_user", JSON.stringify(userData));
    scheduleRefresh(token);
  }, [scheduleRefresh]);

  const logout = useCallback(() => {
    clearPlayerAuth();
  }, [clearPlayerAuth]);

  const refreshBalance = useCallback(async () => {
    if (!accessToken) return;
    const fetchBalanceByToken = async (token: string) => {
      const input = encodeURIComponent(JSON.stringify({ json: { token } }));
      return fetch(`/api/trpc/player.balance?input=${input}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    };
    try {
      const res = await fetchBalanceByToken(accessToken);
      if (res.status === 401) {
        const refreshed = await refreshSession();
        if (!refreshed) {
          clearPlayerAuth();
          return;
        }
        const nextToken = localStorage.getItem("player_token");
        if (!nextToken) {
          clearPlayerAuth();
          return;
        }
        const retry = await fetchBalanceByToken(nextToken);
        if (retry.status === 401) {
          clearPlayerAuth();
          return;
        }
        const retryData = await retry.json();
        const retryPayload = retryData?.result?.data?.json;
        const retryBalance =
          retryPayload?.balance !== undefined
            ? retryPayload.balance
            : retryPayload?.total !== undefined
              ? retryPayload.total
              : undefined;
        if (retryBalance !== undefined) {
          setUser(prev => prev ? { ...prev, balance: String(retryBalance) } : prev);
        }
        return;
      }
      const data = await res.json();
      const payload = data?.result?.data?.json;
      const nextBalance =
        payload?.balance !== undefined
          ? payload.balance
          : payload?.total !== undefined
            ? payload.total
            : undefined;
      if (nextBalance !== undefined) {
        setUser(prev => prev ? { ...prev, balance: String(nextBalance) } : prev);
      }
    } catch { /* ignore */ }
  }, [accessToken, clearPlayerAuth, refreshSession]);

  return (
    <PlayerAuthContext.Provider value={{ user, accessToken, isAuthenticated: !!user && !!accessToken, loading, login, logout, refreshBalance }}>
      {children}
    </PlayerAuthContext.Provider>
  );
}
