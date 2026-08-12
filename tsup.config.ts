import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'tenant/index': 'src/tenant/index.ts',
    'rbac/index': 'src/rbac/index.ts',
    'rate-limit/index': 'src/rate-limit/index.ts',
    'audit/index': 'src/audit/index.ts',
    'rls/index': 'src/rls/index.ts',
    'crypto/index': 'src/crypto/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  target: 'node18',
  outDir: 'dist',
});
