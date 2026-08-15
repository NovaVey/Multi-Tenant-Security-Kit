---
'@novavey/multi-tenant-security-kit': minor
---

Fixes all 18 LOW-severity findings from the round-2 audit — the final tier
of a fully independent, adversarial re-audit that re-verified every prior
fix from scratch (following the Critical RLS injection fix, the 7 High
fixes, and all 13 Medium fixes):

- **`crypto` module hardening**: `decrypt()` now validates the decoded
  `iv`'s length explicitly (12 bytes), matching the existing `authTag`
  check — a wrong-length `iv` already failed safe on its own (GCM's tag
  verification catches it), so this is about a clear, deterministic failure
  reason rather than closing a real gap. `StaticKeyProvider` now throws
  `InvalidKeyError` instead of a plain `Error` for an unconfigured tenant —
  its own docs endorse it for real small deployments, not just
  tests/fixtures, so this is a genuinely reachable production failure that
  needs the same typed-error guarantee as everything else. `encrypt()`/
  `decrypt()` both reject an empty-string `tenantId` (`InvalidTenantIdError`)
  rather than silently deriving/using a real key for "the tenant with no
  id". `assertKeyLength` now checks `Buffer.isBuffer` in addition to
  `.length`, catching a `KeyProvider` returning a non-Buffer value that
  merely has the right `.length`. `encrypt()` now wraps any underlying
  `node:crypto` cipher failure in the new `EncryptionError` — the
  `encrypt`-side counterpart to `decrypt()`'s existing `DecryptionError`
  wrapping, for consistency (this path is essentially unreachable under
  normal use, unlike decryption, which has an authentication step that can
  legitimately fail).
- **`AuditLogger`'s cross-realm promise detection**: `writeToSink` used
  `result instanceof Promise` to decide whether to await/catch a sink's
  return value — but `Promise` bindings are per-realm, so a genuine
  thenable from a different realm (a `node:vm` context; historically also
  an iframe/Worker) fails `instanceof Promise` in the current realm even
  though it's a real, spec-compliant promise. That used to make a rejecting
  cross-realm thenable look synchronous: `onSinkError` never fired, and the
  rejection still surfaced as a genuinely unhandled rejection. Fixed by
  duck-typing on `.then` instead, verified live with a real `node:vm`
  context.
- **RLS module**: identifiers are now also validated against Postgres's own
  63-character `max_identifier_length` (Postgres doesn't reject an
  over-long identifier, it silently _truncates_ it — two different
  intended identifiers sharing the same first 63 characters would silently
  collide into the same actual table/column/policy name). The `PUBLIC`
  pseudo-role (Postgres's "every role" keyword) is now emitted unquoted in
  a `TO` clause instead of getting the same double-quoting every other
  identifier gets — quoting it changes its meaning: `TO "PUBLIC"` asks
  Postgres for an actual role literally named "PUBLIC", which essentially
  never exists, so the generated SQL failed at _execution_ time, not
  generation time — both verified live against a real Postgres instance.
- **`RbacPolicy` now defensively copies (and freezes) constructor input**:
  it used to store each `RoleDefinition` by reference, so a caller mutating
  their own `roleDefinitions` array's `permissions`/`inherits` _after_
  construction — before that role's first resolution — silently changed an
  already-built policy's behavior, contradicting its own "instances are
  immutable" docs (verified live before this fix). `RoleDefinition`'s
  `permissions`/`inherits` fields are now typed `readonly` to reflect this.
- **Rate limiting**: a non-finite `resetMs` (a custom `RateLimitStore`
  legitimately expressing "never resets" as `Infinity` — not producible by
  the built-in store once `TenantRateLimiter` validates its config, but
  `RateLimitStore` is a public extension point with no such guarantee) no
  longer leaks the literal string `"Infinity"`/`"NaN"` into the
  `RateLimit-Reset`/`Retry-After` response headers or `retryAfterMs` fields
  — clamped to a real, finite number instead.
- **Documentation accuracy and completeness**: `InvalidRateLimitPointsError`'s
  API-table row now shows its `.code`; `ForbiddenError`'s and the three
  `*TenantResolver` factories' differing parameter conventions are now
  explained as deliberate per-use-case fits rather than left as unexplained
  inconsistencies (no signature changes — avoiding a breaking change for
  a purely cosmetic finding); `AuditLogger`'s non-public second constructor
  parameter now carries an `@internal` tag recognized by TypeDoc-style
  tooling; `FORCE ROW LEVEL SECURITY`'s and the master-secret length
  check's documentation gaps (already fixed in the Medium-severity pass)
  round out consistently here; `docs/github-governance.md`'s intro
  paragraph no longer describes the Standard tier's "one review before
  merge" _documented default_ as if it were this repo's actual live
  setting (currently 0, solo maintainer) — now says so plainly, matching
  Step 2's own detail.
- **Tooling**: `tsconfig.json` gains `noImplicitReturns` (a free strictness
  win — the codebase already had zero violations); coverage thresholds
  raised from 80/80/75/80 to 95/95/90/95 (stmt/func/branch/line) to sit
  close to this package's actual ~98.5/99/96.5/99% coverage — the old
  thresholds wouldn't have caught a real regression until coverage dropped
  by roughly 20 points, not a meaningful safety net for a security-focused
  package; `release.yml` gains a comment explaining that `npm run verify`
  running twice per release (once explicitly, once implicitly via
  `prepublishOnly` when `npm publish` runs) is deliberate defense-in-depth,
  not an oversight to trim away.

New public export: `EncryptionError` (from `/crypto` and the root) — hence
the minor bump.
