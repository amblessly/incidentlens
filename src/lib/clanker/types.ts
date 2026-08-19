/**
 * @deprecated Import from "@/lib/providers/types" instead.
 * This file is kept for backward compatibility only.
 */
export type {
  EvidenceRelevance,
  InvestigationPhase,
  InvestigationStep,
} from "@/lib/providers/types";

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

export interface InvestigationEvidence {
  source: string;
  title: string;
  observation: string;
  relevance: import("@/lib/providers/types").EvidenceRelevance;
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
  provider: string;
  environment: string;
}
