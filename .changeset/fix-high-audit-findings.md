---
'@novavey/multi-tenant-security-kit': minor
---

Fixes all 7 High-severity findings from a fresh, independent audit that
re-verified every prior fix from scratch (Phase 2 of a phased rollout,
following the Critical RLS `command` injection fix):

- **`AuditLogger` could crash the whole host process.** `writeToSink`'s
  error path read `sink.constructor.name` unconditionally — a spec-compliant
  `AuditSink` built via `Object.create(null)` has no `.constructor`, so a
  throwing/rejecting sink of that shape caused a second, unhandled error:
  escaping `log()` directly (contradicting its "never throws" guarantee) for
  a synchronous throw, or becoming an unhandled promise rejection (which
  terminates the process by default) for an async rejection. Now falls back
  to a safe default name instead of throwing.
- **`crypto`'s `EnvKeyProvider` and internal key-length guard threw bare
  `TypeError`s**, breaking this package's "every error extends
  `SecurityKitError`" contract — reachable through the documented
  `KeyProvider` extension point (a custom KMS integration), not just a
  hypothetical. Both now throw the new `InvalidKeyError`.
- **`TenantEncryptor.decrypt()` never validated the auth tag's length**,
  so a caller-supplied `EncryptedPayload` with a truncated GCM tag (as short
  as 4 bytes — `node:crypto` accepts any NIST SP 800-38D-legal length) was
  authenticated at far weaker odds than the 128 bits this module documents.
  Now rejected explicitly (wrapped in `DecryptionError`, same as any other
  decryption failure).
- **`TenantRateLimiter`'s `limit`/`windowMs` and `MemoryRateLimitStore`'s
  `maxBuckets` were never validated**, unlike `points`. A `windowMs` of `0`
  or a `maxBuckets` of `0` each fully and silently disabled rate limiting —
  demonstrated live before this fix. Both constructors now throw the new
  `RateLimitConfigurationError` for a non-positive/non-finite value.
- **`assertTenantMatches` couldn't accept a real domain type without a
  cast.** Its `TenantScoped` parameter type carries an index signature
  (needed so `scopeToTenant` can accept a plain object literal), and
  TypeScript only lets a _declared_ type (a named interface, an ORM model)
  satisfy an index-signature target if the declared type also has one —
  which real domain types essentially never do. This broke the project's
  own flagship example (`examples/express-basic.ts` didn't compile under
  its own strict settings) — the same class of bug already fixed once for
  `MinimalRequest` in `0.1.2`. `assertTenantMatches` now takes
  `Pick<TenantScoped, 'tenantId'>` instead, accepting any object with a
  `tenantId` field with no cast required; `scopeToTenant`'s literal-argument
  usage is unaffected.
- **`docs/auth-integrations.md`'s code samples didn't actually compile.**
  The doc-examples mirror silently added type casts (`req as Request &
{roles?: string[]}`) that never appeared in the prose readers copy-paste,
  so following the guide verbatim hit a real compile error. Fixed by adding
  the missing `declare global { namespace Express { interface Request {...
} } }` augmentation the samples actually need, shown once in the doc and
  mirrored exactly in `doc-examples/typecheck/auth-integrations.ts`.

New public exports: `InvalidKeyError` (from `/crypto` and the root),
`RateLimitConfigurationError` (from `/rate-limit` and the root) — hence the
minor bump.
