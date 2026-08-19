import { NextResponse } from "next/server";

import { IncidentLensError, type IncidentLensErrorCode } from "@/lib/errors";
import { requestIdFrom } from "@/lib/log";

/**
 * Shared API response helpers.
 *
 * Every response carries an X-Request-Id so operations can be traced in the
 * structured logs. Errors are structured: { error: { code, message } }.
 */

export function requestId(request: Request): string {
  return requestIdFrom(request.headers);
}

export function json<T>(data: T, init?: ResponseInit, request?: Request): NextResponse {
  const headers = new Headers(init?.headers);
  headers.set("X-Request-Id", request ? requestId(request) : "");
  return NextResponse.json(data, { ...init, headers });
}

export interface StructuredErrorBody {
  error: { code: IncidentLensErrorCode | string; message: string; requestId?: string };
}

export function apiError(
  message: string,
  status = 400,
  opts: { code?: IncidentLensErrorCode | string; request?: Request; detail?: unknown } = {},
): NextResponse<StructuredErrorBody> {
  const headers = new Headers();
  if (opts.request) headers.set("X-Request-Id", requestId(opts.request));
  const body: StructuredErrorBody = {
    error: {
      code: opts.code ?? "INVALID_REQUEST",
      message,
      ...(opts.request ? { requestId: requestId(opts.request) } : {}),
    },
  };
  return NextResponse.json(body, { status, headers });
}

export function errorToResponse(error: unknown, request?: Request): NextResponse {
  if (error instanceof IncidentLensError) {
    return apiError(error.message, statusForCode(error.code), {
      code: error.code,
      request,
      detail: error.detail,
    });
  }
  return apiError("Unexpected server error.", 500, { code: "INTERNAL", request });
}

function statusForCode(code: IncidentLensErrorCode | string): number {
  switch (code) {
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "INCIDENT_NOT_FOUND":
    case "PROVIDER_CONNECTION_NOT_FOUND":
      return 404;
    case "RATE_LIMITED":
      return 429;
    case "DUPLICATE_INCIDENT":
      return 200;
    default:
      return 400;
  }
}

export function parseJsonBody(
  body: unknown,
): Record<string, unknown> | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  return body as Record<string, unknown>;
}