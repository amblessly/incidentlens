/**
 * Infrastructure provider abstraction.
 *
 * IncidentLens is not coupled to a single infrastructure backend. Anything
 * that can answer read-only questions about services, health, deployments,
 * logs, metrics, database state and recent changes implements
 * `InfrastructureProvider`.
 *
 * Contract:
 * - Every method performs REAL requests against the connected environment.
 * - Providers never fabricate results. If a source cannot be inspected,
 *   they throw `ProviderError` (see src/lib/errors.ts) — never a made-up row.
 * - `testConnection` performs an actual provider request and only reports
 *   success when the request succeeds.
 */

// ---------------------------------------------------------------------------
// Provider type system
// ---------------------------------------------------------------------------

export type ProviderType =
  | "clanker"
  | "generic"
  | "mock"
  | "datadog"
  | "grafana"
  | "sentry"
  | "aws"
  | "gcp"
  | "azure"
  | string;

export interface ProviderCapabilities {
  services: boolean;
  health: boolean;
  logs: boolean;
  metrics: boolean;
  deployments: boolean;
  database: boolean;
  changes: boolean;
}

export interface ProviderConnectionResult {
  ok: boolean;
  latencyMs: number;
  message: string;
  capabilities?: ProviderCapabilities;
}

// ---------------------------------------------------------------------------
// Investigation domain types (formerly in clanker/types.ts)
// ---------------------------------------------------------------------------

export type EvidenceRelevance = "primary" | "supporting" | "context";

export type InvestigationPhase =
  | "collecting-evidence"
  | "correlating-evidence"
  | "evaluating-hypotheses"
  | "preparing-remediation"
  | "completed"
  | "failed"
  | "understanding"
  | "planning"
  | "collection"
  | "correlation"
  | "root-cause"
  | "remediation";

export interface InvestigationStep {
  step: string;
  label: string;
  detail: string;
  status: "pending" | "active" | "done";
  phase: InvestigationPhase;
  source: string | null;
  completedAt: string | null;
}

export interface ServiceInfo {
  name: string;
  kind: string;
  team?: string;
  status?: string;
  health?: "healthy" | "warning" | "critical" | "unknown";
  detail?: string;
}

export interface ServiceHealth {
  service: string;
  status: "healthy" | "warning" | "critical" | "unknown";
  openIncidents: number;
  detail?: string;
}

export interface DeploymentInfo {
  id: string;
  service: string;
  version: string;
  commit: string | null;
  author: string | null;
  deployedAt: string;
  status: string;
}

export interface LogEntry {
  timestamp: string;
  service: string;
  level: "debug" | "info" | "warn" | "error" | "unknown";
  message: string;
}

export interface MetricSample {
  name: string;
  service: string;
  value: number;
  unit?: string;
  timestamp: string;
}

export interface DatabaseState {
  name: string;
  status: "healthy" | "warning" | "critical" | "unknown";
  connections: number | null;
  maxConnections: number | null;
  replicationLagMs: number | null;
  detail?: string;
}

export interface RecentChange {
  id?: string;
  type: "deployment" | "config" | "pipeline" | "other";
  service: string;
  description: string;
  at: string;
  by?: string;
}

export interface InfrastructureContext {
  services: ServiceInfo[];
  deployments: DeploymentInfo[];
  changes: RecentChange[];
  logs: LogEntry[];
  metrics: MetricSample[];
  database: DatabaseState[];
  collectedAt: string;
}

export interface ProviderHealth {
  ok: boolean;
  latencyMs: number | null;
  message: string;
}

export interface LogQuery {
  service: string;
  since?: string;
  limit?: number;
}

export interface MetricQuery {
  service: string;
  since?: string;
}

export interface InfrastructureProvider {
  /** Stable provider ID, e.g. "clanker", "mock", "datadog-prod". */
  readonly id: string;
  /** Human-readable provider name. */
  readonly name: string;
  /** Provider type identifier. */
  readonly type: ProviderType;

  /** Declare which capabilities this provider supports. */
  getCapabilities(): ProviderCapabilities;

  /** Real connectivity probe. Only reports success when a request succeeds. */
  testConnection(): Promise<ProviderConnectionResult>;

  getServices(): Promise<ServiceInfo[]>;
  getServiceHealth(service?: string): Promise<ServiceHealth[]>;
  getDeployments(service?: string, since?: string): Promise<DeploymentInfo[]>;
  getLogs(query: LogQuery): Promise<LogEntry[]>;
  getMetrics(query: MetricQuery): Promise<MetricSample[]>;
  getDatabaseState(): Promise<DatabaseState[]>;
  getRecentChanges(service?: string): Promise<RecentChange[]>;
  getInfrastructureContext(service?: string): Promise<InfrastructureContext>;
}