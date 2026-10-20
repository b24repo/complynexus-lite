import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/domain/**',
        'src/guided/**',
        'src/grading/anthropicClient.ts',
        'src/grading/claude.ts',
        'src/grading/redact.ts',
        'src/grading/ruleBased.ts',
        'src/library/**',
        'src/usecases/**',
        'src/web/**',
        'src/infra/notify/**',
        'src/jobs/transitions.ts',
        'src/pdf/**',
        'src/api/middleware/**',
        'src/infra/tokens.ts',
      ],
      exclude: ['src/infra/repo/mongo.ts', 'src/server.ts'],
      reporter: ['text', 'text-summary'],
      thresholds: { lines: 80, functions: 80, branches: 75 },
    },
  },
});
