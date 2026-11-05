/** Shared by API validation and the immutable-artifact image gate. Never fetch here. */
export function accountImageHosts(env: Record<string, string | undefined> = process.env): Set<string> {
  const hosts = new Set(['tv-internet-dom.ru']);
  try { const url = new URL(env.PUBLIC_SITE_URL || ''); if (url.protocol === 'https:' && !url.username && !url.password) hosts.add(url.hostname.toLowerCase()); } catch { /* optional origin */ }
  for (const host of (env.ACCOUNT_IMAGE_ALLOWED_HOSTS || '').split(',').map(h => h.trim().toLowerCase()).filter(Boolean)) {
    if (/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(host) && host !== 'localhost') hosts.add(host);
  }
  return hosts;
}
export function accountImageIdentity(source: string, env: Record<string, string | undefined> = process.env): { path: string; digest: string; extension: string } {
  if (source.includes('\\') || /\s/.test(source)) throw new Error('Нужен постоянный URL изображения без пробелов');
  let path = source;
  if (!source.startsWith('/')) {
    const url = new URL(source);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || !accountImageHosts(env).has(url.hostname)) throw new Error('Хост изображения не разрешён политикой ACCOUNT');
    path = url.pathname;
  }
  const match = path.match(/^\/images\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+-([a-f0-9]{16,64})\.(png|webp|jpe?g)$/);
  if (!match) throw new Error('Нужен версионированный файл /images/…-<SHA256>.png, .webp или .jpg');
  return { path, digest: match[1], extension: match[2] };
}
