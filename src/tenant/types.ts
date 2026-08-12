/**
 * The identity of a tenant. Kept intentionally minimal — everything else
 * (roles, plan, feature flags) lives in `extra` so this stays a stable,
 * serializable core that every other module can depend on.
 */
export interface TenantContext<Extra extends Record<string, unknown> = Record<string, unknown>> {
  readonly tenantId: string;
  readonly extra?: Extra;
}

/**
 * Anything that is scoped to a tenant and can be checked against one.
 *
 * The index signature is deliberate: real domain records (an invoice, a
 * query filter, ...) carry many fields beyond `tenantId`, and this type is
 * meant to be satisfied structurally by them without callers needing to
 * cast or over-narrow their own types.
 */
export interface TenantScoped {
  tenantId: string;
  [key: string]: unknown;
}
