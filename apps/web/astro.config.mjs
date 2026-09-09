import { defineConfig } from 'astro/config';
import { resolvePublicSiteUrl } from './scripts/public-site-url.mjs';

export default defineConfig({
  output: 'static',
  site: resolvePublicSiteUrl(process.env),
  devToolbar: {
    enabled: false,
  },
});
