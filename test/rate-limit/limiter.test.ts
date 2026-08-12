import { describe, expect, it, vi } from 'vitest';

import { TenantRateLimiter } from '../../src/rate-limit/limiter.js';
import { MemoryRateLimitStore } from '../../src/rate-limit/memory-store.js';
import type { RateLimitResult, RateLimitStore } from '../../src/rate-limit/types.js';

describe('TenantRateLimiter', () => {
  it('defaults to a MemoryRateLimitStore when none is supplied', async () => {
    const limiter = new TenantRateLimiter({ limit: 2, windowMs: 1000 });
    expect((await limiter.consume('acme')).allowed).toBe(true);
    expect((await limiter.consume('acme')).allowed).toBe(true);
    expect((await limiter.consume('acme')).allowed).toBe(false);
  });

  it('namespaces store keys by tenant id so tenants do not share a bucket', async () => {
    const store = new MemoryRateLimitStore();
    const limiter = new TenantRateLimiter({ store, limit: 1, windowMs: 1000 });

    expect((await limiter.consume('acme')).allowed).toBe(true);
    expect((await limiter.consume('acme')).allowed).toBe(false);
    // A different tenant gets its own, independent bucket.
    expect((await limiter.consume('globex')).allowed).toBe(true);
  });

  it('defaults points to 1 per call', async () => {
    const store = new MemoryRateLimitStore();
    const limiter = new TenantRateLimiter({ store, limit: 3, windowMs: 1000 });

    const first = await limiter.consume('acme');
    expect(first.remaining).toBe(2);
  });

  it('accepts an explicit points argument', async () => {
    const store = new MemoryRateLimitStore();
    const limiter = new TenantRateLimiter({ store, limit: 10, windowMs: 1000 });

    const result = await limiter.consume('acme', 4);
    expect(result.remaining).toBe(6);
  });

  it('uses the "tenant" key prefix by default', async () => {
    const consume = vi.fn(async (): Promise<RateLimitResult> => ({
      allowed: true,
      remaining: 9,
      limit: 10,
      resetMs: 0,
    }));
    const store: RateLimitStore = { consume };
    const limiter = new TenantRateLimiter({ store, limit: 10, windowMs: 1000 });

    await limiter.consume('acme', 1);
    expect(consume).toHaveBeenCalledWith('tenant:acme', 1, 10, 1000);
  });

  it('respects a custom keyPrefix', async () => {
    const consume = vi.fn(async (): Promise<RateLimitResult> => ({
      allowed: true,
      remaining: 9,
      limit: 10,
      resetMs: 0,
    }));
    const store: RateLimitStore = { consume };
    const limiter = new TenantRateLimiter({
      store,
      limit: 10,
      windowMs: 1000,
      keyPrefix: 'exports',
    });

    await limiter.consume('acme', 2);
    expect(consume).toHaveBeenCalledWith('exports:acme', 2, 10, 1000);
  });

  it('delegates to a fully custom store implementation', async () => {
    const calls: Array<[string, number, number, number]> = [];
    const store: RateLimitStore = {
      consume(key, points, limit, windowMs) {
        calls.push([key, points, limit, windowMs]);
        return Promise.resolve({ allowed: false, remaining: 0, limit, resetMs: 12345 });
      },
    };
    const limiter = new TenantRateLimiter({ store, limit: 5, windowMs: 2000, keyPrefix: 'rpc' });

    const result = await limiter.consume('acme', 3);
    expect(result).toEqual({ allowed: false, remaining: 0, limit: 5, resetMs: 12345 });
    expect(calls).toEqual([['rpc:acme', 3, 5, 2000]]);
  });
});
