---
'@novavey/multi-tenant-security-kit': patch
---

Fixed `package.json`'s `homepage`, `bugs.url`, and `repository.url` (and a
JSDoc `@link` in `src/rbac/middleware.ts`) to use the repository's correct
case, `NovaVey/Multi-Tenant-Security-Kit`, instead of an all-lowercase
variant. GitHub's own routing is case-insensitive so this never broke
anything on github.com, but it broke the OpenSSF Scorecard badge/viewer
link in `README.md` — `scorecard.dev`'s lookup is case-sensitive and
returned "invalid repo path" for the lowercase form. Fixed the same casing
across every other reference repo-wide (docs, issue templates,
`CONTRIBUTING.md`'s clone command).
