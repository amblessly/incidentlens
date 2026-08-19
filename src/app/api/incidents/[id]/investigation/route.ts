import { apiError, errorToResponse, json, requestId } from "@/lib/api";
import { requireApiAuth, sessionUser } from "@/lib/api-auth";
import { withLogContext, apiLogger } from "@/lib/log";
import { getInvestigationState, InvestigationError, runInvestigation } from "@/lib/services/investigation";
import { recordAudit } from "@/lib/services/audit";
import { isDemoMode } from "@/lib/config";

export const dynamic = "force-dynamic";

async function getUserForRequest(request: Request) {
  // In demo mode, allow session user or API key
  if (isDemoMode()) {
    const user = await sessionUser();
    if (user) return { kind: "session" as const, user };
    
    // Allow API key in demo mode too
    const { authenticateRequest } = await import("@/lib/api-auth");
    const principal = await authenticateRequest(request);
    if (principal) return principal;
  }
  
  // Normal mode requires session
  const user = await requireApiAuth(request, "investigation.run");
  if (user.kind !== "session") {
    throw new Error("Investigations require a session user (API keys cannot run investigations).");
  }
  return user;
}

export async function GET(request: Request, ctx: RouteContext<"/api/incidents/[id]/investigation">) {
  return withLogContext({ requestId: requestId(request) }, async () => {
    try {
      const { id } = await ctx.params;
      await getUserForRequest(request);
      const state = getInvestigationState(id);
      if (!state.run) return apiError("No investigation has run for this incident.", 404, { request });
      return json(state, undefined, request);
    } catch (error) {
      return errorToResponse(error, request);
    }
  });
}

export async function POST(request: Request, ctx: RouteContext<"/api/incidents/[id]/investigation">) {
  const rid = requestId(request);
  return withLogContext({ requestId: rid }, async () => {
    try {
      const { id } = await ctx.params;
      const principal = await getUserForRequest(request);
      
      const initiatedBy = principal.kind === "session" ? principal.user.name : `API key ${principal.key.name}`;
      
      const result = await runInvestigation(id, { initiatedBy });
      recordAudit({
        action: "investigation.run",
        detail: `Investigation run completed for incident ${id}.`,
        requestId: rid,
        userId: principal.kind === "session" ? principal.user.id : null,
        userName: initiatedBy,
        workspaceId: principal.kind === "session" ? principal.user.workspace_id : principal.key.workspace_id,
        incidentId: id,
      });
      return json({ result }, undefined, request);
    } catch (error) {
      if (error instanceof InvestigationError) {
        return apiError(error.message, 400, { code: "INVESTIGATION_FAILED", request });
      }
      if (error instanceof Error && error.message.includes("require a session user")) {
        return apiError("Investigations require a session user.", 403, { code: "FORBIDDEN", request });
      }
      apiLogger.error("investigation failed", { requestId: rid, error: error instanceof Error ? error.message : String(error) });
      return errorToResponse(error, request);
    }
  });
}