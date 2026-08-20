import { apiError, errorToResponse, json, requestId } from "@/lib/api";
import { requireApiAuth } from "@/lib/api-auth";
import { withLogContext } from "@/lib/log";
import { deleteConnection, getConnection } from "@/lib/services/workspaces";
import { recordAudit } from "@/lib/services/audit";
import { unregisterProvider } from "@/lib/providers/registry";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, ctx: RouteContext<"/api/settings/providers/[id]">) {
  const rid = requestId(request);
  return withLogContext({ requestId: rid }, async () => {
    try {
      const user = await requireApiAuth(request, "settings.manage");
      if (user.kind !== "session") {
        return apiError("Provider management requires a session user.", 403, { code: "FORBIDDEN", request });
      }

      const { id } = await ctx.params;
      const connection = await getConnection(id);
      if (!connection) {
        return apiError("Provider not found.", 404, { code: "PROVIDER_CONNECTION_NOT_FOUND", request });
      }

      await deleteConnection(id);
      unregisterProvider(id);

      await recordAudit({
        action: "provider.deleted",
        detail: `Provider "${connection.name}" (${connection.provider_type}) deleted.`,
        requestId: rid,
        userId: user.user.id,
        userName: user.user.name,
        workspaceId: user.user.workspace_id,
      });

      return json({ deleted: true }, undefined, request);
    } catch (error) {
      return errorToResponse(error, request);
    }
  });
}
