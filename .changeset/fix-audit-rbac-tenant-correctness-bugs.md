---
'@novavey/multi-tenant-security-kit': minor
---

Fix four correctness/security bugs found by a post-1.0 in-depth audit.

**`AuditLogger.log()` could throw despite its documented "never throws"
guarantee.** Every sink write was already try/catch-protected, but a
throwing `redact` function was not. `log()` now catches a throwing
`redact` too, reports it via `onSinkError` (wrapped in `AuditSinkError`
with `sinkName: 'redact'`), and — since `redact`'s entire purpose is
stripping secrets/PII — drops the event rather than falling back to
delivering it unredacted.

**`RbacPolicy.can()`/`.assert()` now validate `subject.roles` is an
array.** A malformed `roles` (e.g. `roles: 'admin'` instead of
`roles: ['admin']` — an easy mistake with a roles claim decoded from a
token) previously either silently iterated the string
character-by-character (a possible source of an unintended grant via a
coincidental single-character role name) or threw a raw, unbranded
`TypeError` out of `assert()`'s error-message construction — which isn't
`instanceof ForbiddenError`, so `requirePermission`'s middleware couldn't
recognize it as a denial and skipped `onDenied` entirely, silently
breaking any app relying on `onDenied` for audit-logging denied requests.
Both now cleanly resolve to a normal `ForbiddenError` denial.

**`createTenantMiddleware`'s `onMissing` now fires for a resolved-but-invalid
tenant id, not just a fully-missing one** — matching what its own JSDoc and
`docs/tenant-isolation.md` already documented. Previously this case threw
`InvalidTenantIdError` instead, bypassing any custom `onMissing` handler
and echoing the raw resolved value into the thrown error's message.
`onMissing`'s signature gains a 4th argument, `info: TenantMissingInfo`
(`{ reason: 'missing' }` or `{ reason: 'invalid', tenantId }`), so a custom
handler can distinguish the two cases and access the rejected value itself
without it being embedded in an error message. The default handler now
responds `400 { error: 'invalid_tenant' }` for the invalid case (previously
an uncaught throw, typically surfacing as a 500) and no longer includes the
raw value in its response.

**Clarified (docs + JSDoc only, no behavior change) that `requirePermission`'s
`getSubject` throwing is _not_ treated as a denial via `onDenied`** — only a
`getSubject` that _resolves_ to `undefined` is. `docs/rbac.md` and this
module's own JSDoc previously claimed a throwing `getSubject` was also
routed through `onDenied`; the code (and its own test suite) never did
that — it forwards to `next(err)`, deliberately, so a real error (e.g. an
unreachable auth service) doesn't get hidden behind an ordinary-looking 403.
Catch your own errors inside `getSubject` and resolve to `undefined` if you
want them treated as a denial instead.
