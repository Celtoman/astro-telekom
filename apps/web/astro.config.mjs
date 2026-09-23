import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { createPublicCsp } from '../../scripts/browser-security-policy.mjs';
import { resolvePublicApiUrl, resolvePublicSiteUrl } from './scripts/public-site-url.mjs';

const publicApiUrl = resolvePublicApiUrl(process.env);
const publicSiteUrl = resolvePublicSiteUrl(process.env);

export default defineConfig({
  output: 'static',
  site: publicSiteUrl,
  trailingSlash: 'never',
  integrations: [react()],
  security: {
    csp: createPublicCsp({
      publicApiUrl,
      metrikaId: process.env.PUBLIC_YANDEX_METRIKA_ID,
    }),
  },
  vite: {
    define: {
      'import.meta.env.PUBLIC_API_URL': JSON.stringify(publicApiUrl),
    },
  },
  devToolbar: {
    enabled: false,
  },
});
