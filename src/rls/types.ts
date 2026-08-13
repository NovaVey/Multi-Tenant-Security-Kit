/**
 * Options controlling the SQL generated for a single table's Postgres
 * row-level-security (RLS) tenant-isolation policy.
 *
 * These are developer-supplied at migration-authoring time (table names,
 * column names, policy names, role lists come from your schema/config, not
 * from an end user's HTTP request) — but see the security note in
 * `postgres.ts` for why every identifier is still validated strictly before
 * being interpolated into generated SQL text.
 */
export interface RlsPolicyOptions {
  /** The table the policy is created on. */
  table: string;
  /**
   * The column on `table` that holds the owning tenant's id.
   * @defaultValue `'tenant_id'`
   */
  tenantColumn?: string;
  /**
   * The name given to the `CREATE POLICY` statement.
   * @defaultValue `` `${table}_tenant_isolation` ``
   */
  policyName?: string;
  /**
   * The Postgres session GUC (set via `set_config`/`current_setting`, see
   * {@link https://www.postgresql.org/docs/current/sql-set.html | SET}) that
   * carries the current request's tenant id. Must match what
   * `generateSetTenantContextSql` is called with for the same deployment.
   * @defaultValue `'app.current_tenant_id'`
   */
  sessionSetting?: string;
  /**
   * Which statement types the policy governs. Postgres's own default when a
   * `CREATE POLICY` statement omits `FOR` is `ALL`, so that's also this
   * option's default.
   * @defaultValue `'ALL'`
   */
  command?: 'ALL' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  /**
   * Postgres roles the policy applies `TO`. Omit to leave off the `TO`
   * clause entirely, which makes the policy apply to every role querying
   * the table (Postgres's default when `TO` is not specified).
   */
  roles?: string[];
}
