import { cookies } from "next/headers";

import { appMode, modeLabel } from "@/lib/config";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getUserById, needsSetup } from "@/lib/auth/current-user";
import type { Role } from "@/lib/auth/permissions";

/**
 * Server-side UI state for the authenticated app shell: current mode,
 * current user, setup state. Components render differently depending on
 * live vs demo mode and on the user's role.
 */
export interface UiState {
  mode: "live" | "demo";
  isDemo: boolean;
  modeLabel: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
    initials: string;
    workspaceId: string | null;
  } | null;
  needsSetup: boolean;
}

export async function appUiState(): Promise<UiState> {
  const mode = appMode();
  const user = await sessionUserFromCookies();

  return {
    mode,
    isDemo: mode === "demo",
    modeLabel: modeLabel(mode),
    user: user
      ? {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          workspaceId: user.workspace_id,
          initials: user.name
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase() ?? "")
            .join(""),
        }
      : null,
    needsSetup: await needsSetup(),
  };
}

async function sessionUserFromCookies() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  const session = verifySession(token);
  if (!session) return null;
  return getUserById(session.userId);
}