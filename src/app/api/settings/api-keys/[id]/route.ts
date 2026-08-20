import { apiError, errorToResponse, json, requestId } from "@/lib/api";
import { requireApiAuth } from "@/lib/api-auth";
import { withLogContext } from "@/lib/log";
import { db } from "@/lib/db";
import { revokeApiKey, rotateApiKey, type ApiKeyRow } from "@/lib/services/api-keys";
import { recordAudit } from "@/lib/services/audit";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, ctx: RouteContext<"/api/settings/api-keys/[id]">) {
  const rid = requestId(request);
  return withLogContext({ requestId: rid }, async () => {
    try {
      const user = await requireApiAuth(request, "api_keys.manage");
      if (user.kind !== "session") {
        return apiError("API key management requires a session user.", 403, { code: "FORBIDDEN", request });
      }
      const { id } = await ctx.params;
      const key = (await db().prepare("SELECT * FROM api_keys WHERE id = ? AND workspace_id = ?").get(id, user.user.workspace_id)) as ApiKeyRow | undefined;
      if (!key) return apiError("API key not found.", 404, { request });
      await revokeApiKey(id);
      await recordAudit({
        action: "api_keys.revoke",
        detail: `API key "${key.name}" revoked.`,
        requestId: rid,
        userId: user.user.id,
        userName: user.user.name,
        workspaceId: user.user.workspace_id,
      });
      return json({ ok: true }, undefined, request);
    } catch (error) {
      return errorToResponse(error, request);
    }
  });
}

export async function POST(request: Request, ctx: RouteContext<"/api/settings/api-keys/[id]">) {
  const rid = requestId(request);
  return withLogContext({ requestId: rid }, async () => {
    try {
      const user = await requireApiAuth(request, "api_keys.manage");
      if (user.kind !== "session") {
        return apiError("API key management requires a session user.", 403, { code: "FORBIDDEN", request });
      }
      const { id } = await ctx.params;
      const rotated = await rotateApiKey(id);
      if (!rotated) return apiError("API key not found.", 404, { request });
      await recordAudit({
        action: "api_keys.rotate",
        detail: `API key "${rotated.row.name}" rotated.`,
        requestId: rid,
        userId: user.user.id,
        userName: user.user.name,
        workspaceId: user.user.workspace_id,
      });
      // The new raw secret is returned exactly once.
      return json({ key: { ...rotated.row, secret: rotated.secret } }, undefined, request);
    } catch (error) {
      return errorToResponse(error, request);
    }
  });
}