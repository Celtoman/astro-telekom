export function GET({ site }: { site?: URL }) {
  const baseUrl = site?.origin || 'http://localhost:4321';
  return new Response(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin/\nDisallow: /crm/\nSitemap: ${baseUrl}/sitemap.xml\n`, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
