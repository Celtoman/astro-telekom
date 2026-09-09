import { defineConfig } from 'astro/config';
import { resolvePublicApiUrl, resolvePublicSiteUrl } from './scripts/public-site-url.mjs';

const publicApiUrl = resolvePublicApiUrl(process.env);

export default defineConfig({
  output: 'static',
  site: resolvePublicSiteUrl(process.env),
  vite: {
    define: {
      'import.meta.env.PUBLIC_API_URL': JSON.stringify(publicApiUrl),
    },
  },
  devToolbar: {
    enabled: false,
  },
});
