import { providerLogger } from "@/lib/log";
import { ClankerMCPClient, readMCPConfig, type ClankerMCPConfig } from "@/lib/providers/adapters/clanker/mcp-client";
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

/**
 * ClankerMCPProvider — infrastructure provider backed by a local Clanker CLI
 * instance via its MCP HTTP server.
 *
 * Flow:
 *   IncidentLens → MCP HTTP → Clanker CLI → AWS/GCP/Azure/K8s/etc.
 *
 * This gives IncidentLens real infrastructure intelligence without requiring
 * the Clanker Cloud sandbox API, making demos reliable and local.
 */
export class ClankerMCPProvider implements InfrastructureProvider {
  readonly id: string;
  readonly name: string;
  readonly type = "clanker" as const;

  private client: ClankerMCPClient;

  constructor(id: string, name: string, config: ClankerMCPConfig = readMCPConfig()) {
    this.id = id;
    this.name = name;
    this.client = new ClankerMCPClient(config);
  }

  getCapabilities(): ProviderCapabilities {
    return { services: true, health: true, logs: true, metrics: true, deployments: true, database: true, changes: true };
  }

  async testConnection(): Promise<ProviderConnectionResult> {
    const result = await this.client.testConnection();
    return {
      ok: result.ok,
      latencyMs: result.latencyMs,
      message: result.message,
      capabilities: result.ok ? this.getCapabilities() : undefined,
    };
  }

  /**
   * Parse Clanker's natural language output into structured data.
   * For the hackathon, we use Clanker's `ask` command with specific
   * queries and parse the results.
   */
  private async queryInfrastructure(question: string): Promise<string> {
    providerLogger.info(`Querying infrastructure via Clanker MCP`, { question: question.slice(0, 100) });
    return this.client.ask(question);
  }

  async getServices(): Promise<ServiceInfo[]> {
    try {
      const output = await this.queryInfrastructure(
        "List all running services, their types (lambda, ecs, etc), and health status. Return as JSON array with fields: name, kind, status, health."
      );
      return this.parseServiceOutput(output);
    } catch (error) {
      providerLogger.warn("Failed to get services via Clanker", { error: String(error) });
      throw error;
    }
  }

  async getServiceHealth(service?: string): Promise<ServiceHealth[]> {
    const query = service
      ? `Check the health status of ${service}. Return JSON with service, status (healthy/warning/critical), openIncidents count, and detail.`
      : "Check health of all services. Return JSON array with service, status (healthy/warning/critical), openIncidents count, and detail.";
    try {
      const output = await this.queryInfrastructure(query);
      return this.parseHealthOutput(output);
    } catch (error) {
      providerLogger.warn("Failed to get service health via Clanker", { error: String(error) });
      throw error;
    }
  }

  async getDeployments(service?: string, since?: string): Promise<DeploymentInfo[]> {
    const timeConstraint = since ? `since ${since}` : "in the last 2 hours";
    const serviceConstraint = service ? `for ${service}` : "for all services";
    const query = `List recent deployments ${serviceConstraint} ${timeConstraint}. Return JSON array with id, service, version, commit, author, deployedAt (ISO), status.`;
    try {
      const output = await this.queryInfrastructure(query);
      return this.parseDeploymentOutput(output);
    } catch (error) {
      providerLogger.warn("Failed to get deployments via Clanker", { error: String(error) });
      throw error;
    }
  }

  async getLogs(query: LogQuery): Promise<LogEntry[]> {
    const timeConstraint = query.since ? `since ${query.since}` : "in the last hour";
    const limit = query.limit ?? 50;
    const q = `Get the last ${limit} error and warning log entries for ${query.service} ${timeConstraint}. Return JSON array with timestamp (ISO), service, level (debug/info/warn/error), message.`;
    try {
      const output = await this.queryInfrastructure(q);
      return this.parseLogOutput(output, query.service);
    } catch (error) {
      providerLogger.warn("Failed to get logs via Clanker", { error: String(error) });
      throw error;
    }
  }

  async getMetrics(query: MetricQuery): Promise<MetricSample[]> {
    const timeConstraint = query.since ? `since ${query.since}` : "in the last hour";
    const q = `Get key metrics for ${query.service} ${timeConstraint}: error rate, latency p95, request count, CPU usage, memory usage. Return JSON array with name, service, value, unit, timestamp (ISO).`;
    try {
      const output = await this.queryInfrastructure(q);
      return this.parseMetricOutput(output, query.service);
    } catch (error) {
      providerLogger.warn("Failed to get metrics via Clanker", { error: String(error) });
      throw error;
    }
  }

  async getDatabaseState(): Promise<DatabaseState[]> {
    try {
      const output = await this.queryInfrastructure(
        "Check database connection state: connection count, max connections, replication lag, health. Return JSON array with name, status (healthy/warning/critical), connections, maxConnections, replicationLagMs, detail."
      );
      return this.parseDatabaseOutput(output);
    } catch (error) {
      providerLogger.warn("Failed to get database state via Clanker", { error: String(error) });
      throw error;
    }
  }

  async getRecentChanges(service?: string): Promise<RecentChange[]> {
    const serviceConstraint = service ? `for ${service}` : "for all services";
    const q = `List recent changes ${serviceConstraint} in the last 2 hours: deployments, config changes, pipeline runs. Return JSON array with id, type (deployment/config/pipeline/other), service, description, at (ISO), by.`;
    try {
      const output = await this.queryInfrastructure(q);
      return this.parseChangesOutput(output);
    } catch (error) {
      providerLogger.warn("Failed to get recent changes via Clanker", { error: String(error) });
      throw error;
    }
  }

  async getInfrastructureContext(service?: string): Promise<InfrastructureContext> {
    const [services, health, deployments, changes] = await Promise.all([
      this.getServices().catch(() => []),
      this.getServiceHealth(service).catch(() => []),
      this.getDeployments(service).catch(() => []),
      this.getRecentChanges(service).catch(() => []),
    ]);

    const healthByName = new Map(health.map((h) => [h.service, h]));
    return {
      services: services.map((s) => ({ ...s, health: healthByName.get(s.name)?.status ?? s.health })),
      deployments,
      changes,
      logs: [],
      metrics: [],
      database: [],
      collectedAt: new Date().toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Parsing helpers — convert Clanker's natural language output to structured data
  // These handle both JSON responses and text responses
  // ---------------------------------------------------------------------------

  private parseJsonFromText(text: string): unknown {
    // Try to extract JSON from markdown code blocks
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) {
      try { return JSON.parse(fenced[1]); } catch { /* fall through */ }
    }
    // Try to find JSON array or object
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try { return JSON.parse(arrayMatch[0]); } catch { /* fall through */ }
    }
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try { return JSON.parse(objMatch[0]); } catch { /* fall through */ }
    }
    return null;
  }

  private parseServiceOutput(output: string): ServiceInfo[] {
    const data = this.parseJsonFromText(output);
    if (Array.isArray(data)) {
      return data.map((item: Record<string, unknown>) => ({
        name: String(item.name ?? item.service ?? "unknown"),
        kind: String(item.kind ?? item.type ?? "service"),
        status: item.status ? String(item.status) : undefined,
        health: ["healthy", "warning", "critical"].includes(String(item.health))
          ? (item.health as "healthy" | "warning" | "critical")
          : "unknown",
        detail: item.detail ? String(item.detail) : undefined,
      }));
    }
    // Fallback: parse text output into a single service entry
    return [{
      name: "unknown",
      kind: "service",
      status: "unknown",
      health: "unknown",
      detail: output.slice(0, 200),
    }];
  }

  private parseHealthOutput(output: string): ServiceHealth[] {
    const data = this.parseJsonFromText(output);
    if (Array.isArray(data)) {
      return data.map((item: Record<string, unknown>) => ({
        service: String(item.service ?? item.name ?? "unknown"),
        status: ["healthy", "warning", "critical"].includes(String(item.status))
          ? (item.status as "healthy" | "warning" | "critical")
          : "unknown",
        openIncidents: Number(item.openIncidents ?? item.incidents ?? 0),
        detail: item.detail ? String(item.detail) : undefined,
      }));
    }
    return [{
      service: "unknown",
      status: "unknown",
      openIncidents: 0,
      detail: output.slice(0, 200),
    }];
  }

  private parseDeploymentOutput(output: string): DeploymentInfo[] {
    const data = this.parseJsonFromText(output);
    if (Array.isArray(data)) {
      return data.map((item: Record<string, unknown>) => ({
        id: String(item.id ?? item.deploymentId ?? `DEP-${Math.random().toString(36).slice(2, 8)}`),
        service: String(item.service ?? "unknown"),
        version: String(item.version ?? item.tag ?? "1.0.0"),
        commit: item.commit ? String(item.commit) : null,
        author: item.author ? String(item.author) : null,
        deployedAt: String(item.deployedAt ?? item.timestamp ?? new Date().toISOString()),
        status: String(item.status ?? "success"),
      }));
    }
    return [];
  }

  private parseLogOutput(output: string, service: string): LogEntry[] {
    const data = this.parseJsonFromText(output);
    if (Array.isArray(data)) {
      return data.map((item: Record<string, unknown>) => ({
        timestamp: String(item.timestamp ?? item.time ?? new Date().toISOString()),
        service: String(item.service ?? service),
        level: ["debug", "info", "warn", "error"].includes(String(item.level))
          ? (item.level as "debug" | "info" | "warn" | "error")
          : "unknown",
        message: String(item.message ?? item.msg ?? item.text ?? ""),
      }));
    }
    return [];
  }

  private parseMetricOutput(output: string, service: string): MetricSample[] {
    const data = this.parseJsonFromText(output);
    if (Array.isArray(data)) {
      return data.map((item: Record<string, unknown>) => ({
        name: String(item.name ?? item.metric ?? "unknown"),
        service: String(item.service ?? service),
        value: Number(item.value ?? 0),
        unit: item.unit ? String(item.unit) : undefined,
        timestamp: String(item.timestamp ?? item.time ?? new Date().toISOString()),
      }));
    }
    return [];
  }

  private parseDatabaseOutput(output: string): DatabaseState[] {
    const data = this.parseJsonFromText(output);
    if (Array.isArray(data)) {
      return data.map((item: Record<string, unknown>) => ({
        name: String(item.name ?? item.database ?? "unknown"),
        status: ["healthy", "warning", "critical"].includes(String(item.status))
          ? (item.status as "healthy" | "warning" | "critical")
          : "unknown",
        connections: item.connections ? Number(item.connections) : null,
        maxConnections: item.maxConnections ? Number(item.maxConnections) : null,
        replicationLagMs: item.replicationLagMs ? Number(item.replicationLagMs) : null,
        detail: item.detail ? String(item.detail) : undefined,
      }));
    }
    return [];
  }

  private parseChangesOutput(output: string): RecentChange[] {
    const data = this.parseJsonFromText(output);
    if (Array.isArray(data)) {
      return data.map((item: Record<string, unknown>) => ({
        id: item.id ? String(item.id) : undefined,
        type: ["deployment", "config", "pipeline"].includes(String(item.type))
          ? (item.type as "deployment" | "config" | "pipeline")
          : "other",
        service: String(item.service ?? "unknown"),
        description: String(item.description ?? item.title ?? ""),
        at: String(item.at ?? item.timestamp ?? new Date().toISOString()),
        by: item.by ? String(item.by) : undefined,
      }));
    }
    return [];
  }
}
