import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

const queryClient = new QueryClient();

const isAdminPath = (pathname: string) => pathname.startsWith("/admin") || pathname.startsWith("/topadmin");

const getTokenByProcedure = (url: string) => {
  const adminToken = localStorage.getItem("admin_access_token");
  const playerToken = localStorage.getItem("player_token");

  try {
    const reqUrl = new URL(url, window.location.origin);
    const trpcPrefix = "/api/trpc/";
    const idx = reqUrl.pathname.indexOf(trpcPrefix);
    if (idx >= 0) {
      const procedurePart = reqUrl.pathname.slice(idx + trpcPrefix.length);
      const procedures = procedurePart.split(",").map((s) => s.trim()).filter(Boolean);
      if (procedures.length > 0) {
        const hasAdminProc = procedures.some((p) => p.startsWith("admin") || p.startsWith("topAdmin"));
        const hasPlayerProc = procedures.some((p) => p.startsWith("player"));
        if (hasAdminProc && !hasPlayerProc) return adminToken || playerToken;
        if (hasPlayerProc && !hasAdminProc) return playerToken || adminToken;
      }
    }
  } catch {
    // Fallback to pathname logic below.
  }

  const pathname = typeof window !== "undefined" ? window.location.pathname : "/";
  return isAdminPath(pathname) ? (adminToken || playerToken) : (playerToken || adminToken);
};

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const msg = String(error.message || "");
  const isUnauthorized =
    msg === UNAUTHED_ERR_MSG ||
    msg.includes("authentication required") ||
    msg.includes("Please login");

  if (!isUnauthorized) return;

  const pathname = window.location.pathname;
  if (isAdminPath(pathname)) {
    localStorage.removeItem("admin_access_token");
    localStorage.removeItem("admin_refresh_token");
    window.location.href = "/admin/login";
    return;
  }

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        const authToken = getTokenByProcedure(String(input));
        const mergedHeaders = new Headers(init?.headers || {});
        if (authToken) mergedHeaders.set("Authorization", `Bearer ${authToken}`);
        return globalThis.fetch(input, {
          ...(init ?? {}),
          headers: mergedHeaders,
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
