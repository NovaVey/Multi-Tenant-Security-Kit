# GitHub Repository Governance Checklist

This is a manual, one-time setup checklist for a repository admin. None of it
can be applied by pushing a commit — branch protection, secrets, and
repository-level security settings live in GitHub's settings UI / API, not in
the git tree. Work through these steps in order after the initial files in
this repo (workflows, `CODEOWNERS`, `dependabot.yml`, etc.) have been pushed
to `main`.

This repo is set up at the **Standard** governance tier: required CI checks
and one review before merge, with the security audit job kept advisory
rather than blocking. Step 6 describes the upgrade path to a stricter tier.

## Step 1 — General settings

**Settings -> General**

- Confirm the default branch is `main`.
- Optionally enable **Automatically delete head branches** (keeps merged
  branches from piling up).

## Step 2 — Branch protection for `main`

**Settings -> Branches -> Add branch protection rule** (the newer
**Settings -> Rules -> Rulesets** UI covers the same functionality and is
also acceptable — use whichever is available on your plan).

Create a rule targeting `main` with:

- **Require a pull request before merging**
  - Require approvals: **1** is the documented default; this repo currently
    runs with it dropped to **0** (solo maintainer) — "require a pull
    request before merging" stays enabled either way, so required status
    checks still gate every merge regardless of the approval count.
  - **Allowed merge methods**: this repo is configured **squash-only**
    (uncheck "Merge commit" and "Rebase", leave only "Squash" checked) —
    keeps `main`'s history one commit per PR, which matters for an
    easily-auditable security library and for `dependabot-auto-merge.yml`
    (Step 4) always squashing.
- **Require status checks to pass before merging**
  - **Require branches to be up to date before merging**
  - Once each check has run at least once on a PR (open any PR to trigger
    them), select these exact checks — the job names come directly from
    `.github/workflows/ci.yml`:
    - `lint-and-typecheck`
    - `test (20)`
    - `test (22)`
    - `build`
  - **If you configured this before reading this note:** the CI matrix
    originally also tested Node `18.18.0`, and this repo's required-checks
    list may still have `test (18.18.0)` selected from that first pass. That
    check no longer exists — the matrix was narrowed to Node 20/22 after CI
    proved `vitest@4` (needed to fix real CVEs in an older `vitest`/`esbuild`)
    cannot run on Node 18 at all. A required check that will never report in
    again permanently blocks merging. Go back into the rule and **deselect
    `test (18.18.0)`** if it's still checked.
  - Do **not** add `security-audit` to this list — it's intentionally
    advisory (`continue-on-error: true` in the workflow) under the Standard
    tier this repo uses. See Step 6 for the upgrade path.
- **Require conversation resolution before merging**
- Disallow force pushes to `main`.
- Disallow branch deletion.
- Apply these restrictions to administrators too (don't exempt admins from
  the rule), so the same gates apply to everyone.

## Step 3 — Publishing secret

**Settings -> Secrets and variables -> Actions -> New repository secret**

Create a secret named exactly **`NPM_TOKEN`**, containing an npm
**Automation** access token with publish rights to the `@novavey` scope.

This is required before `.github/workflows/release.yml` can run
successfully — without it, the `npm publish` step fails authentication on
the first tagged release.

Reminder: the npm org/scope `@novavey` must already exist on npmjs.com, and
the npm account generating the token must have publish rights to it.

## Step 4 — Enable Dependabot auto-merge

**Settings -> General -> Pull Requests -> check "Allow auto-merge"**

`.github/workflows/dependabot-auto-merge.yml` calls `gh pr merge --auto`,
which fails outright unless this repository setting is on. It's off by
default and isn't part of any Ruleset — a separate toggle you have to find
under General settings specifically.

**What it actually auto-merges — deliberately narrow:**

- npm **devDependency** bumps that are **minor or patch** (the same
  `dev-dependencies-minor-patch` group already batched in
  `.github/dependabot.yml`).
- `github-actions` ecosystem bumps that are **minor or patch**.

**What it never touches:** any `semver-major` bump, and any npm
**production**-dependency bump (this package currently ships zero runtime
`dependencies`, but the workflow doesn't assume that stays true). Those PRs
are left exactly as a normal Dependabot PR — sitting there for you to
review and merge by hand.

Auto-merged PRs still go through the exact same branch protection as
everything else — required status checks must pass, squash-only — this
workflow only flips "merge automatically once green," it never bypasses a
required check. It also auto-approves the low-risk subset it merges, purely
so the workflow keeps working unmodified if you ever raise required
approvals above 0; it has no effect while approvals are 0.

## Step 5 — Code security and analysis

**Settings -> Code security and analysis**

- Enable **Dependabot security updates** (this is separate from the
  version-update configuration already committed in
  `.github/dependabot.yml` — security updates react to published
  advisories, version updates are the weekly scheduled bumps).
- Enable **Secret scanning** and **Push protection**, if available on your
  plan.

## Step 6 — Upgrade path

If this project's risk profile grows (more contributors, wider adoption,
handling sensitive data), consider moving further toward a stricter
governance tier:

- ~~Add a CodeQL analysis workflow.~~ **Done** — `.github/workflows/codeql.yml`
  runs on every push/PR to `main` plus a weekly schedule, and reports to the
  repo's Security -> Code scanning alerts tab. It's deliberately **not** in
  the required-status-checks list below (same advisory posture as
  `security-audit`) — add `Analyze (javascript-typescript)` there yourself if
  you want it to block merges.
- Require **2** approving reviews instead of 1. **Not done** — left for a
  solo maintainer to opt into if/when there's a second regular reviewer;
  forcing it now would just mean self-approving or bypassing the rule.
- Require signed commits. **Not done** — a real workflow-friction cost (every
  contributor needs a configured signing key) for a benefit that mostly
  matters once commits come from more than one trusted person.
- Promote `security-audit` from advisory to a required status check. **Not
  done** — `npm audit` can fail on a transitive dev-only advisory with no
  available fix, which would block every merge until upstream ships one;
  advisory keeps it visible without that failure mode.

The three "not done" items above are intentionally left as a manual choice
for whoever is running this repo, not something to silently flip on.

---

This checklist exists because these are GitHub repository settings, not
files in this repository, so they can't be applied by pushing a commit — an
admin needs to click through them once.
