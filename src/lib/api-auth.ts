import { cookies } from "next/headers";

import { IncidentLensError } from "@/lib/errors";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getUserById, getUserByEmail, needsSetup } from "@/lib/auth/current-user";
import { hasPermission, type CurrentUser, type Permission } from "@/lib/auth/permissions";
import { verifyApiKey } from "@/lib/services/api-keys";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Authentication for API routes.
 *
 * A request may authenticate as:
 * - a session user (browser cookie), or
 * - an API key (X-IncidentLens-Key or Authorization: Bearer) for external
 *   incident ingestion.
 *
 * API key authentication is limited to incident ingestion; sensitive
 * operations (approve/execute/settings) require a session user.
 */
export type ApiPrincipal =
  | { kind: "session"; user: CurrentUser }
  | { kind: "api-key"; key: { id: string; workspace_id: string; name: string } };

export async function sessionUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  const session = verifySession(token);
  if (!session) return null;
  return getUserById(session.userId);
}

export async function sessionUserOrThrow(permission?: Permission): Promise<CurrentUser> {
  const user = await sessionUser();
  if (!user) {
    throw new IncidentLensError("UNAUTHORIZED", "Authentication required.");
  }
  if (permission && !hasPermission(user.role, permission)) {
    throw new IncidentLensError("FORBIDDEN", `Missing permission: ${permission}`);
  }
  return user;
}

/** Authenticate a request: prefer session, fall back to API key. */
export async function authenticateRequest(request: Request): Promise<ApiPrincipal | null> {
  const user = await sessionUser();
  if (user) return { kind: "session", user };

  const header = request.headers.get("x-incidentlens-key") ?? request.headers.get("authorization");
  const keyValue = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : header;
  if (!keyValue) return null;

  const key = await verifyApiKey(keyValue);
  if (!key) return null;
  return { kind: "api-key", key: { id: key.id, workspace_id: key.workspace_id, name: key.name } };
}

export async function requireApiAuth(request: Request, permission?: Permission): Promise<ApiPrincipal> {
  const principal = await authenticateRequest(request);
  if (!principal) {
    throw new IncidentLensError(
      "UNAUTHORIZED",
      "Authentication required. Provide a session cookie or a valid API key (X-IncidentLens-Key).",
    );
  }
  if (principal.kind === "session" && permission) {
    if (!hasPermission(principal.user.role, permission)) {
      throw new IncidentLensError("FORBIDDEN", `Missing permission: ${permission}`);
    }
  }
  return principal;
}

/** Rate limit helper that throws RATE_LIMITED when the bucket is empty. */
export function enforceRateLimit(
  bucket: string,
  key: string,
  opts: { limit?: number; windowMs?: number } = {},
): void {
  const result = checkRateLimit(bucket, key, opts);
  if (!result.allowed) {
    throw new IncidentLensError(
      "RATE_LIMITED",
      `Rate limit exceeded. Retry in ${result.retryAfterSeconds}s.`,
      { retryAfterSeconds: result.retryAfterSeconds },
    );
  }
}

export { getUserByEmail, needsSetup, hasPermission };
export type { Permission };