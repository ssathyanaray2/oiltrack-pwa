import { useState } from "react";
import { useNavigate } from "react-router";
import { Droplets } from "lucide-react";

const BASE = import.meta.env.VITE_NEON_AUTH_URL as string;

export function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  const token = new URLSearchParams(window.location.search).get("token");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords do not match"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (!token) { setError("Invalid or missing reset token"); return; }

    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Reset failed");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="text-center space-y-2">
          <p className="text-destructive font-medium">Invalid reset link.</p>
          <button className="text-primary underline text-sm" onClick={() => navigate("/login")}>Back to sign in</button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="bg-primary/10 p-4 rounded-2xl inline-flex mx-auto">
            <Droplets className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-2xl font-semibold">Password updated</h2>
          <p className="text-muted-foreground text-sm">You can now sign in with your new password.</p>
          <button className="text-primary underline text-sm" onClick={() => navigate("/login")}>Sign in</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <div className="bg-primary/10 p-4 rounded-2xl inline-flex">
            <Droplets className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">Reset Password</h1>
        </div>

        <div className="bg-card rounded-2xl p-6 shadow-md border-2 border-border space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground" htmlFor="password">New Password</label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full rounded-xl border-2 border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary transition-colors"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground" htmlFor="confirm">Confirm Password</label>
              <input
                id="confirm"
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat password"
                className="w-full rounded-xl border-2 border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary transition-colors"
              />
            </div>
            {error && <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary/90 disabled:opacity-60 text-primary-foreground rounded-xl py-3 font-medium transition-colors"
            >
              {loading ? "Updating…" : "Set New Password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
