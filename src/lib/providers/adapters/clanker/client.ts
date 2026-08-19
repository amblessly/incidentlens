import { z } from "zod";

import { ProviderError, type ProviderErrorCode } from "@/lib/errors";
import { providerLogger } from "@/lib/log";

/**
 * Clanker Cloud configuration — server-side environment variables only.
 * Credentials are never exposed to the browser and never logged.
 */
export interface ClankerConfig {
  /** Base URL of the Clanker Cloud API, e.g. https://clankercloud.ai */
  baseUrl: string;
  /** Account API key (CLANKER_CLOUD_API_KEY). Optional — anonymous sandboxes work without it. */
  accountToken: string | null;
  /** Optional persistent sandbox id (CLANKER_SANDBOX_ID). */
  sandboxId: string | null;
  /** Optional persistent sandbox token (CLANKER_SANDBOX_TOKEN). */
  sandboxToken: string | null;
  /** Per-request timeout in milliseconds (CLANKER_TIMEOUT_MS). */
  timeoutMs: number;
  /** Agent to use when creating sandboxes (CLANKER_AGENT). */
  agent: string;
  /** Working directory for commands (CLANKER_WORKING_DIR). */
  workingDir: string;
}

export function readClankerConfig(env: NodeJS.ProcessEnv = process.env): ClankerConfig {
  return {
    baseUrl: (env.CLANKER_API_URL ?? "https://clankercloud.ai").replace(/\/+$/, ""),
    accountToken: env.CLANKER_CLOUD_API_KEY ?? null,
    sandboxId: env.CLANKER_SANDBOX_ID ?? null,
    sandboxToken: env.CLANKER_SANDBOX_TOKEN ?? null,
    timeoutMs: Number(env.CLANKER_TIMEOUT_MS ?? 120_000),
    agent: env.CLANKER_AGENT ?? "clanker-cli",
    workingDir: env.CLANKER_WORKING_DIR ?? "/workspace",
  };
}

/** True when CLANKER_MODE=live, i.e. the Clanker provider is allowed to run. */
export function clankerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CLANKER_MODE === "live";
}

/** True when credentials for a persistent sandbox are configured. */
export function hasPersistentSandbox(config: ClankerConfig): boolean {
  return Boolean(config.sandboxId && config.sandboxToken);
}

/** Masked view for display purposes — never the full credential. */
export function clankerConfigSummary(config: ClankerConfig) {
  return {
    baseUrl: config.baseUrl,
    mode: clankerEnabled() ? "live" : "off",
    accountConfigured: Boolean(config.accountToken),
    sandboxConfigured: hasPersistentSandbox(config),
    agent: config.agent,
    timeoutMs: config.timeoutMs,
  };
}

const sandboxCreateSchema = z.object({
  ok: z.boolean().optional(),
  box: z
    .object({
      id: z.string(),
      token: z.string().optional(),
      sandboxToken: z.string().optional(),
    })
    .optional(),
  id: z.string().optional(),
  token: z.string().optional(),
  sandboxToken: z.string().optional(),
});

const commandRunSchema = z.object({
  runId: z.string().optional(),
  output: z.string().optional(),
  result: z.string().optional(),
  status: z.string().optional(),
  error: z.string().optional(),
});

const runStatusSchema = z.object({
  status: z.enum(["created", "running", "completed", "failed", "done", "error"]),
  output: z.string().optional(),
  result: z.string().optional(),
  error: z.string().optional(),
});

export interface Sandbox {
  id: string;
  token: string;
}

export interface CommandResult {
  output: string;
  runId?: string;
  failed?: string;
}

function authHeaders(token: string): Record<string, string> {
  return { "X-API-Key": token };
}

/**
 * Official Clanker Cloud Sandbox API client.
 *
 * Documented endpoints (clankercloud.ai/api, updated July 2026):
 * - POST /api/sandboxes — create (anonymous or account-authenticated)
 * - POST /api/sandboxes/{id}/commands — run a shell command
 * - GET  /api/sandboxes/{id}/runs/{runId} — poll a command run
 * - DELETE /api/sandboxes/{id} — release the sandbox
 *
 * Auth: `X-API-Key: <sandbox token>` or `X-API-Key: <account API key>`.
 * No endpoints are invented; everything below maps to the documented API.
 */
export class ClankerClient {
  readonly config: ClankerConfig;

  constructor(config: ClankerConfig = readClankerConfig()) {
    this.config = config;
  }

  private url(...parts: string[]): string {
    return [this.config.baseUrl, "api", ...parts].join("/");
  }

  private error(code: ProviderErrorCode, message: string, detail?: unknown): ProviderError {
    return new ProviderError("clanker", code, message, detail);
  }

  private async request(
    path: string,
    init: RequestInit & { token?: string | null },
    label: string,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      ...(init.headers as Record<string, string> | undefined),
    };
    const token = init.token;
    if (token) Object.assign(headers, authHeaders(token));

    try {
      const timeoutSignal = AbortSignal.timeout(this.config.timeoutMs);
      const signals = init.signal ? [timeoutSignal, init.signal] : [timeoutSignal];
      const res = await fetch(this.url(path), {
        ...init,
        headers,
        signal: signals.length > 1 ? AbortSignal.any(signals) : signals[0],
      });

      if (res.status === 401 || res.status === 403) {
        throw this.error(
          "PROVIDER_AUTH_FAILED",
          `${label}: Clanker Cloud rejected the credentials (HTTP ${res.status}).`,
          { status: res.status },
        );
      }
      if (res.status === 429) {
        throw this.error(
          "PROVIDER_RATE_LIMITED",
          `${label}: Clanker Cloud rate-limited the request (HTTP 429).`,
          { status: res.status },
        );
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw this.error(
          "PROVIDER_UNAVAILABLE",
          `${label}: Clanker Cloud returned HTTP ${res.status}.`,
          { status: res.status, body: body.slice(0, 500) },
        );
      }
      return res;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      const err = error as { name?: string; message?: string };
      if (err.name === "TimeoutError" || /abort/i.test(err.message ?? "")) {
        throw this.error(
          "PROVIDER_TIMEOUT",
          `${label}: Clanker Cloud did not respond within ${this.config.timeoutMs}ms.`,
        );
      }
      providerLogger.error(`${label}: network failure`, { error: err.message });
      throw this.error(
        "PROVIDER_UNAVAILABLE",
        `${label}: cannot reach Clanker Cloud at ${this.config.baseUrl}.`,
      );
    }
  }

  /** Create a sandbox. Anonymous when no account token is configured. */
  async createSandbox(name = "incidentlens-probe"): Promise<Sandbox> {
    const res = await this.request(
      "sandboxes",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, agent: this.config.agent }),
        token: this.config.accountToken,
      },
      "create sandbox",
    );
    const data = sandboxCreateSchema.safeParse(await res.json().catch(() => null));
    if (!data.success) {
      throw this.error(
        "INVALID_PROVIDER_RESPONSE",
        "create sandbox: response did not match the documented API shape.",
        data.error.issues,
      );
    }
    const id = data.data.box?.id ?? data.data.id;
    const token = data.data.box?.token ?? data.data.box?.sandboxToken ?? data.data.token ?? data.data.sandboxToken;
    if (!id || !token) {
      throw this.error(
        "INVALID_PROVIDER_RESPONSE",
        "create sandbox: response missing sandbox id or token.",
      );
    }
    return { id, token };
  }

  /** Run a shell command in a sandbox and wait for completion. */
  async runCommand(sandbox: Sandbox, command: string): Promise<CommandResult> {
    const res = await this.request(
      `sandboxes/${sandbox.id}/commands`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command,
          workingDir: this.config.workingDir,
          timeoutSeconds: Math.max(5, Math.floor(this.config.timeoutMs / 1000)),
        }),
        token: sandbox.token,
      },
      "run command",
    );

    const data = commandRunSchema.safeParse(await res.json().catch(() => null));
    if (!data.success) {
      throw this.error(
        "INVALID_PROVIDER_RESPONSE",
        "run command: response did not match the documented API shape.",
        data.error.issues,
      );
    }

    // Some API versions return the run output synchronously.
    if (data.data.output !== undefined || data.data.result !== undefined) {
      const output = data.data.output ?? data.data.result ?? "";
      if (data.data.status === "failed" || data.data.error) {
        return { output, failed: data.data.error ?? "command failed" };
      }
      return { output };
    }

    if (!data.data.runId) {
      throw this.error(
        "INVALID_PROVIDER_RESPONSE",
        "run command: response missing runId.",
      );
    }

    const runResult = await this.pollRun(sandbox, data.data.runId);
    if (runResult.failed) return { output: runResult.output, failed: runResult.failed };
    return { output: runResult.output };
  }

  private async pollRun(sandbox: Sandbox, runId: string): Promise<{ output: string; failed?: string }> {
    const deadline = Date.now() + this.config.timeoutMs;
    while (Date.now() < deadline) {
      const res = await this.request(`sandboxes/${sandbox.id}/runs/${runId}`, { token: sandbox.token }, "poll run");
      const data = runStatusSchema.safeParse(await res.json().catch(() => null));
      if (!data.success) {
        throw this.error(
          "INVALID_PROVIDER_RESPONSE",
          "poll run: response did not match the documented API shape.",
          data.error.issues,
        );
      }
      const status = data.data.status;
      if (status === "completed" || status === "done") {
        return { output: data.data.output ?? data.data.result ?? "" };
      }
      if (status === "failed" || status === "error") {
        return { output: data.data.output ?? "", failed: data.data.error ?? "run failed" };
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    throw this.error(
      "PROVIDER_TIMEOUT",
      `poll run: command did not finish within ${this.config.timeoutMs}ms.`,
    );
  }

  /** Best-effort sandbox cleanup. */
  async deleteSandbox(sandbox: Sandbox): Promise<void> {
    try {
      await this.request(`sandboxes/${sandbox.id}`, { method: "DELETE", token: sandbox.token }, "delete sandbox");
    } catch {
      // Best-effort cleanup; the sandbox expires on its own.
    }
  }

  /**
   * Acquire a sandbox for an operation: reuse the configured persistent
   * sandbox, or create (and later delete) a fresh one.
   */
  async withSandbox<T>(fn: (sandbox: Sandbox) => Promise<T>): Promise<T> {
    const owned = !this.config.sandboxId;
    let sandbox: Sandbox;
    if (owned) {
      sandbox = await this.createSandbox();
    } else {
      sandbox = { id: this.config.sandboxId as string, token: this.config.sandboxToken as string };
    }
    try {
      return await fn(sandbox);
    } finally {
      if (owned) await this.deleteSandbox(sandbox);
    }
  }
}