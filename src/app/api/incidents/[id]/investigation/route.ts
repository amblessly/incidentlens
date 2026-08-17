import { apiError, json } from "@/lib/api";
import { getInvestigationState, InvestigationError, runInvestigation } from "@/lib/services/investigation";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: RouteContext<"/api/incidents/[id]/investigation">) {
  const { id } = await ctx.params;
  const state = getInvestigationState(id);
  if (!state.run) return apiError("No investigation has run for this incident.", 404);
  return json(state);
}

export async function POST(request: Request, ctx: RouteContext<"/api/incidents/[id]/investigation">) {
  const { id } = await ctx.params;
  let initiatedBy: string | undefined;
  try {
    const body = (await request.json()) as { initiatedBy?: string };
    initiatedBy = typeof body.initiatedBy === "string" ? body.initiatedBy.slice(0, 200) : undefined;
  } catch {
    // empty body is fine; initiator defaults to the assigned investigator
  }
  try {
    const result = await runInvestigation(id, { initiatedBy });
    return json({ result });
  } catch (error) {
    if (error instanceof InvestigationError) return apiError(error.message, 400);
    console.error("[investigation] failed", error);
    return apiError("Investigation failed unexpectedly.", 500);
  }
}
