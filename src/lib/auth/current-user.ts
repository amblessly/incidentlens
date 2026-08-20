import { cookies } from "next/headers";

import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { toCurrentUser, type CurrentUser, type Permission } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { IncidentLensError } from "@/lib/errors";

/** Number of users with a usable password — drives the first-run setup gate. */
export async function needsSetup(): Promise<boolean> {
  const row = (await db()
    .prepare("SELECT COUNT(*) AS n FROM users WHERE password_hash IS NOT NULL")
    .get()) as { n: number };
  return row.n === 0;
}

export async function getUserById(id: string): Promise<CurrentUser | null> {
  const row = (await db()
    .prepare("SELECT id, name, email, role, workspace_id FROM users WHERE id = ?")
    .get(id)) as { id: string; name: string; email: string; role: string; workspace_id: string | null } | undefined;
  return row ? toCurrentUser(row) : null;
}

export interface UserAuthRow {
  id: string;
  name: string;
  email: string;
  role: string;
  workspace_id: string | null;
  password_hash: string | null;
}

export async function getUserByEmail(email: string): Promise<UserAuthRow | null> {
  return (
    ((await db()
      .prepare("SELECT id, name, email, role, workspace_id, password_hash FROM users WHERE email = ?")
      .get(email)) as UserAuthRow | undefined) ?? null
  );
}

/**
 * Resolve the current user from the session cookie. Returns null when no
 * valid session exists. Throws IncidentLensError(UNAUTHORIZED/FORBIDDEN)
 * when a session exists but the user is gone or lacks a permission.
 */
export async function getCurrentUser(
  permission?: Permission,
): Promise<CurrentUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  const session = verifySession(token);
  if (!session) return null;

  const user = await getUserById(session.userId);
  if (!user) {
    throw new IncidentLensError("UNAUTHORIZED", "Session refers to a user that no longer exists.");
  }
  if (permission && !user.hasPermission(permission)) {
    throw new IncidentLensError(
      "FORBIDDEN",
      `User ${user.email} does not have permission: ${permission}`,
    );
  }
  return user;
}