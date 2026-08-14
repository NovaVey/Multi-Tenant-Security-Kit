import { describe, expect, it } from 'vitest';

import { InvalidSqlIdentifierError, SecurityKitError } from '../../src/errors.js';
import {
  generateEnableRlsSql,
  generateSetTenantContextSql,
  generateTenantIsolationMigration,
  generateTenantIsolationPolicySql,
  tenantWhereClause,
} from '../../src/rls/postgres.js';

/** SQL-injection-shaped and otherwise-invalid identifier inputs shared across entry points. */
const INVALID_IDENTIFIERS = [
  'users; DROP TABLE users;--',
  'users"; --',
  'my table',
  '',
  'a.b.c',
  '1users',
  'users-table',
  "users' OR '1'='1",
];

/**
 * Invalid inputs for `sessionSetting` params specifically. Unlike table/column/policy
 * names, `sessionSetting` legitimately allows dots (Postgres GUC names are
 * dot-separated, e.g. "app.current_tenant_id"), so "a.b.c" — otherwise on the
 * shared invalid list — is a *valid* sessionSetting and is excluded here in favor
 * of a dedicated invalid-multi-segment case.
 */
const INVALID_SESSION_SETTINGS = [
  ...INVALID_IDENTIFIERS.filter((value) => value !== 'a.b.c'),
  'app.1nvalid',
  'app.my column',
  'app..double_dot',
];

describe('generateEnableRlsSql', () => {
  it('produces the exact expected two-statement SQL for a valid table name', () => {
    expect(generateEnableRlsSql('invoices')).toBe(
      'ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;\n' +
        'ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;',
    );
  });

  it('quotes the table identifier', () => {
    expect(generateEnableRlsSql('accounts')).toContain('"accounts"');
  });

  for (const bad of INVALID_IDENTIFIERS) {
    it(`rejects invalid table name ${JSON.stringify(bad)} with an InvalidSqlIdentifierError`, () => {
      expect(() => generateEnableRlsSql(bad)).toThrow(InvalidSqlIdentifierError);
    });

    it(`error message for invalid table name ${JSON.stringify(bad)} names the offending value and parameter`, () => {
      try {
        generateEnableRlsSql(bad);
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidSqlIdentifierError);
        expect(err).toBeInstanceOf(SecurityKitError);
        const error = err as InvalidSqlIdentifierError;
        expect(error.code).toBe('INVALID_SQL_IDENTIFIER');
        expect(error.paramName).toBe('table');
        expect(error.message).toContain('table');
        expect(error.message).toContain(JSON.stringify(bad));
      }
    });
  }
});

describe('generateTenantIsolationPolicySql', () => {
  it('produces exact expected SQL using all defaults', () => {
    expect(generateTenantIsolationPolicySql({ table: 'invoices' })).toBe(
      [
        'CREATE POLICY "invoices_tenant_isolation" ON "invoices"',
        '  USING ("tenant_id" = current_setting(\'app.current_tenant_id\', true))',
        '  WITH CHECK ("tenant_id" = current_setting(\'app.current_tenant_id\', true));',
      ].join('\n'),
    );
  });

  it('omits the FOR clause when command is ALL (explicitly)', () => {
    const sql = generateTenantIsolationPolicySql({ table: 'invoices', command: 'ALL' });
    expect(sql).not.toContain('FOR ALL');
    expect(sql).not.toContain('  FOR');
  });

  it('includes a FOR clause for a non-ALL command', () => {
    expect(generateTenantIsolationPolicySql({ table: 'invoices', command: 'SELECT' })).toBe(
      [
        'CREATE POLICY "invoices_tenant_isolation" ON "invoices"',
        '  FOR SELECT',
        '  USING ("tenant_id" = current_setting(\'app.current_tenant_id\', true))',
        '  WITH CHECK ("tenant_id" = current_setting(\'app.current_tenant_id\', true));',
      ].join('\n'),
    );
  });

  for (const command of ['INSERT', 'UPDATE', 'DELETE'] as const) {
    it(`includes "FOR ${command}" for command ${command}`, () => {
      expect(generateTenantIsolationPolicySql({ table: 'invoices', command })).toContain(
        `  FOR ${command}`,
      );
    });
  }

  it('produces exact expected SQL with a roles list', () => {
    expect(
      generateTenantIsolationPolicySql({ table: 'invoices', roles: ['app_user', 'app_readonly'] }),
    ).toBe(
      [
        'CREATE POLICY "invoices_tenant_isolation" ON "invoices"',
        '  TO "app_user", "app_readonly"',
        '  USING ("tenant_id" = current_setting(\'app.current_tenant_id\', true))',
        '  WITH CHECK ("tenant_id" = current_setting(\'app.current_tenant_id\', true));',
      ].join('\n'),
    );
  });

  it('omits the TO clause when roles is an empty array', () => {
    expect(generateTenantIsolationPolicySql({ table: 'invoices', roles: [] })).not.toContain('TO ');
  });

  it('respects a custom tenantColumn, policyName, and sessionSetting', () => {
    const sql = generateTenantIsolationPolicySql({
      table: 'orders',
      tenantColumn: 'org_id',
      policyName: 'orders_isolation_policy',
      sessionSetting: 'app.org_id',
    });
    expect(sql).toContain('CREATE POLICY "orders_isolation_policy" ON "orders"');
    expect(sql).toContain('"org_id" = current_setting(\'app.org_id\', true)');
  });

  it('combines command and roles together', () => {
    const sql = generateTenantIsolationPolicySql({
      table: 'invoices',
      command: 'UPDATE',
      roles: ['app_user'],
    });
    expect(sql).toBe(
      [
        'CREATE POLICY "invoices_tenant_isolation" ON "invoices"',
        '  FOR UPDATE',
        '  TO "app_user"',
        '  USING ("tenant_id" = current_setting(\'app.current_tenant_id\', true))',
        '  WITH CHECK ("tenant_id" = current_setting(\'app.current_tenant_id\', true));',
      ].join('\n'),
    );
  });

  for (const bad of INVALID_IDENTIFIERS) {
    it(`rejects invalid table ${JSON.stringify(bad)} with an InvalidSqlIdentifierError`, () => {
      expect(() => generateTenantIsolationPolicySql({ table: bad })).toThrow(
        InvalidSqlIdentifierError,
      );
    });

    it(`rejects invalid tenantColumn ${JSON.stringify(bad)} with an InvalidSqlIdentifierError`, () => {
      expect(() =>
        generateTenantIsolationPolicySql({ table: 'invoices', tenantColumn: bad }),
      ).toThrow(InvalidSqlIdentifierError);
    });

    it(`rejects invalid policyName ${JSON.stringify(bad)} with an InvalidSqlIdentifierError`, () => {
      expect(() =>
        generateTenantIsolationPolicySql({ table: 'invoices', policyName: bad }),
      ).toThrow(InvalidSqlIdentifierError);
    });
  }

  for (const bad of INVALID_SESSION_SETTINGS) {
    it(`rejects invalid sessionSetting ${JSON.stringify(bad)} with an InvalidSqlIdentifierError`, () => {
      expect(() =>
        generateTenantIsolationPolicySql({ table: 'invoices', sessionSetting: bad }),
      ).toThrow(InvalidSqlIdentifierError);
    });
  }

  it('rejects an invalid role name in roles with an InvalidSqlIdentifierError', () => {
    expect(() =>
      generateTenantIsolationPolicySql({
        table: 'invoices',
        roles: ['app_user', 'users; DROP TABLE users;--'],
      }),
    ).toThrow(InvalidSqlIdentifierError);
  });

  it('accepts a multi-segment sessionSetting where every segment is valid', () => {
    expect(() =>
      generateTenantIsolationPolicySql({
        table: 'invoices',
        sessionSetting: 'app.current_tenant_id',
      }),
    ).not.toThrow();
  });
});

describe('generateSetTenantContextSql', () => {
  it('returns the expected SQL with the default session setting', () => {
    expect(generateSetTenantContextSql()).toBe(
      "SELECT set_config('app.current_tenant_id', $1, true);",
    );
  });

  it('returns the expected SQL with a custom session setting', () => {
    expect(generateSetTenantContextSql('app.org_id')).toBe(
      "SELECT set_config('app.org_id', $1, true);",
    );
  });

  it('never interpolates a tenant id value into the returned string — only the $1 placeholder appears', () => {
    // generateSetTenantContextSql intentionally takes no tenant-id argument at all;
    // this test documents and locks in that the *only* per-request marker in the
    // output is the parameter placeholder, never a literal value.
    const sql = generateSetTenantContextSql();
    expect(sql).toContain('$1');
    expect(sql).not.toMatch(/\$1.*\$1/); // exactly one placeholder, not accidentally duplicated
    // Simulate a caller mistakenly checking for injected tenant-id-shaped values.
    const suspiciousTenantIds = ['tenant-123', "'; DROP TABLE users; --", 'a-real-uuid-0000'];
    for (const tenantId of suspiciousTenantIds) {
      expect(sql).not.toContain(tenantId);
    }
  });

  it('accepts a multi-segment sessionSetting where every segment is valid (dots are allowed for GUC names)', () => {
    expect(() => generateSetTenantContextSql('a.b.c')).not.toThrow();
    expect(generateSetTenantContextSql('a.b.c')).toBe("SELECT set_config('a.b.c', $1, true);");
  });

  for (const bad of INVALID_SESSION_SETTINGS) {
    it(`rejects invalid sessionSetting ${JSON.stringify(bad)} with an InvalidSqlIdentifierError`, () => {
      expect(() => generateSetTenantContextSql(bad)).toThrow(InvalidSqlIdentifierError);
    });
  }
});

describe('tenantWhereClause', () => {
  it('returns the correct clause and next index at paramIndex 1 (default)', () => {
    expect(tenantWhereClause()).toEqual({ clause: '"tenant_id" = $1', nextParamIndex: 2 });
  });

  it('returns the correct clause and next index at a later paramIndex', () => {
    expect(tenantWhereClause('tenant_id', 3)).toEqual({
      clause: '"tenant_id" = $3',
      nextParamIndex: 4,
    });
  });

  it('respects a custom tenantColumn', () => {
    expect(tenantWhereClause('org_id', 1)).toEqual({ clause: '"org_id" = $1', nextParamIndex: 2 });
  });

  it('is composable: nextParamIndex can be fed into a subsequent call', () => {
    const first = tenantWhereClause('tenant_id', 1);
    const second = tenantWhereClause('org_id', first.nextParamIndex);
    expect(second).toEqual({ clause: '"org_id" = $2', nextParamIndex: 3 });
  });

  for (const bad of INVALID_IDENTIFIERS) {
    it(`rejects invalid tenantColumn ${JSON.stringify(bad)} with an InvalidSqlIdentifierError`, () => {
      expect(() => tenantWhereClause(bad)).toThrow(InvalidSqlIdentifierError);
    });
  }
});

describe('generateTenantIsolationMigration', () => {
  it('combines multiple tables (mix of bare strings and options objects) correctly', () => {
    const migration = generateTenantIsolationMigration([
      'invoices',
      { table: 'orders', tenantColumn: 'org_id', command: 'SELECT' },
    ]);

    // Header comment identifies this as a generated migration.
    expect(migration.startsWith('-- Generated')).toBe(true);

    // Contains the enable/force RLS + policy SQL for the bare-string table, using defaults.
    expect(migration).toContain('ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;');
    expect(migration).toContain('ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;');
    expect(migration).toContain('CREATE POLICY "invoices_tenant_isolation" ON "invoices"');

    // Contains the enable/force RLS + policy SQL for the options-object table, using overrides.
    expect(migration).toContain('ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;');
    expect(migration).toContain('CREATE POLICY "orders_tenant_isolation" ON "orders"');
    expect(migration).toContain('  FOR SELECT');
    expect(migration).toContain('"org_id" = current_setting');

    // Table order is preserved: invoices block appears before orders block.
    expect(migration.indexOf('"invoices"')).toBeLessThan(migration.indexOf('"orders"'));
  });

  it('separates each enable/force + policy pair with a blank line', () => {
    const migration = generateTenantIsolationMigration(['invoices']);
    const enableSql = generateEnableRlsSql('invoices');
    const policySql = generateTenantIsolationPolicySql({ table: 'invoices' });
    expect(migration).toContain(`${enableSql}\n\n${policySql}`);
  });

  it('handles a single-table array', () => {
    const migration = generateTenantIsolationMigration(['invoices']);
    expect(migration).toContain('"invoices"');
    expect(migration.split('CREATE POLICY').length - 1).toBe(1);
  });

  it('handles an empty array by returning just the header', () => {
    expect(generateTenantIsolationMigration([])).toBe(
      '-- Generated by @novavey/multi-tenant-security-kit: tenant RLS isolation migration.',
    );
  });

  it('propagates an InvalidSqlIdentifierError when any table entry has an invalid identifier', () => {
    expect(() =>
      generateTenantIsolationMigration(['invoices', 'users; DROP TABLE users;--']),
    ).toThrow(InvalidSqlIdentifierError);
  });

  it('propagates an InvalidSqlIdentifierError when an options-object entry has an invalid tenantColumn', () => {
    expect(() =>
      generateTenantIsolationMigration([{ table: 'orders', tenantColumn: 'my column' }]),
    ).toThrow(InvalidSqlIdentifierError);
  });
});
