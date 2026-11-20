import type { PublicationState } from "./publication-display.mjs"

export interface PublicationStateSnapshot {
  status: "loading" | "ready" | "error"
  publication: PublicationState | null
  error: string | null
}

export const initialPublicationState: PublicationStateSnapshot
export function subscribePublicationState(apiUrl: string, siteId: string, listener: () => void): () => void
export function getPublicationState(apiUrl: string, siteId: string): PublicationStateSnapshot
export function refreshPublicationState(apiUrl: string, siteId: string): Promise<void>
