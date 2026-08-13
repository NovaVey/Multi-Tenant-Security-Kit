# Postgres row-level security (RLS)

`@novavey/multi-tenant-security-kit/rls`

Application-level checks (`assertTenantMatches`, `scopeToTenant`, RBAC) are
only as strong as the code path that runs them — a missed check on one
route is a real leak. This module generates SQL for a second, independent
layer of enforcement: Postgres row-level security, so the database itself
refuses to return or write another tenant's rows, even if application code
forgets to filter by tenant.

**This module has no Postgres client dependency.** It only ever returns SQL
strings — you execute them with whichever driver, ORM, or migration tool you
already use.

## Security model — read this before using generated SQL in production

Two very different kinds of values flow through this module, handled in
opposite ways on purpose:

1. **Identifiers** (table/column/policy/role/session-setting names) are
   developer-supplied at migration-authoring time, not end-user request
   input. Even so, this module validates every one of them against a strict
   `^[a-zA-Z_][a-zA-Z0-9_]*$` allowlist before using it, and double-quotes it
   in the output as defense in depth — generated migrations get copy-pasted
   and re-templated often enough that "developer-supplied" shouldn't imply
   "safe to splice into SQL" unconditionally. An invalid identifier throws a
   `TypeError` naming the offending value and parameter.
2. **The tenant id value** is genuine runtime, per-request user input, and it
   is **never** interpolated into any string this module returns.
   `generateSetTenantContextSql` only ever emits the placeholder `$1` —
   callers bind the real value through their driver's parameterized-query
   mechanism. This is the load-bearing security property of this module.

## Setting up a table

```ts
import {
  generateEnableRlsSql,
  generateTenantIsolationPolicySql,
} from '@novavey/multi-tenant-security-kit/rls';

console.log(generateEnableRlsSql('invoices'));
// ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
// ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;

console.log(generateTenantIsolationPolicySql({ table: 'invoices' }));
// CREATE POLICY "invoices_tenant_isolation" ON "invoices"
//   USING ("tenant_id" = current_setting('app.current_tenant_id', true))
//   WITH CHECK ("tenant_id" = current_setting('app.current_tenant_id', true));
```

`FORCE ROW LEVEL SECURITY` is easy to forget and a common multi-tenant
footgun: without it, the table owner — often the same role a migration or
admin job connects as — silently bypasses every policy on the table.
`generateEnableRlsSql` always emits both statements together.

Both `USING` (read/update/delete visibility) and `WITH CHECK` (insert / the
post-update row) use the same predicate, so the policy can't be used to read
one tenant's rows while writing as another.

### Customizing the policy

```ts
generateTenantIsolationPolicySql({
  table: 'invoices',
  tenantColumn: 'org_id', // default: 'tenant_id'
  policyName: 'invoices_org_scope', // default: '<table>_tenant_isolation'
  sessionSetting: 'app.current_org_id', // default: 'app.current_tenant_id'
  command: 'SELECT', // default: 'ALL'
  roles: ['app_user'], // default: no TO clause (applies to all roles)
});
```

## Setting the tenant for a connection/transaction

Run this once per request-scoped connection (typically at the start of a
transaction), binding the real tenant id as a parameter — never
concatenated into the SQL string:

```ts
import { generateSetTenantContextSql } from '@novavey/multi-tenant-security-kit/rls';

await client.query('BEGIN');
await client.query(generateSetTenantContextSql(), [tenantId]);
// ... every query in this transaction is now scoped by the RLS policy ...
await client.query('COMMIT');
```

`set_config`'s third argument (`true`, baked into the generated SQL) scopes
the setting to the current transaction, so it can't leak onto a pooled
connection that gets reused by a later, differently-tenanted request.

## Composing a tenant filter into a hand-written query

```ts
import { tenantWhereClause } from '@novavey/multi-tenant-security-kit/rls';

const { clause, nextParamIndex } = tenantWhereClause('tenant_id', 2); // e.g. after $1 is already used
const sql = `SELECT * FROM invoices WHERE status = $1 AND ${clause}`; // "tenant_id" = $2
await client.query(sql, [status, tenantId]);
```

Like `generateSetTenantContextSql`, this never embeds the tenant id _value_
— only the (validated) column identifier and a placeholder number.

## Generating a full migration

```ts
import { generateTenantIsolationMigration } from '@novavey/multi-tenant-security-kit/rls';

const migrationSql = generateTenantIsolationMigration([
  'invoices', // shorthand for { table: 'invoices' }
  'line_items',
  { table: 'audit_events', command: 'SELECT' }, // per-table override
]);
```

Each entry may be a bare table name (all-default options) or a full
`RlsPolicyOptions` object — mirroring how a real migration usually looks:
mostly-default policies for most tables, with a few overridden.

## API reference

| Export                                          | Kind     | Summary                                                                    |
| ----------------------------------------------- | -------- | -------------------------------------------------------------------------- |
| `RlsPolicyOptions`                              | type     | `{ table, tenantColumn?, policyName?, sessionSetting?, command?, roles? }` |
| `generateEnableRlsSql(table)`                   | function | `ENABLE` + `FORCE ROW LEVEL SECURITY` statements                           |
| `generateTenantIsolationPolicySql(options)`     | function | `CREATE POLICY` statement                                                  |
| `generateSetTenantContextSql(sessionSetting?)`  | function | Session/transaction-scoped `set_config`, tenant id as `$1`                 |
| `TenantWhereClauseResult`                       | type     | `{ clause, nextParamIndex }`                                               |
| `tenantWhereClause(tenantColumn?, paramIndex?)` | function | Composable `"<column>" = $<n>` fragment                                    |
| `generateTenantIsolationMigration(tables)`      | function | Full migration for a list of tables                                        |
