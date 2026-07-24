import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const STRAVA_PROXY = process.env.STRAVA_PROXY_URL ?? 'http://localhost:8788';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    proxy: {
      // Optional helper for the Strava OAuth token exchange.
      // Start it with `npm run strava-proxy`.
      '/api/strava': {
        target: STRAVA_PROXY,
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
});
