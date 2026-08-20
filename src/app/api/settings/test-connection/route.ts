import { apiError, errorToResponse, json, requestId } from "@/lib/api";
import { requireApiAuth } from "@/lib/api-auth";
import { withLogContext, apiLogger } from "@/lib/log";
import { getConnection, updateConnectionStatus } from "@/lib/services/workspaces";
import { getProviderById } from "@/lib/providers/registry";
import { providerErrorMessage } from "@/lib/errors";
import { recordAudit } from "@/lib/services/audit";
import { testConnectionSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Test a provider connection. Runs a real read-only probe against
 * the registered provider matching the connection ID.
 * Only reports what the provider actually returned — no fabricated data.
 */
export async function POST(request: Request) {
  const rid = requestId(request);
  return withLogContext({ requestId: rid }, async () => {
    try {
      const user = await requireApiAuth(request, "settings.manage");
      if (user.kind !== "session") {
        return apiError("Connection testing requires a session user.", 403, { code: "FORBIDDEN", request });
      }

      const parsed = testConnectionSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) {
        return apiError(parsed.error.issues[0]?.message ?? "Invalid input.", 400, { request });
      }

      const connection = await getConnection(parsed.data.connectionId);
      if (!connection) {
        return apiError("Connection not found.", 404, { code: "PROVIDER_CONNECTION_NOT_FOUND", request });
      }

      const provider = getProviderById(connection.id);
      if (!provider) {
        return apiError(
          `Provider "${connection.name}" (${connection.provider_type}) is not registered in the runtime registry. Restart the server after adding a provider.`,
          409,
          { code: "PROVIDER_NOT_CONFIGURED", request },
        );
      }

      await updateConnectionStatus(connection.id, "connecting");
      const startedAt = Date.now();
      try {
        const result = await provider.testConnection();
        const durationMs = Date.now() - startedAt;
        await updateConnectionStatus(connection.id, "connected", { testedAt: new Date().toISOString() });

        await recordAudit({
          action: "connection.test",
          detail: `Connection ${connection.name} (${connection.provider_type}) tested successfully in ${durationMs}ms.`,
          requestId: rid,
          userId: user.user.id,
          userName: user.user.name,
          workspaceId: user.user.workspace_id,
        });

        return json(
          {
            ok: true,
            connectionId: connection.id,
            provider: connection.provider_type,
            durationMs,
            probe: result,
          },
          undefined,
          request,
        );
      } catch (error) {
        const message = providerErrorMessage(error);
        await updateConnectionStatus(connection.id, "error", { error: message });
        await recordAudit({
          action: "connection.test_failed",
          detail: `Connection ${connection.name} (${connection.provider_type}) test failed: ${message}`,
          requestId: rid,
          userId: user.user.id,
          userName: user.user.name,
          workspaceId: user.user.workspace_id,
        });
        apiLogger.error("connection test failed", { requestId: rid, connectionId: connection.id, error: message });
        return apiError(message, 502, { code: "PROVIDER_UNREACHABLE", request });
      }
    } catch (error) {
      return errorToResponse(error, request);
    }
  });
}