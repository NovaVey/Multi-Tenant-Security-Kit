import type { MinimalRequest, MinimalResponse, Middleware, NextFunction } from '../http/types.js';
import { runWithTenant } from './context.js';
import type { TenantContext } from './types.js';

/**
 * Resolves a {@link TenantContext} from an incoming request. May be async
 * (e.g. to look the tenant up in a database) and may return `undefined` if
 * no tenant could be determined.
 */
export type TenantResolver<Req extends MinimalRequest = MinimalRequest> = (
  req: Req,
) => TenantContext | undefined | Promise<TenantContext | undefined>;

/**
 * Default tenant id shape: 1-64 chars of letters, digits, `-`, `_`. Override via `validateTenantId`.
 *
 * Exported only so `test/tenant/*.fuzz.test.ts` has a real oracle to fuzz
 * against instead of duplicating this pattern (and risking drift) in a test
 * file. Not re-exported from `tenant/index.ts`, so it stays out of the
 * package's public API.
 */
export const DEFAULT_TENANT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Why {@link TenantMiddlewareOptions.onMissing} is running: no resolver
 * produced a tenant at all (`'missing'`), or one was resolved but rejected
 * by `validateTenantId` (`'invalid'`) — present alongside the
 * resolved-but-rejected id itself, so a custom handler can log or branch on
 * it without receiving it wrapped in a thrown error.
 */
export type TenantMissingInfo = { reason: 'missing' } | { reason: 'invalid'; tenantId: string };

export interface TenantMiddlewareOptions<Req extends MinimalRequest = MinimalRequest> {
  /** Determines the tenant for each request. See the `*TenantResolver` helpers below for common strategies. */
  resolver: TenantResolver<Req>;
  /**
   * Validates a resolved tenant id before it's trusted. Defaults to
   * rejecting anything but `[a-zA-Z0-9_-]{1,64}` — deliberately strict,
   * since this value often flows into SQL identifiers, cache keys, and
   * file paths downstream.
   */
  validateTenantId?: (tenantId: string) => boolean;
  /**
   * Called when no tenant could be resolved, *or* one was resolved but
   * failed `validateTenantId` — `info.reason` distinguishes the two, and
   * `info.tenantId` carries the rejected value for the `'invalid'` case.
   * Defaults to responding `400 { error: "tenant_required" | "invalid_tenant" }`.
   * Set this to implement e.g. a public/marketing-site fallback that skips
   * tenant scoping entirely by calling `next()` without resolving a tenant.
   */
  onMissing?: (req: Req, res: MinimalResponse, next: NextFunction, info: TenantMissingInfo) => void;
}

/**
 * Builds Express-compatible middleware that resolves the tenant for each
 * request and runs the rest of the request pipeline inside
 * {@link runWithTenant}, so `getCurrentTenant()` / `requireCurrentTenantId()`
 * (and everything built on them — RBAC, rate limiting, audit logging) work
 * for the lifetime of that request.
 *
 * Mount this as early as possible, before any route or middleware that
 * touches tenant-scoped data.
 */
export function createTenantMiddleware<Req extends MinimalRequest = MinimalRequest>(
  options: TenantMiddlewareOptions<Req>,
): Middleware<Req> {
  const validateTenantId =
    options.validateTenantId ?? ((id: string) => DEFAULT_TENANT_ID_PATTERN.test(id));
  const onMissing =
    options.onMissing ??
    ((_req: Req, res: MinimalResponse, _next: NextFunction, info: TenantMissingInfo) => {
      res.status(400).json(
        info.reason === 'invalid'
          ? { error: 'invalid_tenant', message: 'The resolved tenant id failed validation.' }
          : {
              error: 'tenant_required',
              message: 'No tenant could be resolved for this request.',
            },
      );
    });

  return (req, res, next) => {
    void (async () => {
      try {
        const context = await options.resolver(req);
        if (!context) {
          onMissing(req, res, next, { reason: 'missing' });
          return;
        }
        if (!validateTenantId(context.tenantId)) {
          onMissing(req, res, next, { reason: 'invalid', tenantId: context.tenantId });
          return;
        }
        runWithTenant(context, () => next());
      } catch (err) {
        next(err);
      }
    })();
  };
}

/** Resolves the tenant from a request header (default: `x-tenant-id`). */
export function headerTenantResolver<Req extends MinimalRequest = MinimalRequest>(
  headerName = 'x-tenant-id',
): TenantResolver<Req> {
  const key = headerName.toLowerCase();
  return (req) => {
    const raw = req.headers[key];
    const tenantId = Array.isArray(raw) ? raw[0] : raw;
    return tenantId ? { tenantId } : undefined;
  };
}

export interface SubdomainTenantResolverOptions {
  /** Number of trailing labels to strip (e.g. `2` for `acme.app.example.com` -> `example.com` stripped, `acme` kept). Default `2`. */
  baseDomainLabels?: number;
}

/**
 * Resolves the tenant from the leftmost label of the request's hostname,
 * e.g. `acme.yourapp.com` -> tenant `acme`. Returns `undefined` for bare
 * apex/base domains (no subdomain present) or unresolvable hosts.
 */
export function subdomainTenantResolver<Req extends MinimalRequest = MinimalRequest>(
  options: SubdomainTenantResolverOptions = {},
): TenantResolver<Req> {
  const baseDomainLabels = options.baseDomainLabels ?? 2;
  return (req) => {
    const hostHeader = req.headers.host;
    const host = req.hostname ?? (Array.isArray(hostHeader) ? hostHeader[0] : hostHeader);
    if (!host) return undefined;
    const hostname = host.split(':')[0] ?? '';
    const labels = hostname.split('.').filter(Boolean);
    if (labels.length <= baseDomainLabels) return undefined;
    const tenantId = labels[0];
    return tenantId ? { tenantId } : undefined;
  };
}

/**
 * Resolves the tenant from a claim on an already-decoded token/session
 * object (e.g. a verified JWT payload). Pass your own `decode` function so
 * this stays agnostic of how you verify tokens (jsonwebtoken, jose, a
 * session store, ...) — this helper only extracts the claim, it never
 * performs verification itself.
 */
export function claimTenantResolver<Req extends MinimalRequest = MinimalRequest>(
  decode: (
    req: Req,
  ) => { [claim: string]: unknown } | undefined | Promise<{ [claim: string]: unknown } | undefined>,
  claim = 'tenant_id',
): TenantResolver<Req> {
  return async (req) => {
    const claims = await decode(req);
    const tenantId = claims?.[claim];
    return typeof tenantId === 'string' && tenantId.length > 0 ? { tenantId } : undefined;
  };
}
