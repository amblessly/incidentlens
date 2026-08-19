import { isDemoMode } from "@/lib/config";
import { ProviderError } from "@/lib/errors";
import { MockInfrastructureProvider } from "@/lib/providers/adapters/mock/mock-provider";
import { ClankerMCPProvider } from "@/lib/providers/adapters/clanker/mcp-provider";
import { readMCPConfig } from "@/lib/providers/adapters/clanker/mcp-client";
import type { InfrastructureProvider } from "@/lib/providers/types";

/**
 * Provider registry — manages all registered infrastructure providers.
 *
 * Resolution rules:
 * - INCIDENTLENS_MODE=demo → MockInfrastructureProvider (deterministic fixtures,
 *   only reachable in explicit demo mode).
 * - INCIDENTLENS_MODE=live (default):
 *   - Registered providers are available by ID.
 *   - If CLANKER_MCP_URL is set → ClankerMCPProvider auto-registered.
 *   - If no providers are registered → ProviderError(PROVIDER_NOT_CONFIGURED).
 *     There is NO silent fallback to demo data in live mode.
 */

const mockProvider = new MockInfrastructureProvider();

const registeredProviders = new Map<string, InfrastructureProvider>();

// Auto-register Clanker MCP provider when configured
function autoRegisterClankerMCP(): void {
  if (process.env.CLANKER_MCP_URL && !registeredProviders.has("clanker-mcp")) {
    try {
      const config = readMCPConfig();
      const provider = new ClankerMCPProvider("clanker-mcp", "Clanker (MCP)", config);
      registeredProviders.set(provider.id, provider);
    } catch {
      // Silently skip if MCP config is invalid
    }
  }
}

// Run auto-registration on module load
autoRegisterClankerMCP();

/** Register a provider instance. Throws on duplicate ID. */
export function registerProvider(provider: InfrastructureProvider): void {
  if (registeredProviders.has(provider.id)) {
    throw new ProviderError(provider.id, "PROVIDER_NOT_CONFIGURED", `Provider "${provider.id}" is already registered.`);
  }
  registeredProviders.set(provider.id, provider);
}

/** Remove a provider by ID. */
export function unregisterProvider(id: string): boolean {
  return registeredProviders.delete(id);
}

/** Get a provider by ID. */
export function getProviderById(id: string): InfrastructureProvider | undefined {
  return registeredProviders.get(id);
}

/** List all registered providers. */
export function listProviders(): InfrastructureProvider[] {
  return Array.from(registeredProviders.values());
}

/** List registered provider IDs. */
export function listProviderIds(): string[] {
  return Array.from(registeredProviders.keys());
}

/**
 * Get the default infrastructure provider for the current mode.
 *
 * - demo mode → MockInfrastructureProvider
 * - live mode → first registered provider, or PROVIDER_NOT_CONFIGURED
 */
export function getInfrastructureProvider(): InfrastructureProvider {
  if (isDemoMode()) return mockProvider;

  const providers = listProviders();
  if (providers.length === 0) {
    throw new ProviderError(
      "none",
      "PROVIDER_NOT_CONFIGURED",
      "No infrastructure provider is configured. Add a provider in Settings → Infrastructure Providers.",
    );
  }
  return providers[0];
}

/** Get a provider by ID, or the default provider if ID is not specified. */
export function resolveProvider(providerId?: string): InfrastructureProvider {
  if (!providerId) return getInfrastructureProvider();

  if (isDemoMode()) return mockProvider;

  const provider = getProviderById(providerId);
  if (!provider) {
    throw new ProviderError(
      providerId,
      "PROVIDER_NOT_CONFIGURED",
      `Provider "${providerId}" is not registered. Add it in Settings → Infrastructure Providers.`,
    );
  }
  return provider;
}

/** True when a provider can be constructed for the current configuration. */
export function providerAvailable(): boolean {
  try {
    getInfrastructureProvider();
    return true;
  } catch {
    return false;
  }
}

/** Reset all registered providers (for tests). */
export function resetProviders(): void {
  registeredProviders.clear();
}
