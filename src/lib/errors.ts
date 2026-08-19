/**
 * Canonical error codes used across providers, investigation and execution.
 *
 * Codes are stable machine-readable identifiers. The UI and API surface
 * them verbatim so operators can alert on them.
 */
export type ProviderErrorCode =
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_RATE_LIMITED"
  | "INVALID_PROVIDER_RESPONSE"
  | "PROVIDER_NOT_CONFIGURED";

export type IncidentLensErrorCode =
  | ProviderErrorCode
  | "INVESTIGATION_FAILED"
  | "EXECUTION_BLOCKED"
  | "EXECUTION_FAILED"
  | "INCIDENT_NOT_FOUND"
  | "PLAN_REJECTED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INVALID_REQUEST"
  | "RATE_LIMITED"
  | "DUPLICATE_INCIDENT"
  | "PROVIDER_CONNECTION_NOT_FOUND";

export class IncidentLensError extends Error {
  readonly code: IncidentLensErrorCode;
  readonly detail?: unknown;

  constructor(code: IncidentLensErrorCode, message: string, detail?: unknown) {
    super(message);
    this.name = "IncidentLensError";
    this.code = code;
    this.detail = detail;
  }
}

/** Any failure talking to an infrastructure provider. */
export class ProviderError extends IncidentLensError {
  readonly provider: string;

  constructor(provider: string, code: ProviderErrorCode, message: string, detail?: unknown) {
    super(code, message, detail);
    this.name = "ProviderError";
    this.provider = provider;
  }
}

export function isProviderError(error: unknown): error is ProviderError {
  return error instanceof ProviderError;
}

export function providerErrorMessage(error: unknown): string {
  if (error instanceof ProviderError) return `[${error.code}] ${error.message}`;
  if (error instanceof IncidentLensError) return `[${error.code}] ${error.message}`;
  return error instanceof Error ? error.message : "Unknown error.";
}

export const PROVIDER_ERROR_HINTS: Record<ProviderErrorCode, string> = {
  PROVIDER_AUTH_FAILED:
    "The provider rejected the configured credentials. Check CLANKER_CLOUD_API_KEY / sandbox token.",
  PROVIDER_UNAVAILABLE:
    "The provider is unreachable. Verify the endpoint and network connectivity.",
  PROVIDER_TIMEOUT:
    "The provider did not respond within the configured timeout (CLANKER_TIMEOUT_MS).",
  PROVIDER_RATE_LIMITED:
    "The provider rate-limited the request. Retry later or reduce investigation frequency.",
  INVALID_PROVIDER_RESPONSE:
    "The provider returned an unparseable or invalid response. No evidence was recorded.",
  PROVIDER_NOT_CONFIGURED:
    "No provider is configured for this environment. Connect infrastructure in Settings.",
};