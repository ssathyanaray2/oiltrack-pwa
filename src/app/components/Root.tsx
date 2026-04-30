import { useState, useEffect } from "react";
import { Outlet, Link, useLocation } from "react-router";
import { Home, Package, ShoppingCart, Users, WifiOff, LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useOnlineStatus } from "../hooks/useOfflineStorage";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { getFeatureFlags } from "../../lib/api";
import { FeatureFlagsContext, defaultFlags, type FeatureFlags } from "../../lib/featureFlags";
import React from "react";

export function Root() {
  const location = useLocation();
  const isOnline = useOnlineStatus();
  const [flags, setFlags] = useState<FeatureFlags>(defaultFlags);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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

  const sidebarW = sidebarCollapsed ? "lg:w-[72px]" : "lg:w-56";
  const mainML = sidebarCollapsed ? "lg:ml-[72px]" : "lg:ml-56";

  return (
    <FeatureFlagsContext.Provider value={flags}>
      <div className="min-h-screen flex" style={{ backgroundColor: "#faf8ff" }}>

        {/* Sidebar — desktop only */}
        <aside
          className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 ${sidebarW} bg-white border-r border-[#eaedff] z-50 shadow-[2px_0_12px_rgba(0,74,198,0.06)] transition-[width] duration-200 overflow-hidden`}
        >
          {/* Brand */}
          <div className="h-[68px] flex items-center gap-3 px-4 border-b border-[#eaedff] flex-shrink-0">
            <div className="w-8 h-8 rounded-xl bg-[#004ac6] text-white flex items-center justify-center font-extrabold text-sm flex-shrink-0">
              OT
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0 overflow-hidden">
                <div className="font-extrabold tracking-tight text-[17px] leading-none text-[#131b2e] whitespace-nowrap">OilTrack</div>
                <div className="text-[10px] font-semibold text-[#737686] tracking-widest uppercase mt-1 whitespace-nowrap">Distributor</div>
              </div>
            )}
          </div>

          {/* Nav items */}
          <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
            {!sidebarCollapsed && (
              <div className="px-3 pt-1 pb-2 text-[10px] font-bold tracking-widest uppercase text-[#737686] whitespace-nowrap">
                Manage
              </div>
            )}
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  title={sidebarCollapsed ? item.label : undefined}
                  className={`flex items-center gap-3 ${sidebarCollapsed ? "justify-center" : ""} px-3 py-2.5 rounded-xl transition-all duration-200 text-sm font-semibold whitespace-nowrap ${
                    active
                      ? "text-[#004ac6] bg-[#eaedff]"
                      : "text-[#434655] hover:text-[#004ac6] hover:bg-[#f2f3ff]"
                  }`}
                >
                  <Icon className={`h-[18px] w-[18px] flex-shrink-0 ${active ? "stroke-[2.5]" : "stroke-2"}`} />
                  {!sidebarCollapsed && <span className="flex-1">{item.label}</span>}
                  {!sidebarCollapsed && active && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#004ac6] flex-shrink-0" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Bottom: sign out + collapse toggle */}
          <div className="px-2 pb-4 pt-3 border-t border-[#eaedff] space-y-1 flex-shrink-0">
            {isSupabaseConfigured() && (
              <button
                onClick={handleSignOut}
                title={sidebarCollapsed ? "Sign Out" : undefined}
                className={`flex items-center gap-3 ${sidebarCollapsed ? "justify-center" : ""} w-full px-3 py-2.5 rounded-xl text-sm font-semibold text-[#434655] hover:text-[#ba1a1a] hover:bg-red-50 transition-all duration-200 whitespace-nowrap`}
              >
                <LogOut className="h-[18px] w-[18px] flex-shrink-0 stroke-2" />
                {!sidebarCollapsed && <span>Sign Out</span>}
              </button>
            )}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={`flex items-center gap-3 ${sidebarCollapsed ? "justify-center" : ""} w-full px-3 py-2.5 rounded-xl text-sm font-semibold text-[#737686] hover:bg-[#f2f3ff] transition-all duration-200 whitespace-nowrap`}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="h-[18px] w-[18px] flex-shrink-0" />
              ) : (
                <>
                  <PanelLeftClose className="h-[18px] w-[18px] flex-shrink-0" />
                  <span>Collapse</span>
                </>
              )}
            </button>
          </div>
        </aside>

        {/* Main content area */}
        <div className={`flex-1 ${mainML} flex flex-col min-h-screen pb-20 lg:pb-0 transition-[margin] duration-200 min-w-0 overflow-x-hidden`}>
          {/* Offline Banner */}
          {!isOnline && (
            <div className="sticky top-0 z-40 bg-orange-100 border-b border-orange-200 text-orange-800 px-4 py-3 flex items-center justify-center gap-2">
              <WifiOff className="h-4 w-4 flex-shrink-0" />
              <span className="text-sm font-semibold">You're offline. Data loaded from cache.</span>
            </div>
          )}

          {/* Page content */}
          <main className="flex-1 w-full overflow-x-hidden">
            <Outlet />
          </main>
        </div>

        {/* Bottom Navigation — mobile only */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-xl shadow-[0_-4px_20px_rgba(0,74,198,0.08)] border-t border-[#eaedff]">
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
