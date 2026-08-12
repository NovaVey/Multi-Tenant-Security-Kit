import type { RateLimitResult, RateLimitStore } from './types.js';

/** Internal token-bucket state tracked per key. */
interface Bucket {
  /** Tokens currently available, as of `lastUpdateMs`. May be fractional between calls. */
  tokens: number;
  /** Wall-clock time (ms, from `Date.now()`) the bucket was last refilled/updated. */
  lastUpdateMs: number;
}

/**
 * In-memory, process-local token-bucket implementation of {@link RateLimitStore}.
 *
 * Deliberately has **no timers or intervals** — a naive rate limiter that
 * runs a `setInterval` to "drip" tokens would keep the Node event loop alive
 * and leak a handle for every limiter instance (a real problem in tests and
 * serverless environments). Instead, refilling is computed lazily on each
 * {@link consume} call from the elapsed wall-clock time since the bucket was
 * last touched, so an idle bucket costs nothing and there is nothing to
 * `clearInterval`/`unref`.
 *
 * **This store is process-local.** It's the right choice for a single
 * instance, local development, or tests, but two instances of an app (e.g.
 * behind a load balancer, or multiple serverless invocations) each get their
 * own independent budget — a tenant could effectively get `N ×` the intended
 * limit across `N` instances. For a production multi-instance deployment,
 * implement {@link RateLimitStore} against a shared backend instead (e.g.
 * Redis, using `INCR`/`PEXPIRE` or a Lua-scripted token bucket for
 * atomicity) and pass it as `store` to `TenantRateLimiter` — this class is
 * intentionally the *reference* implementation of the interface, not the
 * only one.
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, Bucket>();

  /**
   * Refills `key`'s bucket for elapsed time, then attempts to withdraw
   * `points` from it. The bucket is created (fully stocked at `limit`
   * tokens) the first time a key is seen.
   */
  consume(key: string, points: number, limit: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    const refillPerMs = limit / windowMs;

    const bucket = this.buckets.get(key) ?? { tokens: limit, lastUpdateMs: now };
    const elapsedMs = Math.max(0, now - bucket.lastUpdateMs);
    // Guard against `elapsedMs * refillPerMs` producing NaN (0 * Infinity)
    // when a caller passes a degenerate windowMs of 0.
    const refillAmount = elapsedMs > 0 ? elapsedMs * refillPerMs : 0;
    bucket.tokens = Math.min(limit, bucket.tokens + refillAmount);
    bucket.lastUpdateMs = now;
    this.buckets.set(key, bucket);

    if (bucket.tokens >= points) {
      bucket.tokens -= points;
      const tokensToFull = limit - bucket.tokens;
      const resetMs = now + (refillPerMs > 0 ? tokensToFull / refillPerMs : 0);
      return Promise.resolve({
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        limit,
        resetMs,
      });
    }

    const tokensNeeded = points - bucket.tokens;
    const resetMs = now + (refillPerMs > 0 ? tokensNeeded / refillPerMs : Number.POSITIVE_INFINITY);
    return Promise.resolve({
      allowed: false,
      remaining: Math.floor(bucket.tokens),
      limit,
      resetMs,
    });
  }

  /** Deletes `key`'s bucket entirely, as if it had never been consumed from. */
  reset(key: string): void {
    this.buckets.delete(key);
  }
}
