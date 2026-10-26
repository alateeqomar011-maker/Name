import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // The KFGQPC Uthmanic Hafs font ships with the text dataset; it is the font the text is encoded for.
      '@quran-font': fileURLToPath(new URL('./node_modules/@quran.ws/text/data/UthmanicHafs-v-3.0.ttf', import.meta.url)),
    },
  },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 900 },
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
});
