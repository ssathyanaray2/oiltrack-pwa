// Direct HTTP client for Neon Auth (better-auth) — no SDK, no bundling issues
const BASE = import.meta.env.VITE_NEON_AUTH_URL as string;

const authFetch = (path: string, options?: RequestInit) =>
  fetch(`${BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
  });

async function parseResponse(res: Response) {
  const text = await res.text();
  try { return text ? JSON.parse(text) : {}; } catch { return {}; }
}

// Fetch a short-lived JWT from the /token endpoint (requires session cookie)
async function fetchJwt(): Promise<string | null> {
  try {
    const res = await authFetch("/token");
    if (!res.ok) return null;
    const data = await parseResponse(res);
    return data?.token ?? null;
  } catch {
    return null;
  }
}

function isJwtExpired(jwt: string): boolean {
  try {
    const payload = JSON.parse(atob(jwt.split(".")[1]));
    // Refresh if less than 60 seconds remaining
    return (payload.exp * 1000) - Date.now() < 60_000;
  } catch {
    return true;
  }
}

// Returns a valid JWT, refreshing if needed. Call before API requests.
export async function getValidJwt(): Promise<string | null> {
  const stored = sessionStorage.getItem("auth_token");
  if (!stored) return null;
  if (!isJwtExpired(stored)) return stored;
  // Token expired or close to expiry — refresh
  const fresh = await fetchJwt();
  if (fresh) sessionStorage.setItem("auth_token", fresh);
  return fresh;
}

export async function signIn(email: string, password: string) {
  const res = await authFetch("/sign-in/email", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const data = await parseResponse(res);
  if (!res.ok) throw new Error(data.message ?? data.error ?? `Sign in failed (${res.status})`);

  // Get a JWT for API calls (session cookie is now set)
  const jwt = await fetchJwt();
  const token = jwt ?? data.token ?? data.session?.token;
  return { token, user: data.user } as { token: string; user: { id: string; email: string } };
}

export async function signUp(email: string, password: string, name: string) {
  const res = await authFetch("/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ email, password, name }),
  });
  const data = await parseResponse(res);
  if (!res.ok) throw new Error(data.message ?? data.error ?? `Sign up failed (${res.status})`);

  const jwt = await fetchJwt();
  const token = jwt ?? data.token ?? data.session?.token;
  return { token, user: data.user } as { token: string; user: { id: string; email: string } };
}

export async function signOut() {
  await authFetch("/sign-out", { method: "POST" }).catch(() => {});
  sessionStorage.removeItem("auth_token");
}

export async function getSession(): Promise<{ id: string; email: string } | null> {
  const jwt = await getValidJwt();
  if (!jwt) return null;
  try {
    const payload = JSON.parse(atob(jwt.split(".")[1]));
    if (!payload?.sub) return null;
    return { id: payload.sub, email: payload.email ?? "" };
  } catch {
    return null;
  }
}

export function getAuthToken(): string | null {
  return sessionStorage.getItem("auth_token");
}

export function saveAuthToken(token: string) {
  sessionStorage.setItem("auth_token", token);
}
