import { isDemoMode } from "@/lib/config";
import { ProviderError } from "@/lib/errors";
import { ClankerExecutionProvider } from "@/lib/execution/clanker-execution";
import type { ExecutionProvider } from "@/lib/execution/types";
import { clankerEnabled } from "@/lib/providers/adapters/clanker/client";

/**
 * Execution provider registry.
 *
 * - INCIDENTLENS_MODE=demo → demo execution (simulated, clearly labeled).
 * - live mode with CLANKER_MODE=live → ClankerExecutionProvider.
 * - live mode without a provider → ProviderError(PROVIDER_NOT_CONFIGURED).
 *   No silent fallback.
 */
export function getExecutionProvider(): ExecutionProvider {
  if (isDemoMode()) {
    return {
      providerType: "mock",
      providerName: "Demo execution (simulated)",
      async execute() {
        return {
          status: "succeeded",
          result: "Simulated execution — demo mode. No infrastructure was mutated.",
        };
      },
    };
  }

  if (clankerEnabled()) {
    return new ClankerExecutionProvider();
  }

  throw new ProviderError(
    "none",
    "PROVIDER_NOT_CONFIGURED",
    "No execution provider is configured. Add a provider in Settings → Infrastructure Providers.",
  );
}
