import { AsyncLocalStorage } from 'node:async_hooks';

import { TenantContextError } from '../errors.js';
import type { TenantContext } from './types.js';

/**
 * `AsyncLocalStorage`-backed store for the "current tenant" — the single
 * source of truth that {@link https://github.com/NovaVey/Multi-Tenant-Security-Kit#rbac | RBAC},
 * rate limiting, audit logging, and the RLS/crypto helpers all read from.
 *
 * Because it's built on `AsyncLocalStorage`, the context automatically
 * propagates across `await`s, callbacks, timers, and Promise chains started
 * within {@link runWithTenant} — there is no manual thread-through required.
 */
const storage = new AsyncLocalStorage<TenantContext>();

/**
 * Runs `fn` with `context` as the active tenant for the duration of its
 * (possibly asynchronous) execution, including anything it schedules.
 *
 * This is normally called once per request by {@link createTenantMiddleware}
 * (see `tenant/middleware.ts`); call it directly for background jobs, queue
 * consumers, or cron tasks that need tenant scoping outside of an HTTP
 * request.
 */
export function runWithTenant<T>(context: TenantContext, fn: () => T): T {
  return storage.run(context, fn);
}

/** Returns the active tenant context, or `undefined` if none is active. */
export function getCurrentTenant(): TenantContext | undefined {
  return storage.getStore();
}

/**
 * Returns the active tenant context.
 *
 * @throws {TenantContextError} if no tenant context is active. Use this at
 * the top of any function that must never run "tenant-less" — it turns a
 * silent isolation bug into a loud, immediate failure.
 */
export function requireCurrentTenant(): TenantContext {
  const context = storage.getStore();
  if (!context) {
    throw new TenantContextError();
  }
  return context;
}

/** Returns the active tenant id, or `undefined` if no tenant context is active. */
export function getCurrentTenantId(): string | undefined {
  return storage.getStore()?.tenantId;
}

/**
 * Returns the active tenant id.
 *
 * @throws {TenantContextError} if no tenant context is active.
 */
export function requireCurrentTenantId(): string {
  return requireCurrentTenant().tenantId;
}
