import { describe, expect, it, vi } from 'vitest';

import { getCurrentTenantId } from '../../src/tenant/context.js';
import {
  claimTenantResolver,
  createTenantMiddleware,
  headerTenantResolver,
  subdomainTenantResolver,
} from '../../src/tenant/middleware.js';
import type { MinimalRequest, MinimalResponse } from '../../src/http/types.js';

function mockReq(
  overrides: Partial<MinimalRequest> & Record<string, unknown> = {},
): MinimalRequest {
  return { headers: {}, ...overrides };
}

function mockRes(): MinimalResponse & { statusCode?: number; body?: unknown } {
  const res: Partial<MinimalResponse> & { statusCode?: number; body?: unknown } = {};
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res as MinimalResponse;
  });
  res.json = vi.fn((body: unknown) => {
    res.body = body;
    return res as MinimalResponse;
  });
  res.setHeader = vi.fn(() => res as MinimalResponse);
  return res as MinimalResponse & { statusCode?: number; body?: unknown };
}

describe('headerTenantResolver', () => {
  it('reads the default x-tenant-id header', async () => {
    const resolver = headerTenantResolver();
    const context = await resolver(mockReq({ headers: { 'x-tenant-id': 'acme' } }));
    expect(context).toEqual({ tenantId: 'acme' });
  });

  it('supports a custom header name, case-insensitively', async () => {
    const resolver = headerTenantResolver('X-Tenant');
    const context = await resolver(mockReq({ headers: { 'x-tenant': 'acme' } }));
    expect(context).toEqual({ tenantId: 'acme' });
  });

  it('returns undefined when the header is absent', async () => {
    const resolver = headerTenantResolver();
    expect(await resolver(mockReq())).toBeUndefined();
  });
});

describe('subdomainTenantResolver', () => {
  it('extracts the leftmost label as the tenant', async () => {
    const resolver = subdomainTenantResolver();
    const context = await resolver(mockReq({ hostname: 'acme.example.com' }));
    expect(context).toEqual({ tenantId: 'acme' });
  });

  it('returns undefined for a bare base domain', async () => {
    const resolver = subdomainTenantResolver();
    expect(await resolver(mockReq({ hostname: 'example.com' }))).toBeUndefined();
  });

  it('falls back to the Host header when hostname is unavailable', async () => {
    const resolver = subdomainTenantResolver();
    const context = await resolver(mockReq({ headers: { host: 'acme.example.com:3000' } }));
    expect(context).toEqual({ tenantId: 'acme' });
  });
});

describe('claimTenantResolver', () => {
  it('extracts the configured claim from the decoded token', async () => {
    const resolver = claimTenantResolver(() => ({ tenant_id: 'acme' }));
    expect(await resolver(mockReq())).toEqual({ tenantId: 'acme' });
  });

  it('supports async decode functions and custom claim names', async () => {
    const resolver = claimTenantResolver(async () => ({ org: 'acme' }), 'org');
    expect(await resolver(mockReq())).toEqual({ tenantId: 'acme' });
  });

  it('returns undefined when the claim is missing', async () => {
    const resolver = claimTenantResolver(() => ({}));
    expect(await resolver(mockReq())).toBeUndefined();
  });
});

describe('createTenantMiddleware', () => {
  it('runs next() inside the resolved tenant context', async () => {
    const middleware = createTenantMiddleware({ resolver: headerTenantResolver() });
    const req = mockReq({ headers: { 'x-tenant-id': 'acme' } });
    const res = mockRes();

    let observedTenantId: string | undefined;
    await new Promise<void>((resolve) => {
      middleware(req, res, () => {
        observedTenantId = getCurrentTenantId();
        resolve();
      });
    });

    expect(observedTenantId).toBe('acme');
  });

  it('responds 400 by default when no tenant resolves', async () => {
    const middleware = createTenantMiddleware({ resolver: headerTenantResolver() });
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    middleware(req, res, next);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects tenant ids that fail validation via onMissing (not a thrown error), and does not leak the raw value', async () => {
    // Regression: this used to throw InvalidTenantIdError instead of
    // calling onMissing, contradicting this option's own documented
    // behavior ("called when no tenant could be resolved, or it failed
    // validation") and echoing the raw resolved value into the thrown
    // error's message via JSON.stringify.
    const middleware = createTenantMiddleware({ resolver: headerTenantResolver() });
    const req = mockReq({ headers: { 'x-tenant-id': 'not valid! id' } });
    const res = mockRes();
    const next = vi.fn();

    middleware(req, res, next);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'invalid_tenant' }));
    expect(JSON.stringify(res.body)).not.toContain('not valid! id');
  });

  it('supports a custom onMissing handler for the "no tenant resolved" case', async () => {
    const onMissing = vi.fn((_req, res: MinimalResponse) => {
      res.status(200).json({ ok: true });
    });
    const middleware = createTenantMiddleware({ resolver: headerTenantResolver(), onMissing });
    const req = mockReq();
    const res = mockRes();

    middleware(req, res, vi.fn());
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(onMissing).toHaveBeenCalledWith(req, res, expect.any(Function), { reason: 'missing' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('calls the custom onMissing handler for the "resolved but invalid" case too, with the rejected tenantId', async () => {
    const onMissing = vi.fn((_req, res: MinimalResponse) => {
      res.status(200).json({ ok: true });
    });
    const middleware = createTenantMiddleware({ resolver: headerTenantResolver(), onMissing });
    const req = mockReq({ headers: { 'x-tenant-id': 'not valid! id' } });
    const res = mockRes();

    middleware(req, res, vi.fn());
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(onMissing).toHaveBeenCalledWith(req, res, expect.any(Function), {
      reason: 'invalid',
      tenantId: 'not valid! id',
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // Regression (MEDIUM): next() used to be invoked from inside this
  // middleware's own try/catch (via `runWithTenant(context, () =>
  // next())`). This package's `NextFunction` is framework-agnostic — it's
  // whatever the caller supplies, with no guarantee of Express-router-style
  // internal exception isolation for a downstream handler that throws
  // synchronously — so a throw reaching back through that call used to be
  // caught right here and re-forwarded via a *second* call to `next(err)`,
  // violating the "call next at most once" contract every middleware chain
  // depends on. `next()` is now called strictly outside any try/catch that
  // could re-catch its own downstream effects, so a throw from `next()`
  // itself surfaces as-is (an unhandled rejection here, since nothing
  // downstream of a successful tenant resolution is this middleware's to
  // recover from) instead of silently becoming a second call.
  it('calls next() at most once, even if next() itself throws synchronously', async () => {
    const middleware = createTenantMiddleware({ resolver: headerTenantResolver() });
    const req = mockReq({ headers: { 'x-tenant-id': 'acme' } });
    const res = mockRes();
    const boom = new Error('downstream handler blew up');
    const next = vi.fn(() => {
      throw boom;
    });

    const rejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown): void => {
      rejections.push(reason);
    };
    process.once('unhandledRejection', onUnhandledRejection);
    try {
      middleware(req, res, next);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    } finally {
      process.removeListener('unhandledRejection', onUnhandledRejection);
    }

    expect(next).toHaveBeenCalledTimes(1);
    expect(rejections).toEqual([boom]);
  });
});
