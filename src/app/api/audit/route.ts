import { errorToResponse, json, requestId } from "@/lib/api";
import { requireApiAuth } from "@/lib/api-auth";
import { withLogContext } from "@/lib/log";
import { listAuditEvents } from "@/lib/services/audit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withLogContext({ requestId: requestId(request) }, async () => {
    try {
      await requireApiAuth(request, "audit.view");
      const { searchParams } = new URL(request.url);
      const limit = Math.min(Number(searchParams.get("limit") ?? 100), 500);
      return json({ events: listAuditEvents(limit) }, undefined, request);
    } catch (error) {
      return errorToResponse(error, request);
    }
  });
}