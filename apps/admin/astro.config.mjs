import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { createAdminCsp } from '../../scripts/browser-security-policy.mjs';

const adminUrl = process.env.ADMIN_URL || 'http://localhost:3001';

export default defineConfig({
  output: 'static',
  site: adminUrl,
  integrations: [react()],
  security: {
    csp: createAdminCsp({
      publicApiUrl: process.env.PUBLIC_API_URL,
      adminUrl,
    }),
  },
  vite: { plugins: [tailwindcss()] },
});
