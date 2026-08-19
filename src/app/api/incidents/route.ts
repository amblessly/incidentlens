import { apiError, errorToResponse, json, requestId } from "@/lib/api";
import { requireApiAuth, enforceRateLimit } from "@/lib/api-auth";
import { incidentWebhookSchema, normalizeAlert } from "@/lib/ingest";
import { withLogContext, apiLogger } from "@/lib/log";
import { createIncident, findByIdempotencyKey, listIncidents } from "@/lib/services/incidents";
import { recordAudit } from "@/lib/services/audit";
import { defaultWorkspace, listConnections } from "@/lib/services/workspaces";
import type { Severity } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withLogContext({ requestId: requestId(request) }, async () => {
    try {
      const { searchParams } = new URL(request.url);
      const severity = searchParams.get("severity") ?? undefined;
      const status = searchParams.get("status") ?? undefined;
      const service = searchParams.get("service") ?? undefined;
      const q = searchParams.get("q") ?? undefined;

      await requireApiAuth(request);
      const incidents = listIncidents({ severity, status, service, q });
      return json({ incidents }, undefined, request);
    } catch (error) {
      return errorToResponse(error, request);
    }
  });
}

/**
 * Incident ingestion endpoint.
 *
 * Accepts:
 * - structured incident payloads (title/service/severity/...), or
 * - arbitrary vendor alert payloads (normalized via provider-agnostic
 *   field mapping).
 *
 * Security: session cookie OR API key (X-IncidentLens-Key / Bearer).
 * Request validation, rate limiting, idempotency (Idempotency-Key header or
 * idempotencyKey/event_id in the payload) and request ids are enforced.
 */
export async function POST(request: Request) {
  const rid = requestId(request);
  return withLogContext({ requestId: rid }, async () => {
    try {
      const principal = await requireApiAuth(request);

      // Rate limit per key id (or IP for session users).
      const rateKey =
        principal.kind === "api-key" ? `key:${principal.key.id}` : `ip:${(request.headers.get("x-forwarded-for") ?? "unknown").slice(0, 64)}`;
      enforceRateLimit("ingest", rateKey, { limit: 120 });

      const rawBody = (await request.json().catch(() => null)) as unknown;
      if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
        return apiError("Request body must be a JSON object.", 400, { request });
      }

      // Try the structured schema first; fall back to vendor-normalized.
      const structured = incidentWebhookSchema.safeParse(rawBody);
      const normalized = structured.success
        ? structured.data
        : normalizeAlert(rawBody);

      if (!normalized) {
        return apiError(
          "Payload could not be mapped to an incident. Provide at least: service (or component/target) and title or description.",
          422,
          { code: "INVALID_REQUEST", request },
        );
      }

      // Idempotency: honor the Idempotency-Key header, then payload keys.
      const idempotencyKey =
        request.headers.get("idempotency-key") ??
        normalized.idempotencyKey ??
        undefined;

      if (!normalized.service) {
        return apiError(
          "Payload could not be mapped to a service. Provide service (or component/target).",
          422,
          { code: "INVALID_REQUEST", request },
        );
      }

      if (idempotencyKey) {
        const existing = findByIdempotencyKey(idempotencyKey);
        if (existing) {
          return json(
            { incident: existing, duplicate: true },
            { status: 200 },
            request,
          );
        }
      }

      // Resolve workspace: API keys carry their workspace; session users
      // fall back to their workspace or the default workspace.
      const workspaceId =
        principal.kind === "api-key"
          ? principal.key.workspace_id
          : (principal.user.workspace_id ?? defaultWorkspace()?.id ?? null);
      const environmentId =
        workspaceId && listConnections(workspaceId).length > 0
          ? (listConnections(workspaceId)[0].environment_id ?? undefined)
          : undefined;

      const incident = createIncident({
        title: normalized.title ?? `Alert for ${normalized.service}`,
        service: normalized.service,
        severity: (normalized.severity ?? "SEV-3") as Severity,
        description:
          normalized.description ??
          `Automated alert for ${normalized.service} (${new Date().toISOString()}).`,
        startedAt: normalized.startedAt ?? new Date().toISOString(),
        repository: normalized.repository,
        deploymentId: normalized.deploymentId,
        alertPayload: normalized.alertPayload,
        environment: normalized.environment,
        workspaceId,
        environmentId,
        source: normalized.metadata ? "webhook" : principal.kind === "api-key" ? "webhook" : "manual",
        idempotencyKey: idempotencyKey ?? null,
        requestId: rid,
        metadata:
          typeof normalized.metadata === "string"
            ? normalized.metadata
            : JSON.stringify(normalized.metadata ?? null),
        actorName: principal.kind === "api-key" ? `API key ${principal.key.name}` : principal.user.name,
        assignedTo: principal.kind === "session" ? principal.user.id : null,
        providerConnectionId: (normalized as Record<string, unknown>).providerConnectionId as string | null | undefined ?? null,
      });

      recordAudit({
        action: "incident.ingested",
        detail: `Incident ${incident.id} ingested via ${principal.kind === "api-key" ? "api-key" : "session"}.`,
        requestId: rid,
        userId: principal.kind === "session" ? principal.user.id : null,
        userName: principal.kind === "session" ? principal.user.name : `api-key:${principal.key.name}`,
        workspaceId,
        incidentId: incident.id,
      });

      apiLogger.info("incident ingested", {
        requestId: rid,
        incidentId: incident.id,
        source: principal.kind,
        workspaceId: workspaceId ?? undefined,
      });

      return json({ incident }, { status: 201 }, request);
    } catch (error) {
      return errorToResponse(error, request);
    }
  });
}