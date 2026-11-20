import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CircleAlert, Monitor, RefreshCw, Smartphone, Tablet } from "lucide-react"
import { AdminApiError, requestJson, requestSession } from "../lib/admin-api.mjs"
import type { PreviewRouteOption } from "../lib/preview-document.mjs"
import { buildWorkingPreviewDocument } from "../lib/working-preview-document"
import { previewContentIssue } from "../lib/preview-content-issue.mjs"
import publicPreviewStyles, { assets as publicPreviewAssets } from "virtual:preview-public-styles"
import { AdminShell } from "./AdminShell"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Field, FieldLabel } from "./ui/field"
import { Input } from "./ui/input"
import { Skeleton } from "./ui/skeleton"

interface Administrator { id: string; email: string }
interface Site { id: string; name: string; slug: string }
interface PreviewRevision {
  siteId: string
  workingRevision: number
  publishedRevision: number
  basePublicationId: string | null
}
interface PreviewOptions extends PreviewRevision {
  items: PreviewRouteOption[]
  selected: PreviewRouteOption | null
  total: number
  page: number
  pageSize: number
}
interface PreviewResponse extends PreviewRevision {
  path: string
  catalog: Record<string, any>
}

type ScreenState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; user: Administrator; sites: Site[] }

type Viewport = "desktop" | "tablet" | "mobile"

const viewports: Record<Viewport, { width: number; label: string; icon: typeof Monitor }> = {
  desktop: { width: 1440, label: "Десктоп", icon: Monitor },
  tablet: { width: 834, label: "Планшет", icon: Tablet },
  mobile: { width: 390, label: "Мобильный", icon: Smartphone },
}

export function PreviewApp({ apiUrl }: { apiUrl: string }) {
  const [state, setState] = useState<ScreenState>({ status: "loading" })
  const [selectedSiteId, setSelectedSiteId] = useState("")
  const [loadedPreview, setPreview] = useState<{ data: PreviewResponse; assets: Record<string, string>; refresh: number } | null>(null)
  const [selectedRoute, setSelectedRoute] = useState<PreviewRouteOption | null>(null)
  const routeRef = useRef<PreviewRouteOption | null>(null)
  const [routeSearch, setRouteSearch] = useState("")
  const [routeQuery, setRouteQuery] = useState({ page: 1, search: "" })
  const [loadedOptions, setOptions] = useState<{ data: PreviewOptions; refresh: number } | null>(null)
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [optionsError, setOptionsError] = useState<string | null>(null)
  const [viewport, setViewport] = useState<Viewport>("desktop")
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewIssue, setPreviewIssue] = useState<ReturnType<typeof previewContentIssue>>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const selectedPath = selectedRoute?.path ?? ""
  const options = loadedOptions?.refresh === refreshKey && loadedOptions.data.siteId === selectedSiteId ? loadedOptions.data : null
  const workingRevision = options?.workingRevision
  const basePublicationId = options?.basePublicationId
  const preview = loadedPreview?.refresh === refreshKey && loadedPreview.data.siteId === selectedSiteId
    && loadedPreview.data.path === selectedPath && loadedPreview.data.workingRevision === workingRevision
    && loadedPreview.data.basePublicationId === basePublicationId ? loadedPreview : null

  const chooseRoute = useCallback((option: PreviewRouteOption | null) => {
    routeRef.current = option
    setSelectedRoute(option)
  }, [])

  const handleError = useCallback((caught: unknown, fallback: string) => {
    if (caught instanceof AdminApiError && caught.status === 401) {
      window.location.replace("/login")
      return null
    }
    return caught instanceof Error ? caught.message : fallback
  }, [])

  const loadWorkspace = useCallback(async () => {
    setState({ status: "loading" })
    try {
      const [session, sites] = await Promise.all([
        requestSession<{ user: Administrator }>(apiUrl),
        requestJson<Site[]>(apiUrl, "/admin/sites?summary=true"),
      ])
      setState({ status: "ready", user: session.user, sites })
      setSelectedSiteId((current) => sites.some((site) => site.id === current) ? current : sites.find(site => site.id === new URLSearchParams(window.location.search).get("siteId"))?.id ?? (sites.length === 1 ? sites[0].id : ""))
    } catch (caught: unknown) {
      const message = handleError(caught, "API недоступен")
      if (message) setState({ status: "error", message })
    }
  }, [apiUrl, handleError])

  useEffect(() => { void loadWorkspace() }, [loadWorkspace])

  useEffect(() => {
    if (state.status !== "ready" || !selectedSiteId) {
      setOptions(null)
      setLoadingOptions(false)
      setOptionsError(null)
      return
    }
    let active = true
    const abort = new AbortController()
    const selected = routeRef.current
    const preferred = selected?.path ?? new URLSearchParams(window.location.search).get("path")
    const query = new URLSearchParams({ page: String(routeQuery.page), search: routeQuery.search })
    if (preferred) query.set("preferred", preferred)
    setLoadingOptions(true)
    setOptionsError(null)
    void requestJson<PreviewOptions>(apiUrl, `/admin/sites/${encodeURIComponent(selectedSiteId)}/preview-options?${query}`, { signal: abort.signal })
      .then(result => {
        if (!active) return
        setOptions({ data: result, refresh: refreshKey })
        if (routeRef.current === selected) chooseRoute(result.selected)
      })
      .catch((caught: unknown) => {
        if (!active) return
        setOptionsError(handleError(caught, "Список страниц не загружен"))
      })
      .finally(() => { if (active) setLoadingOptions(false) })
    return () => { active = false; abort.abort() }
  }, [apiUrl, chooseRoute, handleError, refreshKey, routeQuery, selectedSiteId, state.status])

  useEffect(() => {
    if (!selectedSiteId || !selectedPath || workingRevision === undefined) {
      setPreview(null)
      setLoadingPreview(false)
      setPreviewError(null)
      setPreviewIssue(null)
      return
    }
    let active = true
    const abort = new AbortController()
    const query = new URLSearchParams({ path: selectedPath, workingRevision: String(workingRevision) })
    if (basePublicationId) query.set("basePublicationId", basePublicationId)
    setLoadingPreview(true)
    setPreviewError(null)
    setPreviewIssue(null)
    void requestJson<PreviewResponse>(apiUrl, `/admin/sites/${encodeURIComponent(selectedSiteId)}/preview-page?${query}`, { signal: abort.signal })
      .then(async (result) => {
        const mediaAssets: Record<string, string> = {}
        await Promise.all(Object.entries(result.catalog.supportMedia ?? {}).map(async ([key, raw]) => {
          const last = (raw as Array<{ src: string; sha256: string }>).at(-1)
          if (!last) return
          const id = key.split("|")[0]
          const response = await fetch(`${apiUrl.replace(/\/$/, "")}/admin/sites/${encodeURIComponent(selectedSiteId)}/support/media/${encodeURIComponent(id)}/file?variant=${encodeURIComponent(last.sha256)}`,
            { credentials: "include", signal: abort.signal })
          if (!response.ok) throw new AdminApiError(response.status, "Не удалось загрузить изображение поддержки для предпросмотра.")
          const blob = await response.blob()
          mediaAssets[last.src] = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result))
            reader.onerror = reject
            reader.readAsDataURL(blob)
          })
        }))
        if (active) setPreview({ data: result, assets: mediaAssets, refresh: refreshKey })
      })
      .catch((caught: unknown) => {
        if (!active) return
        setPreview(null)
        const message = handleError(caught, "Предпросмотр не загружен")
        if (message) { setPreviewError(message); setPreviewIssue(previewContentIssue(caught, selectedSiteId)) }
      })
      .finally(() => { if (active) setLoadingPreview(false) })
    return () => { active = false; abort.abort() }
  }, [apiUrl, basePublicationId, handleError, refreshKey, selectedPath, selectedSiteId, workingRevision])

  const documentResult = useMemo(() => {
    if (!preview || !selectedPath) return { html: "", error: null, issue: null }
    try {
      const assets = { ...Object.fromEntries(Object.entries(publicPreviewAssets).map(([path, url]) => [path, new URL(url, window.location.origin).href])), ...preview.assets }
      return { html: buildWorkingPreviewDocument(preview.data.catalog, selectedPath, publicPreviewStyles, assets), error: null, issue: null }
    } catch (caught: unknown) {
      return { html: "", error: caught instanceof Error ? caught.message : "Страница не может быть показана", issue: previewContentIssue(caught, selectedSiteId) }
    }
  }, [preview, selectedPath, selectedSiteId])

  if (state.status === "loading") return <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 p-8" aria-busy="true"><Skeleton className="h-10 w-72" /><Skeleton className="h-96 w-full" /></main>
  if (state.status === "error") return <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6"><Card className="w-full max-w-lg"><CardHeader><CardTitle>Предпросмотр недоступен</CardTitle><CardDescription>Не удалось загрузить рабочий экран.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><Alert variant="destructive"><CircleAlert /><AlertTitle>Ошибка API</AlertTitle><AlertDescription>{state.message}</AlertDescription></Alert><Button onClick={() => void loadWorkspace()}>Повторить</Button></CardContent></Card></main>

  const selectedSite = state.sites.find((site) => site.id === selectedSiteId)
  const frame = viewports[viewport]
  const routeOptions = options?.items ?? []
  const selectedOutsidePage = selectedRoute && !routeOptions.some(option => option.path === selectedRoute.path) ? selectedRoute : null
  const publishedRevision = Math.max(options?.publishedRevision ?? 0, preview?.data.publishedRevision ?? 0)
  const canRefresh = Boolean(selectedSiteId) && !loadingPreview && !loadingOptions
  const canGoBack = Boolean(options && !loadingOptions && options.page > 1)
  const canGoForward = Boolean(options && !loadingOptions && options.page * options.pageSize < options.total)

  return (
    <AdminShell apiUrl={apiUrl} user={state.user} active="preview">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h1 className="font-heading text-2xl font-semibold">Предпросмотр рабочих страниц</h1><p className="mt-1 text-sm text-muted-foreground">Личный предпросмотр текущей рабочей версии. Он не создает публикацию и не меняет публичный сайт.</p></div>
          <Button variant="outline" aria-disabled={!canRefresh} className="aria-disabled:opacity-50" onClick={() => { if (canRefresh) setRefreshKey((value) => value + 1) }}><RefreshCw data-icon="inline-start" />Обновить данные</Button>
        </div>

        {!state.sites.length ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Сайты не найдены</AlertTitle><AlertDescription>Для предпросмотра нужен хотя бы один сайт.</AlertDescription></Alert> : null}
        {optionsError ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Список страниц недоступен</AlertTitle><AlertDescription>{optionsError}</AlertDescription></Alert> : null}
        {previewError ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Рабочую страницу нельзя показать</AlertTitle><AlertDescription>{previewError}{previewIssue ? <div className="mt-2"><p>{previewIssue.heading} · {previewIssue.field}</p><a className="inline-flex min-h-11 items-center font-medium underline underline-offset-4" href={previewIssue.href ?? undefined}>Исправить поле</a></div> : null}</AlertDescription></Alert> : null}
        {documentResult.error ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Маршрут не отрисован</AlertTitle><AlertDescription>{documentResult.error}{documentResult.issue ? <div className="mt-2"><p>{documentResult.issue.heading} · {documentResult.issue.field}</p><a className="inline-flex min-h-11 items-center font-medium underline underline-offset-4" href={documentResult.issue.href ?? undefined}>Исправить поле</a></div> : null}</AlertDescription></Alert> : null}

        <Card>
          <CardHeader><CardTitle>Что показать</CardTitle><CardDescription>Список содержит URL рабочей версии. Перед открытием страницы сервер проверяет каталог.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(220px,0.7fr)_minmax(320px,1.3fr)_auto] xl:items-end">
            <Field><FieldLabel htmlFor="preview-site">Сайт</FieldLabel><select id="preview-site" className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm" value={selectedSiteId} onChange={(event) => {
              setSelectedSiteId(event.target.value)
              chooseRoute(null)
              setRouteSearch("")
              setRouteQuery({ page: 1, search: "" })
            }}><option value="">Выберите сайт</option>{state.sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></Field>
            <div className="space-y-3" aria-busy={loadingOptions}>
              <form onSubmit={event => { event.preventDefault(); setRouteQuery({ page: 1, search: routeSearch.trim() }) }} className="flex items-end gap-2">
                <Field className="min-w-0 flex-1"><FieldLabel htmlFor="preview-route-search">Название или URL</FieldLabel><Input id="preview-route-search" type="search" maxLength={250} value={routeSearch} onChange={event => setRouteSearch(event.target.value)} disabled={!selectedSiteId} /></Field>
                <Button type="submit" variant="outline" disabled={!selectedSiteId}>Найти</Button>
              </form>
              <Field><FieldLabel htmlFor="preview-route">Страница</FieldLabel><select id="preview-route" className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm" value={options ? selectedPath : ""} disabled={!options || (!routeOptions.length && !selectedOutsidePage)} onChange={(event) => {
                chooseRoute(routeOptions.find(option => option.path === event.target.value)
                  ?? (selectedOutsidePage?.path === event.target.value ? selectedOutsidePage : null))
              }}><option value="">Выберите страницу</option>{selectedOutsidePage ? <option value={selectedOutsidePage.path}>{selectedOutsidePage.label} · {selectedOutsidePage.path}</option> : null}{routeOptions.map((option) => <option key={option.path} value={option.path}>{option.label} · {option.path}</option>)}</select></Field>
              {options ? <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Страницы списка URL">
                <span className="text-sm text-muted-foreground" aria-live="polite">{options.total ? `Найдено: ${options.total}` : "Страницы не найдены"}</span>
                <Button type="button" size="sm" variant="outline" aria-disabled={!canGoBack} className="aria-disabled:opacity-50" onClick={() => { if (canGoBack) setRouteQuery(query => ({ ...query, page: options.page - 1 })) }}>Назад</Button>
                <Button type="button" size="sm" variant="outline" aria-disabled={!canGoForward} className="aria-disabled:opacity-50" onClick={() => { if (canGoForward) setRouteQuery(query => ({ ...query, page: options.page + 1 })) }}>Дальше</Button>
              </div> : null}
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Размер экрана">{(Object.entries(viewports) as Array<[Viewport, typeof frame]>).map(([key, item]) => { const Icon = item.icon; return <Button key={key} type="button" size="sm" variant={viewport === key ? "default" : "outline"} aria-pressed={viewport === key} onClick={() => setViewport(key)}><Icon data-icon="inline-start" />{item.label}</Button> })}</div>
          </CardContent>
        </Card>

        {options ? <div className="flex flex-wrap items-center gap-2"><Badge>Рабочая версия {workingRevision}</Badge><Badge variant="secondary">На сайте версия {publishedRevision}</Badge><span className="text-sm text-muted-foreground">{selectedSite?.name} · {frame.label} {frame.width}px</span></div> : null}
        {loadingPreview ? <Card aria-busy="true"><CardContent className="p-6"><Skeleton className="h-[720px] w-full" /></CardContent></Card> : null}
        {!loadingPreview && preview && documentResult.html ? <Card className="overflow-hidden"><CardHeader className="border-b"><CardTitle className="text-base">Рабочая версия {preview.data.workingRevision}</CardTitle><CardDescription>Ссылки и формы внутри предпросмотра отключены. Для свежих данных нажмите «Обновить данные».</CardDescription></CardHeader><CardContent className="overflow-auto bg-muted p-4"><div className="mx-auto w-max overflow-hidden rounded-lg border bg-white shadow-sm" style={{ width: frame.width }}><iframe key={`${preview.data.workingRevision}:${selectedPath}:${viewport}`} title={`Предпросмотр ${selectedPath}`} sandbox="" srcDoc={documentResult.html} className="block h-[760px] border-0 bg-white" style={{ width: frame.width }} /></div></CardContent></Card> : null}
      </div>
    </AdminShell>
  )
}
