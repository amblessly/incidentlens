import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

/**
 * Structured application logging with request-scoped context.
 *
 * Every log line carries the active request context (requestId, userId,
 * workspaceId, incidentId, investigationRunId, executionId) so operations
 * can be traced end to end. Secrets are never logged: the serializer
 * redacts known credential field names and any value that looks like a
 * token/key.
 */

export interface LogContext {
  requestId?: string;
  userId?: string;
  workspaceId?: string;
  incidentId?: string;
  investigationRunId?: number | string;
  executionId?: string;
  [key: string]: unknown;
}

type LogLevel = "debug" | "info" | "warn" | "error";

const store = new AsyncLocalStorage<LogContext>();

/** Run `fn` with a log context bound to the current async scope. */
export function withLogContext<T>(context: LogContext, fn: () => T): T {
  return store.run(context, fn);
}

/** Merge new fields into the active context. */
export function extendLogContext(fields: LogContext): void {
  const current = store.getStore();
  if (current) Object.assign(current, fields);
}

const REDACTED_FIELDS =
  /(api[-_]?key|token|secret|password|passwd|authorization|cookie|credential|sandbox[-_]?token|key[-_]?hash)/i;

function looksLikeSecret(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return /^[A-Za-z0-9_-]{16,}$/.test(value);
}

export function redact(value: unknown): unknown {
  if (typeof value === "string") return "***";
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = REDACTED_FIELDS.test(k) ? "***" : looksLikeSecret(v) ? "***" : v;
    }
    return out;
  }
  return value;
}

function serialize(context: LogContext): string {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(context)) {
    safe[k] = REDACTED_FIELDS.test(k) ? "***" : looksLikeSecret(v) ? "***" : v;
  }
  return Object.keys(safe).length ? ` ${JSON.stringify(safe)}` : "";
}

export function log(level: LogLevel, scope: string, message: string, context: LogContext = {}): void {
  const ctx = { ...(store.getStore() ?? {}), ...context };
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} [${scope}] ${message}${serialize(ctx)}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (m, c) => log("debug", scope, m, c),
    info: (m, c) => log("info", scope, m, c),
    warn: (m, c) => log("warn", scope, m, c),
    error: (m, c) => log("error", scope, m, c),
  };
}

/** Generate a request id for a request, honoring an incoming header. */
export function requestIdFrom(headers: Headers): string {
  const incoming = headers.get("x-request-id");
  return incoming && /^[A-Za-z0-9._-]{1,128}$/.test(incoming) ? incoming : randomUUID();
}

export const auditLogger = createLogger("audit");
export const providerLogger = createLogger("provider");
export const investigationLogger = createLogger("investigation");
export const executionLogger = createLogger("execution");
export const apiLogger = createLogger("api");