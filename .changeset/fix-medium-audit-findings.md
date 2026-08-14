---
'@novavey/multi-tenant-security-kit': minor
---

Fix three Medium-severity issues found by a post-1.0 in-depth audit, plus
document a fourth pre-existing limitation.

**`TenantRateLimiter.consume()` now validates `points`.** A zero,
negative, `NaN`, or infinite `points` value previously reached
`MemoryRateLimitStore`'s arithmetic unchecked — zero/negative
unconditionally "succeeded" regardless of the tenant's actual remaining
budget, a real rate-limit bypass given this library's own "variable
request cost" feature explicitly invites deriving `points` from request
data. `consume()` now throws the new `InvalidRateLimitPointsError` for
any non-positive or non-finite `points`, before the store is ever called
— every `RateLimitStore` implementation gets this guarantee for free, not
just the built-in one.

**`MemoryRateLimitStore` no longer grows unboundedly.** It's deliberately
timer-free (see its own docs for why), so it couldn't previously expire
idle buckets on a schedule — every distinct key it had ever seen stayed in
memory forever, an unbounded-memory-growth vector if the key space is
reachable by unauthenticated request input. A new `maxBuckets` constructor
option (default `50_000`) bounds this via inline LRU eviction, checked on
each `consume()` call for a new key — no timers added. Also adds a
read-only `.size` getter for introspection/tests.

**`tenantWhereClause`'s `paramIndex` is now validated.** It was spliced
directly into the returned SQL text (`` `$${paramIndex}` ``) with no
validation — a non-integer value reaching this call through a
loosely-typed integration could inject arbitrary SQL text into the
placeholder position. Now throws `InvalidSqlIdentifierError` (the same
error this module already throws for every other value it refuses to
interpolate unchecked) unless `paramIndex` is a positive integer.

**Documented (no code change): RLS tenant columns must be `text`-typed.**
`generateTenantIsolationPolicySql`'s predicate compares the tenant column
against `current_setting(...)`, which always returns `text` — Postgres has
no implicit cast to `uuid`/`integer`/etc. for `=`, so `CREATE POLICY`
already failed outright (loudly, not a silent isolation gap) for a
non-text-typed tenant column. This was previously undocumented and easy to
hit with a realistic `uuid`-tenant-id schema; see "Non-text tenant
columns" in `docs/row-level-security.md` for the workaround.
