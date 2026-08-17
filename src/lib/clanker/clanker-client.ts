import { z } from "zod";

import { buildInvestigationUserPrompt } from "@/lib/clanker/prompts";
import type { IncidentInvestigationInput, InvestigationResult } from "@/lib/clanker/types";

/**
 * Runtime validation for the structured output returned by Clanker Cloud.
 * The rest of the application only ever sees validated data.
 */
const evidenceSchema = z.object({
  source: z.string().min(1),
  title: z.string().min(1),
  observation: z.string().min(1),
  relevance: z.enum(["primary", "supporting", "context"]),
  confidence: z.number().min(0).max(1),
});

const hypothesisSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  confidence: z.number().min(0).max(1),
  supportingEvidence: z.array(z.string()),
  contradictingEvidence: z.array(z.string()).default([]),
  missingEvidence: z.array(z.string()).default([]),
  nextStep: z.string().default(""),
});

const timelineStepSchema = z.object({
  step: z.string().min(1),
  detail: z.string().default(""),
});

const recommendedActionSchema = z.object({
  description: z.string().min(1),
  reason: z.string().default(""),
});

export const investigationResultSchema = z.object({
  summary: z.string().min(1),
  severityAssessment: z.string().default(""),
  affectedServices: z.array(z.string()),
  timeline: z.array(timelineStepSchema).default([]),
  evidence: z.array(evidenceSchema),
  hypotheses: z.array(hypothesisSchema),
  recommendedActions: z.array(recommendedActionSchema).default([]),
  missingEvidence: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  safetyNotes: z.array(z.string()).default([]),
});

export const resultDataSchema = investigationResultSchema;

/**
 * Configuration for the Clanker Cloud sandbox client.
 */
interface ClankerConfig {
  baseUrl: string;
  timeoutMs: number;
}

/**
 * Read the current Clanker configuration from environment variables.
 * Used by the settings page to display config status.
 */
export function readClankerConfig(): {
  baseUrl: string;
  apiKey: string;
  agentId: string;
  configured: boolean;
} {
  const baseUrl = process.env.CLANKER_API_URL ?? "https://clankercloud.ai";
  const mode = process.env.CLANKER_MODE ?? "demo";
  return {
    baseUrl,
    apiKey: mode === "live" ? "sandbox-api (anonymous)" : "",
    agentId: "",
    configured: mode === "live",
  };
}

/**
 * Sandbox returned by POST /api/sandboxes.
 */
interface Sandbox {
  id: string;
  sandboxToken: string;
}

/**
 * Command run returned by POST /api/sandboxes/:id/commands.
 */
interface CommandRun {
  runId: string;
}

/**
 * Run status returned by GET /api/sandboxes/:id/runs/:runId.
 */
interface RunStatus {
  status: "created" | "running" | "completed" | "failed";
  output?: string;
  result?: string;
  error?: string;
}

/**
 * HTTP errors from Clanker Cloud.
 */
export class ClankerHttpError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`Clanker HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

/**
 * Thrown when Clanker Cloud credentials are missing.
 */
export class ClankerNotConfiguredError extends Error {
  constructor() {
    super("Clanker Cloud is not configured. Set CLANKER_API_URL if using a non-default endpoint.");
  }
}

/**
 * Thrown when Clanker Cloud returns unparseable or invalid structured output.
 */
export class ClankerValidationError extends Error {
  detail: unknown;

  constructor(message: string, detail: unknown) {
    super(message);
    this.detail = detail;
  }
}

/**
 * Thrown when Clanker Cloud is unreachable or returns a server error.
 */
export class ProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
  }
}

function parseJsonSafe(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function extractJsonFromText(text: string): unknown {
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) return parseJsonSafe(codeBlockMatch[1]);

  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) return parseJsonSafe(objectMatch[0]);

  return undefined;
}

/**
 * Clanker Cloud sandbox client.
 *
 * Uses the official Clanker Cloud Sandbox API:
 * - POST /api/sandboxes (anonymous, no auth)
 * - POST /api/sandboxes/:id/commands (sandbox token auth)
 * - GET /api/sandboxes/:id/runs/:runId (sandbox token auth)
 * - DELETE /api/sandboxes/:id (sandbox token auth)
 */
export class ClankerClient {
  private config: ClankerConfig;

  constructor(config?: Partial<ClankerConfig>) {
    this.config = {
      baseUrl: config?.baseUrl ?? process.env.CLANKER_API_URL ?? "https://clankercloud.ai",
      timeoutMs: config?.timeoutMs ?? Number(process.env.CLANKER_TIMEOUT_MS ?? 120_000),
    };
  }

  /**
   * Create an anonymous sandbox. No auth required.
   */
  async createSandbox(): Promise<Sandbox> {
    const res = await fetch(`${this.config.baseUrl}/api/sandboxes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "incidentlens-investigation", agent: "clanker-cli" }),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ProviderUnavailableError(`Failed to create sandbox: HTTP ${res.status} ${body}`);
    }

    const data = (await res.json()) as {
      ok?: boolean;
      box?: { id: string; token?: string; sandboxToken?: string };
      id?: string;
      token?: string;
      sandboxToken?: string;
    };

    // Handle both response shapes:
    // { ok: true, box: { id, token } } or { id, sandboxToken }
    const id = data.box?.id ?? data.id;
    const token = data.box?.token ?? data.box?.sandboxToken ?? data.token ?? data.sandboxToken;

    if (!id || !token) {
      throw new ProviderUnavailableError("Sandbox response missing id or token");
    }

    return { id, sandboxToken: token };
  }

  /**
   * Send a command/message to a sandbox. Returns a run ID for polling.
   */
  async runCommand(sandboxId: string, sandboxToken: string, message: string): Promise<CommandRun> {
    const res = await fetch(`${this.config.baseUrl}/api/sandboxes/${sandboxId}/commands`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": sandboxToken,
      },
      body: JSON.stringify({
        command: message,
        workingDir: "/workspace",
        timeoutSeconds: Math.floor(this.config.timeoutMs / 1000),
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ProviderUnavailableError(`Failed to run command: HTTP ${res.status} ${body}`);
    }

    const data = (await res.json()) as { runId: string };
    if (!data.runId) {
      throw new ProviderUnavailableError("Command response missing runId");
    }

    return { runId: data.runId };
  }

  /**
   * Poll a run until it completes, fails, or times out.
   */
  async pollRun(sandboxId: string, sandboxToken: string, runId: string): Promise<RunStatus> {
    const deadline = Date.now() + this.config.timeoutMs;

    while (Date.now() < deadline) {
      const res = await fetch(`${this.config.baseUrl}/api/sandboxes/${sandboxId}/runs/${runId}`, {
        headers: { "X-API-Key": sandboxToken },
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new ProviderUnavailableError(`Failed to poll run: HTTP ${res.status} ${body}`);
      }

      const data = (await res.json()) as RunStatus;

      if (data.status === "completed" || data.status === "failed") {
        return data;
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    throw new ProviderUnavailableError("Clanker Cloud run timed out");
  }

  /**
   * Close/delete a sandbox.
   */
  async closeSandbox(sandboxId: string, sandboxToken: string): Promise<void> {
    try {
      await fetch(`${this.config.baseUrl}/api/sandboxes/${sandboxId}`, {
        method: "DELETE",
        headers: { "X-API-Key": sandboxToken },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // Best-effort cleanup; ignore errors
    }
  }

  /**
   * Full investigation lifecycle: create sandbox → send prompt → poll → parse → close.
   */
  async investigate(input: IncidentInvestigationInput): Promise<InvestigationResult> {
    let sandbox: Sandbox | null = null;

    try {
      // 1. Create anonymous sandbox
      sandbox = await this.createSandbox();

      // 2. Build investigation prompt
      const userPrompt = buildInvestigationUserPrompt(input);

      // 3. Send command to sandbox
      const { runId } = await this.runCommand(sandbox.id, sandbox.sandboxToken, userPrompt);

      // 4. Poll for result
      const runResult = await this.pollRun(sandbox.id, sandbox.sandboxToken, runId);

      if (runResult.status === "failed") {
        throw new ProviderUnavailableError(
          `Clanker Cloud investigation failed: ${runResult.error ?? "unknown error"}`,
        );
      }

      // 5. Parse and validate the result
      const rawOutput = runResult.result ?? runResult.output ?? "";
      return this.parseAndValidate(rawOutput);
    } finally {
      // 6. Clean up sandbox (best-effort)
      if (sandbox) {
        await this.closeSandbox(sandbox.id, sandbox.sandboxToken);
      }
    }
  }

  /**
   * Parse the raw Clanker output and validate against the schema.
   */
  private parseAndValidate(rawOutput: string): InvestigationResult {
    const raw = extractJsonFromText(rawOutput);
    if (!raw || typeof raw !== "object") {
      throw new ClankerValidationError("Clanker returned non-JSON output", rawOutput);
    }

    const parsed = investigationResultSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ClankerValidationError(
        `Clanker output failed schema validation: ${parsed.error.message}`,
        parsed.error,
      );
    }

    return parsed.data;
  }
}
