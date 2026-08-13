/**
 * Postgres row-level-security (RLS) helpers: pure SQL-text generation for
 * enforcing tenant isolation at the database layer, with no runtime
 * dependency on any particular Postgres client.
 */

export type { RlsPolicyOptions } from './types.js';
export type { TenantWhereClauseResult } from './postgres.js';
export {
  generateEnableRlsSql,
  generateTenantIsolationPolicySql,
  generateSetTenantContextSql,
  tenantWhereClause,
  generateTenantIsolationMigration,
} from './postgres.js';
