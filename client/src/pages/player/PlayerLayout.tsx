import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, Link } from "wouter";
import { usePlayerAuth } from "@/contexts/PlayerAuthContext";
import { trpc } from "@/lib/trpc";
import { io, type Socket } from "socket.io-client";
import {
  Gamepad2, Gift, ArrowDownCircle, ArrowUpCircle, User,
  Home, Wallet, Bell, History, MessageCircle,
} from "lucide-react";

const NAV_ITEMS = [
  { path: "/", label: "Home", icon: Home },
  { path: "/games", label: "Games", icon: Gamepad2 },
  { path: "/deposit", label: "Deposit", icon: ArrowDownCircle, isCenter: true },
  { path: "/bonus", label: "Bonus", icon: Gift },
  { path: "/profile", label: "Profile", icon: User },
];

type LayoutCode = { css?: string; headHtml?: string; bodyHtml?: string; bodyJs?: string };

function getLayoutKey(pathname: string): string {
  if (pathname === "/" || pathname.startsWith("/?")) return "home";
  if (pathname.startsWith("/games")) return "game";
  if (pathname.startsWith("/deposit")) return "deposit";
  if (pathname.startsWith("/withdraw")) return "withdraw";
  if (pathname.startsWith("/bonus")) return "bonus";
  if (pathname.startsWith("/profile")) return "profile";
  if (pathname.startsWith("/history")) return "history";
  return "home";
}

function clearInjectedHeadNodes() {
  document
    .querySelectorAll('[data-layout-head-injected="1"]')
    .forEach((node) => node.parentNode?.removeChild(node));
}

function appendHeadHtml(html: string) {
  if (!html.trim()) return;
  const template = document.createElement("template");
  template.innerHTML = html;
  for (const node of Array.from(template.content.childNodes)) {
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    (node as Element).setAttribute("data-layout-head-injected", "1");
    document.head.appendChild(node);
  }
}

function setStyleInjection(css: string) {
  const id = "__layout_injected_css__";
  let styleTag = document.getElementById(id) as HTMLStyleElement | null;
  if (!css.trim()) {
    styleTag?.remove();
    return;
  }
  if (!styleTag) {
    styleTag = document.createElement("style");
    styleTag.id = id;
    document.head.appendChild(styleTag);
  }
  styleTag.textContent = css;
}

function runBodyJs(js: string) {
  const id = "__layout_injected_body_js__";
  const old = document.getElementById(id);
  if (old) old.remove();
  if (!js.trim()) return;
  const script = document.createElement("script");
  script.id = id;
  script.type = "text/javascript";
  script.text = js;
  document.body.appendChild(script);
}

export default function PlayerLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { isAuthenticated, accessToken } = usePlayerAuth();
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const lastMarkedThreadIdRef = useRef<number | null>(null);
  const utils = trpc.useUtils();

  const frontendLayoutQuery = trpc.player.frontendLayout.useQuery(
    { token: accessToken || "" },
    { enabled: true }
  );

  const balanceQuery = trpc.player.balance.useQuery(
    { token: accessToken || "" },
    { enabled: !!accessToken, refetchInterval: 30000 }
  );
  const chatThreadQuery = trpc.player.chat.getOrCreateThread.useQuery(
    { token: accessToken || "" },
    { enabled: !!accessToken && isAuthenticated, refetchInterval: 20000 }
  );
  const chatMarkReadMutation = trpc.player.chat.markRead.useMutation();

  const layoutKey = getLayoutKey(location);
  const layoutConfig = (frontendLayoutQuery.data as any) || null;
  const siteName = String(layoutConfig?.siteName || "").trim();
  const logoUrl = String(layoutConfig?.logoUrl || "").trim();
  const footerText = String(layoutConfig?.footerText || "").trim();

  const mergedCode = useMemo(() => {
    const map = (layoutConfig?.layoutInjections || {}) as Record<string, LayoutCode>;
    const globalCode = map.global || {};
    const pageCode = map[layoutKey] || (layoutKey === "game" ? map.games || {} : {});
    return {
      css: [layoutConfig?.customCss || "", globalCode.css || "", pageCode.css || ""].filter(Boolean).join("\n"),
      headHtml: [layoutConfig?.customHeadHtml || "", globalCode.headHtml || "", pageCode.headHtml || ""].filter(Boolean).join("\n"),
      bodyHtml: [globalCode.bodyHtml || "", pageCode.bodyHtml || ""].filter(Boolean).join("\n"),
      bodyJs: [layoutConfig?.customBodyJs || "", globalCode.bodyJs || "", pageCode.bodyJs || ""].filter(Boolean).join("\n"),
    };
  }, [layoutConfig, layoutKey]);

  useEffect(() => {
    document.title = siteName || "TgGaming";
  }, [siteName]);

  useEffect(() => {
    setLogoLoadFailed(false);
  }, [logoUrl]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const applyAfterRenderStable = () => {
      timer = setTimeout(() => {
        setStyleInjection(mergedCode.css);
        clearInjectedHeadNodes();
        appendHeadHtml(mergedCode.headHtml);
        runBodyJs(mergedCode.bodyJs);
      }, 250);
    };

    if (document.readyState === "complete") {
      applyAfterRenderStable();
    } else {
      const onLoad = () => applyAfterRenderStable();
      window.addEventListener("load", onLoad, { once: true });
    }

    return () => {
      if (timer) clearTimeout(timer);
      clearInjectedHeadNodes();
      setStyleInjection("");
      runBodyJs("");
    };
  }, [mergedCode.css, mergedCode.headHtml, mergedCode.bodyJs, location]);

  const balance = (balanceQuery.data as any)?.balance;
  const unreadChatCount = Number((chatThreadQuery.data as any)?.thread?.unreadForPlayer || 0);
  const activeThreadId = Number((chatThreadQuery.data as any)?.thread?.id || 0) || null;
  const isChatRoute = location.startsWith("/chat");

  useEffect(() => {
    if (!accessToken || !isAuthenticated) return;
    const socket: Socket = io(window.location.origin, {
      path: "/ws",
      auth: { token: accessToken },
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
      reconnectionDelay: 1500,
    });
    const onChat = () => {
      void chatThreadQuery.refetch();
    };
    socket.on("chat:new_message", onChat);
    socket.on("chat:thread_updated", onChat);
    return () => {
      socket.off("chat:new_message", onChat);
      socket.off("chat:thread_updated", onChat);
      socket.disconnect();
    };
  }, [accessToken, isAuthenticated, chatThreadQuery]);

  useEffect(() => {
    if (!isChatRoute || !accessToken || !activeThreadId) return;
    if (lastMarkedThreadIdRef.current === activeThreadId && unreadChatCount <= 0) return;
    lastMarkedThreadIdRef.current = activeThreadId;
    chatMarkReadMutation.mutate({ token: accessToken, threadId: activeThreadId }, {
      onSuccess: () => {
        utils.player.chat.getOrCreateThread.setData({ token: accessToken }, (prev: any) => {
          if (!prev?.thread) return prev;
          return {
            ...prev,
            thread: {
              ...prev.thread,
              unreadForPlayer: 0,
            },
          };
        });
        void chatThreadQuery.refetch();
      },
    });
  }, [isChatRoute, accessToken, activeThreadId, unreadChatCount, chatMarkReadMutation, chatThreadQuery, utils.player.chat.getOrCreateThread]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top header */}
      <header className="sticky top-0 z-40 bg-card/80 backdrop-blur-xl border-b border-white/5 px-4 py-2.5 flex items-center justify-between">
        <Link href="/">
          <div className="flex items-center gap-2.5 cursor-pointer">
            {logoUrl && !logoLoadFailed ? (
              <img
                src={logoUrl}
                alt=""
                className="h-9 w-auto object-contain block"
                onError={() => setLogoLoadFailed(true)}
              />
            ) : (
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)" }}
              >
                <Gamepad2 className="w-5 h-5 text-white" />
              </div>
            )}
            {siteName && (
              <span className="font-bold text-lg tracking-tight">{siteName}</span>
            )}
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
        {mergedCode.bodyHtml && (
          <div
            className="px-4 py-4"
            dangerouslySetInnerHTML={{ __html: mergedCode.bodyHtml }}
          />
        )}
        {footerText && (
          <div className="px-4 py-5 text-center text-xs text-muted-foreground/80">
            {footerText}
          </div>
        )}
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

      {/* Global fixed contact/chat entry */}
      <Link href={isAuthenticated ? "/chat" : "/login"}>
        <button
          type="button"
          aria-label="Contact Support"
          title="Contact Support"
          className="fixed right-4 bottom-24 z-40 h-12 w-12 rounded-full border border-sky-400/40 bg-sky-500/85 text-white shadow-lg shadow-sky-900/40 backdrop-blur-sm transition hover:scale-105 hover:bg-sky-500 active:scale-95 flex items-center justify-center"
        >
          <MessageCircle className="h-5 w-5" />
          {isAuthenticated && !isChatRoute && unreadChatCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
              {unreadChatCount > 99 ? "99+" : unreadChatCount}
            </span>
          )}
        </button>
      </Link>
    </div>
  );
}
