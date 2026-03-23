import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { supabase } from "../../lib/supabase";
import { Droplets } from "lucide-react";
import React from "react";

type Mode = "signin" | "signup";

export function Login() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupDone, setSignupDone] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate("/", { replace: true });
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setError(null);
    setLoading(true);

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/", { replace: true });
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setSignupDone(true);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (signupDone) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="bg-primary/10 p-4 rounded-2xl inline-flex mx-auto">
            <Droplets className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-2xl font-semibold">Check your email</h2>
          <p className="text-muted-foreground">
            We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account, then sign in.
          </p>
          <button
            className="text-primary underline text-sm"
            onClick={() => { setMode("signin"); setSignupDone(false); }}
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="bg-primary/10 p-4 rounded-2xl inline-flex">
            <Droplets className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">OilTrack</h1>
          <p className="text-muted-foreground text-sm">Oil distribution management</p>
        </div>

        {/* Card */}
        <div className="bg-card rounded-2xl p-6 shadow-md border-2 border-border space-y-6">
          <div className="flex rounded-xl bg-muted p-1 gap-1">
            <button
              type="button"
              onClick={() => { setMode("signin"); setError(null); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === "signin" ? "bg-card shadow text-foreground" : "text-muted-foreground"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode("signup"); setError(null); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === "signup" ? "bg-card shadow text-foreground" : "text-muted-foreground"
              }`}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border-2 border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary transition-colors"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border-2 border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary transition-colors"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary/90 disabled:opacity-60 text-primary-foreground rounded-xl py-3 font-medium transition-colors"
            >
              {loading
                ? mode === "signin" ? "Signing in…" : "Creating account…"
                : mode === "signin" ? "Sign In" : "Create Account"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
