import { apiError, json } from "@/lib/api";
import { getIncidentFull } from "@/lib/services/incidents";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: RouteContext<"/api/incidents/[id]">) {
  const { id } = await ctx.params;
  const incident = getIncidentFull(id);
  if (!incident) return apiError("Incident not found.", 404);
  return json({ incident });
}
