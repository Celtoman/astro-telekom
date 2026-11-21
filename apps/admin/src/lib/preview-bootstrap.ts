import { AdminApiError, requestJson } from "./admin-api.mjs"

export interface PreviewSite { id: string; name: string; slug: string }

interface PreviewUser { id: string; email: string }

interface PreviewWorkspace<Options> {
  user: PreviewUser
  sites: PreviewSite[]
  selectedSiteId: string | null
  options: Options | null
}

export async function readPreviewWorkspace<Options>(
  apiUrl: string, siteId: string | null, preferred: string | null, signal: AbortSignal, fetchImpl?: typeof fetch,
): Promise<PreviewWorkspace<Options>> {
  const query = new URLSearchParams()
  if (siteId) query.set("siteId", siteId)
  if (preferred) query.set("preferred", preferred)
  try {
    return await requestJson<PreviewWorkspace<Options>>(apiUrl, `/admin/sites/preview-bootstrap?${query}`, { signal }, fetchImpl)
  } catch (error) {
    // An open tab can still have the newer bundle after the API is rolled back.
    if (signal.aborted || !(error instanceof AdminApiError) || error.status !== 404) throw error
    const [session, sites] = await Promise.all([
      requestJson<{ user: PreviewUser }>(apiUrl, "/auth/me", { signal }, fetchImpl),
      requestJson<PreviewSite[]>(apiUrl, "/admin/sites?summary=true", { signal }, fetchImpl),
    ])
    const selectedSiteId = sites.find(site => site.id === siteId)?.id ?? (sites.length === 1 ? sites[0].id : null)
    return { user: session.user, sites, selectedSiteId, options: null }
  }
}
