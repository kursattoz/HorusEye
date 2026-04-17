import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles:  ['./tests/setup.ts'],
    globals:     true,
    exclude:     ['tests/e2e/**', 'tests/security/**', 'node_modules/**'],
    coverage: {
      provider:   'v8',
      reporter:   ['text', 'lcov', 'html'],
      thresholds: {
        lines:      70,
        functions:  70,
        branches:   65,
        statements: 70,
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
