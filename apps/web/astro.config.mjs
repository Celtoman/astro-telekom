import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { createPublicCsp } from '../../scripts/browser-security-policy.mjs';
import { resolvePublicApiUrl, resolvePublicSiteUrl } from './scripts/public-site-url.mjs';

const publicApiUrl = resolvePublicApiUrl(process.env);
const publicSiteUrl = resolvePublicSiteUrl(process.env);
const artifactId = process.env.PUBLIC_STATIC_ARTIFACT_ID;
if (artifactId && !/^[a-f0-9]{64}$/.test(artifactId)) throw new Error('Invalid static artifact identity');

export default defineConfig({
  output: 'static',
  ...(process.env.PUBLICATION_BUILD_CACHE_DIR ? { cacheDir: process.env.PUBLICATION_BUILD_CACHE_DIR } : {}),
  ...(process.env.PUBLICATION_BUILD_OUT_DIR ? { outDir: process.env.PUBLICATION_BUILD_OUT_DIR } : {}),
  build: {
    ...(artifactId ? { assetsPrefix: `/__publication_assets/${artifactId}` } : {}),
  },
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
    ...(process.env.PUBLICATION_BUILD_CACHE_DIR ? { cacheDir: `${process.env.PUBLICATION_BUILD_CACHE_DIR}/vite` } : {}),
    define: {
      'import.meta.env.PUBLIC_API_URL': JSON.stringify(publicApiUrl),
    },
  },
  devToolbar: {
    enabled: false,
  },
});
