---
'@novavey/multi-tenant-security-kit': patch
---

Fix two public-API consistency gaps found while preparing for 1.0 (see `docs/versioning-policy.md`, new in this release):

- The `rls` module's identifier validation (`generateEnableRlsSql`, `generateTenantIsolationPolicySql`, `generateSetTenantContextSql`, `tenantWhereClause`, `generateTenantIsolationMigration`) now throws `InvalidSqlIdentifierError` (`code: 'INVALID_SQL_IDENTIFIER'`) instead of a plain `TypeError`. Every other module's errors already extended the shared `SecurityKitError` base with a stable `.code`; `rls` was the one outlier, breaking the "every error this kit throws has a stable `.code`" promise `src/errors.ts`'s own doc comment already made.
- `SecurityKitError` (the shared base class) is now re-exported from every subpath barrel (`/tenant`, `/rbac`, `/rate-limit`, `/audit`, `/rls`, `/crypto`), not just the package root, matching how each module already re-exports its own specific error classes. A consumer importing only one subpath can now `catch (e) { if (e instanceof SecurityKitError) ... }` without an extra root import.
