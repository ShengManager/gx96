import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AdminAuthProvider, useAdminAuth } from "./contexts/AdminAuthContext";
import { PlayerAuthProvider, usePlayerAuth } from "./contexts/PlayerAuthContext";

// Admin pages
import AdminLogin from "./pages/admin/AdminLogin";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminPlayers from "./pages/admin/AdminPlayers";
import AdminDeposits from "./pages/admin/AdminDeposits";
import AdminWithdrawals from "./pages/admin/AdminWithdrawals";
import AdminBonuses from "./pages/admin/AdminBonuses";
import AdminBanks from "./pages/admin/AdminBanks";
import AdminBanners from "./pages/admin/AdminBanners";
import AdminMedia from "./pages/admin/AdminMedia";
import AdminReports from "./pages/admin/AdminReports";
import AdminSettings from "./pages/admin/AdminSettings";
import AdminLayouts from "./pages/admin/AdminLayouts";
import AdminLogs from "./pages/admin/AdminLogs";
import AdminSetupGuide from "./pages/admin/AdminSetupGuide";
import AdminLiveChat from "./pages/admin/AdminLiveChat";
import AdminLayout from "./pages/admin/AdminLayout";

// Player pages
import PlayerHome from "./pages/player/PlayerHome";
import PlayerGames from "./pages/player/PlayerGames";
import PlayerBonus from "./pages/player/PlayerBonus";
import PlayerDeposit from "./pages/player/PlayerDeposit";
import PlayerWithdraw from "./pages/player/PlayerWithdraw";
import PlayerHistory from "./pages/player/PlayerHistory";
import PlayerProfile from "./pages/player/PlayerProfile";
import PlayerLogin from "./pages/player/PlayerLogin";
import PlayerLayout from "./pages/player/PlayerLayout";
import PlayerChat from "./pages/player/PlayerChat";
import TopAdminPage from "./pages/topadmin/TopAdminPage";

function getFirstAllowedAdminPath(hasPermission: (module: string, action: "view" | "edit" | "delete") => boolean): string {
  const routeByPermission: Array<{ path: string; module: string }> = [
    { path: "/admin", module: "dashboard" },
    { path: "/admin/players", module: "player" },
    { path: "/admin/deposits", module: "deposit" },
    { path: "/admin/withdrawals", module: "withdraw" },
    { path: "/admin/live-chat", module: "livechat" },
    { path: "/admin/bonuses", module: "bonus" },
    { path: "/admin/banks", module: "bank" },
    { path: "/admin/reports", module: "report" },
    { path: "/admin/banners", module: "banner" },
    { path: "/admin/media", module: "banner" },
    { path: "/admin/logs", module: "log" },
    { path: "/admin/layouts", module: "setting" },
    { path: "/admin/settings", module: "setting" },
    { path: "/admin/setup-guide", module: "setting" },
  ];
  const first = routeByPermission.find((item) => hasPermission(item.module, "view"));
  return first?.path || "/admin/login";
}

function AdminProtected({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAdminAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div>;
  if (!isAuthenticated) return <Redirect to="/admin/login" />;
  return <AdminLayout>{children}</AdminLayout>;
}

function AdminProtectedWithPermission({
  children,
  module,
  action = "view",
}: {
  children: React.ReactNode;
  module: string;
  action?: "view" | "edit" | "delete";
}) {
  const { isAuthenticated, loading, hasPermission } = useAdminAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div>;
  if (!isAuthenticated) return <Redirect to="/admin/login" />;
  if (!hasPermission(module, action)) return <Redirect to={getFirstAllowedAdminPath(hasPermission)} />;
  return <AdminLayout>{children}</AdminLayout>;
}

/** Route guard for player pages that require authentication */
function PlayerProtected({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = usePlayerAuth();
  if (loading) return (
    <PlayerLayout>
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    </PlayerLayout>
  );
  if (!isAuthenticated) return <Redirect to="/login" />;
  return <PlayerLayout>{children}</PlayerLayout>;
}

function Router() {
  return (
    <Switch>
      {/* Admin routes */}
      <Route path="/topadmin" component={TopAdminPage} />
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin">{() => <AdminProtectedWithPermission module="dashboard"><AdminDashboard /></AdminProtectedWithPermission>}</Route>
      <Route path="/admin/players">{() => <AdminProtected><AdminPlayers /></AdminProtected>}</Route>
      <Route path="/admin/deposits">{() => <AdminProtected><AdminDeposits /></AdminProtected>}</Route>
      <Route path="/admin/withdrawals">{() => <AdminProtected><AdminWithdrawals /></AdminProtected>}</Route>
      <Route path="/admin/bonuses">{() => <AdminProtected><AdminBonuses /></AdminProtected>}</Route>
      <Route path="/admin/banks">{() => <AdminProtected><AdminBanks /></AdminProtected>}</Route>
      <Route path="/admin/banners">{() => <AdminProtected><AdminBanners /></AdminProtected>}</Route>
      <Route path="/admin/media">{() => <AdminProtected><AdminMedia /></AdminProtected>}</Route>
      <Route path="/admin/reports">{() => <AdminProtected><AdminReports /></AdminProtected>}</Route>
      <Route path="/admin/settings">{() => <AdminProtectedWithPermission module="setting"><AdminSettings /></AdminProtectedWithPermission>}</Route>
      <Route path="/admin/layouts">{() => <AdminProtected><AdminLayouts /></AdminProtected>}</Route>
      <Route path="/admin/live-chat">{() => <AdminProtected><AdminLiveChat /></AdminProtected>}</Route>
      <Route path="/admin/logs">{() => <AdminProtected><AdminLogs /></AdminProtected>}</Route>
      <Route path="/admin/setup-guide">{() => <AdminProtected><AdminSetupGuide /></AdminProtected>}</Route>

      {/* Player public routes (accessible without login) */}
      <Route path="/login" component={PlayerLogin} />
      <Route path="/">{() => <PlayerLayout><PlayerHome /></PlayerLayout>}</Route>
      <Route path="/games">{() => <PlayerLayout><PlayerGames /></PlayerLayout>}</Route>
      <Route path="/bonus">{() => <PlayerLayout><PlayerBonus /></PlayerLayout>}</Route>

      {/* Player protected routes (require login) */}
      <Route path="/deposit">{() => <PlayerProtected><PlayerDeposit /></PlayerProtected>}</Route>
      <Route path="/withdraw">{() => <PlayerProtected><PlayerWithdraw /></PlayerProtected>}</Route>
      <Route path="/history">{() => <PlayerProtected><PlayerHistory /></PlayerProtected>}</Route>
      <Route path="/profile">{() => <PlayerProtected><PlayerProfile /></PlayerProtected>}</Route>
      <Route path="/chat">{() => <PlayerProtected><PlayerChat /></PlayerProtected>}</Route>

      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <AdminAuthProvider>
          <PlayerAuthProvider>
            <TooltipProvider>
              <Toaster />
              <Router />
            </TooltipProvider>
          </PlayerAuthProvider>
        </AdminAuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
