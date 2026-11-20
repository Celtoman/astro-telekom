import { useCallback, useSyncExternalStore } from "react"
import { getPublicationState, initialPublicationState, subscribePublicationState } from "../lib/publication-state.mjs"

const serverSnapshot = () => initialPublicationState

export function usePublicationState(apiUrl: string, siteId?: string | null) {
  const subscribe = useCallback((listener: () => void) => (
    siteId ? subscribePublicationState(apiUrl, siteId, listener) : () => undefined
  ), [apiUrl, siteId])
  const snapshot = useCallback(() => (
    siteId ? getPublicationState(apiUrl, siteId) : initialPublicationState
  ), [apiUrl, siteId])
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot)
}
