import { apiError, errorToResponse, json, requestId } from "@/lib/api";
import { requireApiAuth } from "@/lib/api-auth";
import { withLogContext } from "@/lib/log";
import { db } from "@/lib/db";
import { nowIso } from "@/lib/format";
import { listConnections } from "@/lib/services/workspaces";
import { recordAudit } from "@/lib/services/audit";
import { registerProvider } from "@/lib/providers/registry";
import { createGenericProviderFromConfig } from "@/lib/providers/adapters/generic/generic-provider";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const rid = requestId(request);
  return withLogContext({ requestId: rid }, async () => {
    try {
      const user = await requireApiAuth(request, "settings.manage");
      if (user.kind !== "session") {
        return apiError("Provider management requires a session user.", 403, { code: "FORBIDDEN", request });
      }
      if (!user.user.workspace_id) {
        return apiError("Your account is not attached to a workspace.", 409, { code: "NO_WORKSPACE", request });
      }
      const connections = listConnections(user.user.workspace_id);
      return json({ providers: connections }, undefined, request);
    } catch (error) {
      return errorToResponse(error, request);
    }
  });
}

export async function POST(request: Request) {
  const rid = requestId(request);
  return withLogContext({ requestId: rid }, async () => {
    try {
      const user = await requireApiAuth(request, "settings.manage");
      if (user.kind !== "session") {
        return apiError("Provider management requires a session user.", 403, { code: "FORBIDDEN", request });
      }
      if (!user.user.workspace_id) {
        return apiError("Your account is not attached to a workspace.", 409, { code: "NO_WORKSPACE", request });
      }

      const body = await request.json().catch(() => null);
      if (!body || typeof body.name !== "string" || body.name.trim().length < 2) {
        return apiError("Provider name is required (min 2 characters).", 400, { request });
      }
      if (!body.provider_type || !["generic", "clanker", "mock", "datadog", "grafana", "aws", "gcp", "azure"].includes(body.provider_type)) {
        return apiError("Invalid provider type.", 400, { request });
      }

      const name = body.name.trim();
      const providerType = body.provider_type;
      const configJson = body.config ? JSON.stringify(body.config) : null;

      const { randomUUID } = await import("node:crypto");
      const id = `conn_${randomUUID().slice(0, 12)}`;
      db()
        .prepare(
          `INSERT INTO provider_connections (id, workspace_id, provider_type, name, status, config, created_at)
           VALUES (?, ?, ?, ?, 'disconnected', ?, ?)`,
        )
        .run(id, user.user.workspace_id, providerType, name, configJson, nowIso());

      const conn = db().prepare("SELECT * FROM provider_connections WHERE id = ?").get(id) as import("@/lib/services/workspaces").ProviderConnectionRow;

      if (providerType === "generic" && configJson) {
        const provider = createGenericProviderFromConfig(conn.id, name, configJson);
        registerProvider(provider);
      }

      recordAudit({
        action: "provider.created",
        detail: `Provider "${name}" (${providerType}) created.`,
        requestId: rid,
        userId: user.user.id,
        userName: user.user.name,
        workspaceId: user.user.workspace_id,
      });

      return json({ provider: conn }, undefined, request);
    } catch (error) {
      return errorToResponse(error, request);
    }
  });
}
