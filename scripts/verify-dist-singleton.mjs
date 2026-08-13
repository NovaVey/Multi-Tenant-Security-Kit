#!/usr/bin/env node
/**
 * Guards against a specific, previously-shipped regression class: the
 * package's public entry points (., ./tenant, ./rbac, ./rate-limit, ./audit,
 * ...) must all share exactly ONE `AsyncLocalStorage` instance for the
 * active-tenant context.
 *
 * That's only true if the build genuinely compiles src/tenant/context.ts to
 * a single physical file that every other compiled entry point imports —
 * i.e. bundle:false in tsup.config.ts. If a future change flips that back to
 * bundling each entry independently (bundle:true, the tsup default), every
 * entry silently gets its OWN copy of context.ts and therefore its own
 * separate storage — tenant context set via one subpath becomes invisible
 * to code reached via another, exactly the failure this script exists to
 * catch before it ever reaches npm again.
 *
 * This deliberately runs against the built dist/ output (not src/ via
 * vitest) — the bug only exists in bundled output, so a source-level test
 * can never catch it. Run via `npm run verify:dist`, after `npm run build`.
 */

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const distDir = fileURLToPath(new URL('../dist', import.meta.url));
if (!existsSync(distDir)) {
  console.error('dist/ not found — run `npm run build` before `npm run verify:dist`.');
  process.exit(1);
}

const { runWithTenant, getCurrentTenantId } = await import('../dist/tenant/index.js');
const { requireCurrentTenantId: rootRequireTenantId } = await import('../dist/index.js');
const { subjectFromRequestRoles } = await import('../dist/rbac/index.js');
const { TenantRateLimiter } = await import('../dist/rate-limit/index.js');
const { AuditLogger, InMemoryAuditSink } = await import('../dist/audit/index.js');

await runWithTenant({ tenantId: 'acme' }, async () => {
  assert.equal(getCurrentTenantId(), 'acme', './tenant: context readable within its own subpath');

  assert.equal(
    rootRequireTenantId(),
    'acme',
    'root package (.) does not share the ./tenant AsyncLocalStorage instance',
  );

  const subject = await subjectFromRequestRoles()({ headers: {}, roles: ['admin'] });
  assert.equal(
    subject.tenantId,
    'acme',
    './rbac does not share the ./tenant AsyncLocalStorage instance',
  );

  const limitResult = await new TenantRateLimiter({ limit: 10, windowMs: 1000 }).consume(
    rootRequireTenantId(),
  );
  assert.equal(limitResult.allowed, true, './rate-limit tenant-scoped consume failed');

  const sink = new InMemoryAuditSink();
  new AuditLogger({ sinks: [sink] }).log({ action: 'test', outcome: 'success' });
  assert.equal(
    sink.events[0]?.tenantId,
    'acme',
    './audit does not share the ./tenant AsyncLocalStorage instance (event.tenantId should default from context)',
  );
});

console.log('verify:dist — all public entry points share one tenant-context singleton. OK.');
