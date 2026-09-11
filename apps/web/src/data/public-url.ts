export function publicHtmlPath(...segments: string[]) {
  const path = `/${segments.filter(Boolean).join('/')}`;
  return path === '/' ? path : path.replace(/\/+$/, '');
}

export function normalizePublicHtmlPath(path: string) {
  return path === '/' ? path : path.replace(/\/+$/, '');
}

export function normalizePublicHref(href: string) {
  if (!href.startsWith('/') || href.startsWith('//') || href.startsWith('/api/')) return href;
  const url = new URL(href, 'https://public.invalid');
  const lastSegment = url.pathname.replace(/\/+$/, '').split('/').at(-1) || '';
  if (lastSegment.includes('.')) return href;
  url.pathname = normalizePublicHtmlPath(url.pathname);
  return `${url.pathname}${url.search}${url.hash}`;
}
