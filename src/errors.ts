/**
 * Shared error hierarchy for the Multi-Tenant Security Kit.
 *
 * Every error the kit throws extends {@link SecurityKitError} and carries a
 * stable machine-readable `code`, so callers (and audit-log sinks) can branch
 * on `error.code` instead of parsing messages or using `instanceof` chains
 * across module boundaries.
 */

export interface SecurityKitErrorOptions {
  cause?: unknown;
}

/** Base class for every error thrown by this package. */
export class SecurityKitError extends Error {
  /** Stable, machine-readable identifier for this error type. */
  readonly code: string;

  constructor(message: string, code: string, options?: SecurityKitErrorOptions) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.code = code;
    Error.captureStackTrace?.(this, new.target);
  }
}

/** Thrown when tenant-scoped code runs outside of any tenant context. */
export class TenantContextError extends SecurityKitError {
  constructor(message = 'No tenant context is active for the current execution.') {
    super(message, 'TENANT_CONTEXT_MISSING');
  }
}

/** Thrown when an operation would read or write data belonging to a different tenant. */
export class CrossTenantAccessError extends SecurityKitError {
  readonly expectedTenantId: string;
  readonly actualTenantId: string;

  constructor(expectedTenantId: string, actualTenantId: string, message?: string) {
    super(
      message ??
        `Cross-tenant access blocked: current tenant is "${expectedTenantId}" but the ` +
          `resource belongs to "${actualTenantId}".`,
      'CROSS_TENANT_ACCESS_DENIED',
    );
    this.expectedTenantId = expectedTenantId;
    this.actualTenantId = actualTenantId;
  }
}

/**
 * Thrown by the `rls` module when a value that must be a safe, allowlisted
 * SQL identifier (a table/column/policy/role/session-setting name) isn't
 * one — e.g. `generateEnableRlsSql('users; DROP TABLE users;--')`.
 *
 * Every value this error can be thrown for is developer-supplied at
 * migration-authoring time, never end-user request input (see
 * `src/rls/postgres.ts`'s own security-model doc comment for why that
 * distinction matters) — this error means a mistake in code generating a
 * migration, not a caught attack.
 */
export class InvalidSqlIdentifierError extends SecurityKitError {
  /** Which parameter (`table`, `tenantColumn`, `sessionSetting`, ...) rejected the value. */
  readonly paramName: string;

  constructor(value: unknown, paramName: string, message?: string) {
    super(
      message ?? `Invalid SQL identifier for "${paramName}": ${JSON.stringify(value)}.`,
      'INVALID_SQL_IDENTIFIER',
    );
    this.paramName = paramName;
  }
}

/** Thrown when an RBAC policy denies a permission check. */
export class ForbiddenError extends SecurityKitError {
  readonly permission?: string | undefined;

  constructor(message: string, permission?: string) {
    super(message, 'FORBIDDEN');
    this.permission = permission;
  }
}

/** Thrown when a tenant has exceeded its allotted rate limit. */
export class RateLimitExceededError extends SecurityKitError {
  /** Milliseconds until the caller may retry. */
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number, message?: string) {
    super(message ?? `Rate limit exceeded. Retry after ${retryAfterMs}ms.`, 'RATE_LIMIT_EXCEEDED');
    this.retryAfterMs = retryAfterMs;
  }
}

/** Thrown for malformed or missing tenant identifiers. */
export class InvalidTenantIdError extends SecurityKitError {
  constructor(tenantId: unknown, message?: string) {
    super(message ?? `Invalid tenant id: ${JSON.stringify(tenantId)}`, 'INVALID_TENANT_ID');
  }
}

/** Thrown by the crypto module when decryption fails (bad key, tampered payload, wrong tenant). */
export class DecryptionError extends SecurityKitError {
  constructor(message = 'Failed to decrypt payload.', options?: SecurityKitErrorOptions) {
    super(message, 'DECRYPTION_FAILED', options);
  }
}

/** Thrown when an {@link RbacPolicy} (see `rbac/policy.ts`) is constructed with invalid role definitions. */
export class RbacConfigurationError extends SecurityKitError {
  constructor(message: string) {
    super(message, 'RBAC_CONFIGURATION_INVALID');
  }
}

/** Wraps an error thrown by an audit sink so callers can distinguish "audit delivery failed" from other errors. */
export class AuditSinkError extends SecurityKitError {
  readonly sinkName: string;

  constructor(sinkName: string, options?: SecurityKitErrorOptions) {
    super(`Audit sink "${sinkName}" failed to write an event.`, 'AUDIT_SINK_FAILED', options);
    this.sinkName = sinkName;
  }
}
