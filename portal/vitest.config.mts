import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    setupFiles:  ['./tests/setup.ts'],
    globals:     true,
    // Integration tests hit a live dev server + local Supabase. CI's unit
    // job doesn't start the dev server, so they always timeout there. Run
    // them separately with `npm run test:integration` (requires
    // `npm run dev` running on TEST_BASE_URL).
    exclude:     ['tests/e2e/**', 'tests/security/**', 'tests/integration/**', 'node_modules/**'],
    coverage: {
      provider:   'v8',
      reporter:   ['text', 'lcov', 'html'],
      // Lowered while the new exam/students/incidents API gets unit-test
      // coverage (BL-52). Restore to 70/65/70 after BL-50/51/52 ship.
      thresholds: {
        lines:      40,
        functions:  40,
        branches:   35,
        statements: 40,
      },
      exclude: [
        'node_modules/**',
        'tests/**',
        '**/*.config.*',
        '**/*.d.ts',
        '.next/**',
        'components/ui/**', // shadcn components — not our code
      ],
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
