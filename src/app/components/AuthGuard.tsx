import { useState, useEffect } from "react";
import { Navigate, Outlet } from "react-router";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import type { Session } from "@supabase/supabase-js";
import React from "react";

export function AuthGuard() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) {
      // Supabase not set up — allow access (dev/mock mode)
      setSession(null as unknown as Session);
      return;
    }

    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // Still checking
  if (session === undefined) return (
    <div className="min-h-screen bg-[#faf8ff] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-[#2563eb] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // Not configured — bypass auth
  if (!isSupabaseConfigured()) return <Outlet />;

  // Authenticated
  if (session) return <Outlet />;

  // Not authenticated — redirect to login
  return <Navigate to="/login" replace />;
}
