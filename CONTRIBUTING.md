# Contributing

Thanks for your interest in contributing to `@novavey/multi-tenant-security-kit`.

## Prerequisites

- Node.js as pinned in [`.nvmrc`](./.nvmrc) (use `nvm use` if you have nvm installed)
- npm (this repo uses npm, not yarn/pnpm — a committed `package-lock.json` is
  the source of truth for dependency versions)

## Local setup

```sh
git clone https://github.com/NovaVey/multi-tenant-security-kit.git
cd multi-tenant-security-kit
npm install
```

## Codebase organization

Each security module lives in its own subdirectory under `src/`, with a
barrel `index.ts` that defines its public API:

```
src/
  tenant/
  rbac/
  rate-limit/
  audit/
  rls/
  crypto/
  http/
  errors.ts
  index.ts
```

Tests mirror this layout under `test/`, one directory per module. New code
should follow the same pattern: add or extend a module's directory and its
`index.ts` barrel, and add matching tests under `test/<module>/`.

## Before you push

Run the full verification gate — the same command CI runs:

```sh
npm run verify
```

This runs, in order: `format:check`, `lint`, `typecheck`, `test`, and
`build`. A PR won't pass CI unless this passes locally first.

## Commit messages

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add per-tenant token bucket rate limiter
fix(rbac): correctly resolve inherited role permissions
```

Common prefixes: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.

## Branch / PR workflow

- Branch off `main`.
- Open a pull request against `main`.
- CI must be green before merging (see branch protection rules); required
  approvals is currently 0 for this solo-maintained repo, but the PR + green
  CI requirement itself is never skipped, including for the maintainer.
- Prefer small, focused PRs over large multi-purpose ones — they're easier
  to review and safer to release.
- Dependabot PRs are a partial exception: low-risk updates (npm
  devDependency minor/patch, `github-actions` minor/patch) merge themselves
  automatically once CI passes — see
  [`docs/github-governance.md`](./docs/github-governance.md). Anything
  riskier (major bumps, production dependencies) still shows up as a normal
  PR waiting for review.

## How a release happens

Releases are cut by a maintainer, not by contributors:

1. A maintainer bumps the `version` field in `package.json` following
   [semver](https://semver.org/), and merges that change to `main`.
2. The maintainer pushes a matching git tag, e.g. `v0.2.0`.
3. Pushing the tag triggers [`.github/workflows/release.yml`](./.github/workflows/release.yml),
   which runs the full verify gate, publishes the package to npm, and cuts a
   GitHub Release automatically.

Contributors don't need to do anything release-related — just get changes
merged to `main`.

## Reporting bugs / requesting features

Please use the issue templates:

- [Bug report](./.github/ISSUE_TEMPLATE/bug_report.yml)
- [Feature request](./.github/ISSUE_TEMPLATE/feature_request.yml)

For security vulnerabilities, do **not** open a public issue — see
[SECURITY.md](./SECURITY.md) instead.
