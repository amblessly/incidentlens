import type { EventType, IncidentStatus, RiskLevel, Severity } from "@/lib/types";

export const SEVERITIES: Severity[] = ["SEV-1", "SEV-2", "SEV-3", "SEV-4"];

export const SEVERITY_META: Record<
  Severity,
  { label: string; description: string; className: string; dot: string; rank: number }
> = {
  "SEV-1": {
    label: "SEV-1",
    description: "Critical — complete service outage or data loss.",
    className:
      "border-destructive/30 bg-destructive/10 text-destructive dark:border-destructive/40",
    dot: "bg-destructive",
    rank: 1,
  },
  "SEV-2": {
    label: "SEV-2",
    description: "High — degraded service, partial outage, urgent.",
    className:
      "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:border-amber-500/40 dark:text-amber-400",
    dot: "bg-amber-500",
    rank: 2,
  },
  "SEV-3": {
    label: "SEV-3",
    description: "Medium — minor impact, non-urgent investigation.",
    className:
      "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:border-sky-500/40 dark:text-sky-400",
    dot: "bg-sky-500",
    rank: 3,
  },
  "SEV-4": {
    label: "SEV-4",
    description: "Low — cosmetic or low-impact issue.",
    className: "border-border bg-muted/50 text-muted-foreground",
    dot: "bg-muted-foreground",
    rank: 4,
  },
};

export const INCIDENT_STATUSES: IncidentStatus[] = [
  "open",
  "investigating",
  "awaiting_approval",
  "approved",
  "resolved",
];

export const STATUS_META: Record<
  IncidentStatus,
  { label: string; className: string; dot: string }
> = {
  open: {
    label: "Open",
    className: "border-border bg-muted/50 text-muted-foreground",
    dot: "bg-muted-foreground",
  },
  investigating: {
    label: "Investigating",
    className: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:border-sky-500/40 dark:text-sky-400",
    dot: "bg-sky-500",
  },
  awaiting_approval: {
    label: "Awaiting approval",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:border-amber-500/40 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  approved: {
    label: "Plan approved",
    className: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:border-violet-500/40 dark:text-violet-400",
    dot: "bg-violet-500",
  },
  resolved: {
    label: "Resolved",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:border-emerald-500/40 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
};

export const PLAN_STATUS_META: Record<
  "draft" | "pending_approval" | "approved" | "rejected" | "executed",
  { label: string; className: string }
> = {
  draft: { label: "Draft", className: "border-border bg-muted/50 text-muted-foreground" },
  pending_approval: {
    label: "Pending approval",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:border-amber-500/40 dark:text-amber-400",
  },
  approved: {
    label: "Approved",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:border-emerald-500/40 dark:text-emerald-400",
  },
  rejected: {
    label: "Rejected",
    className: "border-destructive/30 bg-destructive/10 text-destructive dark:border-destructive/40",
  },
  executed: {
    label: "Executed",
    className: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:border-violet-500/40 dark:text-violet-400",
  },
};

export const RISK_META: Record<RiskLevel, { label: string; className: string }> = {
  low: {
    label: "Low",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:border-emerald-500/40 dark:text-emerald-400",
  },
  medium: {
    label: "Medium",
    className: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:border-sky-500/40 dark:text-sky-400",
  },
  high: {
    label: "High",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:border-amber-500/40 dark:text-amber-400",
  },
  critical: {
    label: "Critical",
    className: "border-destructive/30 bg-destructive/10 text-destructive dark:border-destructive/40",
  },
};

export const EVENT_META: Record<
  EventType,
  { label: string; icon: string; kind: "info" | "investigation" | "approval" | "remediation" }
> = {
  incident_created: { label: "Incident created", icon: "circle", kind: "info" },
  alert_received: { label: "Alert received", icon: "bell", kind: "info" },
  investigation_started: { label: "Investigation started", icon: "search", kind: "investigation" },
  infrastructure_queried: { label: "Infrastructure queried", icon: "server", kind: "investigation" },
  logs_inspected: { label: "Logs inspected", icon: "file-text", kind: "investigation" },
  changes_inspected: { label: "Changes inspected", icon: "git-branch", kind: "investigation" },
  deployment_discovered: { label: "Deployment discovered", icon: "rocket", kind: "investigation" },
  evidence_correlated: { label: "Evidence correlated", icon: "link", kind: "investigation" },
  hypothesis_generated: { label: "Hypothesis generated", icon: "lightbulb", kind: "investigation" },
  remediation_proposed: { label: "Remediation proposed", icon: "shield", kind: "remediation" },
  approval_requested: { label: "Approval requested", icon: "user-check", kind: "approval" },
  approval_granted: { label: "Approval granted", icon: "check", kind: "approval" },
  approval_rejected: { label: "Approval rejected", icon: "x", kind: "approval" },
  remediation_executed: { label: "Remediation executed", icon: "zap", kind: "remediation" },
  incident_resolved: { label: "Incident resolved", icon: "check-circle", kind: "info" },
  plan_viewed: { label: "Plan viewed", icon: "eye", kind: "approval" },
  execution_started: { label: "Execution started", icon: "zap", kind: "remediation" },
  execution_result: { label: "Execution result", icon: "flag", kind: "remediation" },
  rollback_result: { label: "Rollback result", icon: "rotate-ccw", kind: "remediation" },
  note: { label: "Note", icon: "sticky-note", kind: "info" },
};

export const AGENT_STEPS = [
  "Understanding incident",
  "Determining investigation window",
  "Planning investigation",
  "Inspecting infrastructure",
  "Checking recent changes",
  "Correlating evidence",
  "Evaluating hypotheses",
  "Preparing remediation plan",
  "Waiting for approval",
] as const;

export const INVESTIGATION_PHASE_META: Record<
  string,
  { label: string }
> = {
  understanding: { label: "Phase 1 · Understanding" },
  planning: { label: "Phase 2 · Planning" },
  collection: { label: "Phase 3 · Evidence collection" },
  correlation: { label: "Phase 4 · Correlation" },
  "root-cause": { label: "Phase 5 · Root cause" },
  remediation: { label: "Phase 6 · Remediation" },
};

export const INVESTIGATOR_NAME = "Ava Chen";
export const INVESTIGATOR_ROLE = "On-call engineer";

export const DEFAULT_AGENT_NAME = "IncidentLens Investigator";

/** @deprecated Use DEFAULT_AGENT_NAME */
export const CLANKER_AGENT_NAME = DEFAULT_AGENT_NAME;

/** Rollback strategy value that marks an action as requiring human intervention. */
export const MANUAL_RECOVERY_LABEL = "Manual recovery required";

export const DEMO_SERVICES = [
  "api-production",
  "payments-service",
  "db-primary",
  "auth-service",
  "search-service",
  "web-frontend",
  "worker-jobs",
  "cdn-edge",
];
