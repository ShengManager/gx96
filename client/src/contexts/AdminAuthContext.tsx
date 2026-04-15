import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";

interface AdminUser {
  id: number;
  username: string;
  displayName: string;
  role: "master" | "sub";
  parentId: number | null;
  adminId: number;
  permissions?: { module: string; canView: boolean; canEdit: boolean; canDelete: boolean }[];
}

interface AdminAuthState {
  user: AdminUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  accessToken: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  hasPermission: (module: string, action: "view" | "edit" | "delete") => boolean;
}

const AdminAuthContext = createContext<AdminAuthState | null>(null);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(() => localStorage.getItem("admin_access_token"));
  const [refreshToken, setRefreshToken] = useState<string | null>(() => localStorage.getItem("admin_refresh_token"));
  const [loading, setLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loginMutation = trpc.adminAuth.login.useMutation();
  const refreshMutation = trpc.adminAuth.refresh.useMutation();

  const clearAuth = useCallback(() => {
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
    localStorage.removeItem("admin_access_token");
    localStorage.removeItem("admin_refresh_token");
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
  }, []);

  const scheduleRefresh = useCallback((token: string) => {
    // Refresh 1 minute before expiry (tokens last 15 min)
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(async () => {
      const rt = localStorage.getItem("admin_refresh_token");
      if (!rt) return;
      try {
        const result = await refreshMutation.mutateAsync({ refreshToken: rt });
        setAccessToken(result.accessToken);
        setRefreshToken(result.refreshToken);
        localStorage.setItem("admin_access_token", result.accessToken);
        localStorage.setItem("admin_refresh_token", result.refreshToken);
        scheduleRefresh(result.accessToken);
      } catch {
        clearAuth();
      }
    }, 13 * 60 * 1000); // 13 minutes
  }, [refreshMutation, clearAuth]);

  // Fetch admin profile on mount or token change
  const meQuery = trpc.adminAuth.me.useQuery(undefined, {
    enabled: !!accessToken,
    retry: false,
  });

  useEffect(() => {
    if (meQuery.data) {
      setUser(meQuery.data as AdminUser);
      setLoading(false);
      if (accessToken) scheduleRefresh(accessToken);
    } else if (meQuery.isError || !accessToken) {
      setUser(null);
      setLoading(false);
    }
  }, [meQuery.data, meQuery.isError, accessToken]);

  const login = useCallback(async (username: string, password: string) => {
    const result = await loginMutation.mutateAsync({ username, password });
    setAccessToken(result.accessToken);
    setRefreshToken(result.refreshToken);
    localStorage.setItem("admin_access_token", result.accessToken);
    localStorage.setItem("admin_refresh_token", result.refreshToken);
    setUser(result.admin as AdminUser);
    scheduleRefresh(result.accessToken);
  }, [loginMutation, scheduleRefresh]);

  const logout = useCallback(() => {
    clearAuth();
  }, [clearAuth]);

  const hasPermission = useCallback((module: string, action: "view" | "edit" | "delete") => {
    if (!user) return false;
    if (user.role === "master") return true;
    const perm = user.permissions?.find(p => p.module === module);
    if (!perm) return false;
    if (action === "view") return perm.canView;
    if (action === "edit") return perm.canEdit;
    if (action === "delete") return perm.canDelete;
    return false;
  }, [user]);

  return (
    <AdminAuthContext.Provider value={{
      user,
      loading,
      isAuthenticated: !!user,
      accessToken,
      login,
      logout,
      hasPermission,
    }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
}
