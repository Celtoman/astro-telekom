import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const workspaceRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

export default defineConfig({
  output: 'static',
  site: process.env.PUBLIC_SITE_URL || 'http://localhost:4321',
  devToolbar: {
    enabled: false,
  },
  vite: {
    optimizeDeps: {
      noDiscovery: true,
      include: [],
      exclude: ['aria-query', 'axobject-query', 'cssesc'],
    },
    resolve: {
      alias: {
        'aria-query': path.join(workspaceRoot, 'node_modules/aria-query'),
        'axobject-query': path.join(workspaceRoot, 'node_modules/axobject-query'),
      },
    },
  },
});
