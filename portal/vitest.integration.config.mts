// Integration tests — require a running dev server on TEST_BASE_URL and
// a local Supabase stack with the test fixtures seeded.
//
// Run with:
//   npm run dev &        # start dev server on :3000
//   supabase start
//   TEST_BASE_URL=http://localhost:3000 \
//   TEST_ADMIN_EMAIL=… TEST_ADMIN_PASSWORD=… \
//     npm run test:integration

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include:    ['tests/integration/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    globals:    true,
    testTimeout: 30_000,
    environment: 'node',
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
