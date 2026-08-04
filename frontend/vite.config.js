import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // '/' in local dev; the Dockerfile sets VITE_BASE_URL=/app/roi-prototype/
  // so built assets resolve under Alfred's app path (same pattern as the hub).
  base: process.env.VITE_BASE_URL || '/',
  plugins: [react()],
  server: {
    port: 3600,
    proxy: {
      '/api': 'http://localhost:3599',
      // Local stand-in for Alfred's same-origin routing: deployed, hub calls
      // go to /app/delivery-hub/* on the shared origin; locally they hit the
      // hub dev server directly (cargo run in app-delivery-hub, port 3501).
      '/hub': {
        target: 'http://localhost:3501',
        rewrite: (path) => path.replace(/^\/hub/, ''),
      },
    },
  },
});
