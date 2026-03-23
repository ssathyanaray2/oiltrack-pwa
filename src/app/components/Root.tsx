import { Outlet, Link, useLocation } from "react-router";
import { Home, Package, ShoppingCart, Users, WifiOff, LogOut } from "lucide-react";
import { useOnlineStatus } from "../hooks/useOfflineStorage";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import React from "react";

export function Root() {
  const location = useLocation();
  const isOnline = useOnlineStatus();

  const handleSignOut = async () => {
    if (isSupabaseConfigured() && supabase) {
      await supabase.auth.signOut();
    }
  };

  const navItems = [
    { path: "/", icon: Home, label: "Dashboard" },
    { path: "/inventory", icon: Package, label: "Inventory" },
    { path: "/orders", icon: ShoppingCart, label: "Orders" },
    { path: "/customers", icon: Users, label: "Customers" },
  ];

  const isActive = (path: string) => {
    if (path === "/") {
      return location.pathname === "/";
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen flex flex-col pb-20">
      {/* Offline Banner */}
      {!isOnline && (
        <div className="sticky top-0 z-40 bg-accent/95 border-b-2 border-accent text-accent-foreground px-4 py-3 flex items-center justify-center gap-2">
          <WifiOff className="h-5 w-5 flex-shrink-0" />
          <span className="font-medium">You're offline. Data is loaded from cache.</span>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t-2 border-border shadow-lg">
        <div className="flex justify-around items-center h-20 max-w-2xl mx-auto px-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center justify-center gap-1 py-2 px-4 rounded-xl transition-colors min-w-[80px] ${
                  active
                    ? "text-primary bg-secondary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-7 w-7" />
                <span className="text-sm">{item.label}</span>
              </Link>
            );
          })}
          {isSupabaseConfigured() && (
            <button
              onClick={handleSignOut}
              className="flex flex-col items-center justify-center gap-1 py-2 px-4 rounded-xl transition-colors min-w-[80px] text-muted-foreground hover:text-destructive"
            >
              <LogOut className="h-7 w-7" />
              <span className="text-sm">Sign Out</span>
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}