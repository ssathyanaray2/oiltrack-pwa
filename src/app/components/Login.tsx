import { useState } from "react";
import { useNavigate } from "react-router";
import { signIn, signUp, saveAuthToken } from "../../lib/neonAuth";
import { Droplets } from "lucide-react";

type Mode = "signin" | "signup";

export function Login() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupDone, setSignupDone] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === "signin") {
        const { token } = await signIn(email, password);
        saveAuthToken(token);
        navigate("/", { replace: true });
      } else {
        const { token } = await signUp(email, password, name || email);
        saveAuthToken(token);
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
          <h2 className="text-2xl font-semibold">Account created</h2>
          <p className="text-muted-foreground">
            Your account for <strong>{email}</strong> is ready. Sign in to continue.
          </p>
          <button
            className="text-primary underline text-sm"
            onClick={() => { setMode("signin"); setSignupDone(false); }}
          >
            Sign in
          </button>
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
          <h1 className="text-3xl font-bold text-foreground">OilTrack</h1>
          <p className="text-muted-foreground text-sm">Oil distribution management</p>
        </div>

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
            {mode === "signup" && (
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground" htmlFor="name">
                  Name
                </label>
                <input
                  id="name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full rounded-xl border-2 border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary transition-colors"
                />
              </div>
            )}

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
