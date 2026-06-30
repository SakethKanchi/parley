// Vite dev config for screenshotting the dashboard against the seeded demo DB.
// Proxies /api to the demo standalone server (scripts/web-demo.mjs on :3100).
//   node scripts/web-demo.mjs            # serve demo/meetings.db on :3100
//   npx vite --config web/vite.demo.config.js   # UI on :5273
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5273, proxy: { '/api': 'http://127.0.0.1:3100' } },
});
