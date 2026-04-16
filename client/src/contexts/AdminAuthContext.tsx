import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";

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
  const [location] = useLocation();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(() => localStorage.getItem("admin_access_token"));
  const [refreshToken, setRefreshToken] = useState<string | null>(() => localStorage.getItem("admin_refresh_token"));
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRefreshingRef = useRef(false);
  const recoveringFromMeErrorRef = useRef(false);
  const isAdminArea = location.startsWith("/admin") || location.startsWith("/topadmin");

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

  const isJwtExpired = useCallback((token: string) => {
    try {
      const payloadBase64 = token.split(".")[1];
      if (!payloadBase64) return true;
      const normalized = payloadBase64.replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(atob(normalized));
      const exp = typeof payload?.exp === "number" ? payload.exp : 0;
      if (!exp) return true;
      return exp * 1000 <= Date.now();
    } catch {
      return true;
    }
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

  const refreshSession = useCallback(async () => {
    if (isRefreshingRef.current) return false;
    const rt = localStorage.getItem("admin_refresh_token");
    if (!rt) return false;
    isRefreshingRef.current = true;
    try {
      const result = await refreshMutation.mutateAsync({ refreshToken: rt });
      setAccessToken(result.accessToken);
      setRefreshToken(result.refreshToken);
      localStorage.setItem("admin_access_token", result.accessToken);
      localStorage.setItem("admin_refresh_token", result.refreshToken);
      scheduleRefresh(result.accessToken);
      return true;
    } catch {
      clearAuth();
      return false;
    } finally {
      isRefreshingRef.current = false;
    }
  }, [refreshMutation, scheduleRefresh, clearAuth]);

  useEffect(() => {
    let mounted = true;
    const bootstrapAuth = async () => {
      const storedAccess = localStorage.getItem("admin_access_token");
      const storedRefresh = localStorage.getItem("admin_refresh_token");

      if (!storedAccess && !storedRefresh) {
        if (mounted) {
          setAuthReady(true);
          setLoading(false);
        }
        return;
      }

      if (storedAccess && !isJwtExpired(storedAccess)) {
        if (mounted) {
          setAccessToken(storedAccess);
          setRefreshToken(storedRefresh);
          scheduleRefresh(storedAccess);
          setAuthReady(true);
        }
        return;
      }

      const refreshed = await refreshSession();
      if (!mounted) return;
      if (!refreshed) clearAuth();
      setAuthReady(true);
    };

    bootstrapAuth();
    return () => {
      mounted = false;
    };
  }, [clearAuth, isJwtExpired, refreshSession, scheduleRefresh]);

  // Fetch admin profile on mount or token change
  const meQuery = trpc.adminAuth.me.useQuery(undefined, {
    enabled: authReady && !!accessToken && isAdminArea,
    retry: false,
  });

  useEffect(() => {
    if (!authReady) return;
    if (!isAdminArea) {
      setLoading(false);
      return;
    }

    if (meQuery.data) {
      recoveringFromMeErrorRef.current = false;
      setUser(meQuery.data as AdminUser);
      setLoading(false);
      if (accessToken) scheduleRefresh(accessToken);
    } else if (meQuery.isSuccess && !meQuery.data) {
      // Token exists but backend returns null (invalid/expired/signature mismatch).
      // Clear stale tokens to avoid infinite loading and repeated failed verification.
      clearAuth();
      setLoading(false);
    } else if (meQuery.isError && accessToken) {
      if (recoveringFromMeErrorRef.current) return;
      recoveringFromMeErrorRef.current = true;
      refreshSession().then((ok) => {
        if (!ok) {
          setUser(null);
          setLoading(false);
          recoveringFromMeErrorRef.current = false;
          return;
        }
        meQuery.refetch().finally(() => {
          recoveringFromMeErrorRef.current = false;
        });
      });
    } else if (!accessToken) {
      recoveringFromMeErrorRef.current = false;
      setUser(null);
      setLoading(false);
    }
  }, [authReady, isAdminArea, meQuery.data, meQuery.isError, meQuery.isSuccess, accessToken, scheduleRefresh, clearAuth, refreshSession]);

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
