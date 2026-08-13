import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RateLimitExceededError, TenantContextError } from '../../src/errors.js';
import type { MinimalRequest, MinimalResponse, NextFunction } from '../../src/http/types.js';
import { TenantRateLimiter } from '../../src/rate-limit/limiter.js';
import {
  assertNotRateLimited,
  createRateLimitMiddleware,
} from '../../src/rate-limit/middleware.js';
import type { RateLimitResult, RateLimitStore } from '../../src/rate-limit/types.js';
import { runWithTenant } from '../../src/tenant/context.js';

function mockReq(overrides: Partial<MinimalRequest> = {}): MinimalRequest {
  return { headers: {}, ...overrides };
}

function mockRes(): MinimalResponse & {
  statusCode?: number;
  body?: unknown;
  headers: Record<string, string | number>;
} {
  const res: Partial<MinimalResponse> & {
    statusCode?: number;
    body?: unknown;
    headers: Record<string, string | number>;
  } = { headers: {} };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res as MinimalResponse;
  });
  res.json = vi.fn((body: unknown) => {
    res.body = body;
    return res as MinimalResponse;
  });
  res.setHeader = vi.fn((name: string, value: string | number) => {
    res.headers[name] = value;
    return res as MinimalResponse;
  });
  return res as MinimalResponse & {
    statusCode?: number;
    body?: unknown;
    headers: Record<string, string | number>;
  };
}

/** A store whose `consume()` result is scripted, for deterministic middleware tests. */
function scriptedStore(result: RateLimitResult): RateLimitStore {
  return { consume: vi.fn(() => Promise.resolve(result)) };
}

/**
 * Drains the microtask queue without touching (fake) timers, so awaits
 * inside the middleware's internal async IIFE settle before assertions run.
 */
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

describe('assertNotRateLimited', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not throw when the result is allowed', () => {
    expect(() =>
      assertNotRateLimited({ allowed: true, remaining: 1, limit: 5, resetMs: 0 }),
    ).not.toThrow();
  });

  it('throws RateLimitExceededError with the correct shape when denied', () => {
    try {
      assertNotRateLimited({ allowed: false, remaining: 0, limit: 5, resetMs: 2000 });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitExceededError);
      const error = err as RateLimitExceededError;
      expect(error.name).toBe('RateLimitExceededError');
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.retryAfterMs).toBe(2000);
      expect(error.message).toContain('2000');
    }
  });

  it('clamps retryAfterMs to 0 when resetMs is already in the past', () => {
    try {
      assertNotRateLimited({ allowed: false, remaining: 0, limit: 5, resetMs: -1000 });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitExceededError);
      expect((err as RateLimitExceededError).retryAfterMs).toBe(0);
    }
  });
});

describe('createRateLimitMiddleware', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets RateLimit-* headers and calls next() when allowed', async () => {
    const store = scriptedStore({ allowed: true, remaining: 4, limit: 5, resetMs: 1000 });
    const limiter = new TenantRateLimiter({ store, limit: 5, windowMs: 1000 });
    const middleware = createRateLimitMiddleware({ limiter, getTenantId: () => 'acme' });

    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();
    middleware(req, res, next);
    await flush();

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
    expect(res.headers['RateLimit-Limit']).toBe(5);
    expect(res.headers['RateLimit-Remaining']).toBe(4);
    expect(res.headers['RateLimit-Reset']).toBe(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('sets RateLimit-* headers even when the request is denied', async () => {
    const store = scriptedStore({ allowed: false, remaining: 0, limit: 5, resetMs: 3000 });
    const limiter = new TenantRateLimiter({ store, limit: 5, windowMs: 1000 });
    const middleware = createRateLimitMiddleware({ limiter, getTenantId: () => 'acme' });

    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();
    middleware(req, res, next);
    await flush();

    expect(res.headers['RateLimit-Limit']).toBe(5);
    expect(res.headers['RateLimit-Remaining']).toBe(0);
    expect(res.headers['RateLimit-Reset']).toBe(3);
    expect(next).not.toHaveBeenCalled();
  });

  it('responds 429 with Retry-After and a JSON body by default when limited', async () => {
    const store = scriptedStore({ allowed: false, remaining: 0, limit: 5, resetMs: 2500 });
    const limiter = new TenantRateLimiter({ store, limit: 5, windowMs: 1000 });
    const middleware = createRateLimitMiddleware({ limiter, getTenantId: () => 'acme' });

    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();
    middleware(req, res, next);
    await flush();

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.headers['Retry-After']).toBe(3); // ceil(2500ms / 1000)
    expect(res.body).toEqual({ error: 'rate_limit_exceeded', retryAfterMs: 2500 });
    expect(next).not.toHaveBeenCalled();
  });

  it('floors Retry-After at 1 second even when reset is imminent', async () => {
    const store = scriptedStore({ allowed: false, remaining: 0, limit: 5, resetMs: 10 });
    const limiter = new TenantRateLimiter({ store, limit: 5, windowMs: 1000 });
    const middleware = createRateLimitMiddleware({ limiter, getTenantId: () => 'acme' });

    const req = mockReq();
    const res = mockRes();
    middleware(req, res, vi.fn());
    await flush();

    expect(res.headers['Retry-After']).toBe(1);
  });

  it('supports a custom onLimited handler', async () => {
    const store = scriptedStore({ allowed: false, remaining: 0, limit: 5, resetMs: 1000 });
    const limiter = new TenantRateLimiter({ store, limit: 5, windowMs: 1000 });
    const onLimited = vi.fn(
      (
        _req: MinimalRequest,
        res: MinimalResponse,
        _next: NextFunction,
        _result: RateLimitResult,
      ) => {
        res.status(503).json({ error: 'too_busy' });
      },
    );
    const middleware = createRateLimitMiddleware({ limiter, getTenantId: () => 'acme', onLimited });

    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();
    middleware(req, res, next);
    await flush();

    expect(onLimited).toHaveBeenCalledTimes(1);
    expect(onLimited.mock.calls[0]?.[3]).toMatchObject({ allowed: false, limit: 5 });
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.body).toEqual({ error: 'too_busy' });
    expect(next).not.toHaveBeenCalled();
  });

  it('supports a custom getTenantId', async () => {
    const consume = vi.fn(() =>
      Promise.resolve({ allowed: true, remaining: 1, limit: 2, resetMs: 0 } as RateLimitResult),
    );
    const store: RateLimitStore = { consume };
    const limiter = new TenantRateLimiter({ store, limit: 2, windowMs: 1000, keyPrefix: 'tenant' });
    const getTenantId = vi.fn((req: MinimalRequest) => String(req['tenantOverride']));
    const middleware = createRateLimitMiddleware({ limiter, getTenantId });

    const req = mockReq({ tenantOverride: 'globex' });
    const res = mockRes();
    middleware(req, res, vi.fn());
    await flush();

    expect(getTenantId).toHaveBeenCalledWith(req);
    expect(consume).toHaveBeenCalledWith('tenant:globex', 1, 2, 1000);
  });

  it('uses requireCurrentTenantId() by default', async () => {
    const consume = vi.fn(() =>
      Promise.resolve({ allowed: true, remaining: 1, limit: 2, resetMs: 0 } as RateLimitResult),
    );
    const store: RateLimitStore = { consume };
    const limiter = new TenantRateLimiter({ store, limit: 2, windowMs: 1000 });
    const middleware = createRateLimitMiddleware({ limiter });

    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    await runWithTenant({ tenantId: 'acme' }, async () => {
      middleware(req, res, next);
      await flush();
    });

    expect(consume).toHaveBeenCalledWith('tenant:acme', 1, 2, 1000);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('forwards to next(err) when no tenant context is active and getTenantId is not supplied', async () => {
    const store = scriptedStore({ allowed: true, remaining: 1, limit: 2, resetMs: 0 });
    const limiter = new TenantRateLimiter({ store, limit: 2, windowMs: 1000 });
    const middleware = createRateLimitMiddleware({ limiter });

    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();
    middleware(req, res, next);
    await flush();

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(TenantContextError);
  });

  it('forwards unexpected store errors to next(err)', async () => {
    const boom = new Error('store unavailable');
    const store: RateLimitStore = {
      consume: vi.fn(() => Promise.reject(boom)),
    };
    const limiter = new TenantRateLimiter({ store, limit: 2, windowMs: 1000 });
    const middleware = createRateLimitMiddleware({ limiter, getTenantId: () => 'acme' });

    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();
    middleware(req, res, next);
    await flush();

    expect(next).toHaveBeenCalledWith(boom);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('supports a fixed numeric points cost', async () => {
    const consume = vi.fn(() =>
      Promise.resolve({ allowed: true, remaining: 1, limit: 5, resetMs: 0 } as RateLimitResult),
    );
    const store: RateLimitStore = { consume };
    const limiter = new TenantRateLimiter({ store, limit: 5, windowMs: 1000 });
    const middleware = createRateLimitMiddleware({ limiter, getTenantId: () => 'acme', points: 3 });

    middleware(mockReq(), mockRes(), vi.fn());
    await flush();

    expect(consume).toHaveBeenCalledWith('tenant:acme', 3, 5, 1000);
  });

  it('supports a per-request points function', async () => {
    const consume = vi.fn(() =>
      Promise.resolve({ allowed: true, remaining: 1, limit: 5, resetMs: 0 } as RateLimitResult),
    );
    const store: RateLimitStore = { consume };
    const limiter = new TenantRateLimiter({ store, limit: 5, windowMs: 1000 });
    const points = vi.fn((req: MinimalRequest) => (req['bulk'] ? 5 : 1));
    const middleware = createRateLimitMiddleware({ limiter, getTenantId: () => 'acme', points });

    middleware(mockReq({ bulk: true }), mockRes(), vi.fn());
    await flush();

    expect(points).toHaveBeenCalled();
    expect(consume).toHaveBeenCalledWith('tenant:acme', 5, 5, 1000);
  });
});
