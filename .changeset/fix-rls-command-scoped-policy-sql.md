---
'@novavey/multi-tenant-security-kit': patch
---

Fix `generateTenantIsolationPolicySql` producing SQL Postgres rejects for
`command` values other than `ALL`/`UPDATE`. Postgres only accepts `WITH
CHECK` on `INSERT`/`UPDATE`/`ALL` policies and only accepts `USING` on
`SELECT`/`UPDATE`/`DELETE`/`ALL` policies — this module was emitting both
clauses unconditionally, so calling it with `command: 'SELECT'`,
`'INSERT'`, or `'DELETE'` (all documented, supported values) produced a
`CREATE POLICY` statement that failed outright against a real database.

Now the emitted clauses match `command`:

| `command`        | `USING` | `WITH CHECK` |
| ----------------- | ------- | ------------ |
| `ALL` (default)    | yes     | yes          |
| `SELECT`           | yes     | —            |
| `INSERT`           | —       | yes          |
| `UPDATE`           | yes     | yes          |
| `DELETE`           | yes     | —            |

No change for the default (`ALL`) or `UPDATE` — the generated SQL for
those two was already correct. If you called this function directly with
`command: 'SELECT' | 'INSERT' | 'DELETE'` and were seeing (or working
around) a Postgres syntax/semantics error from the generated policy, that
workaround is no longer needed.
