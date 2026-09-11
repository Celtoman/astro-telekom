import type { APIRoute } from 'astro';
import { loadSiteData, publicSiteSlug } from '../data/site';

export const GET: APIRoute = async () => {
  const catalog = await loadSiteData();
  const lines = catalog.redirects.flatMap((redirect, index) => [
    `@redirect_${index} path ${redirect.sourcePath} ${redirect.sourcePath}/`,
    `handle @redirect_${index} {`,
    `  rewrite * /api/v1/public/sites/${publicSiteSlug}/redirects/${redirect.id}`,
    '  reverse_proxy {$API_UPSTREAM:api:3000}',
    '}',
  ]);
  if (!lines.length) lines.push('# No published redirects');
  return new Response(`${lines.join('\n')}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
