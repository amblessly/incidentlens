import { apiError, errorToResponse, json, requestId } from "@/lib/api";
import { requireApiAuth } from "@/lib/api-auth";
import { withLogContext } from "@/lib/log";
import { createApiKey, listApiKeys } from "@/lib/services/api-keys";
import { recordAudit } from "@/lib/services/audit";
import { createApiKeySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withLogContext({ requestId: requestId(request) }, async () => {
    try {
      const user = await requireApiAuth(request, "api_keys.manage");
      if (user.kind !== "session") {
        return apiError("API key management requires a session user.", 403, { code: "FORBIDDEN", request });
      }
      if (!user.user.workspace_id) {
        return apiError("Your account is not attached to a workspace yet.", 409, { code: "NO_WORKSPACE", request });
      }
      return json({ keys: listApiKeys(user.user.workspace_id) }, undefined, request);
    } catch (error) {
      return errorToResponse(error, request);
    }
  });
}

export async function POST(request: Request) {
  const rid = requestId(request);
  return withLogContext({ requestId: rid }, async () => {
    try {
      const user = await requireApiAuth(request, "api_keys.manage");
      if (user.kind !== "session") {
        return apiError("API key management requires a session user.", 403, { code: "FORBIDDEN", request });
      }
      if (!user.user.workspace_id) {
        return apiError("Your account is not attached to a workspace yet.", 409, { code: "NO_WORKSPACE", request });
      }

      const parsed = createApiKeySchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) {
        return apiError(parsed.error.issues[0]?.message ?? "Invalid input.", 400, { request });
      }

      const created = createApiKey(user.user.workspace_id, parsed.data.name, {
        expiresAt: parsed.data.expiresAt ?? null,
      });

      recordAudit({
        action: "api_keys.create",
        detail: `API key "${parsed.data.name}" created.`,
        requestId: rid,
        userId: user.user.id,
        userName: user.user.name,
        workspaceId: user.user.workspace_id,
      });

      // The raw secret is returned exactly once.
      return json(
        { key: { ...created.row, secret: created.secret } },
        { status: 201 },
        request,
      );
    } catch (error) {
      return errorToResponse(error, request);
    }
  });
}