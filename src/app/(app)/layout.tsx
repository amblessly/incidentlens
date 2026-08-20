import { redirect } from "next/navigation";

import { AppShell } from "@/components/app/shell";
import { appUiState } from "@/lib/ui-state";
import { isDemoMode } from "@/lib/config";
import type { Role } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const state = await appUiState();

  if (state.needsSetup) {
    redirect("/setup");
  }

  // In demo mode, use a pre-created demo user (bypasses auth for hackathon demo)
  if (isDemoMode() && !state.user) {
    const { db } = await import("@/lib/db");

    // Get or create demo user
    const demoEmail = "demo@incidentlens.dev";
    const database = db();
    let user = (await database
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(demoEmail)) as
      | { id: string; name: string; email: string; role: string; workspace_id: string }
      | undefined;

    if (!user) {
      const demoUserId = "u-demo";
      const now = new Date().toISOString();
      const workspace = (await database.prepare("SELECT * FROM workspaces LIMIT 1").get()) as
        | { id: string }
        | undefined;
      if (workspace) {
        await database
          .prepare(
            "INSERT OR IGNORE INTO users (id, name, email, password_hash, role, workspace_id, created_at) VALUES (?, ?, ?, ?, 'admin', ?, ?)",
          )
          .run(demoUserId, "Demo User", demoEmail, "", workspace.id, now);
        user = { id: demoUserId, name: "Demo User", email: demoEmail, role: "admin", workspace_id: workspace.id };
      }
    }
    
    if (user) {
      state.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role as Role,
        workspaceId: user.workspace_id,
        initials: user.name.split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? "").join(""),
      };
    }
  }
  
  if (!state.user) {
    redirect("/login");
  }

  return (
    <AppShell
      mode={state.mode}
      isDemo={state.isDemo}
      modeLabel={state.modeLabel}
      user={state.user}
    >
      {children}
    </AppShell>
  );
}