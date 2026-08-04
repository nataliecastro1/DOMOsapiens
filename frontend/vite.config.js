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
    },
  },
});
