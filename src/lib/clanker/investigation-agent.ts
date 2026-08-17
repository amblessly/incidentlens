import { ClankerClient } from "@/lib/clanker/clanker-client";
import {
  type IncidentInvestigationInput,
  type InfrastructureInvestigator,
  type InvestigationPhase,
  type InvestigationResult,
  type InvestigationStep,
} from "@/lib/clanker/types";
import { getScenarioForIncident } from "@/lib/demo/generator";

const STEP_DELAY_MS = Number(process.env.CLANKER_DEMO_STEP_DELAY_MS ?? 420);

const SAFETY_NOTES = [
  "Investigation is read-only. No infrastructure mutations are performed.",
  "All remediation actions require explicit human approval before execution.",
  "Hypotheses are probabilistic — they describe the most likely cause, not a certainty.",
];

interface DemoStepSpec {
  id: string;
  label: string;
  detail: string;
  phase: InvestigationPhase;
  source: string | null;
}

function buildDemoSteps(scenario: ReturnType<typeof getScenarioForIncident>): DemoStepSpec[] {
  const { incident } = scenario;
  return [
    {
      id: "understanding-incident",
      label: "Understanding incident",
      detail: `Reading incident context and alert payload for ${incident.service}.`,
      phase: "understanding",
      source: "incident-report",
    },
    {
      id: "determining-window",
      label: "Determining investigation window",
      detail: "Bracketing the window from the incident start time and alert firing time.",
      phase: "understanding",
      source: "incident-report",
    },
    {
      id: "investigation-planning",
      label: "Planning investigation",
      detail: "Building a plan: inspect service, check changes, inspect errors, check dependencies, correlate.",
      phase: "planning",
      source: "agent",
    },
    {
      id: "inspecting-infrastructure",
      label: "Inspecting infrastructure",
      detail: `Querying read-only infrastructure state for ${incident.service}.`,
      phase: "collection",
      source: "cloud-infrastructure",
    },
    {
      id: "checking-changes",
      label: "Checking recent changes",
      detail: `Scanning recent deployments and CI history touching ${incident.service}.`,
      phase: "collection",
      source: "deployments",
    },
    {
      id: "correlating-evidence",
      label: "Correlating evidence",
      detail: `Correlating ${scenario.evidence.length} observations across metrics, logs and state.`,
      phase: "correlation",
      source: "agent",
    },
    {
      id: "evaluating-hypotheses",
      label: "Evaluating hypotheses",
      detail: `Scoring ${scenario.hypotheses.length} candidate hypotheses against collected evidence.`,
      phase: "root-cause",
      source: "agent",
    },
    {
      id: "preparing-remediation",
      label: "Preparing remediation plan",
      detail: "Drafting a read-only remediation plan for human review.",
      phase: "remediation",
      source: "agent",
    },
  ];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Deterministic, clearly-labeled demo investigator.
 *
 * It replays a realistic, phased investigation for seeded demo incidents and
 * synthesizes one for any runtime-created incident. No live infrastructure
 * is queried and nothing is mutated. Demo evidence is never mixed with live
 * evidence — the UI flags DEMO ENVIRONMENT whenever this provider is active.
 */
export class DemoInvestigator implements InfrastructureInvestigator {
  readonly provider = "clanker-demo";

  async investigateIncident(
    input: IncidentInvestigationInput,
    onStep?: (step: InvestigationStep) => void,
  ): Promise<InvestigationResult> {
    const scenario = getScenarioForIncident(input);
    const steps = buildDemoSteps(scenario);

    for (const step of steps) {
      onStep?.({
        ...step,
        status: "active",
        completedAt: null,
      });
      await sleep(STEP_DELAY_MS);
      onStep?.({
        ...step,
        status: "done",
        completedAt: new Date().toISOString(),
      });
    }

    const hypotheses = scenario.hypotheses.map((h) => ({
      title: h.title,
      description: h.description,
      confidence: h.confidence,
      supportingEvidence: h.evidenceTitles,
      contradictingEvidence: h.contradictingTitles ?? [],
      missingEvidence: h.missingEvidence ?? [],
      nextStep: h.nextStep ?? "",
    }));

    return {
      summary: scenario.incident.description,
      severityAssessment: describeSeverity(scenario.incident.severity),
      affectedServices: [scenario.incident.service],
      timeline: steps.map((s) => ({ step: s.label, detail: s.detail })),
      evidence: scenario.evidence.map((e) => ({
        source: e.source,
        title: e.title,
        observation: e.observation,
        relevance: e.relevance,
        confidence: e.confidence,
      })),
      hypotheses,
      recommendedActions:
        scenario.plan?.actions.map((a) => ({
          description: a.description,
          reason: a.reason,
        })) ?? [],
      missingEvidence: [...new Set(hypotheses.flatMap((h) => h.missingEvidence))],
      confidence: hypotheses[0]?.confidence ?? 0,
      safetyNotes: SAFETY_NOTES,
    };
  }
}

function describeSeverity(severity: string): string {
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

/**
 * Adapter that runs the investigation through the real Clanker Cloud agent.
 *
 * Progress is synthesized from coarse phase states because Clanker's API
 * returns the final structured output rather than a step stream. Evidence,
 * hypotheses and the plan come from the validated agent output — never from
 * demo fixtures.
 */
export class ClankerInvestigator implements InfrastructureInvestigator {
  readonly provider = "clanker-cloud";

  constructor(private readonly client: ClankerClient) {}

  async investigateIncident(
    input: IncidentInvestigationInput,
    onStep?: (step: InvestigationStep) => void,
  ): Promise<InvestigationResult> {
    const steps: DemoStepSpec[] = [
      {
        id: "understanding-incident",
        label: "Understanding incident",
        detail: `Extracting service, severity, window and symptoms for ${input.service}.`,
        phase: "understanding",
        source: "incident-report",
      },
      {
        id: "investigation-planning",
        label: "Planning investigation",
        detail: "Determining what infrastructure information is necessary before querying.",
        phase: "planning",
        source: "agent",
      },
      {
        id: "dispatching",
        label: "Dispatching investigation to Clanker",
        detail: `Requesting a read-only investigation of ${input.service} from the Clanker agent.`,
        phase: "collection",
        source: "clanker-cloud",
      },
      {
        id: "agent-running",
        label: "Clanker agent investigating",
        detail: "Agent is inspecting infrastructure, logs, metrics and recent changes.",
        phase: "collection",
        source: "clanker-cloud",
      },
      {
        id: "normalizing",
        label: "Validating structured result",
        detail: "Validating the agent output against the IncidentLens result schema.",
        phase: "correlation",
        source: "agent",
      },
    ];

    for (const step of steps) {
      onStep?.({ ...step, status: "active", completedAt: null });
      await sleep(120);
      onStep?.({ ...step, status: "done", completedAt: new Date().toISOString() });
    }

    return this.client.investigate(input);
  }
}

/**
 * Returns the active investigator for the environment.
 *
 * - `CLANKER_MODE=live` + configured Clanker → ClankerInvestigator
 * - otherwise → deterministic DemoInvestigator (clearly labeled)
 *
 * The application never depends on CLI shell commands or cloud credentials
 * directly; it only talks to `InfrastructureInvestigator`.
 */
export function getInvestigator(): InfrastructureInvestigator {
  if (process.env.CLANKER_MODE === "live") {
    const clanker = new ClankerClient();
    return new ClankerInvestigator(clanker);
  }
  return new DemoInvestigator();
}
