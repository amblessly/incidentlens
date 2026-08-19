import { z } from "zod";

import { SEVERITIES } from "@/lib/constants";

/**
 * Provider-agnostic incident ingestion.
 *
 * External systems (monitoring, alerting, CI/CD, custom backends) POST an
 * alert payload. The ingestion layer normalizes common payload conventions
 * (Prometheus/Grafana/DataDog-style field names) into the canonical
 * IncidentLens incident shape. No specific vendor is required.
 */

export const incidentWebhookSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  service: z.string().trim().min(1).max(200).optional(),
  severity: z.enum(SEVERITIES as [string, ...string[]]).optional(),
  description: z.string().trim().min(1).max(4000).optional(),
  startedAt: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), "startedAt must be a valid timestamp.")
    .optional(),
  environment: z.string().trim().max(100).optional(),
  repository: z.string().trim().max(200).optional(),
  deploymentId: z.string().trim().max(100).optional(),
  alertPayload: z.string().trim().max(8000).optional(),
  idempotencyKey: z.string().trim().max(200).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type NormalizedAlert = {
  title: string;
  service: string;
  severity: z.infer<typeof incidentWebhookSchema>["severity"];
  description: string;
  startedAt: string;
  environment?: string;
  repository?: string;
  deploymentId?: string;
  alertPayload?: string;
  idempotencyKey?: string;
  metadata?: string;
};

/** Fields probed in order for each canonical field. */
const FIELD_ALIASES: Record<
  "title" | "service" | "severity" | "description" | "startedAt" | "environment",
  string[]
> = {
  title: ["title", "alertname", "alert_name", "name", "incident_name"],
  service: [
    "service",
    "affected_service",
    "component",
    "target",
    "resource",
    "job",
    "service_name",
  ],
  severity: ["severity", "level", "priority", "criticality", "status"],
  description: ["description", "summary", "message", "annotations.summary", "detail"],
  startedAt: ["startedAt", "startsAt", "start_at", "begin_at", "time", "timestamp", "event_time"],
  environment: ["environment", "env", "environment_name"],
};

function firstString(payload: Record<string, unknown>, field: keyof typeof FIELD_ALIASES): string | undefined {
  for (const alias of FIELD_ALIASES[field]) {
    const value = alias.includes(".") ? deepGet(payload, alias) : payload[alias];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && !Number.isNaN(value)) return String(value);
  }
  return undefined;
}

function deepGet(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

const SEVERITY_LEVELS: Record<string, "SEV-1" | "SEV-2" | "SEV-3" | "SEV-4"> = {
  critical: "SEV-1",
  fatal: "SEV-1",
  sev1: "SEV-1",
  high: "SEV-2",
  major: "SEV-2",
  sev2: "SEV-2",
  error: "SEV-2",
  warning: "SEV-3",
  medium: "SEV-3",
  warn: "SEV-3",
  sev3: "SEV-3",
  info: "SEV-4",
  low: "SEV-4",
  minor: "SEV-4",
  sev4: "SEV-4",
  p0: "SEV-1",
  p1: "SEV-2",
  p2: "SEV-3",
  p3: "SEV-4",
};

export function mapSeverity(severity: string): "SEV-1" | "SEV-2" | "SEV-3" | "SEV-4" {
  const key = severity.trim().toLowerCase();
  return SEVERITY_LEVELS[key] ?? "SEV-3";
}

/**
 * Normalize an arbitrary alert payload into the canonical incident shape.
 * Returns null when the payload cannot be mapped to a valid incident.
 */
export function normalizeAlert(payload: unknown): NormalizedAlert | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const p = payload as Record<string, unknown>;

  const service = firstString(p, "service");
  if (!service) return null;

  const title = firstString(p, "title") ?? `Alert for ${service}`;
  const description =
    firstString(p, "description") ??
    `Automated alert for ${service} (${new Date().toISOString()}).`;
  const startedAt = firstString(p, "startedAt") ?? new Date().toISOString();
  const severity = firstString(p, "severity") ? mapSeverity(firstString(p, "severity") as string) : "SEV-3";
  const environment = firstString(p, "environment");

  const idempotencyKey =
    typeof p.idempotencyKey === "string"
      ? p.idempotencyKey
      : typeof p.event_id === "string"
        ? p.event_id
        : typeof p.alert_id === "string"
          ? p.alert_id
          : undefined;

  return {
    title,
    service,
    severity,
    description,
    startedAt,
    environment,
    repository: typeof p.repository === "string" ? p.repository : undefined,
    deploymentId: typeof p.deployment_id === "string" ? p.deployment_id : undefined,
    alertPayload: JSON.stringify(p).slice(0, 8000),
    idempotencyKey,
    metadata: typeof p.metadata === "object" && p.metadata !== null ? JSON.stringify(p.metadata).slice(0, 4000) : undefined,
  };
}