---
'@novavey/multi-tenant-security-kit': minor
---

Fixes the remaining 4 MEDIUM-severity findings from the round-2 audit that
were inadvertently left out of the first Medium-severity fix — the original
synthesis report listed 13 Medium findings, and only 9 were addressed there.
This closes the gap:

- **`InvalidTenantIdError` was dead code.** It was exported and documented
  as "thrown for a malformed tenant id," but nothing in this module
  actually threw it — `createTenantMiddleware` deliberately responds via
  `onMissing` instead of throwing, and nothing else validated a tenant id
  at all. Added `assertValidTenantId(tenantId, validate?)`, the real throw
  site this error class needed — for non-HTTP call sites (background jobs,
  queue consumers, RPC/GraphQL resolvers) that want exception-based
  validation instead of a response, mirroring `assertNotRateLimited`'s role
  for rate limiting.
- **`FORCE ROW LEVEL SECURITY`'s docs never mentioned the superuser/
  `BYPASSRLS` bypass.** They correctly explain that `FORCE` closes the
  table-_owner_ bypass, but never mention that Postgres superusers and any
  role granted `BYPASSRLS` skip RLS enforcement unconditionally regardless
  of `FORCE` — verified live. That's a real false-sense-of-security gap for
  exactly the scenario the docs use as their own motivating example
  (privileged batch jobs, admin tooling). Both `generateEnableRlsSql`'s
  JSDoc and `docs/row-level-security.md` now call this out explicitly.
- **RLS `roles` as a non-array crashed with a raw `TypeError`, not
  `InvalidSqlIdentifierError`.** `roles` is typed `string[]`, but that's
  erased at runtime the same way `command`'s union type was (fixed in the
  Critical finding) — a caller bypassing it (an `as` cast, a config file, a
  non-TS consumer) reached a raw `TypeError` instead of this module's
  documented error contract: a non-iterable `roles` (a number, a plain
  object) threw `"... is not iterable"` from the `for...of` loop, and even
  a bare _string_ silently iterated character-by-character before throwing
  its own raw `TypeError` at `.map()`. Both verified live before the fix.
  `generateTenantIsolationPolicySql` now validates `Array.isArray(roles)`
  up front, throwing `InvalidSqlIdentifierError` like everything else this
  module rejects.
- **The master-secret length check reads like an entropy guarantee, but
  isn't one.** `EnvKeyProvider`'s `>= 16 bytes` check only catches an
  obvious placeholder or typo — it can't and doesn't certify the secret as
  cryptographically strong (16 zero bytes passes it and is exactly as
  guessable as it looks). Clarified in both the JSDoc and
  `docs/encryption.md` that this is a length floor, not an entropy floor,
  and that the real secret should come from a CSPRNG and a real secrets
  manager.

New public export: `assertValidTenantId` (from `/tenant` and the root) —
hence the minor bump. Everything else here is docs/JSDoc plus one runtime
validation fix with no new API surface.
