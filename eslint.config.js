// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    // examples/ is illustrative documentation code (imports `express`, which
    // is not a dependency of this package) — excluded from lint/typecheck
    // the same way dist/coverage/node_modules are, rather than pulled into
    // the project's strict TS project just to satisfy the linter.
    //
    // doc-examples/ has its own separate, purpose-built tsconfig
    // (doc-examples/tsconfig.json, self-references the built package —
    // see doc-examples/README.md) and its own CI check (`npm run
    // verify:docs`) — same reasoning as examples/, excluded here rather
    // than force-fit into the main strict-typed project.
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'examples/**', 'doc-examples/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            '*.config.js',
            '*.config.ts',
            'scripts/*.mjs',
            '.claude/workflows/*.js',
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },
  {
    // Plain Node scripts (not .ts) don't get typescript-eslint's automatic
    // no-undef handling for TS files, so Node's globals need declaring here.
    //
    // The no-unsafe-* rules are also off here: verify-dist-singleton.mjs
    // dynamically imports from dist/, which doesn't exist yet at lint time
    // in a fresh checkout — CI's lint-and-typecheck job never runs build
    // first (it's a separate parallel job), so those imports always type
    // as `any` there. Locally this can go unnoticed if dist/ happens to
    // already exist from a prior manual build, which is exactly how this
    // got missed once already — don't trust a local lint pass here without
    // deleting dist/ first.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly', URL: 'readonly' },
    },
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
  {
    // Workflow-tool scripts (see the Workflow tool's own docs): plain JS,
    // no import — `phase`/`agent`/`pipeline`/`parallel`/`log` are globals
    // injected by the tool's execution context at runtime, not declared or
    // imported anywhere in the file itself. The script body also runs
    // top-level `await`/`return` (the tool wraps it in an implicit async
    // function at execution time) — valid at runtime, but not valid syntax
    // for a real standalone ES module, which is exactly what crashes
    // typescript-eslint's type-aware rules here (`no-misused-promises`
    // throws internally trying to find a `return` statement's enclosing
    // function, since there isn't one in this file's own AST). Disabling
    // type-aware checking for this glob avoids that crash entirely, the
    // same fix typescript-eslint's own docs recommend for files that don't
    // fit the type-checked project model — this file was never going to be
    // meaningfully type-checked against this package's own tsconfig anyway.
    files: ['.claude/workflows/*.js'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      // Same parserOptions disableTypeChecked itself sets — inlined rather
      // than spread from it, since that property chain types as `any` here
      // and this package lints itself with @ts-check.
      parserOptions: { program: null, project: false, projectService: false },
      globals: {
        phase: 'readonly',
        agent: 'readonly',
        pipeline: 'readonly',
        parallel: 'readonly',
        log: 'readonly',
        args: 'readonly',
        budget: 'readonly',
        workflow: 'readonly',
      },
    },
  },
  {
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  eslintConfigPrettier,
);
