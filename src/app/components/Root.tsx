import { useState, useEffect } from "react";
import { Outlet, Link, useLocation } from "react-router";
import { Home, Package, ShoppingCart, Users, WifiOff, LogOut } from "lucide-react";
import { useOnlineStatus } from "../hooks/useOfflineStorage";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { getFeatureFlags } from "../../lib/api";
import { FeatureFlagsContext, defaultFlags, type FeatureFlags } from "../../lib/featureFlags";
import React from "react";

export function Root() {
  const location = useLocation();
  const isOnline = useOnlineStatus();
  const [flags, setFlags] = useState<FeatureFlags>(defaultFlags);

  useEffect(() => {
    if (!isSupabaseConfigured() || !isOnline) return;
    getFeatureFlags().then(setFlags).catch(console.error);
  }, [isOnline]);

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
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <FeatureFlagsContext.Provider value={flags}>
      <div className="min-h-screen flex flex-col pb-20" style={{ backgroundColor: "#faf8ff" }}>
        {/* Offline Banner */}
        {!isOnline && (
          <div className="sticky top-0 z-40 bg-orange-100 border-b border-orange-200 text-orange-800 px-4 py-3 flex items-center justify-center gap-2">
            <WifiOff className="h-4 w-4 flex-shrink-0" />
            <span className="text-sm font-semibold">You're offline. Data loaded from cache.</span>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 max-w-lg mx-auto w-full">
          <Outlet />
        </main>

        {/* Bottom Navigation */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-xl shadow-[0_-4px_20px_rgba(0,74,198,0.08)] border-t border-[#eaedff]">
          <div className="flex justify-around items-center h-[68px] max-w-lg mx-auto px-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex flex-col items-center justify-center gap-1 py-2 px-4 rounded-xl transition-all duration-200 min-w-[72px] ${
                    active
                      ? "text-[#004ac6] bg-[#eaedff]"
                      : "text-[#434655] hover:text-[#004ac6]"
                  }`}
                >
                  <Icon className={`h-6 w-6 ${active ? "stroke-[2.5]" : "stroke-2"}`} />
                  <span className={`text-[10px] uppercase tracking-wider font-semibold ${active ? "text-[#004ac6]" : ""}`}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
            {isSupabaseConfigured() && (
              <button
                onClick={handleSignOut}
                className="flex flex-col items-center justify-center gap-1 py-2 px-4 rounded-xl transition-all duration-200 min-w-[72px] text-[#434655] hover:text-[#ba1a1a]"
              >
                <LogOut className="h-6 w-6 stroke-2" />
                <span className="text-[10px] uppercase tracking-wider font-semibold">Sign Out</span>
              </button>
            )}
          </div>
        </nav>
      </div>
    </FeatureFlagsContext.Provider>
  );
}
