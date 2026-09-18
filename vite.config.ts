import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root: 'apps/web',
  base: '/housegames/',
  plugins: [react()],
  resolve: {
    alias: {
      '@ui': path.resolve(__dirname, 'packages/shared-ui/src'),
      '@fb': path.resolve(__dirname, 'packages/shared-firebase/src'),
      '@engines/elimination': path.resolve(__dirname, 'packages/game-engines/elimination-engine/src'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
});
