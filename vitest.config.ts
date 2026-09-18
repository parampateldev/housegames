import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@ui': path.resolve(__dirname, 'packages/shared-ui/src'),
      '@fb': path.resolve(__dirname, 'packages/shared-firebase/src'),
      '@engines/elimination': path.resolve(__dirname, 'packages/game-engines/elimination-engine/src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/engines/**/*.test.ts', 'packages/**/*.test.ts'],
  },
});
