import { createHmac, randomBytes } from "node:crypto";

/**
 * Signed session cookies.
 *
 * Sessions are opaque HMAC-signed tokens stored in an HttpOnly cookie.
 * The payload is base64url(JSON) + "." + HMAC-SHA256(payload, SESSION_SECRET).
 * Expiry is embedded in the token and enforced on every read.
 *
 * In production (live mode) SESSION_SECRET is required. In dev/demo a
 * generated ephemeral secret is allowed with a warning so the flow can be
 * exercised locally without configuration.
 */

const SESSION_COOKIE = "il_session";
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS ?? 7 * 24 * 60 * 60 * 1000);

export interface SessionPayload {
  userId: string;
  exp: number;
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (!secret && process.env.NODE_ENV !== "production") {
    // Ephemeral dev secret — sessions do not survive restarts.
    if (!(globalThis as { __il_dev_secret?: string }).__il_dev_secret) {
      (globalThis as { __il_dev_secret?: string }).__il_dev_secret = randomBytes(32).toString("hex");
    }
    return (globalThis as { __il_dev_secret?: string }).__il_dev_secret as string;
  }
  throw new Error(
    "SESSION_SECRET is required (min 32 characters). Sessions cannot be issued without it.",
  );
}

export function signSession(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", getSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySession(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", getSecret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !a.equals(b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.userId || typeof payload.exp !== "number") return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function createSessionToken(userId: string): string {
  return signSession({ userId, exp: Date.now() + SESSION_TTL_MS });
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;

export function sessionCookieValue(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(
    SESSION_TTL_MS / 1000,
  )}`;
}

export function clearSessionCookieValue(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}