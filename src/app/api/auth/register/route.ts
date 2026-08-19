import { apiError, errorToResponse, json, requestId } from "@/lib/api";
import { createSessionToken, sessionCookieValue } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { needsSetup } from "@/lib/auth/current-user";
import { withLogContext, apiLogger } from "@/lib/log";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/services/audit";
import { createWorkspace, createEnvironment, createProviderConnection } from "@/lib/services/workspaces";
import { registerSchema } from "@/lib/validation";
import { clankerEnabled, readClankerConfig } from "@/lib/providers/adapters/clanker/client";
import { ClankerProvider } from "@/lib/providers/adapters/clanker/provider";
import { registerProvider } from "@/lib/providers/registry";

export const dynamic = "force-dynamic";

/**
 * First-run setup. Available only when no users exist yet (needsSetup).
 * Creates the initial admin user, workspace, environment and a provider
 * connection record (provider type defaults to "clanker"; credentials must
 * be configured server-side via env vars).
 */
export async function POST(request: Request) {
  const rid = requestId(request);
  return withLogContext({ requestId: rid }, async () => {
    try {
      if (!needsSetup()) {
        return apiError("Setup already completed.", 409, { code: "SETUP_COMPLETED", request });
      }

      const parsed = registerSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) {
        return apiError(parsed.error.issues[0]?.message ?? "Invalid input.", 400, { request });
      }

      const email = parsed.data.email.toLowerCase();
      const existing = db().prepare("SELECT id FROM users WHERE email = ?").get(email);
      if (existing) {
        return apiError("A user with this email already exists.", 409, { code: "EMAIL_TAKEN", request });
      }

      const passwordHash = hashPassword(parsed.data.password);
      const userId = `u-${crypto.randomUUID().slice(0, 8)}`;
      const now = new Date().toISOString();

      const workspace = createWorkspace(parsed.data.workspaceName);
      const environment = createEnvironment(workspace.id, parsed.data.environmentName ?? "production", "production");
      const connection = createProviderConnection(workspace.id, {
        environmentId: environment.id,
        providerType: "clanker",
        name: "Default Clanker connection",
      });

      // Register the provider in the runtime registry if Clanker is configured
      if (clankerEnabled()) {
        try {
          const provider = new ClankerProvider(connection.id, connection.name, readClankerConfig());
          registerProvider(provider);
        } catch (e) {
          // If registration fails, log but don't fail setup - provider can be configured later
          apiLogger.warn("Failed to register Clanker provider during setup", { error: e instanceof Error ? e.message : String(e) });
        }
      }

      db()
        .prepare(
          "INSERT INTO users (id, name, email, password_hash, role, workspace_id, created_at) VALUES (?, ?, ?, ?, 'admin', ?, ?)",
        )
        .run(userId, parsed.data.name, email, passwordHash, workspace.id, now);

      const token = createSessionToken(userId);
      recordAudit({
        action: "setup.completed",
        detail: `First-run setup: admin ${email}, workspace ${workspace.name}, environment ${environment.name}.`,
        requestId: rid,
        userId,
        userName: parsed.data.name,
        workspaceId: workspace.id,
      });

      apiLogger.info("setup completed", { requestId: rid, workspaceId: workspace.id });

      const res = json(
        {
          ok: true,
          user: { id: userId, name: parsed.data.name, email, role: "admin" },
          workspace: { id: workspace.id, name: workspace.name },
          environment: { id: environment.id, name: environment.name },
          connection: { id: connection.id, name: connection.name, provider_type: connection.provider_type },
        },
        { status: 201 },
        request,
      );
      res.headers.append("Set-Cookie", sessionCookieValue(token));
      return res;
    } catch (error) {
      return errorToResponse(error, request);
    }
  });
}