---
'@novavey/multi-tenant-security-kit': patch
---

Fixes all MEDIUM-severity findings from a fresh, independent audit that
re-verified every prior fix from scratch (Phase 3 of a phased rollout,
following the Critical RLS `command` injection fix and the 7 High-severity
fixes):

- **`RbacPolicy` had an unbounded internal cache.** `resolveRole` memoized
  every role name it was ever asked to resolve, including unknown ones —
  and `can()`/`assert()` are reachable with arbitrary caller-controlled role
  strings through `subjectFromRequestRoles`, which passes request-derived
  roles straight through with no validation against the policy's catalog.
  A client sending a fresh, never-before-seen role name on every request
  could grow that cache without bound, the same unbounded-memory-growth
  shape `MemoryRateLimitStore` needed `maxBuckets` for. Unknown-role lookups
  are no longer memoized — there's no recursive work there worth caching
  anyway, so the cache is now provably bounded by the number of roles
  actually passed to the constructor.
- **`RbacPolicy#can()`/`#assert()` crashed on a missing `subject`.**
  `can()`'s own doc comment promises it never throws, and a malformed
  `subject.roles` was already handled safely — but a `null`/`undefined`
  `subject` itself (e.g. from a lookup that legitimately came up empty)
  still read `.roles` unconditionally first, throwing a raw TypeError
  before that check ever ran. Both now treat a missing subject the same as
  one with no permissions.
- **The active tenant context was mutable.** `runWithTenant` stored the
  exact object it was given, unfrozen — `TenantContext`'s `readonly`
  fields are compile-time only, so anything holding a reference obtained
  via `getCurrentTenant()` could reassign `.tenantId` in place, silently
  changing what every _other_ `getCurrentTenantId()` call sees for the rest
  of that async scope. The stored context (a copy, not your original
  object) is now `Object.freeze`d, so a mutation attempt throws instead of
  silently succeeding.
- **`traceContextTransform` could silently drop audit events that have
  nothing to do with OpenTelemetry.** A throwing `getActiveSpan()` or
  `span.spanContext()` (a malformed or version-incompatible span) used to
  propagate out of the returned function — tolerable for an ordinary sink,
  but this function is meant to be used as `AuditLoggerOptions.redact`,
  and `AuditLogger.log()` treats a throwing `redact` as a reason to drop
  the _entire_ event, not just skip trace-context enrichment. Now degrades
  to a no-op passthrough on any throw, the same as "no active span at all".
- **Three middlewares (`createTenantMiddleware`, `requirePermission`,
  `createRateLimitMiddleware`) could call `next()` twice.** Each called
  `next()` from inside its own try/catch; since this package's
  `NextFunction` is framework-agnostic (whatever the caller supplies, with
  no guaranteed Express-router-style exception isolation), a downstream
  handler throwing synchronously inside that call used to be caught right
  there and re-forwarded via a second `next(err)` — violating the "call
  next at most once" contract every middleware chain depends on. `next()`
  now runs strictly outside any try/catch that could re-catch its own
  downstream effects in all three.
- **`examples/express-basic.ts` didn't compile under its own strict
  settings.** An untyped `requirePermission()` call left `req` inside its
  `onDenied` callback typed as the framework-agnostic default (no
  `.params`), and reading `req.params.id` didn't account for Express 5
  typing route params as `string | string[]`. Fixed with an explicit
  `requirePermission<express.Request>` type argument and the same
  `String(...)` coercion already used elsewhere in this repo's own docs.
  (Investigated but did **not** change: the audit also flagged
  `examples/redis-rate-limit-store.ts` as failing to compile against
  `ioredis` — re-verified against the real, currently-published `ioredis`
  package with this repo's exact strict `tsconfig` and it compiles cleanly
  with zero errors, so no fix was needed there.)
- **`release.yml` had a silent diagnostic gap.** If the `changesets/action`
  step itself failed outright (as opposed to succeeding without publishing
  anything), every step after it — including the one that detects a
  successful-but-untagged publish — was silently skipped by GitHub Actions'
  implicit `success()` step gating, with no indication of whether `npm
publish` had actually already succeeded before the failure. Added a
  diagnostic-only step, gated on that specific failure, that checks npm
  directly and leaves an unambiguous `::error::` if a real publish is
  stuck behind the failure.
- **`docs/tenant-isolation.md`'s API reference table was missing three
  real exports** (`TenantMiddlewareOptions`, `TenantResolver`,
  `SubdomainTenantResolverOptions`) that `src/tenant/index.ts` has exported
  since this module was first built.

No public API surface changed — every fix here is internal behavior,
docs, examples, or CI infrastructure.
