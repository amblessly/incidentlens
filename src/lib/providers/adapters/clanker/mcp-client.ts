import { providerLogger } from "@/lib/log";

/**
 * Clanker CLI MCP Client — connects to a local Clanker CLI instance
 * via its HTTP MCP transport (clanker mcp --transport http --listen :39393).
 *
 * This is the recommended integration path for the hackathon because:
 * - It uses real Clanker CLI infrastructure queries
 * - It runs locally, making demos reliable
 * - It exposes the full Clanker tool surface (K8s, AWS, GCP, etc.)
 */

export interface ClankerMCPConfig {
  /** MCP server URL (default http://127.0.0.1:39393) */
  mcpUrl: string;
  /** Request timeout in ms (default 30000) */
  timeoutMs: number;
}

export function readMCPConfig(env: NodeJS.ProcessEnv = process.env): ClankerMCPConfig {
  return {
    mcpUrl: (env.CLANKER_MCP_URL ?? "http://127.0.0.1:39393").replace(/\/+$/, ""),
    timeoutMs: Number(env.CLANKER_MCP_TIMEOUT_MS ?? 30_000),
  };
}

interface MCPRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: "2.0";
  id: number;
  result?: { content?: { type: string; text: string }[] };
  error?: { code: number; message: string };
}

let requestCounter = 0;

export class ClankerMCPClient {
  readonly config: ClankerMCPConfig;

  constructor(config: ClankerMCPConfig = readMCPConfig()) {
    this.config = config;
  }

  private async request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = ++requestCounter;
    const body: MCPRequest = { jsonrpc: "2.0", id, method, params };

    providerLogger.info(`MCP request: ${method}`, { id });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const res = await fetch(`${this.config.mcpUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`MCP HTTP ${res.status}: ${await res.text().catch(() => "")}`);
      }

      const text = await res.text();
      // Handle SSE format
      const lines = text.split("\n").filter((l) => l.startsWith("data: "));
      const data = lines.length > 0 ? JSON.parse(lines[lines.length - 1].slice(6)) : JSON.parse(text);

      const mcpRes = data as MCPResponse;
      if (mcpRes.error) {
        throw new Error(`MCP error ${mcpRes.error.code}: ${mcpRes.error.message}`);
      }

      const content = mcpRes.result?.content;
      if (content && content.length > 0) {
        const textContent = content.find((c) => c.type === "text");
        if (textContent) {
          try {
            return JSON.parse(textContent.text);
          } catch {
            return textContent.text;
          }
        }
      }

      return mcpRes.result;
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Initialize MCP session. */
  async initialize(): Promise<void> {
    await this.request("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "incidentlens", version: "1.0" },
    });
    providerLogger.info("MCP session initialized");
  }

  /** List available tools. */
  async listTools(): Promise<{ name: string; description: string }[]> {
    const result = (await this.request("tools/list", {})) as { tools?: { name: string; description: string }[] };
    return result?.tools ?? [];
  }

  /** Run a clanker command via MCP. */
  async runCommand(args: string[]): Promise<string> {
    const result = await this.request("tools/call", {
      name: "clanker_run_command",
      arguments: { args },
    });
    return typeof result === "string" ? result : JSON.stringify(result);
  }

  /** Get Clanker version. */
  async getVersion(): Promise<string> {
    const result = await this.request("tools/call", {
      name: "clanker_version",
      arguments: {},
    });
    return typeof result === "string" ? result : JSON.stringify(result);
  }

  /** Ask Clanker a question via the ask command. */
  async ask(question: string, options?: { aws?: boolean; profile?: string }): Promise<string> {
    const args = ["ask"];
    if (options?.aws) args.push("--aws");
    if (options?.profile) args.push("--profile", options.profile);
    args.push(question);
    return this.runCommand(args);
  }

  /** List AWS resources. */
  async listAWSResources(): Promise<string> {
    const args = ["aws", "list", "resources"];
    return this.runCommand(args);
  }

  /** List K8s resources via Clanker. */
  async listK8sResources(cluster?: string): Promise<string> {
    const args = ["k8s", "resources"];
    if (cluster) args.push("--cluster", cluster);
    return this.runCommand(args);
  }

  /** Ask K8s a natural language question. */
  async askK8s(question: string, cluster?: string): Promise<string> {
    const args = ["k8s", "ask"];
    if (cluster) args.push("--cluster", cluster);
    args.push(question);
    return this.runCommand(args);
  }

  /** Test connectivity to MCP server. */
  async testConnection(): Promise<{ ok: boolean; latencyMs: number; message: string }> {
    const start = Date.now();
    try {
      const version = await this.getVersion();
      return {
        ok: true,
        latencyMs: Date.now() - start,
        message: `Connected to Clanker CLI MCP (version: ${version})`,
      };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        message: error instanceof Error ? error.message : "Connection failed",
      };
    }
  }
}
