import { webcrypto } from "crypto";
if (!globalThis.crypto) (globalThis as any).crypto = webcrypto;

import { jwtVerify, createRemoteJWKSet } from "jose";

const NEON_AUTH_URL = process.env.NEON_AUTH_URL!;
const JWKS = createRemoteJWKSet(new URL(`${NEON_AUTH_URL}/.well-known/jwks.json`));

export interface AuthUser {
  id: string;
  email: string;
}

export function getTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}

export async function requireAuth(authHeader: string | undefined): Promise<AuthUser> {
  const token = getTokenFromHeader(authHeader);
  if (!token) throw new Error("Unauthorised");

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: new URL(NEON_AUTH_URL).origin,
    });

    const id = (payload.sub ?? payload.userId ?? payload.id) as string;
    const email = (payload.email ?? "") as string;
    if (!id) throw new Error("Unauthorised");
    return { id, email };
  } catch (err) {
    console.log("[auth] JWT verify failed:", err instanceof Error ? err.message : err);
    throw new Error("Unauthorised");
  }
}
