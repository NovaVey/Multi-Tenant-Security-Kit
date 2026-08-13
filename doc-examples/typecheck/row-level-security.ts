// Mirrors docs/row-level-security.md's client.query() pseudocode (pg-shaped)
// samples — the pure SQL-generation samples are executable and live in
// doc-examples/run/row-level-security.mjs instead, with exact-string
// assertions against the doc's own comments. Keep both in sync — see
// doc-examples/README.md for the convention this file is part of.
import {
  generateSetTenantContextSql,
  tenantWhereClause,
} from '@novavey/multi-tenant-security-kit/rls';

declare const client: { query(sql: string, params?: unknown[]): Promise<unknown> };
declare const tenantId: string;
declare const status: string;

// "Setting the tenant for a connection/transaction"
await client.query('BEGIN');
await client.query(generateSetTenantContextSql(), [tenantId]);
// ... every query in this transaction is now scoped by the RLS policy ...
await client.query('COMMIT');

// "Composing a tenant filter into a hand-written query"
{
  const { clause, nextParamIndex } = tenantWhereClause('tenant_id', 2); // e.g. after $1 is already used
  void nextParamIndex;
  const sql = `SELECT * FROM invoices WHERE status = $1 AND ${clause}`; // "tenant_id" = $2
  await client.query(sql, [status, tenantId]);
}
