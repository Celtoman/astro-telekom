import { defineConfig } from 'astro/config';
import { readFile, writeFile } from 'node:fs/promises';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { createAdminCsp } from '../../scripts/browser-security-policy.mjs';
import { previewPublicStylesPlugin } from '../../scripts/preview-public-styles.mjs';

const adminUrl = process.env.ADMIN_URL || 'http://localhost:3001';

const workspaceVersion = {
  name: 'admin-workspace-version',
  hooks: {
    async 'astro:build:done'({ dir }) {
      const html = await readFile(new URL('index.html', dir), 'utf8');
      const island = html.match(/<astro-island\b[^>]*\bcomponent-export="AdminWorkspace"[^>]*>/)?.[0];
      const componentUrl = island?.match(/\bcomponent-url="(\/_astro\/[^"]+\.js)"/)?.[1];
      if (!componentUrl) throw new Error('Admin workspace module is missing from the built overview');
      await writeFile(new URL('workspace-version.json', dir), JSON.stringify({ componentUrl }) + '\n');
    },
  },
};

export default defineConfig({
  output: 'static',
  site: adminUrl,
  integrations: [react(), workspaceVersion],
  security: {
    csp: createAdminCsp({
      publicApiUrl: process.env.PUBLIC_API_URL,
      adminUrl,
    }),
  },
  vite: { plugins: [tailwindcss(), previewPublicStylesPlugin()] },
});
