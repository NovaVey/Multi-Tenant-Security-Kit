# GitHub Repository Governance Checklist

This is a manual, one-time setup checklist for a repository admin. None of it
can be applied by pushing a commit — branch protection, secrets, and
repository-level security settings live in GitHub's settings UI / API, not in
the git tree. Work through these steps in order after the initial files in
this repo (workflows, `CODEOWNERS`, `dependabot.yml`, etc.) have been pushed
to `main`.

This repo is set up at the **Standard** governance tier: required CI checks
and one review before merge, with the security audit job kept advisory
rather than blocking. Step 5 describes the upgrade path to a stricter tier.

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
  - Require approvals: **1**. (A solo maintainer can later drop this to 0,
    but should keep "require a pull request before merging" itself enabled
    so that required status checks still gate every merge.)
- **Require status checks to pass before merging**
  - **Require branches to be up to date before merging**
  - Once each check has run at least once on a PR (open any PR to trigger
    them), select these exact checks — the job names come directly from
    `.github/workflows/ci.yml`:
    - `lint-and-typecheck`
    - `test (18.18.0)`
    - `test (20)`
    - `test (22)`
    - `build`
  - Do **not** add `security-audit` to this list — it's intentionally
    advisory (`continue-on-error: true` in the workflow) under the Standard
    tier this repo uses. See Step 5 for the upgrade path.
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

## Step 4 — Code security and analysis

**Settings -> Code security and analysis**

- Enable **Dependabot security updates** (this is separate from the
  version-update configuration already committed in
  `.github/dependabot.yml` — security updates react to published
  advisories, version updates are the weekly scheduled bumps).
- Enable **Secret scanning** and **Push protection**, if available on your
  plan.

## Step 5 — Upgrade path (optional, not done today)

If this project's risk profile grows (more contributors, wider adoption,
handling sensitive data), consider moving to a stricter governance tier:

- Require **2** approving reviews instead of 1.
- Add a CodeQL analysis workflow.
- Require signed commits.
- Promote `security-audit` from advisory to a required status check.

This is listed here as a deliberate future option — none of it is configured
as part of this initial setup.

---

This checklist exists because these are GitHub repository settings, not
files in this repository, so they can't be applied by pushing a commit — an
admin needs to click through them once.
