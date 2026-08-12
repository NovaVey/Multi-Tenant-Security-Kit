import { describe, expect, it } from 'vitest';

import { CrossTenantAccessError, TenantContextError } from '../../src/errors.js';
import { runWithTenant } from '../../src/tenant/context.js';
import { assertSameTenant, assertTenantMatches, scopeToTenant } from '../../src/tenant/guard.js';

describe('assertSameTenant', () => {
  it('does not throw when ids match', () => {
    expect(() => assertSameTenant('acme', 'acme')).not.toThrow();
  });

  it('throws CrossTenantAccessError when ids differ', () => {
    expect(() => assertSameTenant('acme', 'globex')).toThrow(CrossTenantAccessError);
  });

  it('includes both ids on the thrown error', () => {
    try {
      assertSameTenant('acme', 'globex');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(CrossTenantAccessError);
      const error = err as CrossTenantAccessError;
      expect(error.expectedTenantId).toBe('acme');
      expect(error.actualTenantId).toBe('globex');
      expect(error.code).toBe('CROSS_TENANT_ACCESS_DENIED');
    }
  });
});

describe('assertTenantMatches', () => {
  it('throws TenantContextError outside of a tenant context', () => {
    expect(() => assertTenantMatches({ tenantId: 'acme' })).toThrow(TenantContextError);
  });

  it('passes when the resource belongs to the current tenant', () => {
    runWithTenant({ tenantId: 'acme' }, () => {
      expect(() => assertTenantMatches({ tenantId: 'acme', name: 'invoice-1' })).not.toThrow();
    });
  });

  it("blocks access to another tenant's resource", () => {
    runWithTenant({ tenantId: 'acme' }, () => {
      expect(() => assertTenantMatches({ tenantId: 'globex' })).toThrow(CrossTenantAccessError);
    });
  });
});

describe('scopeToTenant', () => {
  it('throws TenantContextError outside of a tenant context', () => {
    expect(() => scopeToTenant({ status: 'open' })).toThrow(TenantContextError);
  });

  it('injects the current tenant id into the query', () => {
    runWithTenant({ tenantId: 'acme' }, () => {
      expect(scopeToTenant({ status: 'open' })).toEqual({ status: 'open', tenantId: 'acme' });
    });
  });

  it('is a no-op when the query already targets the current tenant', () => {
    runWithTenant({ tenantId: 'acme' }, () => {
      expect(scopeToTenant({ tenantId: 'acme', status: 'open' })).toEqual({
        tenantId: 'acme',
        status: 'open',
      });
    });
  });

  it('throws if the query targets a different tenant than the active one', () => {
    runWithTenant({ tenantId: 'acme' }, () => {
      expect(() => scopeToTenant({ tenantId: 'globex' })).toThrow(CrossTenantAccessError);
    });
  });
});
