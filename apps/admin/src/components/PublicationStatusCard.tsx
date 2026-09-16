import { useCallback, useEffect, useState } from "react"
import { CalendarClock, CheckCircle2, CircleAlert, CloudUpload, LoaderCircle, RefreshCw, X } from "lucide-react"
import { describePublicationState, type PublicationState } from "../lib/publication-display.mjs"
import { requestJson } from "../lib/admin-api.mjs"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Input } from "./ui/input"
import { Skeleton } from "./ui/skeleton"
import { StatusBadge } from "./StatusBadge"

interface PublicationStatusCardProps {
  apiUrl: string
  siteId: string
  publicationRefreshKey?: number
}

export function PublicationStatusCard({ apiUrl, siteId, publicationRefreshKey = 0 }: PublicationStatusCardProps) {
  const [state, setState] = useState<PublicationState | null>(null)
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [scheduledFor, setScheduledFor] = useState("")
  const [error, setError] = useState<string | null>(null)

  const loadState = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    try {
      const next = await requestJson<PublicationState>(apiUrl, `/admin/sites/${siteId}/publication-state`)
      setState(next)
      setError(null)
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Состояние публикации недоступно")
    } finally {
      setLoading(false)
    }
  }, [apiUrl, siteId])

  useEffect(() => { void loadState(true) }, [loadState, publicationRefreshKey])

  useEffect(() => {
    if (!state) return
    const presentation = describePublicationState(state)
    if (presentation.kind !== "publishing" && presentation.kind !== "scheduled") return
    const timer = window.setTimeout(() => { void loadState() }, presentation.kind === "publishing" ? 3000 : 15000)
    return () => window.clearTimeout(timer)
  }, [loadState, state])

  async function publish() {
    if (!state) return
    setPublishing(true)
    setError(null)
    try {
      await requestJson(apiUrl, `/admin/sites/${siteId}/publications`, {
        method: "POST",
        body: { expectedWorkingRevision: state.workingRevision },
      })
      await loadState()
    } catch (caught: unknown) {
      const message = caught instanceof Error ? caught.message : "Публикация не запущена"
      await loadState()
      setError(message)
    } finally {
      setPublishing(false)
    }
  }

  async function schedule() {
    if (!state || !scheduledFor) return
    const date = new Date(scheduledFor)
    if (!Number.isFinite(date.getTime())) {
      setError("Укажите корректные дату и время")
      return
    }
    setScheduling(true)
    setError(null)
    try {
      await requestJson(apiUrl, `/admin/sites/${siteId}/publication-schedules`, {
        method: "POST",
        body: { expectedWorkingRevision: state.workingRevision, scheduledFor: new Date(scheduledFor).toISOString() },
      })
      setScheduledFor("")
      await loadState()
    } catch (caught: unknown) {
      const message = caught instanceof Error ? caught.message : "Расписание не сохранено"
      await loadState()
      setError(message)
    } finally {
      setScheduling(false)
    }
  }

  async function cancelSchedule() {
    const publicationId = state?.scheduledPublication?.id
    if (!publicationId) return
    setCancelling(true)
    setError(null)
    try {
      await requestJson(apiUrl, `/admin/sites/${siteId}/publication-schedules/${encodeURIComponent(publicationId)}`, { method: "DELETE" })
      await loadState()
    } catch (caught: unknown) {
      const message = caught instanceof Error ? caught.message : "Расписание не отменено"
      await loadState()
      setError(message)
    } finally {
      setCancelling(false)
    }
  }

  const presentation = state ? describePublicationState(state) : null

  return <Card aria-label="Публикация сайта">
    <CardHeader>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><CardTitle>Публикация сайта</CardTitle><CardDescription>Сохранение создает рабочую версию. Сайт меняется только после успешной публикации.</CardDescription></div>
        {presentation ? <StatusBadge kind="publicationView" value={presentation.kind} /> : null}
      </div>
    </CardHeader>
    <CardContent className="flex flex-col gap-4">
      {loading && !state ? <div className="flex flex-col gap-2" aria-busy="true"><Skeleton className="h-5 w-64" /><Skeleton className="h-4 w-full max-w-xl" /></div> : null}
      {presentation ? <Alert variant={presentation.kind === "failed" ? "destructive" : "default"}>
        {presentation.kind === "published" ? <CheckCircle2 /> : presentation.kind === "failed" ? <CircleAlert /> : presentation.kind === "publishing" ? <LoaderCircle className="animate-spin" /> : presentation.kind === "scheduled" ? <CalendarClock /> : <CloudUpload />}
        <AlertTitle>{presentation.title}</AlertTitle>
        <AlertDescription>{presentation.description} {presentation.kind !== "published" ? "Предыдущая опубликованная версия остается на сайте до успешного завершения." : ""}</AlertDescription>
      </Alert> : null}
      {error ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Состояние не обновлено</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {state?.scheduledPublication ? <Alert>
        <CalendarClock />
        <AlertTitle>Точная версия {state.scheduledPublication.siteRevision} ожидает расписания</AlertTitle>
        <AlertDescription><span className="block">Запуск: {state.scheduledPublication.scheduledFor ? new Date(state.scheduledPublication.scheduledFor).toLocaleString("ru-RU") : "время не указано"}. Более поздние сохранения не войдут в этот зафиксированный снимок.</span><Button className="mt-3" type="button" size="sm" variant="outline" disabled={cancelling || publishing} onClick={() => void cancelSchedule()}><X data-icon="inline-start" />{cancelling ? "Отменяем…" : "Отменить расписание"}</Button></AlertDescription>
      </Alert> : <div className="flex flex-col gap-2 rounded-lg border p-4">
        <div><p className="text-sm font-medium">Публикация по расписанию</p><p className="text-sm text-muted-foreground">Будет зафиксирована точная текущая рабочая версия. Следующие правки в нее не попадут.</p></div>
        <div className="flex flex-wrap items-end gap-2"><label className="flex min-w-64 flex-col gap-1 text-sm font-medium" htmlFor={`publication-schedule-${siteId}`}>Дата и время<Input id={`publication-schedule-${siteId}`} type="datetime-local" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} /></label><Button type="button" variant="outline" disabled={!state?.hasUnpublishedChanges || !scheduledFor || scheduling || publishing || presentation?.kind === "publishing"} onClick={() => void schedule()}><CalendarClock data-icon="inline-start" />{scheduling ? "Планируем…" : `Запланировать версию ${state?.workingRevision ?? "—"}`}</Button></div>
      </div>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={!presentation?.canPublish || publishing || scheduling || cancelling} onClick={() => void publish()}>
          {publishing ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <CloudUpload data-icon="inline-start" />}
          {publishing ? "Запускаем…" : `Публиковать версию ${state?.workingRevision ?? "—"}`}
        </Button>
        <Button type="button" variant="outline" disabled={loading || publishing} onClick={() => void loadState(true)}><RefreshCw data-icon="inline-start" />Обновить состояние</Button>
      </div>
    </CardContent>
  </Card>
}
