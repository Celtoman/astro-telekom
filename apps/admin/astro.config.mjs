import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  site: process.env.ADMIN_URL || 'http://localhost:3001',
  vite: { optimizeDeps: { noDiscovery: true, include: [] } },
});
