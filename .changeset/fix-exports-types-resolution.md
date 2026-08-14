---
'@novavey/multi-tenant-security-kit': patch
---

Fix broken TypeScript type resolution for every subpath export
(`/tenant`, `/rbac`, `/rate-limit`, `/audit`, `/rls`, `/crypto`, and the
root `.`) under some resolution modes. `tsup` emits two separate
declaration files per module — `index.d.ts` for ESM, `index.d.cts` for
CJS — but `package.json`'s `exports` map declared a single flat `types`
key shared across both `import`/`require` conditions, and had no
`typesVersions` fallback for classic (`moduleResolution: "node"`)
resolvers.

In practice this meant:

- Every subpath failed type resolution entirely under classic/`node10`
  resolution (`Cannot find module ... or its corresponding type
declarations`).
- Every entry point (including root) was flagged "masquerading as ESM"
  for CJS consumers under `node16`/`nodenext` resolution, since the
  unconditional `types` key always resolved to the ESM-flavored `.d.ts`
  regardless of whether the consumer was `require()`-ing the `.cjs` file.

This was types-only — real JS consumers were unaffected (the module-per-file
build already keeps `dist/`'s runtime ESM/CJS output correct; see
`scripts/verify-dist-singleton.mjs`) — but broke exactly the subpath
surface `docs/versioning-policy.md` commits to as this package's stable
1.0.0 public API.

Fixed by nesting `types` inside each condition (`import.types` /
`require.types`, pointing at `.d.ts` / `.d.cts` respectively) instead of
sharing one flat key, and adding `typesVersions` so classic resolvers can
still find each subpath's declarations. Verified clean across every
resolution mode (`node10`, `node16` from both ESM and CJS, `bundler`) with
`@arethetypeswrong/cli` against the real `npm pack` tarball — which is now
wired in as `npm run verify:types`, part of `npm run verify` and CI's
`build` job, so this class of bug (invisible to `tsc --noEmit`, which only
checks source-adjacent files, never what a consumer actually resolves
through the published `exports` map) can't silently regress again.
