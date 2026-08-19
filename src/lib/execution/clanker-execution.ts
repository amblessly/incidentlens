import { IncidentLensError, ProviderError } from "@/lib/errors";
import { executionLogger } from "@/lib/log";
import { ClankerClient, clankerEnabled, readClankerConfig, type ClankerConfig, type Sandbox } from "@/lib/providers/adapters/clanker/client";
import type { ExecutionProvider, ExecutionResult, StructuredOp } from "@/lib/execution/types";

/**
 * ClankerExecutionProvider — executes approved allow-listed operations in a
 * Clanker Cloud sandbox.
 *
 * The connected environment exposes the `incidentlens-exec` command (or the
 * command configured via CLANKER_EXEC_COMMAND) which accepts only the
 * allow-listed operations from the execution registry. Every call is a real
 * request; failures surface as provider errors, never as fabricated success.
 */
export class ClankerExecutionProvider implements ExecutionProvider {
  readonly providerType = "clanker";
  readonly providerName = "Clanker Cloud";

  private client: ClankerClient;
  private execCommand: string;

  constructor(
    config: ClankerConfig = readClankerConfig(),
    execCommand: string = process.env.CLANKER_EXEC_COMMAND ?? "incidentlens-exec",
  ) {
    if (!clankerEnabled()) {
      throw new ProviderError(
        "clanker",
        "PROVIDER_NOT_CONFIGURED",
        "Clanker execution requires CLANKER_MODE=live in the server environment.",
      );
    }
    this.client = new ClankerClient(config);
    this.execCommand = execCommand;
  }

  private commandFor(op: StructuredOp): string {
    const base = this.execCommand;
    switch (op.op) {
      case "rollback_deployment":
        return `${base} rollback --service "${op.service}"${op.version ? ` --version "${op.version}"` : ""}`;
      case "restart_service":
        return `${base} restart --service "${op.service}"`;
      case "scale_service":
        return `${base} scale --service "${op.service}" --replicas ${op.replicas}`;
      case "run_readonly_check":
        return `${base} check --service "${op.service}" --check "${op.check}"`;
    }
  }

  async execute(op: StructuredOp): Promise<ExecutionResult> {
    executionLogger.info(`executing ${op.op} via Clanker Cloud`, { service: op.service });
    const command = this.commandFor(op);
    try {
      const output = await this.client.withSandbox(async (sandbox: Sandbox) => {
        const result = await this.client.runCommand(sandbox, command);
        if (result.failed) {
          throw new IncidentLensError(
            "EXECUTION_FAILED",
            `execution command failed: ${result.failed}`,
          );
        }
        return result.output;
      });
      const summary = output.trim().slice(0, 2000);
      return {
        status: "succeeded",
        result: summary || `${op.op} completed (no output).`,
      };
    } catch (error) {
      executionLogger.error(`execution of ${op.op} failed`, {
        service: op.service,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}