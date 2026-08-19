/**
 * In-memory token-bucket rate limiting keyed by (bucket, key).
 *
 * Sufficient for single-instance deployments. For multi-instance hosted
 * deployments, swap this for a shared store (Redis/Postgres) behind the
 * same interface.
 */

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function checkRateLimit(
  bucketName: string,
  key: string,
  opts: { limit?: number; windowMs?: number } = {},
): RateLimitResult {
  const limit = opts.limit ?? Number(process.env.RATE_LIMIT_MAX ?? 120);
  const windowMs = opts.windowMs ?? Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
  const id = `${bucketName}:${key}`;
  const now = Date.now();

  let bucket = buckets.get(id);
  if (!bucket) {
    bucket = { tokens: limit, lastRefill: now };
    buckets.set(id, bucket);
  }

  const elapsed = now - bucket.lastRefill;
  const refill = (elapsed / windowMs) * limit;
  bucket.tokens = Math.min(limit, bucket.tokens + refill);
  bucket.lastRefill = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { allowed: true, remaining: Math.floor(bucket.tokens), retryAfterSeconds: 0 };
  }

  const retryMs = Math.max(1, Math.ceil((1 - bucket.tokens) * (windowMs / limit)));
  return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil(retryMs / 1000) };
}

/** Release memory held by buckets (used by tests). */
export function resetRateLimiters(): void {
  buckets.clear();
}