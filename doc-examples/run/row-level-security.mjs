// Mirrors docs/row-level-security.md's pure SQL-generation code samples —
// asserts the actual output matches the doc's own comments *exactly*, so a
// doc edit that silently drifts from real output fails CI. Keep in sync
// with the doc — see doc-examples/README.md for the convention this file
// is part of.
import assert from 'node:assert/strict';
import {
  generateEnableRlsSql,
  generateTenantIsolationPolicySql,
  generateTenantIsolationMigration,
} from '@novavey/multi-tenant-security-kit/rls';

// "Setting up a table"
assert.equal(
  generateEnableRlsSql('invoices'),
  'ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;\n' +
    'ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;',
);

assert.equal(
  generateTenantIsolationPolicySql({ table: 'invoices' }),
  'CREATE POLICY "invoices_tenant_isolation" ON "invoices"\n' +
    '  USING ("tenant_id" = current_setting(\'app.current_tenant_id\', true))\n' +
    '  WITH CHECK ("tenant_id" = current_setting(\'app.current_tenant_id\', true));',
);

// "Customizing the policy" — just needs to not throw, and to actually use
// every option (the doc doesn't show the output for this one).
generateTenantIsolationPolicySql({
  table: 'invoices',
  tenantColumn: 'org_id',
  policyName: 'invoices_org_scope',
  sessionSetting: 'app.current_org_id',
  command: 'SELECT',
  roles: ['app_user'],
});

// "Generating a full migration" — just needs to not throw.
generateTenantIsolationMigration([
  'invoices',
  'line_items',
  { table: 'audit_events', command: 'SELECT' },
]);

console.log('OK row-level-security.md: SQL generation examples match the doc comments exactly');
