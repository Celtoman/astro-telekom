import { describePublicationState } from "./publication-display.mjs"

export function publicationScope(section) {
  return ['news', 'news-categories', 'pages-news', 'pages-not-found'].includes(section) ? 'editorial' : 'legacy'
}

export function resolvePublicationSite(sites) {
  return Array.isArray(sites) && sites.length === 1 && typeof sites[0]?.id === "string" ? sites[0] : null
}

export function publicationRefreshDelay(state) {
  return state && describePublicationState(state).kind === "publishing" ? 3000 : null
}
