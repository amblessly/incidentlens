import type {
  DatabaseState,
  DeploymentInfo,
  InfrastructureContext,
  InfrastructureProvider,
  LogEntry,
  LogQuery,
  MetricQuery,
  MetricSample,
  ProviderCapabilities,
  ProviderConnectionResult,
  RecentChange,
  ServiceHealth,
  ServiceInfo,
} from "@/lib/providers/types";

function nowIso(): string {
  return new Date().toISOString();
}

function minutesAgo(n: number): string {
  return new Date(Date.now() - n * 60_000).toISOString();
}

/**
 * MockInfrastructureProvider — deterministic fixtures for INCIDENTLENS_MODE=demo ONLY.
 *
 * Scenario: "Production API — 5xx spike caused by deployment DEP-9081
 * introducing unbounded DB queries that exhaust the connection pool."
 *
 * This tells a coherent story:
 *   Deployment DEP-9081 → DB connection pool exhaustion → API timeouts → 5xx spike
 *
 * The investigation engine correlates these signals into evidence
 * relationships and produces a high-confidence hypothesis.
 */

// ---------------------------------------------------------------------------
// Services — api-production is degraded, database is critical
// ---------------------------------------------------------------------------

const SERVICES: ServiceInfo[] = [
  { name: "api-production", kind: "service", team: "Core API", health: "critical" },
  { name: "worker-jobs", kind: "service", team: "Batch", health: "healthy" },
  { name: "auth-service", kind: "service", team: "Identity", health: "healthy" },
  { name: "search-engine", kind: "service", team: "Search", health: "healthy" },
  { name: "cdn-edge", kind: "cdn", team: "Edge", health: "healthy" },
  { name: "web-frontend", kind: "web", team: "Web", health: "healthy" },
  { name: "primary-db", kind: "database", team: "Data", health: "critical" },
  { name: "cache-layer", kind: "service", team: "Data", health: "warning" },
];

// ---------------------------------------------------------------------------
// Health — api-production is critical, database is critical
// ---------------------------------------------------------------------------

const HEALTH: ServiceHealth[] = [
  { service: "api-production", status: "critical", openIncidents: 1, detail: "5xx error rate at 18% — response times elevated. API returning timeout errors to downstream consumers." },
  { service: "primary-db", status: "critical", openIncidents: 1, detail: "Connection pool exhaustion: 98/100 connections in use. Replication lag at 4200ms." },
  { service: "cache-layer", status: "warning", openIncidents: 0, detail: "Cache hit rate dropped to 61% due to upstream database pressure." },
  { service: "worker-jobs", status: "healthy", openIncidents: 0, detail: "Processing normally." },
  { service: "auth-service", status: "healthy", openIncidents: 0, detail: "Latency nominal." },
  { service: "search-engine", status: "healthy", openIncidents: 0, detail: "Index up to date." },
  { service: "cdn-edge", status: "healthy", openIncidents: 0, detail: "Edge cache healthy." },
  { service: "web-frontend", status: "healthy", openIncidents: 0, detail: "Serving static assets." },
];

// ---------------------------------------------------------------------------
// Deployments — DEP-9081 deployed ~10 min before the incident started
// ---------------------------------------------------------------------------

const DEPLOYMENTS: DeploymentInfo[] = [
  { id: "DEP-9081", service: "api-production", version: "v3.4.1", commit: "9f2c41a", author: "Jordan Reyes", deployedAt: minutesAgo(10), status: "success" },
  { id: "DEP-9079", service: "api-production", version: "v3.4.0", commit: "a11b22c", author: "Maya Patel", deployedAt: minutesAgo(180), status: "success" },
  { id: "DEP-9075", service: "auth-service", version: "v2.9.0", commit: "71fae12", author: "Maya Patel", deployedAt: minutesAgo(360), status: "success" },
  { id: "DEP-9070", service: "cdn-edge", version: "edge-44", commit: "b6d01ef", author: "Jordan Reyes", deployedAt: minutesAgo(600), status: "success" },
  { id: "DEP-9068", service: "web-frontend", version: "v5.1.0", commit: "8aa22d1", author: "Ava Chen", deployedAt: minutesAgo(900), status: "success" },
];

// ---------------------------------------------------------------------------
// Logs — error logs correlate with the deployment timestamp
// ---------------------------------------------------------------------------

function LOGS(service: string): LogEntry[] {
  const ts = (min: number) => minutesAgo(min);

  const errorLogs: Record<string, LogEntry[]> = {
    "api-production": [
      { timestamp: ts(9), service: "api-production", level: "error", message: "Request timeout after 30s: GET /api/v2/orders — connection pool exhausted (98/100 active)" },
      { timestamp: ts(9), service: "api-production", level: "error", message: "Upstream database error: could not acquire connection within 15000ms timeout" },
      { timestamp: ts(8), service: "api-production", level: "error", message: "Request timeout after 30s: GET /api/v2/inventory — connection pool exhausted" },
      { timestamp: ts(7), service: "api-production", level: "error", message: "5xx response generated: POST /api/v2/orders → 503 Service Unavailable" },
      { timestamp: ts(6), service: "api-production", level: "error", message: "Connection pool exhausted — 100/100 active, 42 waiting" },
      { timestamp: ts(5), service: "api-production", level: "error", message: "Database health check failed: connection timeout" },
      { timestamp: ts(4), service: "api-production", level: "warn", message: "Elevated p95 latency: 4200ms (threshold: 500ms)" },
      { timestamp: ts(3), service: "api-production", level: "error", message: "Request timeout after 30s: GET /api/v2/customers — pool exhaustion" },
      { timestamp: ts(2), service: "api-production", level: "error", message: "Circuit breaker OPEN for primary-db — 15 consecutive failures" },
      { timestamp: ts(1), service: "api-production", level: "error", message: "5xx rate 18.2% — 847 errors in last 5 min (threshold: 1%)" },
    ],
    "primary-db": [
      { timestamp: ts(9), service: "primary-db", level: "warn", message: "Connection pool utilization at 82% — approaching capacity" },
      { timestamp: ts(8), service: "primary-db", level: "warn", message: "Slow query detected: SELECT * FROM orders JOIN order_items WHERE status = 'pending' (2400ms)" },
      { timestamp: ts(7), service: "primary-db", level: "error", message: "Connection pool exhausted: 100/100 active connections" },
      { timestamp: ts(6), service: "primary-db", level: "error", message: "Replication lag spike: 4200ms (threshold: 200ms)" },
      { timestamp: ts(5), service: "primary-db", level: "error", message: "Query timeout: SELECT * FROM orders JOIN order_items JOIN products WHERE created_at > NOW() - INTERVAL '1 hour' (killed after 30s)" },
      { timestamp: ts(4), service: "primary-db", level: "warn", message: "Connection pool at 98% — 98/100 active, 23 queued" },
      { timestamp: ts(3), service: "primary-db", level: "error", message: "Out of memory warning: work_mem exceeded 256MB on complex JOIN query" },
      { timestamp: ts(1), service: "primary-db", level: "error", message: "Replication lag: 4800ms — standby falling behind" },
    ],
    "cache-layer": [
      { timestamp: ts(6), service: "cache-layer", level: "warn", message: "Cache hit rate degraded: 61% (baseline: 94%)" },
      { timestamp: ts(3), service: "cache-layer", level: "warn", message: "Elevated miss rate due to upstream database pressure" },
    ],
  };

  return errorLogs[service] ?? [
    { timestamp: ts(10), service, level: "info", message: "Service operating normally." },
  ];
}

// ---------------------------------------------------------------------------
// Metrics — error rate and latency correlate with the deployment
// ---------------------------------------------------------------------------

function METRICS(service: string): MetricSample[] {
  if (service !== "api-production") {
    return [
      { name: "request_rate", service, value: 142, unit: "req/s", timestamp: nowIso() },
      { name: "error_rate", service, value: 0.002, unit: "ratio", timestamp: nowIso() },
    ];
  }

  return [
    { name: "error_rate", service: "api-production", value: 0.182, unit: "ratio", timestamp: nowIso() },
    { name: "error_rate_baseline", service: "api-production", value: 0.002, unit: "ratio", timestamp: nowIso() },
    { name: "latency_p95", service: "api-production", value: 4200, unit: "ms", timestamp: nowIso() },
    { name: "latency_p95_baseline", service: "api-production", value: 180, unit: "ms", timestamp: nowIso() },
    { name: "request_rate", service: "api-production", value: 1847, unit: "req/s", timestamp: nowIso() },
    { name: "timeout_count", service: "api-production", value: 847, unit: "count/5m", timestamp: nowIso() },
    { name: "circuit_breaker_trips", service: "api-production", value: 3, unit: "count", timestamp: nowIso() },
  ];
}

// ---------------------------------------------------------------------------
// Database — connection pool exhaustion
// ---------------------------------------------------------------------------

const DATABASE_STATE: DatabaseState[] = [
  { name: "primary-db", status: "critical", connections: 98, maxConnections: 100, replicationLagMs: 4800, detail: "Connection pool near exhaustion. Active: 98/100. Waiting: 23. Complex JOIN queries consuming excessive connections and memory." },
  { name: "cache-layer", status: "warning", connections: 12, maxConnections: 50, replicationLagMs: 0, detail: "Cache hit rate degraded to 61% due to upstream DB pressure." },
];

// ---------------------------------------------------------------------------
// Changes — recent deployments and config changes
// ---------------------------------------------------------------------------

const CHANGES: RecentChange[] = [
  { id: "CHG-1421", type: "deployment", service: "api-production", description: "api-production v3.4.1 deployed — introduces new order aggregation queries with multi-table JOINs", at: minutesAgo(10), by: "Jordan Reyes (via GitHub Actions)" },
  { id: "CHG-1418", type: "deployment", service: "api-production", description: "api-production v3.4.0 deployed — minor API endpoint additions", at: minutesAgo(180), by: "Maya Patel (via GitHub Actions)" },
  { id: "CHG-1415", type: "pipeline", service: "api-production", description: "CI/CD pipeline completed: build #4821 — 142 tests passed", at: minutesAgo(10), by: "Jordan Reyes" },
  { id: "CHG-1412", type: "config", service: "primary-db", description: "Database connection pool size unchanged: max_connections=100", at: minutesAgo(4320), by: "Platform team" },
];

export class MockInfrastructureProvider implements InfrastructureProvider {
  readonly id = "mock";
  readonly name = "Demo Infrastructure Provider";
  readonly type = "mock" as const;

  getCapabilities(): ProviderCapabilities {
    return { services: true, health: true, logs: true, metrics: true, deployments: true, database: true, changes: true };
  }

  async testConnection(): Promise<ProviderConnectionResult> {
    return { ok: true, latencyMs: 1, message: "Connected to Demo Infrastructure Provider.", capabilities: this.getCapabilities() };
  }

  async getServices(): Promise<ServiceInfo[]> {
    return SERVICES;
  }

  async getServiceHealth(service?: string): Promise<ServiceHealth[]> {
    if (service) return HEALTH.filter((h) => h.service === service);
    return HEALTH;
  }

  async getDeployments(service?: string, since?: string): Promise<DeploymentInfo[]> {
    let list = [...DEPLOYMENTS];
    if (service) list = list.filter((d) => d.service === service);
    if (since) {
      const sinceMs = new Date(since).getTime();
      list = list.filter((d) => new Date(d.deployedAt).getTime() >= sinceMs);
    }
    return list;
  }

  async getLogs(query: LogQuery): Promise<LogEntry[]> {
    return LOGS(query.service);
  }

  async getMetrics(query: MetricQuery): Promise<MetricSample[]> {
    return METRICS(query.service);
  }

  async getDatabaseState(): Promise<DatabaseState[]> {
    return DATABASE_STATE;
  }

  async getRecentChanges(service?: string): Promise<RecentChange[]> {
    if (service) return CHANGES.filter((c) => c.service === service);
    return CHANGES;
  }

  async getInfrastructureContext(service?: string): Promise<InfrastructureContext> {
    const [services, health, deployments, changes] = await Promise.all([
      this.getServices(),
      this.getServiceHealth(),
      this.getDeployments(service),
      this.getRecentChanges(service),
    ]);

    const healthByName = new Map(health.map((h) => [h.service, h]));

    return {
      services: services.map((s) => ({ ...s, health: healthByName.get(s.name)?.status ?? s.health })),
      deployments,
      changes,
      logs: [],
      metrics: [],
      database: [],
      collectedAt: nowIso(),
    };
  }
}

/**
 * @deprecated Use MockInfrastructureProvider instead.
 */
export const DemoProvider = MockInfrastructureProvider;
