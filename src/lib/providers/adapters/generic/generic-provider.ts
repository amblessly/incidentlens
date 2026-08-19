import { ProviderError } from "@/lib/errors";
import type {
  DatabaseState,
  DeploymentInfo,
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

/**
 * GenericApiProvider — a configurable adapter for custom infrastructure APIs.
 *
 * Developers configure base URL, authentication, and endpoint mappings.
 * All provider credentials remain server-side and are never logged.
 *
 * The generic provider maps endpoint responses to normalized IncidentLens
 * types. If an endpoint is not configured, the corresponding capability
 * is reported as unsupported and the investigation engine skips it.
 */

export interface GenericApiConfig {
  /** Base URL of the infrastructure API (server-side only). */
  baseUrl: string;
  /** Authentication method: "bearer" | "api-key" | "none" */
  authMethod: "bearer" | "api-key" | "none";
  /** API key or bearer token (server-side only, never logged). */
  credentials: string | null;
  /** Custom headers sent with every request. */
  headers: Record<string, string>;
  /** Endpoint paths relative to baseUrl (null = not configured). */
  endpoints: {
    services: string | null;
    health: string | null;
    logs: string | null;
    metrics: string | null;
    deployments: string | null;
    database: string | null;
    changes: string | null;
  };
  /** Per-request timeout in milliseconds. */
  timeoutMs: number;
}

function buildHeaders(config: GenericApiConfig): Record<string, string> {
  const headers: Record<string, string> = { ...config.headers, Accept: "application/json" };
  if (config.authMethod === "bearer" && config.credentials) {
    headers["Authorization"] = `Bearer ${config.credentials}`;
  } else if (config.authMethod === "api-key" && config.credentials) {
    headers["X-API-Key"] = config.credentials;
  }
  return headers;
}

async function fetchJson<T>(url: string, headers: Record<string, string>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) {
      throw new ProviderError("generic", "INVALID_PROVIDER_RESPONSE", `HTTP ${res.status}: ${res.statusText}`);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ProviderError("generic", "PROVIDER_TIMEOUT", `Request timed out after ${timeoutMs}ms`);
    }
    throw new ProviderError("generic", "PROVIDER_UNAVAILABLE", `Request failed: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

export class GenericApiProvider implements InfrastructureProvider {
  readonly id: string;
  readonly name: string;
  readonly type = "generic" as const;
  private config: GenericApiConfig;

  constructor(id: string, name: string, config: GenericApiConfig) {
    this.id = id;
    this.name = name;
    this.config = config;
  }

  getCapabilities(): ProviderCapabilities {
    const ep = this.config.endpoints;
    return {
      services: !!ep.services,
      health: !!ep.health,
      logs: !!ep.logs,
      metrics: !!ep.metrics,
      deployments: !!ep.deployments,
      database: !!ep.database,
      changes: !!ep.changes,
    };
  }

  async testConnection(): Promise<ProviderConnectionResult> {
    const started = Date.now();
    const headers = buildHeaders(this.config);
    const cap = this.getCapabilities();

    if (cap.services && this.config.endpoints.services) {
      try {
        const data = await fetchJson<unknown>(
          `${this.config.baseUrl}${this.config.endpoints.services}`,
          headers,
          this.config.timeoutMs,
        );
        if (Array.isArray(data) || (typeof data === "object" && data !== null)) {
          return { ok: true, latencyMs: Date.now() - started, message: `Connected to ${this.name}.`, capabilities: cap };
        }
        return { ok: false, latencyMs: Date.now() - started, message: "Response was not a valid JSON array/object." };
      } catch (err) {
        return { ok: false, latencyMs: Date.now() - started, message: (err as Error).message };
      }
    }

    return { ok: true, latencyMs: Date.now() - started, message: `Generic provider ${this.name} registered (no health endpoint configured).`, capabilities: cap };
  }

  async getServices(): Promise<ServiceInfo[]> {
    if (!this.config.endpoints.services) throw new ProviderError(this.id, "PROVIDER_NOT_CONFIGURED", "Services endpoint not configured.");
    const data = await fetchJson<unknown[]>(`${this.config.baseUrl}${this.config.endpoints.services}`, buildHeaders(this.config), this.config.timeoutMs);
    return (Array.isArray(data) ? data : []).map((item) => {
      const r = item as Record<string, unknown>;
      return {
        name: String(r.name ?? r.service ?? r.id ?? "unknown"),
        kind: String(r.kind ?? r.type ?? "service"),
        team: r.team ? String(r.team) : undefined,
        status: r.status ? String(r.status) : undefined,
        health: (r.health as ServiceInfo["health"]) ?? undefined,
        detail: r.detail ? String(r.detail) : undefined,
      };
    });
  }

  async getServiceHealth(service?: string): Promise<ServiceHealth[]> {
    if (!this.config.endpoints.health) throw new ProviderError(this.id, "PROVIDER_NOT_CONFIGURED", "Health endpoint not configured.");
    const url = service
      ? `${this.config.baseUrl}${this.config.endpoints.health}?service=${encodeURIComponent(service)}`
      : `${this.config.baseUrl}${this.config.endpoints.health}`;
    const data = await fetchJson<unknown[]>(url, buildHeaders(this.config), this.config.timeoutMs);
    return (Array.isArray(data) ? data : []).map((item) => {
      const r = item as Record<string, unknown>;
      return {
        service: String(r.service ?? "unknown"),
        status: (r.status as ServiceHealth["status"]) ?? "unknown",
        openIncidents: Number(r.openIncidents ?? r.open_incidents ?? 0),
        detail: r.detail ? String(r.detail) : undefined,
      };
    });
  }

  async getLogs(query: LogQuery): Promise<LogEntry[]> {
    if (!this.config.endpoints.logs) throw new ProviderError(this.id, "PROVIDER_NOT_CONFIGURED", "Logs endpoint not configured.");
    const params = new URLSearchParams({ service: query.service, limit: String(query.limit ?? 50) });
    if (query.since) params.set("since", query.since);
    const data = await fetchJson<unknown[]>(`${this.config.baseUrl}${this.config.endpoints.logs}?${params}`, buildHeaders(this.config), this.config.timeoutMs);
    return (Array.isArray(data) ? data : []).map((item) => {
      const r = item as Record<string, unknown>;
      return {
        timestamp: String(r.timestamp ?? r.time ?? new Date().toISOString()),
        service: String(r.service ?? query.service),
        level: (r.level as LogEntry["level"]) ?? "unknown",
        message: String(r.message ?? r.msg ?? r.text ?? ""),
      };
    });
  }

  async getMetrics(query: MetricQuery): Promise<MetricSample[]> {
    if (!this.config.endpoints.metrics) throw new ProviderError(this.id, "PROVIDER_NOT_CONFIGURED", "Metrics endpoint not configured.");
    const params = new URLSearchParams({ service: query.service });
    if (query.since) params.set("since", query.since);
    const data = await fetchJson<unknown[]>(`${this.config.baseUrl}${this.config.endpoints.metrics}?${params}`, buildHeaders(this.config), this.config.timeoutMs);
    return (Array.isArray(data) ? data : []).map((item) => {
      const r = item as Record<string, unknown>;
      return {
        name: String(r.name ?? r.metric ?? "unknown"),
        service: String(r.service ?? query.service),
        value: Number(r.value ?? 0),
        unit: r.unit ? String(r.unit) : undefined,
        timestamp: String(r.timestamp ?? r.time ?? new Date().toISOString()),
      };
    });
  }

  async getDeployments(service?: string, since?: string): Promise<DeploymentInfo[]> {
    if (!this.config.endpoints.deployments) throw new ProviderError(this.id, "PROVIDER_NOT_CONFIGURED", "Deployments endpoint not configured.");
    const params = new URLSearchParams();
    if (service) params.set("service", service);
    if (since) params.set("since", since);
    const qs = params.toString() ? `?${params}` : "";
    const data = await fetchJson<unknown[]>(`${this.config.baseUrl}${this.config.endpoints.deployments}${qs}`, buildHeaders(this.config), this.config.timeoutMs);
    return (Array.isArray(data) ? data : []).map((item) => {
      const r = item as Record<string, unknown>;
      return {
        id: String(r.id ?? r.deploymentId ?? ""),
        service: String(r.service ?? ""),
        version: String(r.version ?? ""),
        commit: r.commit ? String(r.commit) : null,
        author: r.author ? String(r.author) : null,
        deployedAt: String(r.deployedAt ?? r.deployed_at ?? ""),
        status: String(r.status ?? "success"),
      };
    });
  }

  async getDatabaseState(): Promise<DatabaseState[]> {
    if (!this.config.endpoints.database) throw new ProviderError(this.id, "PROVIDER_NOT_CONFIGURED", "Database endpoint not configured.");
    const data = await fetchJson<unknown[]>(`${this.config.baseUrl}${this.config.endpoints.database}`, buildHeaders(this.config), this.config.timeoutMs);
    return (Array.isArray(data) ? data : []).map((item) => {
      const r = item as Record<string, unknown>;
      return {
        name: String(r.name ?? "unknown"),
        status: (r.status as DatabaseState["status"]) ?? "unknown",
        connections: r.connections != null ? Number(r.connections) : null,
        maxConnections: r.maxConnections != null ? Number(r.maxConnections) : r.max_connections != null ? Number(r.max_connections) : null,
        replicationLagMs: r.replicationLagMs != null ? Number(r.replicationLagMs) : r.replication_lag_ms != null ? Number(r.replication_lag_ms) : 0,
        detail: r.detail ? String(r.detail) : undefined,
      };
    });
  }

  async getRecentChanges(service?: string): Promise<RecentChange[]> {
    if (!this.config.endpoints.changes) throw new ProviderError(this.id, "PROVIDER_NOT_CONFIGURED", "Changes endpoint not configured.");
    const params = service ? `?service=${encodeURIComponent(service)}` : "";
    const data = await fetchJson<unknown[]>(`${this.config.baseUrl}${this.config.endpoints.changes}${params}`, buildHeaders(this.config), this.config.timeoutMs);
    return (Array.isArray(data) ? data : []).map((item) => {
      const r = item as Record<string, unknown>;
      return {
        id: r.id ? String(r.id) : undefined,
        type: (String(r.type ?? "other") as RecentChange["type"]),
        service: r.service ? String(r.service) : "",
        description: String(r.summary ?? r.description ?? ""),
        at: String(r.timestamp ?? r.at ?? ""),
        by: r.author ? String(r.author) : undefined,
      };
    });
  }

  async getInfrastructureContext() {
    const [services, deployments, changes] = await Promise.all([
      this.config.endpoints.services ? this.getServices() : [],
      this.config.endpoints.deployments ? this.getDeployments() : [],
      this.config.endpoints.changes ? this.getRecentChanges() : [],
    ]);
    return { services, deployments, changes, logs: [], metrics: [], database: [], collectedAt: new Date().toISOString() };
  }
}

/** Helper to create a GenericApiProvider from stored provider config (JSON string in DB). */
export function createGenericProviderFromConfig(
  id: string,
  name: string,
  configJson: string,
): GenericApiProvider {
  const config = JSON.parse(configJson) as GenericApiConfig;
  return new GenericApiProvider(id, name, config);
}
