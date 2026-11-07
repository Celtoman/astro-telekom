import type { PublicationState } from "./publication-display.mjs"

export function resolvePublicationSite<T extends { id: string }>(sites: T[]): T | null
export function publicationRefreshDelay(state: PublicationState | null): number | null
export function publicationScope(section:string):'editorial'|'legacy'
