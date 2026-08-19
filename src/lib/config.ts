/**
 * Application mode configuration.
 *
 * - `live` (default): production mode. No demo fixtures, no simulated
 *   responses, no silent fallback to demo providers. Provider failures are
 *   surfaced as real errors.
 * - `demo`: explicit opt-in for development, testing, screenshots and
 *   hackathon demonstrations. Seeded fixtures and the DemoProvider are only
 *   reachable in this mode.
 */
export type AppMode = "live" | "demo";

export function appMode(): AppMode {
  return process.env.INCIDENTLENS_MODE === "demo" ? "demo" : "live";
}

export const isDemoMode = (): boolean => appMode() === "demo";

export function modeLabel(mode: AppMode = appMode()): string {
  return mode === "demo" ? "Demo" : "Live";
}

export function modeDescription(mode: AppMode = appMode()): string {
  return mode === "demo"
    ? "Demo environment — deterministic fixtures. No live infrastructure is queried."
    : "Live environment — investigations query real infrastructure through the connected provider.";
}

/** The mode banner shown in the UI. */
export const MODE_BANNER: Record<
  AppMode,
  { label: string; className: string; description: string }
> = {
  live: {
    label: "Live",
    className:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:border-emerald-500/40 dark:text-emerald-400",
    description: "Live environment — real provider requests.",
  },
  demo: {
    label: "Demo",
    className:
      "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:border-amber-500/40 dark:text-amber-400",
    description:
      "Demo environment — deterministic fixtures. No live infrastructure is queried.",
  },
};

/** True when the session secret is configured for production use. */
export function sessionSecretConfigured(): boolean {
  const secret = process.env.SESSION_SECRET;
  return Boolean(secret && secret.length >= 32);
}