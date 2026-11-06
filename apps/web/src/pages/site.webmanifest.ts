import { loadSiteData } from '../data/site';
import { publicAsset } from '../data/public-asset';

export async function GET() {
  const { site } = await loadSiteData();
  return new Response(JSON.stringify({
    name: site.name,
    lang: 'ru',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'browser',
    theme_color: '#ffffff',
    background_color: '#ff2d28',
    icons: [
      { src: publicAsset('/web-app-manifest-192x192.png'), sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: publicAsset('/web-app-manifest-512x512.png'), sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  }), { headers: { 'content-type': 'application/manifest+json; charset=utf-8' } });
}
