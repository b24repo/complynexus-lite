import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/domain/**',
        'src/guided/**',
        'src/grading/redact.ts',
        'src/grading/ruleBased.ts',
        'src/library/**',
        'src/usecases/**',
        'src/infra/notify/**',
        'src/api/middleware/**',
        'src/infra/tokens.ts',
      ],
      exclude: ['src/grading/claude.ts', 'src/infra/repo/mongo.ts', 'src/server.ts'],
      reporter: ['text', 'text-summary'],
      thresholds: { lines: 80, functions: 80, branches: 75 },
    },
  },
});
