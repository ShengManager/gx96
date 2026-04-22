import { useState, useCallback } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useAdminNotifications } from "@/hooks/useAdminNotifications";
import { trpc } from "@/lib/trpc";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  LayoutDashboard, Users, ArrowDownCircle, ArrowUpCircle,
  Gift, Building2, Settings, FileText, Image, Images, ClipboardList, Palette,
  LogOut, Menu, X, Shield, ChevronRight, ChevronDown,
  Bell, Wifi, WifiOff, Globe, Bot, MessageSquare,
} from "lucide-react";

interface NavSection {
  label: string;
  items: NavItem[];
  defaultOpen?: boolean;
}

interface NavItem {
  path: string;
  label: string;
  icon: any;
  module: string;
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    defaultOpen: true,
    items: [
      { path: "/admin", label: "Dashboard", icon: LayoutDashboard, module: "dashboard" },
    ],
  },
  {
    label: "Operations",
    defaultOpen: true,
    items: [
      { path: "/admin/players", label: "Players", icon: Users, module: "player" },
      { path: "/admin/deposits", label: "Deposits", icon: ArrowDownCircle, module: "deposit" },
      { path: "/admin/withdrawals", label: "Withdrawals", icon: ArrowUpCircle, module: "withdraw" },
      { path: "/admin/live-chat", label: "Live Chat", icon: MessageSquare, module: "livechat" },
    ],
  },
  {
    label: "Marketing",
    defaultOpen: true,
    items: [
      { path: "/admin/bonuses", label: "Bonuses", icon: Gift, module: "bonus" },
      { path: "/admin/banners", label: "Banners", icon: Image, module: "banner" },
      { path: "/admin/media", label: "Media Library", icon: Images, module: "banner" },
    ],
  },
  {
    label: "Finance",
    defaultOpen: true,
    items: [
      { path: "/admin/banks", label: "Banks", icon: Building2, module: "bank" },
      { path: "/admin/reports", label: "Reports", icon: FileText, module: "report" },
    ],
  },
  {
    label: "System",
    defaultOpen: false,
    items: [
      { path: "/admin/logs", label: "Audit Logs", icon: ClipboardList, module: "log" },
      { path: "/admin/layouts", label: "Layouts", icon: Palette, module: "setting" },
      { path: "/admin/settings", label: "Settings", icon: Settings, module: "setting" },
      { path: "/admin/setup-guide", label: "Setup Guide", icon: FileText, module: "setting" },
    ],
  },
];

function pendingBadgeForPath(
  path: string,
  deposits: number,
  withdrawals: number,
  liveChats: number
): number | undefined {
  if (path === "/admin/deposits" && deposits > 0) return deposits;
  if (path === "/admin/withdrawals" && withdrawals > 0) return withdrawals;
  if (path === "/admin/live-chat" && liveChats > 0) return liveChats;
  return undefined;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, hasPermission, accessToken } = useAdminAuth();
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const utils = trpc.useUtils();

  const pendingCountsQuery = trpc.adminFinance.pendingActionCounts.useQuery(
    { token: accessToken ?? "" },
    {
      enabled: !!user && !!accessToken,
      refetchInterval: 20_000,
      staleTime: 10_000,
    }
  );

  const invalidatePendingCounts = useCallback(() => {
    void utils.adminFinance.pendingActionCounts.invalidate();
  }, [utils]);
  const invalidateLiveChatCounts = useCallback(() => {
    void utils.adminLiveChat.counts.invalidate();
  }, [utils]);

  const { connected: wsConnected, unreadOrders, unreadChats: wsUnreadChats, clearUnread } = useAdminNotifications({
    accessToken,
    enabled: !!user && !!accessToken,
    hasPermission,
    currentAdminUserId: user?.id,
    onRealtimeOrder: invalidatePendingCounts,
    onRealtimeChat: invalidateLiveChatCounts,
  });
  const liveChatCountsQuery = trpc.adminLiveChat.counts.useQuery(
    { token: accessToken ?? "" },
    {
      enabled: !!user && !!accessToken && hasPermission("livechat", "view"),
      refetchInterval: 20_000,
      staleTime: 10_000,
    }
  );
  const unreadChats = Math.max(
    Number((liveChatCountsQuery.data as any)?.unreadMessages || 0),
    Number(wsUnreadChats || 0)
  );
  const chatBadgeCount = Number((liveChatCountsQuery.data as any)?.badgeCount || 0);
  const unreadBell = unreadOrders + unreadChats;

  const visibleSections = NAV_SECTIONS.map(section => ({
    ...section,
    items: section.items.filter(item => hasPermission(item.module, "view")),
  })).filter(section => section.items.length > 0);

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col transition-transform duration-200 ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        {/* Brand Header */}
        <div className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl gaming-gradient flex items-center justify-center shadow-lg">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-sm truncate">TgGaming</h2>
            <p className="text-xs text-sidebar-foreground/50 truncate">{user?.displayName || user?.username}</p>
          </div>
          <Button variant="ghost" size="icon" className="lg:hidden h-8 w-8" onClick={() => setSidebarOpen(false)}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Connection Status */}
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-sidebar-accent/30 text-xs">
            {wsConnected ? (
              <><Wifi className="w-3 h-3 text-green-500" /><span className="text-green-500">Connected</span></>
            ) : (
              <><WifiOff className="w-3 h-3 text-amber-500" /><span className="text-amber-500">Connecting...</span></>
            )}
            <span className="ml-auto text-sidebar-foreground/40">WS</span>
          </div>
        </div>

        <Separator className="bg-sidebar-border" />

        {/* Navigation */}
        <ScrollArea className="flex-1 py-2">
          <nav className="px-2 space-y-1">
            {visibleSections.map((section, sIdx) => (
              <Collapsible key={sIdx} defaultOpen={section.defaultOpen}>
                <CollapsibleTrigger className="flex items-center gap-2 px-3 py-1.5 w-full text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/40 hover:text-sidebar-foreground/60 transition-colors">
                  <ChevronDown className="w-3 h-3 transition-transform group-data-[state=closed]:rotate-[-90deg]" />
                  {section.label}
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-0.5 mt-0.5">
                  {section.items.map(item => {
                    const isActive = location === item.path || (item.path !== "/admin" && location.startsWith(item.path));
                    const d = pendingCountsQuery.data?.deposits ?? 0;
                    const w = pendingCountsQuery.data?.withdrawals ?? 0;
                    const navBadge = pendingBadgeForPath(item.path, d, w, chatBadgeCount);
                    return (
                      <Link key={item.path} href={item.path}>
                        <div
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all cursor-pointer group ${
                            isActive
                              ? "bg-primary/15 text-primary font-medium border-l-2 border-primary ml-0.5"
                              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                          }`}
                          onClick={() => setSidebarOpen(false)}
                        >
                          <item.icon className={`w-4 h-4 shrink-0 ${isActive ? "text-primary" : ""}`} />
                          <span className="truncate flex-1 min-w-0">{item.label}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            {navBadge != null && navBadge > 0 && (
                              <span
                                className="flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1.5 text-[10px] font-bold leading-none text-white tabular-nums shadow-sm"
                                title={`${navBadge} pending`}
                              >
                                {navBadge > 99 ? "99+" : navBadge}
                              </span>
                            )}
                            {isActive && <ChevronRight className="w-3 h-3 text-primary/50" />}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </CollapsibleContent>
              </Collapsible>
            ))}
          </nav>
        </ScrollArea>

        <Separator className="bg-sidebar-border" />

        {/* Footer */}
        <div className="p-3 space-y-1">
          <div className="px-3 py-1.5 text-xs text-sidebar-foreground/40">
            Role: <Badge variant="outline" className="text-[10px] h-4 px-1">{user?.role || "admin"}</Badge>
          </div>
          <Button variant="ghost" className="w-full justify-start gap-2 text-sidebar-foreground/70 hover:text-red-400 hover:bg-red-500/10" onClick={logout}>
            <LogOut className="w-4 h-4" />
            <span className="text-sm">Logout</span>
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0">
        <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5" />
          </Button>
          <h1 className="font-semibold text-sm lg:hidden">TgGaming Admin</h1>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            title={unreadBell > 0 ? `${unreadBell} unread notification(s) — click to clear badge` : "Notifications"}
            onClick={() => clearUnread()}
          >
            <Bell className="w-4 h-4" />
            {unreadBell > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-0.5 bg-red-500 text-white text-[9px] rounded-full flex items-center justify-center">
                {unreadBell > 99 ? "99+" : unreadBell}
              </span>
            )}
          </Button>
        </header>
        <div className="p-4 lg:p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
