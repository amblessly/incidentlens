import type { ProviderCapabilities } from "@/lib/providers/types";

/**
 * Capability utilities for the provider abstraction layer.
 */

export const FULL_CAPABILITIES: ProviderCapabilities = {
  services: true,
  health: true,
  logs: true,
  metrics: true,
  deployments: true,
  database: true,
  changes: true,
};

export const NO_CAPABILITIES: ProviderCapabilities = {
  services: false,
  health: false,
  logs: false,
  metrics: false,
  deployments: false,
  database: false,
  changes: false,
};

/** Merge multiple capability objects — true if ANY provider supports the capability. */
export function mergeCapabilities(...caps: ProviderCapabilities[]): ProviderCapabilities {
  const result = { ...NO_CAPABILITIES };
  for (const c of caps) {
    for (const key of Object.keys(result) as (keyof ProviderCapabilities)[]) {
      if (c[key]) result[key] = true;
    }
  }
  return result;
}

/** Return labels for human-readable capability display. */
export function capabilityLabels(cap: ProviderCapabilities): { label: string; enabled: boolean }[] {
  return [
    { label: "Services", enabled: cap.services },
    { label: "Health", enabled: cap.health },
    { label: "Logs", enabled: cap.logs },
    { label: "Metrics", enabled: cap.metrics },
    { label: "Deployments", enabled: cap.deployments },
    { label: "Database", enabled: cap.database },
    { label: "Changes", enabled: cap.changes },
  ];
}
