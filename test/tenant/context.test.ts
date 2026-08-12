import { describe, expect, it } from 'vitest';

import { TenantContextError } from '../../src/errors.js';
import {
  getCurrentTenant,
  getCurrentTenantId,
  requireCurrentTenant,
  requireCurrentTenantId,
  runWithTenant,
} from '../../src/tenant/context.js';

describe('tenant context', () => {
  it('returns undefined outside of any tenant context', () => {
    expect(getCurrentTenant()).toBeUndefined();
    expect(getCurrentTenantId()).toBeUndefined();
  });

  it('throws from the require* variants outside of any tenant context', () => {
    expect(() => requireCurrentTenant()).toThrow(TenantContextError);
    expect(() => requireCurrentTenantId()).toThrow(TenantContextError);
  });

  it('exposes the active tenant within runWithTenant', () => {
    runWithTenant({ tenantId: 'acme' }, () => {
      expect(getCurrentTenant()).toEqual({ tenantId: 'acme' });
      expect(getCurrentTenantId()).toBe('acme');
      expect(requireCurrentTenant()).toEqual({ tenantId: 'acme' });
      expect(requireCurrentTenantId()).toBe('acme');
    });
  });

  it('propagates the tenant across awaits scheduled inside the callback', async () => {
    await runWithTenant({ tenantId: 'acme' }, async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(getCurrentTenantId()).toBe('acme');
    });
  });

  it('isolates concurrent tenant contexts from each other', async () => {
    const results: string[] = [];
    await Promise.all([
      runWithTenant({ tenantId: 'acme' }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        results.push(getCurrentTenantId() ?? 'none');
      }),
      runWithTenant({ tenantId: 'globex' }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        results.push(getCurrentTenantId() ?? 'none');
      }),
    ]);
    expect(results.sort()).toEqual(['acme', 'globex']);
  });

  it('clears the context once runWithTenant returns', () => {
    runWithTenant({ tenantId: 'acme' }, () => undefined);
    expect(getCurrentTenant()).toBeUndefined();
  });

  it('preserves extra claims alongside tenantId', () => {
    runWithTenant({ tenantId: 'acme', extra: { plan: 'enterprise' } }, () => {
      expect(getCurrentTenant()).toEqual({ tenantId: 'acme', extra: { plan: 'enterprise' } });
    });
  });
});
