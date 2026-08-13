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

  it('rejects tenant ids that fail validation', async () => {
    const middleware = createTenantMiddleware({ resolver: headerTenantResolver() });
    const req = mockReq({ headers: { 'x-tenant-id': 'not valid! id' } });
    const res = mockRes();
    const next = vi.fn();

    middleware(req, res, next);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });

  it('supports a custom onMissing handler', async () => {
    const onMissing = vi.fn((_req, res: MinimalResponse) => {
      res.status(200).json({ ok: true });
    });
    const middleware = createTenantMiddleware({ resolver: headerTenantResolver(), onMissing });
    const req = mockReq();
    const res = mockRes();

    middleware(req, res, vi.fn());
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(onMissing).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
