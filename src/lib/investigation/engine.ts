import { nowIso } from "@/lib/format";
import { providerErrorMessage } from "@/lib/errors";
import { investigationLogger } from "@/lib/log";
import type {
  EvidenceRelevance,
  InfrastructureProvider,
  InvestigationPhase,
  InvestigationStep,
} from "@/lib/providers/types";
import type { Incident } from "@/lib/types";

/**
 * Evidence-driven investigation engine.
 *
 * The engine is the ONLY producer of evidence in IncidentLens. It queries
 * the connected infrastructure provider (real requests), turns real
 * responses into structured evidence records, correlates them into
 * relationships, and derives hypotheses that reference evidence by id.
 *
 * Nothing here invents data:
 * - every evidence record maps to a provider response (or an explicit
 *   "Evidence unavailable" record when a source cannot be inspected)
 * - hypotheses only cite evidence records that actually exist
 * - remediation actions reference the evidence they are based on
 */

export type EngineEvidenceSourceType =
  | "incident-report"
  | "service-health"
  | "deployments"
  | "changes"
  | "logs"
  | "metrics"
  | "database"
  | "infrastructure"
  | "provider-error";

export interface EngineEvidence {
  source: string;
  sourceType: EngineEvidenceSourceType;
  timestamp: string;
  observation: string;
  relevance: EvidenceRelevance;
  confidence: number;
  service: string;
  environment: string;
}

export interface EngineRelationship {
  from: number;
  to: number;
  relationship: string;
  reason: string;
}

export interface EngineHypothesis {
  title: string;
  explanation: string;
  confidence: number;
  supportingEvidence: number[];
  contradictingEvidence: number[];
  missingEvidence: string[];
  suggestedNextStep: string;
}

export interface EngineAction {
  description: string;
  reason: string;
  supportingEvidence: number[];
  expectedImpact: string;
  risk: "low" | "medium" | "high" | "critical";
  blastRadius: string;
  rollbackStrategy: string;
  resources: string[];
  approvalRequired: boolean;
  prerequisites: string[];
}

export interface EngineResult {
  summary: string;
  severityAssessment: string;
  affectedServices: string[];
  timeline: { step: string; detail: string }[];
  evidence: EngineEvidence[];
  relationships: EngineRelationship[];
  hypotheses: EngineHypothesis[];
  recommendedActions: EngineAction[];
  missingEvidence: string[];
  confidence: number;
  safetyNotes: string[];
  provider: string;
  environment: string;
}

export interface EngineStep extends InvestigationStep {
  id: string;
  label: string;
  detail: string;
  status: "pending" | "active" | "done";
  phase: InvestigationPhase;
  source: string | null;
  completedAt: string | null;
}

export interface EngineContext {
  incident: Incident;
  environment: string;
  provider: InfrastructureProvider;
  onStep?: (step: EngineStep) => void;
}

const SAFETY_NOTES = [
  "Investigation is read-only. No infrastructure mutations are performed.",
  "All remediation actions require explicit human approval before execution.",
  "Hypotheses are probabilistic — they describe the most likely cause, not a certainty.",
];

function severityAssessment(severity: string): string {
  switch (severity) {
    case "SEV-1":
      return "Critical — complete service outage or data loss. Treat as a P0.";
    case "SEV-2":
      return "High — degraded service with partial outage. Requires urgent attention.";
    case "SEV-3":
      return "Medium — minor impact; investigation is non-urgent.";
    default:
      return "Low — cosmetic or low-impact issue.";
  }
}

function markStep(
  ctx: EngineContext,
  id: string,
  label: string,
  detail: string,
  phase: InvestigationPhase,
  source: string | null,
): void {
  ctx.onStep?.({ step: id, id, label, detail, status: "done", phase, source, completedAt: nowIso() });
}

interface Collected {
  services: Awaited<ReturnType<InfrastructureProvider["getServices"]>>;
  health: Awaited<ReturnType<InfrastructureProvider["getServiceHealth"]>>;
  deployments: Awaited<ReturnType<InfrastructureProvider["getDeployments"]>>;
  logs: Awaited<ReturnType<InfrastructureProvider["getLogs"]>>;
  metrics: Awaited<ReturnType<InfrastructureProvider["getMetrics"]>>;
  database: Awaited<ReturnType<InfrastructureProvider["getDatabaseState"]>>;
  changes: Awaited<ReturnType<InfrastructureProvider["getRecentChanges"]>>;
}

/**
 * Run the investigation. Returns structured evidence, relationships,
 * hypotheses and recommended actions. Throws when the provider is
 * unavailable — the caller decides how to record the failure.
 */
export async function runEngine(ctx: EngineContext): Promise<EngineResult> {
  const { incident, environment, provider } = ctx;
  const affected = incident.service;
  const windowStart = new Date(
    new Date(incident.started_at).getTime() - 45 * 60_000,
  ).toISOString();

  const timeline: EngineResult["timeline"] = [];
  const pushStep = (step: string, detail: string) => timeline.push({ step, detail });

  markStep(ctx, "understanding-incident", "Understanding incident", `Reading incident context and alert payload for ${affected}.`, "understanding", "incident-report");
  pushStep("Understanding incident", `Affected service: ${affected} (${incident.severity}).`);
  markStep(ctx, "determining-window", "Determining investigation window", `Bracketing the window from ${windowStart} to now.`, "understanding", "incident-report");
  markStep(ctx, "investigation-planning", "Planning investigation", "Inspecting service state, changes, errors, metrics and dependencies.", "planning", "agent");

  // ---- Evidence collection (real provider requests) ----------------------
  markStep(ctx, "inspecting-infrastructure", "Inspecting infrastructure", `Querying read-only infrastructure state for ${affected}.`, "collection", "infrastructure");
  const collected: Partial<Collected> = {};
  const unavailable: { source: string; reason: string }[] = [];

  async function collect<T>(
    key: keyof Collected,
    source: string,
    fn: () => Promise<T>,
  ): Promise<T | null> {
    try {
      const value = await fn();
      (collected as Record<string, unknown>)[key] = value;
      return value;
    } catch (error) {
      const reason = providerErrorMessage(error);
      unavailable.push({ source, reason });
      investigationLogger.warn(`provider capability ${key} unavailable`, { incidentId: incident.id, reason });
      return null;
    }
  }

  const [services, health, deployments, logs, metrics, database, changes] = await Promise.all([
    collect("services", "service registry", () => provider.getServices()),
    collect("health", "service health", () => provider.getServiceHealth(affected)),
    collect("deployments", "deployments", () => provider.getDeployments(affected, windowStart)),
    collect("logs", "application logs", () => provider.getLogs({ service: affected, since: windowStart, limit: 500 })),
    collect("metrics", "metrics", () => provider.getMetrics({ service: affected, since: windowStart })),
    collect("database", "database state", () => provider.getDatabaseState()),
    collect("changes", "recent changes", () => provider.getRecentChanges(affected)),
  ]);

  // ---- Evidence records ---------------------------------------------------
  const evidence: EngineEvidence[] = [];
  const sourceLabel = (label: string) => `${label} (${provider.id})`;
  const onsetMs = new Date(incident.started_at).getTime();

  if (services && services.length > 0) {
    const svc = services.find((s) => s.name === affected);
    evidence.push({
      source: sourceLabel("Service registry"),
      sourceType: "infrastructure",
      timestamp: nowIso(),
      observation: svc
        ? `${affected} is present in the environment as a ${svc.kind}.`
        : `${affected} is NOT present in the environment's service registry.`,
      relevance: "primary",
      confidence: 1,
      service: affected,
      environment,
    });
  }

  if (health && health.length > 0) {
    for (const h of health) {
      evidence.push({
        source: sourceLabel("Service health"),
        sourceType: "service-health",
        timestamp: nowIso(),
        observation:
          h.status === "healthy"
            ? `${h.service} health is reported healthy (${h.detail ?? "no detail"}).`
            : `${h.service} health is reported ${h.status.toUpperCase()}${h.detail ? ` — ${h.detail}` : ""}.`,
        relevance: h.status === "healthy" ? "supporting" : "primary",
        confidence: 0.95,
        service: h.service,
        environment,
      });
    }
  }

  if (deployments && deployments.length > 0) {
    for (const d of deployments) {
      const deltaMin = (onsetMs - new Date(d.deployedAt).getTime()) / 60_000;
      evidence.push({
        source: sourceLabel("Deployments"),
        sourceType: "deployments",
        timestamp: d.deployedAt,
        observation:
          deltaMin > 0
            ? `Deployment ${d.id} (${d.version}) of ${d.service} was created ${Math.round(deltaMin)} minutes before the incident onset.`
            : `Deployment ${d.id} (${d.version}) of ${d.service} was created ${Math.round(-deltaMin)} minutes after the incident onset.`,
        relevance: deltaMin > 0 && deltaMin <= 120 ? "primary" : "supporting",
        confidence: 0.9,
        service: d.service,
        environment,
      });
    }
  }

  if (changes && changes.length > 0) {
    for (const c of changes) {
      const deltaMin = (onsetMs - new Date(c.at).getTime()) / 60_000;
      evidence.push({
        source: sourceLabel("Recent changes"),
        sourceType: "changes",
        timestamp: c.at,
        observation: `${c.type === "deployment" ? "Deployment change" : c.type === "config" ? "Configuration change" : "Change"} "${c.description}" on ${c.service}${c.by ? ` by ${c.by}` : ""}${deltaMin > 0 ? `, ${Math.round(deltaMin)} minutes before onset` : ""}.`,
        relevance: deltaMin > 0 && deltaMin <= 120 ? "primary" : "supporting",
        confidence: 0.9,
        service: c.service,
        environment,
      });
    }
  }

  if (logs && logs.length > 0) {
    const errors = logs.filter((l) => l.level === "error");
    const warns = logs.filter((l) => l.level === "warn");
    const errorInWindow = errors.filter((l) => {
      const m = (onsetMs - new Date(l.timestamp).getTime()) / 60_000;
      return m >= -60 && m <= 120;
    });
    evidence.push({
      source: sourceLabel("Application logs"),
      sourceType: "logs",
      timestamp: errorInWindow[0]?.timestamp ?? nowIso(),
      observation:
        errors.length === 0
          ? `No error-level log entries were returned for ${affected} in the window.`
          : `${errors.length} error-level log entries returned for ${affected}; ${errorInWindow.length} within 60 minutes before to 2 hours after onset.` +
            (errorInWindow[0] ? ` Earliest: "${errorInWindow[0].message.slice(0, 160)}"` : ""),
      relevance: errorInWindow.length > 0 ? "primary" : "supporting",
      confidence: errorInWindow.length > 0 ? 0.9 : 0.7,
      service: affected,
      environment,
    });
    if (errorInWindow.length > 0) {
      const samples = errorInWindow.slice(0, 5).map((l) => l.message.slice(0, 140));
      evidence.push({
        source: sourceLabel("Application logs"),
        sourceType: "logs",
        timestamp: errorInWindow[0].timestamp,
        observation: `Error signatures near onset: ${samples.join(" | ")}`,
        relevance: "primary",
        confidence: 0.85,
        service: affected,
        environment,
      });
    }
    if (warns.length > 0) {
      evidence.push({
        source: sourceLabel("Application logs"),
        sourceType: "logs",
        timestamp: warns[0].timestamp,
        observation: `${warns.length} warning-level entries present in the window.`,
        relevance: "context",
        confidence: 0.6,
        service: affected,
        environment,
      });
    }
  } else {
    unavailable.push({ source: "application logs", reason: "no entries returned" });
  }

  if (metrics && metrics.length > 0) {
    const byName = new Map<string, MetricValue[]>();
    for (const m of metrics) {
      const list = byName.get(m.name) ?? [];
      list.push({ value: m.value, unit: m.unit ?? "", timestamp: m.timestamp });
      byName.set(m.name, list);
    }
    for (const [name, samples] of byName) {
      const values = samples.map((s) => s.value).sort((a, b) => a - b);
      const median = values[Math.floor(values.length / 2)] ?? 0;
      const peak = Math.max(...values);
      const spike = median > 0 && peak > median * 1.8;
      const recent = samples
        .filter((s) => onsetMs - new Date(s.timestamp).getTime() <= 180 * 60_000)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      const anomaly = spike && recent.length > 0;
      evidence.push({
        source: sourceLabel("Metrics"),
        sourceType: "metrics",
        timestamp: recent[recent.length - 1]?.timestamp ?? nowIso(),
        observation: anomaly
          ? `Metric ${name} for ${affected} shows a spike: median ${median}${samples[0]?.unit ?? ""}, peak ${peak}${samples[0]?.unit ?? ""} (${Math.round((peak / Math.max(median, 1e-9)) * 100)}% of median) near the incident window.`
          : `Metric ${name} for ${affected} is within normal bounds (median ${median}${samples[0]?.unit ?? ""}, peak ${peak}).`,
        relevance: anomaly ? "primary" : "supporting",
        confidence: anomaly ? 0.85 : 0.7,
        service: affected,
        environment,
      });
    }
  } else {
    unavailable.push({ source: "metrics", reason: "no samples returned" });
  }

  if (database && database.length > 0) {
    for (const d of database) {
      const pressure = d.maxConnections && d.connections ? d.connections / d.maxConnections : 0;
      const lagPressure = d.replicationLagMs !== null && d.replicationLagMs > 5000;
      evidence.push({
        source: sourceLabel("Database state"),
        sourceType: "database",
        timestamp: nowIso(),
        observation:
          pressure > 0.8 || lagPressure
            ? `${d.name} is under pressure — connections ${d.connections}/${d.maxConnections}${d.replicationLagMs !== null ? `, replication lag ${d.replicationLagMs}ms` : ""}.`
            : `${d.name} is healthy — connections ${d.connections ?? "n/a"}${d.maxConnections ? `/${d.maxConnections}` : ""}${d.replicationLagMs !== null ? `, replication lag ${d.replicationLagMs}ms` : ""}.`,
        relevance: pressure > 0.8 || lagPressure ? "primary" : "supporting",
        confidence: 0.9,
        service: affected,
        environment,
      });
    }
  }

  for (const u of unavailable) {
    evidence.push({
      source: sourceLabel("Evidence unavailable"),
      sourceType: "provider-error",
      timestamp: nowIso(),
      observation: `Evidence unavailable — ${u.source} could not be inspected (${u.reason}).`,
      relevance: "context",
      confidence: 1,
      service: affected,
      environment,
    });
  }

  if (evidence.length === 0) {
    evidence.push({
      source: sourceLabel("Evidence unavailable"),
      sourceType: "provider-error",
      timestamp: nowIso(),
      observation: `Evidence unavailable — the provider returned no observations for ${affected}.`,
      relevance: "context",
      confidence: 1,
      service: affected,
      environment,
    });
  }

  // ---- Correlation ----------------------------------------------------------
  markStep(ctx, "correlating-evidence", "Correlating evidence", `Correlating ${evidence.length} observations across sources.`, "correlation", "agent");
  const relationships = correlate(evidence, onsetMs);

  // ---- Hypotheses -----------------------------------------------------------
  markStep(ctx, "evaluating-hypotheses", "Evaluating hypotheses", "Scoring candidate hypotheses against collected evidence.", "root-cause", "agent");
  const hypotheses = buildHypotheses(evidence, incident);

  const missingEvidence = [
    ...new Set(hypotheses.flatMap((h) => h.missingEvidence)),
  ];

  // ---- Remediation ----------------------------------------------------------
  markStep(ctx, "preparing-remediation", "Preparing remediation plan", "Drafting a read-only remediation plan for human review.", "remediation", "agent");
  const recommendedActions = buildActions(evidence, hypotheses, incident);

  const confidence = hypotheses[0]?.confidence ?? 0;
  pushStep("Evidence collected", `${evidence.length} observations recorded from ${provider.name}.`);
  pushStep("Correlation complete", `${relationships.length} evidence relationships established.`);

  return {
    summary: incident.description,
    severityAssessment: severityAssessment(incident.severity),
    affectedServices: [affected],
    timeline,
    evidence,
    relationships,
    hypotheses,
    recommendedActions,
    missingEvidence,
    confidence,
    safetyNotes: SAFETY_NOTES,
    provider: provider.id,
    environment,
  };
}

interface MetricValue {
  value: number;
  unit: string;
  timestamp: string;
}

const idOf = (evidence: EngineEvidence[], e: EngineEvidence): number => evidence.indexOf(e);

/** Deterministic correlation of collected evidence into relationships. */
export function correlate(
  evidence: EngineEvidence[],
  onsetMs: number,
): EngineRelationship[] {
  const relationships: EngineRelationship[] = [];
  const deployments = evidence.filter((e) => e.sourceType === "deployments");
  const changes = evidence.filter((e) => e.sourceType === "changes");
  const errors = evidence.filter((e) => e.sourceType === "logs" && e.observation.toLowerCase().includes("error") && e.relevance === "primary");
  const metricSpikes = evidence.filter((e) => e.sourceType === "metrics" && e.relevance === "primary");
  const dbPressure = evidence.filter((e) => e.sourceType === "database" && e.relevance === "primary");
  const unhealthy = evidence.filter((e) => e.sourceType === "service-health" && e.relevance === "primary");

  const link = (from: EngineEvidence, to: EngineEvidence, relationship: string, reason: string) => {
    const fromId = idOf(evidence, from);
    const toId = idOf(evidence, to);
    if (fromId === toId || fromId < 0 || toId < 0) return;
    relationships.push({ from: fromId, to: toId, relationship, reason });
  };

  const inWindowBeforeOnset = (e: EngineEvidence, maxMinutes = 120): boolean => {
    const deltaMin = (onsetMs - new Date(e.timestamp).getTime()) / 60_000;
    return deltaMin > 0 && deltaMin <= maxMinutes;
  };

  // deployment/change before onset → error cluster
  for (const d of [...deployments, ...changes]) {
    if (!inWindowBeforeOnset(d)) continue;
    for (const e of errors) {
      link(
        d,
        e,
        "preceded",
        `"${d.observation.slice(0, 90)}…" precedes the error cluster by ${Math.round(
          (onsetMs - new Date(d.timestamp).getTime()) / 60_000,
        )} minutes relative to onset.`,
      );
    }
    for (const m of metricSpikes) {
      link(
        d,
        m,
        "preceded",
        `"${d.observation.slice(0, 90)}…" precedes the ${m.observation.length > 70 ? m.observation.slice(0, 70) + "…" : m.observation} anomaly.`,
      );
    }
  }

  // error cluster → metric spike
  for (const e of errors) {
    for (const m of metricSpikes) {
      link(e, m, "correlates-with", "Error density and the metric anomaly occur inside the same incident window.");
    }
    for (const d of dbPressure) {
      link(d, e, "contributes-to", "Database connection pressure is consistent with the observed error density.");
    }
  }

  // unhealthy health source → error cluster
  for (const u of unhealthy) {
    for (const e of errors) {
      link(u, e, "reflects", "The service health source reports degraded state matching the error cluster.");
    }
  }

  return relationships;
}

/** Hypotheses derived from collected evidence — evidence ids, not titles. */
export function buildHypotheses(
  evidence: EngineEvidence[],
  incident: Incident,
): EngineHypothesis[] {
  const deployments = evidence.filter((e) => e.sourceType === "deployments" && e.relevance === "primary");
  const changes = evidence.filter((e) => e.sourceType === "changes" && e.relevance === "primary");
  const errors = evidence.filter((e) => e.sourceType === "logs" && e.observation.toLowerCase().includes("error") && e.relevance === "primary");
  const spikes = evidence.filter((e) => e.sourceType === "metrics" && e.relevance === "primary");
  const dbPressure = evidence.filter((e) => e.sourceType === "database" && e.relevance === "primary");
  const healthy = evidence.filter((e) => e.sourceType === "service-health" && e.observation.includes("healthy"));

  const hypotheses: EngineHypothesis[] = [];

  if (deployments.length > 0 || changes.length > 0) {
    const trigger = [...deployments, ...changes];
    const support = [...trigger, ...errors.slice(0, 2), ...spikes.slice(0, 2)];
    hypotheses.push({
      title: `Recent change to ${incident.service} is the likely trigger`,
      explanation: `${trigger.map((t) => t.observation).join(" ")} Errors and metric anomalies cluster after this change.`,
      confidence: 0.65 + Math.min(0.25, errors.length * 0.05 + spikes.length * 0.05),
      supportingEvidence: support.map((s) => idOf(evidence, s)).filter((id) => id >= 0),
      contradictingEvidence: healthy.map((h) => idOf(evidence, h)),
      missingEvidence: [
        "Per-version error rollup for the incident window",
        "Traffic comparison between the new and previous version",
      ],
      suggestedNextStep: `Compare ${incident.service} error rates before and after the latest change.`,
    });
  }

  if (dbPressure.length > 0) {
    const support = [...dbPressure, ...spikes.slice(0, 2)];
    hypotheses.push({
      title: "Database connection pressure is degrading the service",
      explanation: `${dbPressure.map((d) => d.observation).join(" ")} Connection pressure at the incident window matches the failure signature.`,
      confidence: 0.6 + Math.min(0.2, spikes.length * 0.05),
      supportingEvidence: support.map((s) => idOf(evidence, s)).filter((id) => id >= 0),
      contradictingEvidence: [],
      missingEvidence: ["Connection pool configuration history", "Slow query profile for the window"],
      suggestedNextStep: "Inspect connection pool configuration and slow query profile for the incident window.",
    });
  }

  if (errors.length > 0 && hypotheses.length === 0) {
    hypotheses.push({
      title: "Ephemeral runtime failure caused error density",
      explanation: `Error-level entries cluster near the incident onset with no correlated change and no metric spike.`,
      confidence: 0.45,
      supportingEvidence: errors.map((e) => idOf(evidence, e)).filter((id) => id >= 0),
      contradictingEvidence: [],
      missingEvidence: ["Deployment or config change in the window", "Resource saturation metrics"],
      suggestedNextStep: "Inspect autoscaling events and resource saturation around the error cluster.",
    });
  }

  if (hypotheses.length === 0) {
    hypotheses.push({
      title: "Insufficient evidence to determine root cause",
      explanation: `The provider returned no correlated observations for ${incident.service}. Evidence sources may be unconfigured or unavailable.`,
      confidence: 0.1,
      supportingEvidence: [],
      contradictingEvidence: [],
      missingEvidence: [
        "Provider observations for the affected service",
        "Deployment history in the incident window",
        "Error logs and metrics for the incident window",
      ],
      suggestedNextStep: "Connect a provider that exposes telemetry for the affected service, then re-run the investigation.",
    });
  }

  return hypotheses.sort((a, b) => b.confidence - a.confidence);
}

/** Remediation actions grounded in evidence. */
export function buildActions(
  evidence: EngineEvidence[],
  hypotheses: EngineHypothesis[],
  incident: Incident,
): EngineAction[] {
  const leading = hypotheses[0];
  if (!leading) return [];

  const actions: EngineAction[] = [];
  const idOfEv = (i: number) => evidence[i];

  const deployments = leading.supportingEvidence
    .map(idOfEv)
    .filter((e): e is EngineEvidence => Boolean(e) && e.sourceType === "deployments");
  const changes = leading.supportingEvidence
    .map(idOfEv)
    .filter((e): e is EngineEvidence => Boolean(e) && e.sourceType === "changes");
  const dbPressure = leading.supportingEvidence
    .map(idOfEv)
    .filter((e): e is EngineEvidence => Boolean(e) && e.sourceType === "database");

  if (deployments.length > 0) {
    const d = deployments[0];
    actions.push({
      description: `Roll back the most recent deployment of ${incident.service}${d.observation.includes("Deployment") ? ` (${d.observation.split(" ").find((w) => w.startsWith("DEP-")) ?? "the deployed version"})` : ""}.`,
      reason: `The leading hypothesis points at a recent deployment as the trigger: ${d.observation}`,
      supportingEvidence: leading.supportingEvidence,
      expectedImpact: "Reverts the probable trigger; error and latency metrics should return toward baseline.",
      risk: "high",
      blastRadius: `All traffic served by ${incident.service}.`,
      rollbackStrategy: `Roll forward by redeploying version ${deployments[0].observation.match(/\(([^)]+)\)/)?.[1] ?? "the previous version"} if the rollback does not help.`,
      resources: [`service/${incident.service}`],
      approvalRequired: true,
      prerequisites: ["A previous stable version of the service is available"],
    });
  } else if (changes.length > 0) {
    const c = changes[0];
    actions.push({
      description: `Revert the configuration change "${c.observation.slice(0, 120)}" on ${incident.service}.`,
      reason: `The leading hypothesis points at a recent change as the trigger: ${c.observation}`,
      supportingEvidence: leading.supportingEvidence,
      expectedImpact: "Restores the previous configuration; service metrics should recover.",
      risk: "medium",
      blastRadius: `Configuration for ${incident.service}.`,
      rollbackStrategy: "Re-apply the reverted configuration if the cause is confirmed elsewhere.",
      resources: [`config/${incident.service}`],
      approvalRequired: true,
      prerequisites: ["Configuration history is available"],
    });
  } else if (dbPressure.length > 0) {
    actions.push({
      description: `Investigate and relieve database connection pressure on ${incident.service}.`,
      reason: `The database reported connection pressure during the incident window: ${dbPressure[0].observation}`,
      supportingEvidence: leading.supportingEvidence,
      expectedImpact: "Reduces connection contention; error rates should decline.",
      risk: "medium",
      blastRadius: "Database connection pool for the affected service.",
      rollbackStrategy: "Manual recovery required",
      resources: [`database/${incident.service}`],
      approvalRequired: true,
      prerequisites: ["Database admin access"],
    });
  } else {
    actions.push({
      description: `Run targeted diagnostics on ${incident.service} to gather missing evidence.`,
      reason: `The leading hypothesis lacks supporting observations: ${leading.explanation}`,
      supportingEvidence: leading.supportingEvidence,
      expectedImpact: "Produces the evidence needed to choose a safe remediation.",
      risk: "low",
      blastRadius: "None — read-only diagnostics.",
      rollbackStrategy: "Not applicable — observation only.",
      resources: [`metrics/${incident.service}`],
      approvalRequired: false,
      prerequisites: ["Read access to the provider"],
    });
  }

  actions.push({
    description: `Verify ${incident.service} health signals return to baseline after intervention.`,
    reason: "Confirms whether the intervention resolved the incident.",
    supportingEvidence: leading.supportingEvidence.slice(0, 2),
    expectedImpact: "Confirms recovery before the incident is closed.",
    risk: "low",
    blastRadius: "None — read-only verification.",
    rollbackStrategy: "Not applicable — observation only.",
    resources: [`metrics/${incident.service}`],
    approvalRequired: false,
    prerequisites: ["Read access to the provider"],
  });

  return actions;
}