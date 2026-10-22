import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 20000,
    fileParallelism: false, // Run test suites sequentially to prevent SQLite concurrent lock and chain contention
    maxConcurrency: 1,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
