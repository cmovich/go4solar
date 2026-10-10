import path from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  // tsconfig keeps JSX for Next ("preserve"); component tests need it compiled here.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      // `server-only` throws outside a Server Component bundle; stub it in tests.
      'server-only': path.resolve(import.meta.dirname, 'src/test/server-only.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    coverage: { provider: 'v8', reporter: ['text', 'html'] },
  },
})
