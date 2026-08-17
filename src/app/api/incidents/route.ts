import { apiError, json } from "@/lib/api";
import { createIncident, listIncidents } from "@/lib/services/incidents";
import { createIncidentSchema } from "@/lib/validation";
import type { Severity } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const severity = searchParams.get("severity") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const service = searchParams.get("service") ?? undefined;
  const q = searchParams.get("q") ?? undefined;

  const incidents = listIncidents({ severity, status, service, q });
  return json({ incidents });
}

export async function POST(request: Request) {
  const parsed = createIncidentSchema.safeParse(await request.json());
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid input.");
  }
  const incident = createIncident({
    title: parsed.data.title,
    service: parsed.data.service,
    severity: parsed.data.severity as Severity,
    description: parsed.data.description,
    startedAt: parsed.data.startedAt,
    deploymentId: parsed.data.deploymentId ?? null,
    repository: parsed.data.repository ?? null,
    alertPayload: parsed.data.alertPayload ?? null,
  });
  return json({ incident }, { status: 201 });
}
