import { z } from "zod";

import { ProviderError } from "@/lib/errors";
import { providerLogger } from "@/lib/log";
import { ClankerClient, clankerEnabled, readClankerConfig, type ClankerConfig, type Sandbox } from "@/lib/providers/adapters/clanker/client";
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
 * ClankerProvider — a REAL infrastructure provider backed by Clanker Cloud
 * sandboxes.
 *
 * Every capability performs an actual read-only command in a Clanker Cloud
 * sandbox and parses the returned JSON. If the command fails or the output
 * does not validate, a ProviderError is raised — nothing is fabricated, and
 * "evidence unavailable" is surfaced to the investigation instead of a made
 * up answer.
 *
 * The connected environment must expose the read-only `incidentlens-probe`
 * command (or the probe commands configured via CLANKER_PROBE_*). The probe
 * protocol is documented in README.md.
 */

const probeJson = z
  .string()
  .transform((text) => {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = fenced ? fenced[1] : text;
    const objectMatch = candidate.match(/\{[\s\S]*\}/);
    return objectMatch ? objectMatch[0] : candidate;
  })
  .transform((text) => {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  });

function invalidOutput(capability: string, detail: unknown): ProviderError {
  return new ProviderError(
    "clanker",
    "INVALID_PROVIDER_RESPONSE",
    `get${capability}: probe returned unparseable output. Evidence unavailable.`,
    detail,
  );
}

const servicesSchema = z.array(
  z.object({
    name: z.string().min(1),
    kind: z.string().default("service"),
    team: z.string().optional(),
    status: z.string().optional(),
    health: z.enum(["healthy", "warning", "critical", "unknown"]).optional(),
    detail: z.string().optional(),
  }),
);

const healthSchema = z.array(
  z.object({
    service: z.string().min(1),
    status: z.enum(["healthy", "warning", "critical", "unknown"]),
    openIncidents: z.number().default(0),
    detail: z.string().optional(),
  }),
);

const deploymentsSchema = z.array(
  z.object({
    id: z.string().min(1),
    service: z.string().min(1),
    version: z.string().min(1),
    commit: z.string().nullable().optional(),
    author: z.string().nullable().optional(),
    deployedAt: z.string(),
    status: z.string().default("success"),
  }),
);

const logsSchema = z.array(
  z.object({
    timestamp: z.string(),
    service: z.string().min(1),
    level: z.enum(["debug", "info", "warn", "error", "unknown"]).default("unknown"),
    message: z.string().min(1),
  }),
);

const metricsSchema = z.array(
  z.object({
    name: z.string().min(1),
    service: z.string().min(1),
    value: z.number(),
    unit: z.string().optional(),
    timestamp: z.string(),
  }),
);

const databaseSchema = z.array(
  z.object({
    name: z.string().min(1),
    status: z.enum(["healthy", "warning", "critical", "unknown"]),
    connections: z.number().nullable().optional(),
    maxConnections: z.number().nullable().optional(),
    replicationLagMs: z.number().nullable().optional(),
    detail: z.string().optional(),
  }),
);

const changesSchema = z.array(
  z.object({
    id: z.string().optional(),
    type: z.enum(["deployment", "config", "pipeline", "other"]),
    service: z.string().min(1),
    description: z.string().min(1),
    at: z.string(),
    by: z.string().optional(),
  }),
);

export interface ProbeCommands {
  test: string;
  services: string;
  health: string;
  deployments: string;
  logs: string;
  metrics: string;
  database: string;
  changes: string;
}

const DEFAULT_PROBE =
  process.env.CLANKER_PROBE_BINARY ?? "incidentlens-probe";

export function readProbeCommands(env: NodeJS.ProcessEnv = process.env): ProbeCommands {
  const probe = (name: string, fallback: string) =>
    env[`CLANKER_PROBE_${name.toUpperCase()}`] ?? fallback;
  return {
    test: probe("test", 'printf \'{"probe":"clanker-cloud","time":"%s"}\' "$(date -u +%FT%TZ)"'),
    services: probe("services", `${DEFAULT_PROBE} services --json`),
    health: probe("health", `${DEFAULT_PROBE} health --json`),
    deployments: probe(
      "deployments",
      `${DEFAULT_PROBE} deployments --since "{{SINCE}}" --json`,
    ),
    logs: probe(
      "logs",
      `${DEFAULT_PROBE} logs --service "{{SERVICE}}" --since "{{SINCE}}" --limit {{LIMIT}} --json`,
    ),
    metrics: probe(
      "metrics",
      `${DEFAULT_PROBE} metrics --service "{{SERVICE}}" --since "{{SINCE}}" --json`,
    ),
    database: probe("database", `${DEFAULT_PROBE} database --json`),
    changes: probe("changes", `${DEFAULT_PROBE} changes --since "{{SINCE}}" --json`),
  };
}

function parseJsonOutput(capability: string, output: string): unknown {
  if (!output.trim()) return null;
  const parsed = probeJson.safeParse(output);
  if (!parsed.success || parsed.data === null) {
    throw invalidOutput(capability, { preview: output.slice(0, 300) });
  }
  return parsed.data;
}

export class ClankerProvider implements InfrastructureProvider {
  readonly id: string;
  readonly name: string;
  readonly type = "clanker" as const;

  private client: ClankerClient;
  private probes: ProbeCommands;

  constructor(
    id: string,
    name: string,
    config: ClankerConfig = readClankerConfig(),
    probes: ProbeCommands = readProbeCommands(),
  ) {
    this.id = id;
    this.name = name;
    if (!clankerEnabled()) {
      throw new ProviderError(
        "clanker",
        "PROVIDER_NOT_CONFIGURED",
        "Clanker provider requires CLANKER_MODE=live in the server environment.",
      );
    }
    this.client = new ClankerClient(config);
    this.probes = probes;
  }

  getCapabilities(): ProviderCapabilities {
    return { services: true, health: true, logs: true, metrics: true, deployments: true, database: true, changes: true };
  }

  private substitute(template: string, vars: Record<string, string>): string {
    return Object.entries(vars).reduce(
      (acc, [key, value]) => acc.replaceAll(`{{${key}}}`, value),
      template,
    );
  }

  private async runProbe(command: string): Promise<string> {
    return this.client.withSandbox(async (sandbox: Sandbox) => {
      const result = await this.client.runCommand(sandbox, command);
      if (result.failed) {
        throw new ProviderError(
          "clanker",
          "INVALID_PROVIDER_RESPONSE",
          `probe command failed: ${result.failed}`,
        );
      }
      return result.output;
    });
  }

  private async parseCapability<T>(
    capability: string,
    template: string,
    vars: Record<string, string>,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const command = this.substitute(template, vars);
    providerLogger.info(`querying ${capability} via Clanker Cloud`, { command: command.slice(0, 120) });
    const output = await this.runProbe(command);
    const data = parseJsonOutput(capability, output);
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      throw invalidOutput(capability, parsed.error.issues);
    }
    return parsed.data;
  }

  /** Real connectivity probe: creates a sandbox and runs a real command. */
  async testConnection(): Promise<ProviderConnectionResult> {
    const started = Date.now();
    try {
      const output = await this.runProbe(this.probes.test);
      if (!output.trim()) {
        return { ok: false, latencyMs: Date.now() - started, message: "Probe returned empty output." };
      }
      return {
        ok: true,
        latencyMs: Date.now() - started,
        message: `Connected to Clanker Cloud (probe succeeded).`,
        capabilities: this.getCapabilities(),
      };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        message: error instanceof Error ? error.message : "Connection test failed.",
      };
    }
  }

  async getServices(): Promise<ServiceInfo[]> {
    return this.parseCapability("Services", this.probes.services, {}, servicesSchema);
  }

  async getServiceHealth(service?: string): Promise<ServiceHealth[]> {
    const command = this.substitute(this.probes.health, {
      SERVICE: service ?? "",
    });
    const rows = await this.parseCapability(
      "ServiceHealth",
      command,
      {},
      healthSchema,
    );
    return service ? rows.filter((r) => r.service === service) : rows;
  }

  async getDeployments(service?: string, since?: string): Promise<DeploymentInfo[]> {
    const command = this.substitute(this.probes.deployments, {
      SERVICE: service ?? "",
      SINCE: since ?? "",
    });
    const rows = await this.parseCapability(
      "Deployments",
      command,
      {},
      deploymentsSchema,
    );
    return rows.map((row) => ({
      id: row.id,
      service: row.service,
      version: row.version,
      commit: row.commit ?? null,
      author: row.author ?? null,
      deployedAt: row.deployedAt,
      status: row.status,
    }));
  }

  async getLogs(query: LogQuery): Promise<LogEntry[]> {
    const command = this.substitute(this.probes.logs, {
      SERVICE: query.service,
      SINCE: query.since ?? "",
      LIMIT: String(query.limit ?? 200),
    });
    return this.parseCapability("Logs", command, {}, logsSchema);
  }

  async getMetrics(query: MetricQuery): Promise<MetricSample[]> {
    const command = this.substitute(this.probes.metrics, {
      SERVICE: query.service,
      SINCE: query.since ?? "",
    });
    return this.parseCapability("Metrics", command, {}, metricsSchema);
  }

  async getDatabaseState(): Promise<DatabaseState[]> {
    const rows = await this.parseCapability("DatabaseState", this.probes.database, {}, databaseSchema);
    return rows.map((row) => ({
      name: row.name,
      status: row.status,
      connections: row.connections ?? null,
      maxConnections: row.maxConnections ?? null,
      replicationLagMs: row.replicationLagMs ?? null,
      detail: row.detail,
    }));
  }

  async getRecentChanges(service?: string): Promise<RecentChange[]> {
    const command = this.substitute(this.probes.changes, {
      SERVICE: service ?? "",
      SINCE: "",
    });
    const changes = await this.parseCapability(
      "RecentChanges",
      command,
      {},
      changesSchema,
    );
    return service ? changes.filter((c) => c.service === service) : changes;
  }

  async getInfrastructureContext(service?: string): Promise<InfrastructureContext> {
    const [services, health, deployments, changes] = await Promise.all([
      this.getServices(),
      this.getServiceHealth(service),
      this.getDeployments(service),
      this.getRecentChanges(service),
    ]);
    const healthByName = new Map(health.map((h) => [h.service, h]));
    return {
      services: services.map((s) => ({ ...s, health: healthByName.get(s.name)?.status ?? s.health })),
      deployments: deployments.filter((d) => !service || d.service === service),
      changes: changes.filter((c) => !service || c.service === service),
      logs: [],
      metrics: [],
      database: [],
      collectedAt: new Date().toISOString(),
    };
  }
}