export function publicationScope(section) {
  return ['news', 'news-categories', 'pages-news', 'pages-not-found'].includes(section) ? 'editorial' : 'legacy'
}

export function resolvePublicationSite(sites) {
  return Array.isArray(sites) && sites.length === 1 && typeof sites[0]?.id === "string" ? sites[0] : null
}

export function publicationRefreshDelay(state) {
  if (!state) return null
  if (["PENDING", "RUNNING"].includes(state.latestPublication?.status)) return 3000
  return null
}
