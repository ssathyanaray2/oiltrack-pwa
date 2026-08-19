import { useState, useEffect } from "react";
import { Navigate, Outlet } from "react-router";
import { getSession } from "../../lib/neonAuth";

export function AuthGuard() {
  const [user, setUser] = useState<{ id: string; email: string } | null | undefined>(undefined);

  useEffect(() => {
    getSession().then(setUser);
  }, []);

  if (user === undefined) {
    return (
      <div className="min-h-screen bg-[#faf8ff] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#2563eb] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return <Outlet />;
}
