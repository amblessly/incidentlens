import type { IncidentInvestigationInput } from "@/lib/clanker/types";
import { buildScenarios, type DemoScenario } from "@/lib/demo/scenarios";

const scenarios = buildScenarios(new Date());

const sourceRotation = [
  "Metrics",
  "Application error logs",
  "Cloud infrastructure state",
  "Recent deployment",
  "Database health",
];

function synthesizeScenario(input: IncidentInvestigationInput): DemoScenario {
  const startedAgo = Math.max(
    1,
    Math.round((Date.now() - new Date(input.startedAt).getTime()) / 60_000),
  );

  const hasDeployment = Boolean(input.deploymentId);
  const sources = hasDeployment
    ? sourceRotation
    : sourceRotation.filter((s) => s !== "Recent deployment");

  const baseHypothesis =
    "A recent change to the affected service is the most probable trigger, with steady infrastructure health ruling out a platform-level fault.";

  const evidence = sources.slice(0, 5).map((source, i) => ({
    source,
    title: source === "Metrics"
      ? "Error and latency anomaly"
      : source === "Application error logs"
        ? "Repeated application-level errors"
        : source === "Recent deployment"
          ? "Deployment before onset"
          : source === "Database health"
            ? "Database health within norms"
            : "Infrastructure state normal",
    observation:
      source === "Metrics"
        ? `Abnormal error/latency signal observed for ${input.service} during the incident window.`
        : source === "Application error logs"
          ? `Application error signatures cluster near the incident start time for ${input.service}.`
          : source === "Recent deployment"
            ? `${input.deploymentId} was deployed immediately before the incident onset.`
            : source === "Database health"
              ? "Connection usage and replication lag stayed within normal bounds."
              : "CPU, memory and network on the host remained within normal bounds.",
    relevance: i === 0 ? ("primary" as const) : i === 1 ? ("supporting" as const) : ("context" as const),
    confidence: 0.6 + Math.min(0.35, i * 0.08),
    atAgo: Math.max(1, startedAgo - i * 2),
  }));

  const evidenceTitles = evidence.map((e) => e.title);
  const deploymentTitle = evidenceTitles.find((t) => t.includes("Deployment"));

  const hypotheses: DemoScenario["hypotheses"] = [
    {
      title: "Recent change to affected service",
      description: baseHypothesis,
      confidence: 0.64,
      evidenceTitles: evidenceTitles.slice(0, 3),
      contradictingTitles: evidenceTitles.includes("Database health")
        ? ["Database health and infrastructure state stayed within norms"]
        : undefined,
      missingEvidence: [
        "Per-version error rollup for the incident window",
        "Application logs broken down by deployment version",
      ],
      nextStep: hasDeployment
        ? `Compare ${input.deploymentId} traffic vs the previous version across the window.`
        : "Inspect application error logs around the incident start time.",
    },
    {
      title: "Ephemeral capacity or configuration issue",
      description:
        "A transient resource or configuration condition self-recovered. Weak: no independent supporting signal observed.",
      confidence: 0.28,
      evidenceTitles: evidenceTitles.slice(2, 4),
      missingEvidence: ["Autoscaling and capacity events during the window"],
      nextStep: "Pull capacity and scaling events for the incident window.",
    },
    {
      title: "Upstream dependency degradation",
      description:
        "A downstream dependency degraded briefly. Weak: dependency health checks showed no incident.",
      confidence: 0.12,
      evidenceTitles: evidenceTitles.slice(1, 2),
      contradictingTitles: evidenceTitles.includes("Database health")
        ? ["Dependency health checks showed no incident"]
        : undefined,
      missingEvidence: ["Upstream provider status for the window"],
      nextStep: "Check dependency health and upstream status feeds.",
    },
  ];

  if (deploymentTitle) {
    hypotheses[0].evidenceTitles = [deploymentTitle, ...evidenceTitles.slice(0, 2)];
    hypotheses[0].contradictingTitles = [
      "Infrastructure health remained stable during the window",
    ];
  }

  return {
    incident: {
      id: input.incidentId,
      title: input.title,
      service: input.service,
      severity: input.severity as DemoScenario["incident"]["severity"],
      status: "open",
      description: input.description,
      startedAgo,
      resolvedAgo: null,
      deploymentId: input.deploymentId,
      repository: input.repository,
      alertPayload: input.alertPayload ? (JSON.parse(input.alertPayload) as Record<string, unknown>) : null,
    },
    events: [
      { type: "incident_created", title: "Incident created", atAgo: startedAgo },
      ...(input.alertPayload
        ? [{ type: "alert_received" as const, title: "Alert received", atAgo: startedAgo }]
        : []),
    ],
    evidence,
    hypotheses,
    plan: null,
    deployment: {
      id: input.deploymentId ?? "N/A",
      service: input.service,
      version: "unknown",
      commit: "unknown",
      author: "unknown",
      deployedAgo: Math.max(1, startedAgo - 2),
    },
  };
}

/**
 * Returns the demo scenario for an incident: the hand-written fixture for
 * seeded demo incidents, or a clearly-labeled synthesized scenario for any
 * incident created at runtime.
 */
export function getScenarioForIncident(
  input: IncidentInvestigationInput,
): DemoScenario {
  const fixture = scenarios.find((s) => s.incident.id === input.incidentId);
  return fixture ?? synthesizeScenario(input);
}
