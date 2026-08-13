# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.1] - 2026-08-13

### Fixed

- **Critical: the active-tenant context was not actually shared across the
  package's public entry points.** Every entry point (`.`, `./tenant`,
  `./rbac`, `./rate-limit`, `./audit`, `./rls`, `./crypto`) was built as an
  independently-bundled file, each inlining its own separate copy of the
  `AsyncLocalStorage` singleton in `tenant/context.ts`. Any usage mixing
  more than one entry point — including this README's own Quickstart
  example — silently talked to different storages: tenant context set via
  `createTenantMiddleware` (`./tenant`) was invisible to
  `subjectFromRequestRoles` (`./rbac`) and the default tenant resolution in
  `createRateLimitMiddleware` (`./rate-limit`), both of which threw
  `TenantContextError` on every call. Fixed by switching the build
  (`tsup.config.ts`) from bundling each entry independently to
  `bundle: false` with every source file as its own entry, so Node's own
  module cache (the ESM registry / the CJS `require` cache, both keyed by
  resolved file path) guarantees `tenant/context.ts` loads exactly once per
  process regardless of which entry point is imported. A permanent
  regression test (`scripts/verify-dist-singleton.mjs`, run via
  `npm run verify:dist`) now runs against the built `dist/` output as part
  of `npm run verify` — and therefore CI's `build` job and the release
  workflow — since this class of bug only exists in bundled output and is
  invisible to source-level tests.

### Added

- Dependabot auto-merge (`.github/workflows/dependabot-auto-merge.yml`) for
  the low-risk subset of dependency bumps only: npm devDependency
  minor/patch updates and `github-actions` minor/patch updates. Any
  semver-major bump, and any npm production-dependency bump, is never
  auto-merged — those stay normal PRs for manual review. Requires "Allow
  auto-merge" enabled under Settings -> General (see
  `docs/github-governance.md`, Step 4).

## [0.1.0] - 2026-08-13

### Added

- **`tenant`** — `AsyncLocalStorage`-based tenant context (`runWithTenant`,
  `getCurrentTenant(Id)`, `requireCurrentTenant(Id)`), cross-tenant isolation
  guards (`assertSameTenant`, `assertTenantMatches`, `scopeToTenant`), and
  request-scoping middleware with header/subdomain/claim resolvers.
- **`rbac`** — `RbacPolicy` with role inheritance and wildcard permission
  matching, `requirePermission` middleware, `subjectFromRequestRoles` helper.
- **`rate-limit`** — per-tenant token-bucket rate limiting
  (`TenantRateLimiter`, `MemoryRateLimitStore`), Express middleware setting
  `RateLimit-*` response headers, `assertNotRateLimited` for non-HTTP call
  sites, and a pluggable `RateLimitStore` interface for Redis/etc.
- **`audit`** — `AuditLogger` fanning events out to multiple `AuditSink`s
  with per-sink error isolation, `ConsoleAuditSink`/`InMemoryAuditSink`/
  `callbackAuditSink`, event redaction, and `child()` loggers.
- **`rls`** — Postgres row-level-security SQL generation
  (`generateEnableRlsSql`, `generateTenantIsolationPolicySql`,
  `generateSetTenantContextSql`, `tenantWhereClause`,
  `generateTenantIsolationMigration`), with strict identifier validation and
  zero database-client dependencies.
- **`crypto`** — per-tenant AES-256-GCM encryption (`TenantEncryptor`) with
  HKDF-derived keys from a single master secret (`EnvKeyProvider`), a
  pluggable `KeyProvider` interface for real KMS integration, and
  `StaticKeyProvider` for tests.
- Shared error hierarchy (`SecurityKitError` and typed subclasses) used
  consistently across every module.
- Full test suite (250+ tests) and dual ESM/CJS build with type declarations.
- Minimum supported Node.js version is **20.19** (`engines.node`, CI matrix,
  `.nvmrc`). `vitest@4`/`vite`/`rolldown` — pulled in to fix real CVEs in an
  older `vitest`/`esbuild` — hard-require Node 20.19+/22.13+/24+ and cannot
  start on Node 18 at all; Node 18 has also been end-of-life since April 2025. An earlier draft of this package targeted Node >=18.18; that was
  narrowed before the first release once CI caught the incompatibility.
- GitHub governance: CI (lint, typecheck, multi-version test matrix, build,
  advisory `npm audit`), tag-triggered release automation with npm
  provenance, CODEOWNERS, Dependabot (npm + GitHub Actions), issue/PR
  templates, `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and a
  manual branch-protection setup checklist
  (`docs/github-governance.md`).

[Unreleased]: https://github.com/NovaVey/multi-tenant-security-kit/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/NovaVey/multi-tenant-security-kit/releases/tag/v0.1.1
[0.1.0]: https://github.com/NovaVey/multi-tenant-security-kit/releases/tag/v0.1.0
