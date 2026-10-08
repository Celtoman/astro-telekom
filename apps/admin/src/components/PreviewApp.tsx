import { useCallback, useEffect, useMemo, useState } from "react"
import { CircleAlert, Monitor, RefreshCw, Smartphone, Tablet } from "lucide-react"
import { AdminApiError, requestJson, requestSession } from "../lib/admin-api.mjs"
import { buildPreviewDocument, previewRouteOptions, type PreviewRouteOption } from "../lib/preview-document.mjs"
import publicPreviewStyles, { assets as publicPreviewAssets } from "virtual:preview-public-styles"
import { AdminShell } from "./AdminShell"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Field, FieldLabel } from "./ui/field"
import { Skeleton } from "./ui/skeleton"

interface Administrator { id: string; email: string }
interface Site { id: string; name: string; slug: string }
interface PreviewResponse {
  siteId: string
  workingRevision: number
  publishedRevision: number
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
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [selectedPath, setSelectedPath] = useState("")
  const [viewport, setViewport] = useState<Viewport>("desktop")
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

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
      setPreview(null)
      setSelectedPath("")
      setLoadingPreview(false)
      return
    }
    let active = true
    setLoadingPreview(true)
    setPreviewError(null)
    void requestJson<PreviewResponse>(apiUrl, `/admin/sites/${encodeURIComponent(selectedSiteId)}/preview-catalog`)
      .then((result) => {
        if (!active) return
        const options = previewRouteOptions(result.catalog)
        setPreview(result)
        setSelectedPath((current) => options.some((option) => option.path === current)
          ? current
          : options.find((option) => option.path === new URLSearchParams(window.location.search).get("path"))?.path || options.find((option) => option.kind === "CITY_HOME")?.path || options[0]?.path || "")
      })
      .catch((caught: unknown) => {
        if (!active) return
        setPreview(null)
        const message = handleError(caught, "Предпросмотр не загружен")
        if (message) setPreviewError(message)
      })
      .finally(() => { if (active) setLoadingPreview(false) })
    return () => { active = false }
  }, [apiUrl, handleError, refreshKey, selectedSiteId, state.status])

  const routeOptions: PreviewRouteOption[] = useMemo(
    () => preview ? previewRouteOptions(preview.catalog) : [],
    [preview],
  )
  const documentResult = useMemo(() => {
    if (!preview || !selectedPath) return { html: "", error: null }
    try {
      const assets = Object.fromEntries(Object.entries(publicPreviewAssets).map(([path, url]) => [path, new URL(url, window.location.origin).href]))
      return { html: buildPreviewDocument(preview.catalog, selectedPath, publicPreviewStyles, assets), error: null }
    } catch (caught: unknown) {
      return { html: "", error: caught instanceof Error ? caught.message : "Страница не может быть показана" }
    }
  }, [preview, selectedPath])

  if (state.status === "loading") return <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 p-8" aria-busy="true"><Skeleton className="h-10 w-72" /><Skeleton className="h-96 w-full" /></main>
  if (state.status === "error") return <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6"><Card className="w-full max-w-lg"><CardHeader><CardTitle>Предпросмотр недоступен</CardTitle><CardDescription>Не удалось загрузить рабочий экран.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><Alert variant="destructive"><CircleAlert /><AlertTitle>Ошибка API</AlertTitle><AlertDescription>{state.message}</AlertDescription></Alert><Button onClick={() => void loadWorkspace()}>Повторить</Button></CardContent></Card></main>

  const selectedSite = state.sites.find((site) => site.id === selectedSiteId)
  const frame = viewports[viewport]

  return (
    <AdminShell apiUrl={apiUrl} user={state.user} active="preview">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h1 className="font-heading text-2xl font-semibold">Предпросмотр рабочих страниц</h1><p className="mt-1 text-sm text-muted-foreground">Личный предпросмотр текущей рабочей версии. Он не создает публикацию и не меняет публичный сайт.</p></div>
          <Button variant="outline" disabled={loadingPreview || !selectedSiteId} onClick={() => setRefreshKey((value) => value + 1)}><RefreshCw data-icon="inline-start" />Обновить данные</Button>
        </div>

        {!state.sites.length ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Сайты не найдены</AlertTitle><AlertDescription>Для предпросмотра нужен хотя бы один сайт.</AlertDescription></Alert> : null}
        {previewError ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Рабочую страницу нельзя показать</AlertTitle><AlertDescription>{previewError}. Исправьте неполный шаблон или конфликт маршрутов и обновите предпросмотр.</AlertDescription></Alert> : null}
        {documentResult.error ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Маршрут не отрисован</AlertTitle><AlertDescription>{documentResult.error}</AlertDescription></Alert> : null}

        <Card>
          <CardHeader><CardTitle>Что показать</CardTitle><CardDescription>Состав URL берется из рабочего Release 1 inventory и проходит те же проверки каталога, что публикация.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(220px,0.7fr)_minmax(320px,1.3fr)_auto] xl:items-end">
            <Field><FieldLabel htmlFor="preview-site">Сайт</FieldLabel><select id="preview-site" className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm" value={selectedSiteId} onChange={(event) => { setSelectedSiteId(event.target.value); setSelectedPath("") }}><option value="">Выберите сайт</option>{state.sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></Field>
            <Field><FieldLabel htmlFor="preview-route">Страница</FieldLabel><select id="preview-route" className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm" value={selectedPath} disabled={!preview || !routeOptions.length} onChange={(event) => setSelectedPath(event.target.value)}><option value="">Выберите страницу</option>{routeOptions.map((option) => <option key={option.path} value={option.path}>{option.label} · {option.path}</option>)}</select></Field>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Размер экрана">{(Object.entries(viewports) as Array<[Viewport, typeof frame]>).map(([key, item]) => { const Icon = item.icon; return <Button key={key} type="button" size="sm" variant={viewport === key ? "default" : "outline"} aria-pressed={viewport === key} onClick={() => setViewport(key)}><Icon data-icon="inline-start" />{item.label}</Button> })}</div>
          </CardContent>
        </Card>

        {preview ? <div className="flex flex-wrap items-center gap-2"><Badge>Рабочая версия {preview.workingRevision}</Badge><Badge variant="secondary">На сайте версия {preview.publishedRevision}</Badge><span className="text-sm text-muted-foreground">{selectedSite?.name} · {frame.label} {frame.width}px</span></div> : null}
        {loadingPreview ? <Card aria-busy="true"><CardContent className="p-6"><Skeleton className="h-[720px] w-full" /></CardContent></Card> : null}
        {!loadingPreview && preview && documentResult.html ? <Card className="overflow-hidden"><CardHeader className="border-b"><CardTitle className="text-base">Рабочая версия {preview.workingRevision}</CardTitle><CardDescription>Ссылки и формы внутри предпросмотра отключены. Для свежих данных нажмите «Обновить данные».</CardDescription></CardHeader><CardContent className="overflow-auto bg-muted p-4"><div className="mx-auto w-max overflow-hidden rounded-lg border bg-white shadow-sm" style={{ width: frame.width }}><iframe key={`${preview.workingRevision}:${selectedPath}:${viewport}`} title={`Предпросмотр ${selectedPath}`} sandbox="" srcDoc={documentResult.html} className="block h-[760px] border-0 bg-white" style={{ width: frame.width }} /></div></CardContent></Card> : null}
      </div>
    </AdminShell>
  )
}
