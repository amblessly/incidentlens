export type Severity = "SEV-1" | "SEV-2" | "SEV-3" | "SEV-4";

export type IncidentStatus =
  | "open"
  | "investigating"
  | "awaiting_approval"
  | "approved"
  | "resolved";

export type PlanStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "executed";

export type RunStatus = "running" | "completed" | "failed";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type EvidenceRelevance = "primary" | "supporting" | "context";

export type EventType =
  | "incident_created"
  | "alert_received"
  | "investigation_started"
  | "infrastructure_queried"
  | "logs_inspected"
  | "changes_inspected"
  | "deployment_discovered"
  | "evidence_correlated"
  | "hypothesis_generated"
  | "remediation_proposed"
  | "approval_requested"
  | "approval_granted"
  | "approval_rejected"
  | "remediation_executed"
  | "incident_resolved"
  | "plan_viewed"
  | "execution_started"
  | "execution_result"
  | "rollback_result"
  | "note";

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at: string;
}

export interface Service {
  id: string;
  name: string;
  team: string;
  kind: string;
  created_at: string;
}

export interface Deployment {
  id: string;
  service: string;
  version: string;
  commit: string;
  author: string;
  deployed_at: string;
  status: string;
}

export interface Incident {
  id: string;
  title: string;
  service: string;
  severity: Severity;
  status: IncidentStatus;
  description: string;
  started_at: string;
  created_at: string;
  resolved_at: string | null;
  assigned_to: string | null;
  deployment_id: string | null;
  repository: string | null;
  alert_payload: string | null;
  is_demo: number;
}

export interface IncidentEvent {
  id: number;
  incident_id: string;
  type: EventType;
  title: string;
  description: string | null;
  actor: string | null;
  created_at: string;
  run_id: number | null;
}

export interface Evidence {
  id: number;
  incident_id: string;
  source: string;
  title: string;
  observation: string;
  relevance: EvidenceRelevance;
  confidence: number;
  timestamp: string;
  data: string | null;
}

export interface Hypothesis {
  id: number;
  incident_id: string;
  title: string;
  description: string;
  confidence: number;
  is_selected: number;
  supporting_evidence: string;
  created_at: string;
}

export interface InvestigationRun {
  id: number;
  incident_id: string;
  status: RunStatus;
  agent: string;
  started_at: string;
  finished_at: string | null;
  result: string | null;
}

export interface RemediationPlan {
  id: number;
  incident_id: string;
  status: PlanStatus;
  summary: string;
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
  rejection_reason: string | null;
  hash: string | null;
  executed_at: string | null;
  executed_by: string | null;
  execution_result: string | null;
  rollback_result: string | null;
}

export interface RemediationAction {
  id: number;
  plan_id: number;
  order_index: number;
  description: string;
  expected_impact: string;
  risk_level: RiskLevel;
  rollback_strategy: string;
  affected_resources: string;
  reason: string;
  evidence_refs: string;
  approval_required: number;
  blast_radius: string | null;
  prerequisites: string | null;
}

export interface InvestigationResultData {
  incidentSummary: string;
  severityAssessment: string;
  affectedServices: string[];
  timeline: { step: string; detail: string }[];
  evidence: {
    source: string;
    title: string;
    observation: string;
    relevance: EvidenceRelevance;
    confidence: number;
  }[];
  hypotheses: {
    title: string;
    description: string;
    confidence: number;
    supportingEvidence: string[];
    contradictingEvidence: string[];
    missingEvidence: string[];
    nextStep: string;
  }[];
  recommendedActions: { description: string; reason: string }[];
  missingEvidence: string[];
  confidence: number;
  safetyNotes: string[];
}
