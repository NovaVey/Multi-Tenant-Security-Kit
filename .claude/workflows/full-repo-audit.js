export const meta = {
  name: 'full-repo-audit',
  description:
    'Adversarial multi-dimension review of the whole library (one reviewer per module plus cross-cutting concerns), independent verification of every finding, and a synthesized report. Finds and reports only — does not fix.',
  whenToUse:
    'Periodic maintenance pass (new dependency majors, a stretch of unreviewed changes, before a release) or on demand. This codebase has already been through two full independent audit rounds with every severity tier fixed — this workflow exists to catch drift and genuinely new issues, not to re-litigate settled ground. Each reviewer is told that explicitly and instructed to hold a high bar: report something only if it is a real, reachable defect with a concrete failure scenario, not a stylistic preference.',
  phases: [
    {
      title: 'Review',
      detail: 'one agent per module + three cross-cutting dimensions, in parallel',
    },
    {
      title: 'Verify',
      detail: 'one independent skeptic per finding, instructed to actually try to refute it live',
    },
    { title: 'Report', detail: 'synthesize confirmed findings into a single ranked report' },
  ],
};

const BASELINE = `Context: @novavey/multi-tenant-security-kit is a published, framework-agnostic
TypeScript security library (tenant isolation, RBAC, per-tenant rate limiting, audit
logging, Postgres row-level security helpers, per-tenant encryption). Zero runtime
dependencies by design — every module is pure/stateless except where a caller
explicitly hands it a Postgres client or similar. It has already been through two
full independent adversarial audit rounds (Critical/High/Medium/Low, all fixed) plus
ongoing Dependabot-driven dependency hygiene. Do not re-report anything already
covered by that history unless you have live evidence it regressed.

Ground rules for this review:
- Read the actual current source under the path(s) given below — do not rely on any
  prior summary of this codebase, including your own training data about it.
- Prefer verifying claims by actually running something (a test, a throwaway node/tsx
  script, \`npm test\`/\`npm run typecheck\`/\`npm run lint\` on the real repo at
  /home/user/Multi-Tenant-Security-Kit) over reasoning about code in the abstract.
  A local Postgres 16 instance is available via \`sudo -u postgres psql\` if a finding
  needs real-Postgres verification (RLS SQL generation, identifier truncation, etc.).
- A finding needs a concrete, reachable failure scenario: specific inputs or call
  sequence -> specific wrong behavior. "This could theoretically..." with no concrete
  trigger is not a finding.
- High bar: this is mature, twice-audited code. If you find nothing real, report zero
  findings — do not manufacture something to seem productive. Quality over count.
- For each real finding, report: title, severity (critical/high/medium/low), the exact
  file and location, a one-paragraph summary, and the concrete failure scenario
  (inputs/state -> wrong output or crash).`;

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          file: { type: 'string' },
          summary: { type: 'string' },
          failureScenario: { type: 'string' },
        },
        required: ['title', 'severity', 'file', 'summary', 'failureScenario'],
      },
    },
  },
  required: ['findings'],
};

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    refuted: { type: 'boolean' },
    reasoning: { type: 'string' },
  },
  required: ['refuted', 'reasoning'],
};

const DIMENSIONS = [
  {
    key: 'tenant',
    prompt: `${BASELINE}\n\nReview src/tenant/** (context.ts, guard.ts, middleware.ts, types.ts) in /home/user/Multi-Tenant-Security-Kit. Focus: AsyncLocalStorage context propagation correctness across async boundaries, the tenant-resolver factories (header/subdomain/claim), assertSameTenant/scopeToTenant's cross-tenant guarantees, and assertValidTenantId. Try to find a real way tenant isolation could be bypassed or a context leak between requests.`,
  },
  {
    key: 'rbac',
    prompt: `${BASELINE}\n\nReview src/rbac/** (policy.ts, middleware.ts, types.ts) in /home/user/Multi-Tenant-Security-Kit. Focus: role-inheritance resolution correctness (cycles, diamond inheritance), the defensive-copy/freeze behavior on construction, requirePermission's fail-closed behavior on malformed input, and subjectFromRequestRoles' handling of attacker-controlled role strings.`,
  },
  {
    key: 'rate-limit',
    prompt: `${BASELINE}\n\nReview src/rate-limit/** (limiter.ts, memory-store.ts, middleware.ts, types.ts) in /home/user/Multi-Tenant-Security-Kit. Focus: MemoryRateLimitStore's bucket bookkeeping and unbounded-growth guards, TenantRateLimiter's config validation, race conditions between concurrent consume() calls, and non-finite/adversarial resetMs handling in the middleware layer.`,
  },
  {
    key: 'audit',
    prompt: `${BASELINE}\n\nReview src/audit/** (logger.ts, sinks.ts, otel.ts, types.ts) in /home/user/Multi-Tenant-Security-Kit. Focus: AuditLogger.writeToSink's error handling (sync throw, rejected promise, cross-realm thenable), the redact hook's guarantees, and openTelemetrySink/traceContextTransform's behavior when no active span exists.`,
  },
  {
    key: 'rls',
    prompt: `${BASELINE}\n\nReview src/rls/** (postgres.ts, types.ts) in /home/user/Multi-Tenant-Security-Kit. Focus: SQL-identifier validation and quoting (injection via table/column/role names, the 63-char Postgres identifier-length truncation, the PUBLIC pseudo-role special case), and whether every generated SQL statement is actually safe against a malicious tenantId/identifier. Verify at least one case against the real local Postgres if you find anything suspicious.`,
  },
  {
    key: 'crypto',
    prompt: `${BASELINE}\n\nReview src/crypto/** (tenant-keys.ts, types.ts) in /home/user/Multi-Tenant-Security-Kit. Focus: EnvKeyProvider/StaticKeyProvider key derivation and length enforcement, encrypt()/decrypt()'s IV/authTag handling, tenantId binding (can ciphertext from one tenant ever decrypt under another tenant's key/AAD?), and error-wrapping consistency (EncryptionError/DecryptionError never leaking a raw crypto error).`,
  },
  {
    key: 'types-and-errors',
    prompt: `${BASELINE}\n\nCross-cutting review of src/errors.ts and type-soundness across all of src/ in /home/user/Multi-Tenant-Security-Kit. Focus: every exported error class's code/fields are consistent and match docs; grep for \`as \`/\`any\`/non-null assertions (\`!\`) across src/ and judge whether each one is actually sound or hides a real unsoundness; confirm every subpath's exported error classes match what its docs/*.md claims.`,
  },
  {
    key: 'docs-accuracy',
    prompt: `${BASELINE}\n\nCross-cutting review of docs/*.md and README.md in /home/user/Multi-Tenant-Security-Kit against the actual current src/ behavior. \`npm run verify:docs\` only typechecks the doc-examples snippets — it does not check that prose claims are still true. Look for a documented behavior, guarantee, or API signature that has drifted from what the code actually does now.`,
  },
  {
    key: 'ci-and-release',
    prompt: `${BASELINE}\n\nCross-cutting review of .github/workflows/*.yml, .github/dependabot.yml, package.json's scripts/exports/publishConfig, and docs/github-governance.md in /home/user/Multi-Tenant-Security-Kit. Focus: whether the documented governance checklist still matches what's actually committed (job names required-check lists still reference, action pins, permissions), and whether the changesets release pipeline still has no real gap (a scenario where a version could publish without npm registry confirmation, or a step that fails silently).`,
  },
];

phase('Review');
const reviewed = await pipeline(
  DIMENSIONS,
  (d) => agent(d.prompt, { label: `review:${d.key}`, phase: 'Review', schema: REVIEW_SCHEMA }),
  (review, d) =>
    parallel(
      (review?.findings ?? []).map(
        (f) => () =>
          agent(
            `Adversarially try to REFUTE this finding against the real, current codebase at /home/user/Multi-Tenant-Security-Kit. Default to refuted:true if you cannot reproduce it live. Do not just re-read the reasoning below — independently re-derive it against the actual source and, wherever feasible, actually run something (a script, a test, a real Postgres check) to confirm or refute.\n\nFinding: "${f.title}" (dimension: ${d.key}, claimed severity: ${f.severity})\nFile: ${f.file}\nSummary: ${f.summary}\nClaimed failure scenario: ${f.failureScenario}`,
            { label: `verify:${d.key}`, phase: 'Verify', schema: VERDICT_SCHEMA },
          ).then((v) => ({ ...f, dimension: d.key, verdict: v })),
      ),
    ),
);

const confirmed = reviewed
  .flat()
  .filter(Boolean)
  .filter((f) => f.verdict && f.verdict.refuted === false);

log(`${confirmed.length} finding(s) survived adversarial verification.`);

phase('Report');
const report = confirmed.length
  ? await agent(
      `Synthesize this list of independently-verified findings from a full-repo audit of /home/user/Multi-Tenant-Security-Kit into one clean report: group by severity (critical first), for each finding restate the title/file/failure scenario concisely and note which dimension found it and the verifier's own reasoning for why it survived. End with a short recommended next step (e.g. "phase these into PRs by severity, same as the two prior audit rounds"). Findings JSON:\n\n${JSON.stringify(confirmed, null, 2)}`,
      { label: 'synthesize-report' },
    )
  : 'No findings survived independent adversarial verification. The codebase remains clean as of this run.';

return { findingsCount: confirmed.length, findings: confirmed, report };
