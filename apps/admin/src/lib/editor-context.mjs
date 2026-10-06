export function editorSiteId(sites, search) {
  const requested = new URLSearchParams(search).get('siteId');
  return sites.find(site => site.id === requested)?.id ?? (sites.length === 1 ? sites[0].id : '');
}
