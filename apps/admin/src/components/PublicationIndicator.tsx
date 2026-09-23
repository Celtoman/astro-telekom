import { useCallback, useEffect, useRef, useState } from "react"
import { CalendarClock, CheckCircle2, CircleAlert, CloudUpload, LoaderCircle, RefreshCw } from "lucide-react"
import { Popover } from "radix-ui"
import { requestJson } from "../lib/admin-api.mjs"
import { describePublicationState, type PublicationState } from "../lib/publication-display.mjs"
import { publicationRefreshDelay, resolvePublicationSite } from "../lib/publication-indicator.mjs"
import { statusPresentation } from "../lib/status-presentation.mjs"
import { StatusBadge } from "./StatusBadge"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"

interface SiteSummary { id: string; name: string }
type IndicatorState =
  | { status: "loading" }
  | { status: "unavailable"; reason: string }
  | { status: "ready"; site: SiteSummary; publication: PublicationState }

export function PublicationIndicator({ apiUrl }: { apiUrl: string }) {
  const [state, setState] = useState<IndicatorState>({ status: "loading" })
  const [site, setSite] = useState<SiteSummary | null>(null)
  const requestSequence = useRef(0)

  const loadState = useCallback(async (currentSite: SiteSummary) => {
    const sequence = ++requestSequence.current
    try {
      const publication = await requestJson<PublicationState>(apiUrl, `/admin/sites/${encodeURIComponent(currentSite.id)}/publication-state`)
      if (sequence === requestSequence.current) setState({ status: "ready", site: currentSite, publication })
    } catch {
      if (sequence === requestSequence.current) setState({ status: "unavailable", reason: "Не удалось получить состояние публикации. Попробуйте обновить." })
    }
  }, [apiUrl])

  const loadSite = useCallback(async () => {
    try {
      const sites = await requestJson<SiteSummary[]>(apiUrl, "/admin/sites")
      const selected = resolvePublicationSite(sites)
      if (!selected) {
        setSite(null)
        setState({ status: "unavailable", reason: sites.length === 0 ? "Сайт не найден." : "Нельзя однозначно выбрать сайт." })
        return
      }
      setSite(selected)
      await loadState(selected)
    } catch {
      setSite(null)
      setState({ status: "unavailable", reason: "Не удалось получить список сайтов. Попробуйте обновить." })
    }
  }, [apiUrl, loadState])

  useEffect(() => { void loadSite() }, [loadSite])

  useEffect(() => {
    if (!site) return
    const refresh = () => { void loadState(site) }
    window.addEventListener("focus", refresh)
    window.addEventListener("admin:publication-changed", refresh)
    return () => {
      window.removeEventListener("focus", refresh)
      window.removeEventListener("admin:publication-changed", refresh)
    }
  }, [site, loadState])

  useEffect(() => {
    if (state.status !== "ready") return
    const delay = publicationRefreshDelay(state.publication)
    if (delay === null) return
    const timer = window.setTimeout(() => { void loadState(state.site) }, delay)
    return () => window.clearTimeout(timer)
  }, [state, loadState])

  const presentation = state.status === "ready" ? describePublicationState(state.publication) : null
  const status = presentation ? statusPresentation("publicationView", presentation.kind) : null
  const Icon = state.status === "loading" ? LoaderCircle
    : presentation?.kind === "published" ? CheckCircle2
    : presentation?.kind === "failed" ? CircleAlert
      : presentation?.kind === "publishing" ? LoaderCircle
        : presentation?.kind === "scheduled" ? CalendarClock : presentation?.kind === "unpublished" ? CloudUpload : CircleAlert

  return <Popover.Root>
    <Popover.Trigger asChild>
      <Button type="button" size="sm" variant="outline" aria-label={`Публикация сайта: ${status?.label ?? (state.status === "loading" ? "проверяем" : "статус недоступен")}. Открыть подробности`}>
        <Icon className={state.status === "loading" || presentation?.kind === "publishing" ? "animate-spin" : undefined} data-icon="inline-start" />
        <span className="hidden sm:inline">Сайт:</span>
        {status ? <Badge variant={status.tone}>{status.label}</Badge> : <Badge variant={state.status === "loading" ? "neutral" : "destructive"}>{state.status === "loading" ? "Проверяем…" : "Недоступен"}</Badge>}
      </Button>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content align="end" sideOffset={8} className="z-50 w-80 max-w-[calc(100vw-2rem)] rounded-lg border bg-background p-4 text-foreground shadow-lg outline-none" aria-label="Состояние публикации сайта">
        <div className="space-y-3 text-sm">
          <div><p className="font-heading font-semibold">{presentation?.title ?? "Статус публикации недоступен"}</p><p className="mt-1 text-muted-foreground">{presentation?.description ?? (state.status === "unavailable" ? state.reason : "Получаем состояние сайта.")}</p></div>
          {state.status === "ready" ? <>
            <div className="grid grid-cols-2 gap-2 rounded-md bg-muted/50 p-3">
              <div><p className="text-xs text-muted-foreground">Рабочая версия</p><p className="font-medium">{state.publication.workingRevision}</p></div>
              <div><p className="text-xs text-muted-foreground">На сайте</p><p className="font-medium">{state.publication.publishedRevision}</p></div>
            </div>
            {state.publication.latestPublication ? <div className="flex flex-wrap items-center gap-2"><span className="text-muted-foreground">Последняя публикация · версия {state.publication.latestPublication.siteRevision}</span><StatusBadge kind="sitePublicationStatus" value={state.publication.latestPublication.status} /></div> : null}
            {state.publication.scheduledPublication ? <p>Запланирована версия {state.publication.scheduledPublication.siteRevision}: {new Date(state.publication.scheduledPublication.scheduledFor).toLocaleString("ru-RU")}</p> : null}
            {state.publication.latestPublication?.lastError || state.publication.rebuild?.lastError ? <p className="break-words text-destructive">Последняя ошибка: {state.publication.latestPublication?.lastError || state.publication.rebuild?.lastError}</p> : null}
          </> : null}
          <Button type="button" size="sm" variant="outline" onClick={() => void (site ? loadState(site) : loadSite())}><RefreshCw data-icon="inline-start" />Обновить</Button>
        </div>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
}
