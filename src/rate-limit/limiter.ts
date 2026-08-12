import { MemoryRateLimitStore } from './memory-store.js';
import type { RateLimitResult, RateLimitStore } from './types.js';

/** Configuration for a {@link TenantRateLimiter}. */
export interface TenantRateLimiterOptions {
  /**
   * Backing store for bucket state. Defaults to a fresh
   * {@link MemoryRateLimitStore} — fine for a single instance, but see that
   * class's docs before relying on it in a multi-instance deployment.
   */
  store?: RateLimitStore;
  /** Bucket capacity: the maximum number of points a tenant can hold/spend at once. */
  limit: number;
  /** Time window (ms) over which the bucket fully refills. */
  windowMs: number;
  /**
   * Prefix used to namespace store keys, so a single store can safely be
   * shared by multiple independent limiters (e.g. one for "API calls", one
   * for "exports") without their keys colliding. Defaults to `'tenant'`.
   */
  keyPrefix?: string;
}

/**
 * Rate-limits actions per tenant, on top of a pluggable {@link RateLimitStore}.
 *
 * This class owns only the "how do I key this tenant" concern — key
 * construction and defaulting — and delegates all actual budget accounting
 * to the store, so swapping `MemoryRateLimitStore` for a Redis-backed store
 * (for a multi-instance deployment) requires no change here.
 */
export class TenantRateLimiter {
  private readonly store: RateLimitStore;
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly keyPrefix: string;

  constructor(options: TenantRateLimiterOptions) {
    this.store = options.store ?? new MemoryRateLimitStore();
    this.limit = options.limit;
    this.windowMs = options.windowMs;
    this.keyPrefix = options.keyPrefix ?? 'tenant';
  }

  /**
   * Attempts to spend `points` (default `1`) from the given tenant's
   * budget. The store key is `${keyPrefix}:${tenantId}`, so unrelated
   * tenants (and, when a store is shared across limiters, unrelated
   * limiters via distinct prefixes) never share a bucket.
   */
  consume(tenantId: string, points = 1): Promise<RateLimitResult> {
    const key = `${this.keyPrefix}:${tenantId}`;
    return this.store.consume(key, points, this.limit, this.windowMs);
  }
}
