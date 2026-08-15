---
'@novavey/multi-tenant-security-kit': patch
---

**Critical fix:** `generateTenantIsolationPolicySql`'s `command` option was
spliced directly into the generated `CREATE POLICY ... FOR ${command}` SQL
text with no runtime validation — only its TypeScript union type
(`'ALL' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'`) constrained it, and
that's erased at runtime. A caller bypassing the type (an `as` cast, a
config file, a non-TS consumer) could inject arbitrary SQL, up to and
including additional statements (`'SELECT;\nDROP TABLE victim;--'`).

Every other value this function accepts (`table`, `tenantColumn`,
`policyName`, `sessionSetting`, each entry of `roles`) was already validated
before being interpolated; `command` now goes through the same
allowlist-or-reject pattern, throwing `InvalidSqlIdentifierError` for
anything outside the five values Postgres's `CREATE POLICY` grammar
actually accepts.

Found via a fresh, independent audit that re-verified every prior fix from
scratch rather than assuming it held, and demonstrated the exploit against
a live Postgres instance before this fix was written.
