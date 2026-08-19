import { apiError, errorToResponse, json, requestId } from "@/lib/api";
import { requireApiAuth } from "@/lib/api-auth";
import { withLogContext, apiLogger } from "@/lib/log";
import { generatePlan, getPlan, PlanError } from "@/lib/services/plans";
import { recordAudit } from "@/lib/services/audit";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: RouteContext<"/api/incidents/[id]/plan">) {
  return withLogContext({ requestId: requestId(request) }, async () => {
    try {
      const { id } = await ctx.params;
      await requireApiAuth(request);
      const plan = getPlan(id);
      if (!plan) return apiError("No remediation plan for this incident.", 404, { request });
      return json({ plan }, undefined, request);
    } catch (error) {
      return errorToResponse(error, request);
    }
  });
}

export async function POST(request: Request, ctx: RouteContext<"/api/incidents/[id]/plan">) {
  const rid = requestId(request);
  return withLogContext({ requestId: rid }, async () => {
    try {
      const { id } = await ctx.params;
      const user = await requireApiAuth(request, "plan.generate");
      if (user.kind !== "session") {
        return apiError("Plan generation requires a session user.", 403, { code: "FORBIDDEN", request });
      }

      const plan = generatePlan(id);
      recordAudit({
        action: "plan.generate",
        detail: `Remediation plan #${plan.id} generated for incident ${id}.`,
        requestId: rid,
        userId: user.user.id,
        userName: user.user.name,
        workspaceId: user.user.workspace_id,
        incidentId: id,
      });
      return json({ plan }, { status: 201 }, request);
    } catch (error) {
      if (error instanceof PlanError) {
        return apiError(error.message, 400, { code: "PLAN_REJECTED", request });
      }
      apiLogger.error("plan generation failed", { requestId: rid, error: error instanceof Error ? error.message : String(error) });
      return errorToResponse(error, request);
    }
  });
}