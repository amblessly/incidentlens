import { apiError, errorToResponse, json, requestId } from "@/lib/api";
import { requireApiAuth } from "@/lib/api-auth";
import { withLogContext } from "@/lib/log";
import { getIncidentFull } from "@/lib/services/incidents";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: RouteContext<"/api/incidents/[id]">) {
  return withLogContext({ requestId: requestId(request) }, async () => {
    try {
      const { id } = await ctx.params;
      await requireApiAuth(request);
      const incident = await getIncidentFull(id);
      if (!incident) return apiError("Incident not found.", 404, { request });
      return json({ incident }, undefined, request);
    } catch (error) {
      return errorToResponse(error, request);
    }
  });
}