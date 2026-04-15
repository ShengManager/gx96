import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

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

  useEffect(() => {
    const stored = localStorage.getItem("player_token");
    const storedUser = localStorage.getItem("player_user");
    if (stored && storedUser) {
      try {
        setAccessToken(stored);
        setUser(JSON.parse(storedUser));
      } catch { /* ignore */ }
    }
    setLoading(false);
  }, []);

  const login = useCallback((token: string, refreshToken: string, userData: PlayerUser) => {
    setAccessToken(token);
    setUser(userData);
    localStorage.setItem("player_token", token);
    localStorage.setItem("player_refresh", refreshToken);
    localStorage.setItem("player_user", JSON.stringify(userData));
  }, []);

  const logout = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    localStorage.removeItem("player_token");
    localStorage.removeItem("player_refresh");
    localStorage.removeItem("player_user");
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await fetch("/api/trpc/player.balance?input=" + encodeURIComponent(JSON.stringify({ json: { token: accessToken } })));
      const data = await res.json();
      if (data?.result?.data?.json?.balance) {
        setUser(prev => prev ? { ...prev, balance: data.result.data.json.balance } : prev);
      }
    } catch { /* ignore */ }
  }, [accessToken]);

  return (
    <PlayerAuthContext.Provider value={{ user, accessToken, isAuthenticated: !!user && !!accessToken, loading, login, logout, refreshBalance }}>
      {children}
    </PlayerAuthContext.Provider>
  );
}
