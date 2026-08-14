---
'@novavey/multi-tenant-security-kit': major
---

First stable release. `1.0.0` marks the public API — everything reachable through this package's `exports` map (root plus the `/tenant`, `/rbac`, `/rate-limit`, `/audit`, `/rls`, `/crypto` subpaths) — as a stable contract: `error.code` values won't change or be removed without a major bump, and nothing gets removed or renamed without a full deprecation cycle first. See `docs/versioning-policy.md` for exactly what this commits to going forward.

No breaking changes from `0.3.0` — this is a version-number milestone, not a migration.
