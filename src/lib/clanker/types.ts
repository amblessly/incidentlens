export interface IncidentInvestigationInput {
  incidentId: string;
  title: string;
  description: string;
  service: string;
  severity: string;
  startedAt: string;
  deploymentId: string | null;
  repository: string | null;
  alertPayload: string | null;
}

export type EvidenceRelevance = "primary" | "supporting" | "context";

export interface InvestigationEvidence {
  source: string;
  title: string;
  observation: string;
  relevance: EvidenceRelevance;
  confidence: number;
}

export interface InvestigationHypothesis {
  title: string;
  description: string;
  confidence: number;
  supportingEvidence: string[];
  /** Evidence that weakens or conflicts with this hypothesis. */
  contradictingEvidence: string[];
  /** Evidence that is still needed to confirm or refute it. */
  missingEvidence: string[];
  /** The next investigation step to advance this hypothesis. */
  nextStep: string;
}

export interface RecommendedAction {
  description: string;
  reason: string;
}

export interface InvestigationTimelineStep {
  step: string;
  detail: string;
}

/**
 * Normalized, validated result returned by any investigator.
 *
 * This is the contract the whole application consumes. The Clanker adapter
 * is responsible for producing it; everything upstream only ever sees
 * validated data.
 */
export interface InvestigationResult {
  summary: string;
  severityAssessment: string;
  affectedServices: string[];
  timeline: InvestigationTimelineStep[];
  evidence: InvestigationEvidence[];
  hypotheses: InvestigationHypothesis[];
  recommendedActions: RecommendedAction[];
  missingEvidence: string[];
  confidence: number;
  safetyNotes: string[];
}

/** Stable investigation phase identifiers. */
export type InvestigationPhase =
  | "understanding"
  | "planning"
  | "collection"
  | "correlation"
  | "root-cause"
  | "remediation";

export interface InvestigationStep {
  /** Stable machine id, e.g. "inspecting-infrastructure" */
  id: string;
  label: string;
  detail: string;
  status: "pending" | "active" | "done";
  phase: InvestigationPhase;
  /** Where the observation came from, e.g. "clanker-demo" or "k8s". */
  source: string | null;
  completedAt: string | null;
}

export interface InvestigationProgress {
  runId: number;
  status: "running" | "completed" | "failed";
  steps: InvestigationStep[];
  error: string | null;
}

/**
 * Boundary the whole application depends on. Anything that can perform an
 * incident investigation (Clanker-backed or otherwise) implements this.
 *
 * The interface is deliberately read-only: an investigator may inspect
 * infrastructure and collect evidence, but must never mutate it.
 */
export interface InfrastructureInvestigator {
  readonly provider: string;

  investigateIncident(
    input: IncidentInvestigationInput,
    onStep?: (step: InvestigationStep) => void,
  ): Promise<InvestigationResult>;
}
