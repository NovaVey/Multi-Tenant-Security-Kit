import { describe, expect, it } from 'vitest';

import { ForbiddenError, RbacConfigurationError } from '../../src/errors.js';
import { RbacPolicy } from '../../src/rbac/policy.js';
import type { AccessSubject } from '../../src/rbac/types.js';

function subject(roles: string[], tenantId = 'tenant-a'): AccessSubject {
  return { tenantId, roles };
}

describe('RbacPolicy construction', () => {
  it('accepts a well-formed set of role definitions', () => {
    expect(
      () =>
        new RbacPolicy([
          { name: 'viewer', permissions: ['invoices:read'] },
          { name: 'admin', permissions: ['*'] },
        ]),
    ).not.toThrow();
  });

  it('throws RbacConfigurationError on a duplicate role name', () => {
    expect(
      () =>
        new RbacPolicy([
          { name: 'viewer', permissions: ['invoices:read'] },
          { name: 'viewer', permissions: ['invoices:write'] },
        ]),
    ).toThrow(RbacConfigurationError);
  });

  it('duplicate role name error message names the offending role', () => {
    try {
      new RbacPolicy([
        { name: 'viewer', permissions: [] },
        { name: 'viewer', permissions: [] },
      ]);
      expect.unreachable('constructor should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RbacConfigurationError);
      expect((err as RbacConfigurationError).message).toContain('viewer');
    }
  });

  it('throws RbacConfigurationError when inherits references an unknown role', () => {
    expect(
      () => new RbacPolicy([{ name: 'editor', permissions: [], inherits: ['ghost-role'] }]),
    ).toThrow(RbacConfigurationError);
  });

  it('unknown-inherited-role error message names both roles', () => {
    try {
      new RbacPolicy([{ name: 'editor', permissions: [], inherits: ['ghost-role'] }]);
      expect.unreachable('constructor should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RbacConfigurationError);
      const message = (err as RbacConfigurationError).message;
      expect(message).toContain('editor');
      expect(message).toContain('ghost-role');
    }
  });

  it('throws RbacConfigurationError on a direct two-role inheritance cycle', () => {
    expect(
      () =>
        new RbacPolicy([
          { name: 'a', permissions: [], inherits: ['b'] },
          { name: 'b', permissions: [], inherits: ['a'] },
        ]),
    ).toThrow(RbacConfigurationError);
  });

  it('cycle error message names the roles involved in the cycle', () => {
    try {
      new RbacPolicy([
        { name: 'a', permissions: [], inherits: ['b'] },
        { name: 'b', permissions: [], inherits: ['a'] },
      ]);
      expect.unreachable('constructor should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RbacConfigurationError);
      const message = (err as RbacConfigurationError).message;
      expect(message).toContain('a');
      expect(message).toContain('b');
    }
  });

  it('throws RbacConfigurationError on a self-inheriting role', () => {
    expect(() => new RbacPolicy([{ name: 'a', permissions: [], inherits: ['a'] }])).toThrow(
      RbacConfigurationError,
    );
  });

  it('throws RbacConfigurationError on a longer three-role cycle', () => {
    expect(
      () =>
        new RbacPolicy([
          { name: 'a', permissions: [], inherits: ['b'] },
          { name: 'b', permissions: [], inherits: ['c'] },
          { name: 'c', permissions: [], inherits: ['a'] },
        ]),
    ).toThrow(RbacConfigurationError);
  });

  it('does not throw for a diamond inheritance shape (no cycle)', () => {
    expect(
      () =>
        new RbacPolicy([
          { name: 'base', permissions: ['base:read'] },
          { name: 'left', permissions: ['left:read'], inherits: ['base'] },
          { name: 'right', permissions: ['right:read'], inherits: ['base'] },
          { name: 'top', permissions: [], inherits: ['left', 'right'] },
        ]),
    ).not.toThrow();
  });
});

describe('RbacPolicy.permissionsFor', () => {
  it("returns a role's own permissions", () => {
    const policy = new RbacPolicy([
      { name: 'viewer', permissions: ['invoices:read', 'invoices:list'] },
    ]);
    expect(policy.permissionsFor(['viewer'])).toEqual(new Set(['invoices:read', 'invoices:list']));
  });

  it('resolves multi-level inheritance transitively', () => {
    const policy = new RbacPolicy([
      { name: 'base', permissions: ['base:read'] },
      { name: 'mid', permissions: ['mid:read'], inherits: ['base'] },
      { name: 'top', permissions: ['top:read'], inherits: ['mid'] },
    ]);
    expect(policy.permissionsFor(['top'])).toEqual(new Set(['top:read', 'mid:read', 'base:read']));
  });

  it('unions permissions across multiple roles, deduplicating overlaps', () => {
    const policy = new RbacPolicy([
      { name: 'a', permissions: ['shared:x', 'a:only'] },
      { name: 'b', permissions: ['shared:x', 'b:only'] },
    ]);
    expect(policy.permissionsFor(['a', 'b'])).toEqual(new Set(['shared:x', 'a:only', 'b:only']));
  });

  it('ignores unknown role names, contributing no permissions', () => {
    const policy = new RbacPolicy([{ name: 'viewer', permissions: ['invoices:read'] }]);
    expect(policy.permissionsFor(['viewer', 'nonexistent-role'])).toEqual(
      new Set(['invoices:read']),
    );
  });

  it('returns an empty set for an empty roles array', () => {
    const policy = new RbacPolicy([{ name: 'viewer', permissions: ['invoices:read'] }]);
    expect(policy.permissionsFor([])).toEqual(new Set());
  });

  it('returns an empty set when every role passed is unknown', () => {
    const policy = new RbacPolicy([{ name: 'viewer', permissions: ['invoices:read'] }]);
    expect(policy.permissionsFor(['ghost'])).toEqual(new Set());
  });

  it('does not duplicate permissions shared across a diamond inheritance shape', () => {
    const policy = new RbacPolicy([
      { name: 'base', permissions: ['base:read'] },
      { name: 'left', permissions: [], inherits: ['base'] },
      { name: 'right', permissions: [], inherits: ['base'] },
      { name: 'top', permissions: [], inherits: ['left', 'right'] },
    ]);
    expect(policy.permissionsFor(['top'])).toEqual(new Set(['base:read']));
  });
});

describe('RbacPolicy.can', () => {
  const policy = new RbacPolicy([
    { name: 'viewer', permissions: ['invoices:read'] },
    { name: 'billing-admin', permissions: ['billing:*'] },
    { name: 'superuser', permissions: ['*'] },
    { name: 'nested-viewer', permissions: [], inherits: ['viewer'] },
  ]);

  it('grants an exact permission match', () => {
    expect(policy.can(subject(['viewer']), 'invoices:read')).toBe(true);
  });

  it('denies a permission the subject does not hold', () => {
    expect(policy.can(subject(['viewer']), 'invoices:write')).toBe(false);
  });

  it('grants via a namespaced wildcard permission', () => {
    expect(policy.can(subject(['billing-admin']), 'billing:read')).toBe(true);
    expect(policy.can(subject(['billing-admin']), 'billing:write')).toBe(true);
  });

  it('a namespaced wildcard does not grant a different namespace', () => {
    expect(policy.can(subject(['billing-admin']), 'invoices:read')).toBe(false);
  });

  it('grants any permission via the bare "*" superuser wildcard', () => {
    expect(policy.can(subject(['superuser']), 'anything:goes')).toBe(true);
    expect(policy.can(subject(['superuser']), 'invoices:read')).toBe(true);
  });

  it('grants an inherited permission through a role with no permissions of its own', () => {
    expect(policy.can(subject(['nested-viewer']), 'invoices:read')).toBe(true);
  });

  it('denies when the subject has no roles', () => {
    expect(policy.can(subject([]), 'invoices:read')).toBe(false);
  });

  it('denies when the subject only holds unknown roles', () => {
    expect(policy.can(subject(['ghost']), 'invoices:read')).toBe(false);
  });

  // Regression coverage: subject.roles is typed as Role[], but a caller can
  // still hand this a malformed value at runtime (a decoded-token claim
  // that turned out not to be an array, `roles: 'admin'` instead of
  // `roles: ['admin']`, etc.). Before this was validated, a string value
  // didn't throw here at all — strings are iterable, so it silently
  // iterated character-by-character — which could coincidentally grant
  // permissions from a single-character role name; other non-array values
  // (null, a number, a plain object) threw a raw TypeError out of `can()`.
  // Every one of these must now cleanly resolve to `false` instead.
  describe('malformed subject.roles (not an array)', () => {
    const malformed: unknown[] = ['viewer', null, undefined, 42, {}, { length: 1, 0: 'viewer' }];

    for (const roles of malformed) {
      it(`denies (does not throw) for roles = ${JSON.stringify(roles)}`, () => {
        const malformedSubject = { tenantId: 'tenant-a', roles } as unknown as AccessSubject;
        expect(() => policy.can(malformedSubject, 'invoices:read')).not.toThrow();
        expect(policy.can(malformedSubject, 'invoices:read')).toBe(false);
      });
    }

    it('a single-character role name string does not coincidentally grant anything', () => {
      // Regression for the specific silent-wrong-ALLOW shape: if a role
      // literally named "v" existed and roles were iterated
      // character-by-character, subject.roles = 'viewer' would grant it.
      const policyWithShortRole = new RbacPolicy([
        { name: 'v', permissions: ['invoices:read'] },
        { name: 'viewer', permissions: ['invoices:read'] },
      ]);
      const malformedSubject = {
        tenantId: 'tenant-a',
        roles: 'viewer',
      } as unknown as AccessSubject;
      expect(policyWithShortRole.can(malformedSubject, 'invoices:read')).toBe(false);
    });
  });
});

describe('RbacPolicy.assert', () => {
  const policy = new RbacPolicy([{ name: 'viewer', permissions: ['invoices:read'] }]);

  it('does not throw when the subject has the permission', () => {
    expect(() => policy.assert(subject(['viewer']), 'invoices:read')).not.toThrow();
  });

  it('throws ForbiddenError when the subject lacks the permission', () => {
    expect(() => policy.assert(subject(['viewer']), 'invoices:delete')).toThrow(ForbiddenError);
  });

  it('the thrown ForbiddenError names the missing permission in its message and .permission field', () => {
    try {
      policy.assert(subject(['viewer']), 'invoices:delete');
      expect.unreachable('assert should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError);
      const forbidden = err as ForbiddenError;
      expect(forbidden.permission).toBe('invoices:delete');
      expect(forbidden.message).toContain('invoices:delete');
      expect(forbidden.code).toBe('FORBIDDEN');
    }
  });

  // Regression: assert() used to build its error message with
  // `subject.roles.join(', ')` unconditionally — for a non-array roles
  // value (e.g. a string), `.join` doesn't exist and that threw a raw,
  // unbranded TypeError instead of ForbiddenError, which
  // `requirePermission`'s middleware doesn't recognize as a denial (it
  // isn't `instanceof ForbiddenError`), silently skipping `onDenied`.
  it('throws ForbiddenError, not a raw TypeError, when subject.roles is not an array', () => {
    const malformedSubject = {
      tenantId: 'tenant-a',
      roles: 'viewer',
    } as unknown as AccessSubject;
    expect(() => policy.assert(malformedSubject, 'invoices:read')).toThrow(ForbiddenError);
  });
});
