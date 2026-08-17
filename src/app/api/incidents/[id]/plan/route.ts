import { apiError, json } from "@/lib/api";
import { generatePlan, getPlan, PlanError } from "@/lib/services/plans";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: RouteContext<"/api/incidents/[id]/plan">) {
  const { id } = await ctx.params;
  const plan = getPlan(id);
  if (!plan) return apiError("No remediation plan for this incident.", 404);
  return json({ plan });
}

export async function POST(_request: Request, ctx: RouteContext<"/api/incidents/[id]/plan">) {
  const { id } = await ctx.params;
  try {
    const plan = generatePlan(id);
    return json({ plan }, { status: 201 });
  } catch (error) {
    if (error instanceof PlanError) return apiError(error.message, 400);
    console.error("[plan] generation failed", error);
    return apiError("Plan generation failed unexpectedly.", 500);
  }
}
