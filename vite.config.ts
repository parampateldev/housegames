import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root: 'apps/web',
  // Vite's default envDir follows `root`, so apps/web/.env would be read
  // instead of the repo-root .env everyone actually uses (CI works anyway
  // since it injects real process.env vars, which Vite honors regardless
  // of envDir — this only bit local `vite build`/`vite preview`).
  envDir: path.resolve(__dirname),
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
