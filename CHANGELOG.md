# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.2] - 2026-08-13

### Fixed

- **`MinimalRequest`/`MinimalResponse` silently broke Express type-compatibility.**
  Both had a `[key: string]: unknown` index signature (meant to document
  that frameworks attach arbitrary properties like `req.user`), but
  TypeScript only lets a _declared_ type (like `express.Request`) satisfy a
  target type that has an index signature if the declared type also has a
  matching one — and Express's own types don't. The result: every
  documented Express usage (`app.use(createTenantMiddleware(...))`,
  `app.use(createRateLimitMiddleware(...))`, `app.use(requirePermission(...))`)
  failed `tsc --noEmit` under strict TypeScript, including this README's own
  Quickstart and `examples/express-basic.ts` — never caught by CI, since
  `examples/` is excluded from typecheck by design. Found via a full
  doc-sweep that type-checks every documented code sample against the real
  published package rather than trusting source-level tests or review, the
  same lesson that produced 0.1.1's fix. Fixed by dropping the index
  signature; the one place that needed dynamic property access internally
  (`subjectFromRequestRoles`) now casts through `Record<string, unknown>`
  locally instead of widening the public type.
- `AuditSinkError` (`/audit`), `TenantContextError`/`CrossTenantAccessError`/
  `InvalidTenantIdError` (`/tenant`), `ForbiddenError`/`RbacConfigurationError`
  (`/rbac`), `RateLimitExceededError` (`/rate-limit`), and `DecryptionError`
  (`/crypto`) are now re-exported from the subpath whose own public API
  throws them, not just the package root — e.g. `onSinkError: (error:
AuditSinkError) => ...`, as shown in docs/audit-logging.md, previously
  failed to type-check when only `/audit` was imported.
- `docs/rate-limiting.md`'s Redis store example had an empty method body
  with a non-`void` return type, which doesn't compile as literally
  written; replaced with a throwing stub pointing at the new full reference
  implementation (see Added, below). Its `points`/`getTenantId` callback
  examples now show the explicit `<express.Request>` type argument needed
  to access framework-specific properties (`req.path`, `req.params`) —
  these middleware factories are generic over the request type and default
  to the framework-agnostic `MinimalRequest`, which doesn't have them.
- `docs/rbac.md`'s custom `SubjectResolver` example imported
  `requireCurrentTenantId` from `/rbac`; it's exported from `/tenant`.
- `docs/tenant-isolation.md` and `docs/rate-limiting.md`: two route-param
  lookups now coerce with `String(...)` — Express 5 types `req.params[key]`
  as `string | string[]` (to support repeated-segment patterns), which
  doesn't assign to a plain `string` parameter as literally written.

### Added

- CodeQL static analysis (`.github/workflows/codeql.yml`) — runs on every
  push/PR to `main` plus a weekly schedule, reporting to the repo's Security
  -> Code scanning alerts tab. Kept advisory (not a required status check),
  matching this repo's Standard governance tier; see
  `docs/github-governance.md` Step 6 for the (deliberately manual) option to
  promote it.
- `examples/fastify-basic.ts` and `examples/koa-basic.ts` — tenant +
  rate-limit middleware wired into Fastify and Koa, each with a small,
  verified request/response adapter (neither framework's native
  request/response type matches `MinimalRequest`/`MinimalResponse` closely
  enough to skip one, unlike Express).
- `examples/nextjs-route-handler.ts` — the same tenant/rate-limit/RBAC
  behavior inside a Next.js Route Handler, calling `runWithTenant()`,
  `TenantRateLimiter.consume()`, and `RbacPolicy.assert()` directly instead
  of through `Middleware`, since Route Handlers use the Web Fetch API's
  `Request`/`Response` rather than an Express-shaped `(req, res, next)`.
  Notes the Node.js-runtime requirement (`AsyncLocalStorage` needs it, Route
  Handlers use it by default, root `middleware.ts` does not).
- `examples/redis-rate-limit-store.ts` — a full, verified reference
  `RateLimitStore` implementation backed by Redis: an atomic Lua-scripted
  token bucket (via `ioredis`'s `defineCommand`) mirroring
  `MemoryRateLimitStore`'s refill math exactly, for multi-instance
  deployments. Linked from `docs/rate-limiting.md`'s "Scaling past one
  process" section.

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

[Unreleased]: https://github.com/NovaVey/multi-tenant-security-kit/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/NovaVey/multi-tenant-security-kit/releases/tag/v0.1.2
[0.1.1]: https://github.com/NovaVey/multi-tenant-security-kit/releases/tag/v0.1.1
[0.1.0]: https://github.com/NovaVey/multi-tenant-security-kit/releases/tag/v0.1.0
