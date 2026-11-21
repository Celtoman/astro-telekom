import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, CircleAlert, CloudUpload, LoaderCircle, RefreshCw } from "lucide-react"
import { Button as AriaButton, Dialog, DialogTrigger, Popover } from "react-aria-components"
import { requestJson } from "../lib/admin-api.mjs"
import { describePublicationState, describePublicationProgress } from "../lib/publication-display.mjs"
import { resolvePublicationSite } from "../lib/publication-indicator.mjs"
import { refreshPublicationState } from "../lib/publication-state.mjs"
import { usePublicationState } from "./usePublicationState"
import { statusPresentation } from "../lib/status-presentation.mjs"
import { StatusBadge } from "./StatusBadge"
import { Badge } from "./ui/badge"
import { Button, buttonVariants } from "./ui/button"

interface SiteSummary { id: string; name: string }

export function PublicationIndicator({ apiUrl, editorial=false, initialSites }: { apiUrl: string; editorial?:boolean; initialSites?: SiteSummary[] }) {
  const [siteError, setSiteError] = useState<string | null>(null)
  const [site, setSite] = useState<SiteSummary | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const close = () => setOpen(false)
    document.addEventListener("admin:workspace-navigated", close)
    return () => document.removeEventListener("admin:workspace-navigated", close)
  }, [])
  const snapshot = usePublicationState(apiUrl, site?.id)
  const loadSite = useCallback(async (sitesFromWorkspace?: SiteSummary[]) => {
    try {
      const sites = editorial ? [await requestJson<SiteSummary>(apiUrl, "/admin/sites/editorial-context")]
        : sitesFromWorkspace ?? await requestJson<SiteSummary[]>(apiUrl, "/admin/sites?summary=true")
      const selected = resolvePublicationSite(sites)
      setSiteError(selected ? null : sites.length === 0 ? "Сайт не найден." : "Нельзя однозначно выбрать сайт.")
      setSite(selected)
    } catch {
      setSite(null)
      setSiteError("Не удалось получить список сайтов. Попробуйте обновить.")
    }
  }, [apiUrl, editorial])

  useEffect(() => { void loadSite(initialSites) }, [initialSites, loadSite])
  const publication = snapshot.publication
  const reason = siteError ?? snapshot.error
  const loading = !reason && snapshot.status === "loading"
  const available = snapshot.status === "ready" && !reason

  const presentation = publication && available ? describePublicationState(publication) : null
  const status = presentation ? statusPresentation("publicationView", presentation.kind) : null
  const progress = publication && available ? describePublicationProgress(publication) : null
  const Icon = loading ? LoaderCircle
    : presentation?.kind === "published" ? CheckCircle2
    : presentation?.kind === "failed" ? CircleAlert
      : presentation?.kind === "publishing" ? LoaderCircle
        : presentation?.kind === "unpublished" ? CloudUpload : CircleAlert

  return <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <AriaButton className={`${buttonVariants({ size: "sm", variant: "outline" })} min-h-11`} aria-label={`Публикация сайта: ${status?.label ?? (loading ? "проверяем" : "статус недоступен")}. Открыть подробности`}>
        <Icon className={loading || presentation?.kind === "publishing" ? "animate-spin motion-reduce:animate-none" : undefined} data-icon="inline-start" />
        <span className="hidden sm:inline">Сайт:</span>
        {status ? <Badge variant={status.tone}>{status.label}</Badge> : <Badge variant={loading ? "neutral" : "destructive"}>{loading ? "Проверяем…" : "Недоступен"}</Badge>}
      </AriaButton>
      <Popover placement="bottom end" offset={8} className="z-50 w-80 max-w-[calc(100vw-2rem)] rounded-lg border bg-background p-4 text-foreground shadow-lg outline-none">
        <Dialog aria-label="Состояние публикации сайта" className="outline-none">
        <div className="space-y-3 text-sm">
          <div><p className="font-heading font-semibold">{presentation?.title ?? (loading ? "Проверяем состояние" : "Статус публикации недоступен")}</p><p className="mt-1 text-muted-foreground">{presentation?.description ?? (reason ?? "Получаем состояние сайта.")}</p></div>
          {publication && available ? <>
            <div className="grid grid-cols-2 gap-2 rounded-md bg-muted/50 p-3">
              <div><p className="text-xs text-muted-foreground">Рабочая версия</p><p className="font-medium">{publication.workingRevision}</p></div>
              <div><p className="text-xs text-muted-foreground">На сайте</p><p className="font-medium">{publication.publishedRevision}</p></div>
            </div>
            {publication.latestPublication ? <div className="flex flex-wrap items-center gap-2"><span className="text-muted-foreground">Последняя публикация · версия {publication.latestPublication.siteRevision}</span><StatusBadge kind="sitePublicationStatus" value={publication.latestPublication.status} /></div> : null}
            {progress ? <div className="space-y-1"><p className="font-medium">{progress.stageLabel}</p>{progress.counterLabel ? <p className="text-muted-foreground">{progress.counterLabel}</p> : null}<p className="text-muted-foreground">Прошло: {progress.elapsedLabel}</p><p className="text-muted-foreground">{progress.remainingLabel}</p></div> : null}
            {publication.latestPublication?.lastError || publication.rebuild?.lastError ? <p className="break-words text-destructive">Последняя ошибка: {publication.latestPublication?.lastError || publication.rebuild?.lastError}</p> : null}
          </> : null}
          <Button type="button" size="sm" variant="outline" onClick={() => void (site ? refreshPublicationState(apiUrl, site.id) : loadSite())}><RefreshCw data-icon="inline-start" />Обновить</Button>
          <Button asChild className="min-h-11 w-full"><a href={site ? `/publication?site=${encodeURIComponent(site.id)}` : "/publication"}>Проверить и опубликовать изменения</a></Button>
        </div>
        </Dialog>
      </Popover>
  </DialogTrigger>
}
