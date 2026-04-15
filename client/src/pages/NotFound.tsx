import { Button } from "@/components/ui/button";
import { Home, ArrowLeft, Gamepad2, Shield } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [location, setLocation] = useLocation();

  const isAdminRoute = location.startsWith("/admin");

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-48 h-48 rounded-full bg-purple-500/5 blur-3xl" />
      </div>

      <div className="relative z-10 text-center px-6 max-w-md">
        {/* Icon */}
        <div className="mb-6 inline-flex items-center justify-center">
          <div className="relative">
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-primary/20 to-purple-500/10 flex items-center justify-center border border-white/5">
              {isAdminRoute ? (
                <Shield className="w-12 h-12 text-primary/60" />
              ) : (
                <Gamepad2 className="w-12 h-12 text-primary/60" />
              )}
            </div>
            <div className="absolute -top-2 -right-2 w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <span className="text-red-500 text-xs font-bold">!</span>
            </div>
          </div>
        </div>

        {/* Text */}
        <h1 className="text-6xl font-bold text-foreground mb-2 tracking-tight">404</h1>
        <h2 className="text-lg font-semibold text-foreground/80 mb-3">Page Not Found</h2>
        <p className="text-sm text-muted-foreground leading-relaxed mb-8">
          The page you are looking for does not exist or has been moved.
          {isAdminRoute && " Please check your admin permissions."}
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            onClick={() => window.history.back()}
            variant="outline"
            className="rounded-xl px-6"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
          <Button
            onClick={() => setLocation(isAdminRoute ? "/admin" : "/")}
            className="rounded-xl px-6"
            style={{ background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)" }}
          >
            <Home className="w-4 h-4 mr-2" />
            {isAdminRoute ? "Admin Dashboard" : "Home"}
          </Button>
        </div>
      </div>
    </div>
  );
}
