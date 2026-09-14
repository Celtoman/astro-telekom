import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, CircleAlert, CloudUpload, LoaderCircle, RefreshCw } from "lucide-react"
import { describePublicationState, type PublicationState } from "../lib/publication-display.mjs"
import { requestJson } from "../lib/admin-api.mjs"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Skeleton } from "./ui/skeleton"

interface PublicationStatusCardProps {
  apiUrl: string
  siteId: string
  publicationRefreshKey?: number
}

const kindLabel = {
  published: "Опубликовано",
  unpublished: "Ожидает публикации",
  publishing: "Выполняется",
  failed: "Ошибка",
} as const

const kindVariant = {
  published: "default",
  unpublished: "secondary",
  publishing: "outline",
  failed: "destructive",
} as const

export function PublicationStatusCard({ apiUrl, siteId, publicationRefreshKey = 0 }: PublicationStatusCardProps) {
  const [state, setState] = useState<PublicationState | null>(null)
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
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
    if (presentation.kind !== "publishing") return
    const timer = window.setTimeout(() => { void loadState() }, 3000)
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

  const presentation = state ? describePublicationState(state) : null

  return <Card aria-label="Публикация сайта">
    <CardHeader>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><CardTitle>Публикация сайта</CardTitle><CardDescription>Сохранение создает рабочую версию. Сайт меняется только после успешной публикации.</CardDescription></div>
        {presentation ? <Badge variant={kindVariant[presentation.kind]}>{kindLabel[presentation.kind]}</Badge> : null}
      </div>
    </CardHeader>
    <CardContent className="flex flex-col gap-4">
      {loading && !state ? <div className="flex flex-col gap-2" aria-busy="true"><Skeleton className="h-5 w-64" /><Skeleton className="h-4 w-full max-w-xl" /></div> : null}
      {presentation ? <Alert variant={presentation.kind === "failed" ? "destructive" : "default"}>
        {presentation.kind === "published" ? <CheckCircle2 /> : presentation.kind === "failed" ? <CircleAlert /> : presentation.kind === "publishing" ? <LoaderCircle className="animate-spin" /> : <CloudUpload />}
        <AlertTitle>{presentation.title}</AlertTitle>
        <AlertDescription>{presentation.description} {presentation.kind !== "published" ? "Предыдущая опубликованная версия остается на сайте до успешного завершения." : ""}</AlertDescription>
      </Alert> : null}
      {error ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Состояние не обновлено</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={!presentation?.canPublish || publishing} onClick={() => void publish()}>
          {publishing ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <CloudUpload data-icon="inline-start" />}
          {publishing ? "Запускаем…" : `Публиковать версию ${state?.workingRevision ?? "—"}`}
        </Button>
        <Button type="button" variant="outline" disabled={loading || publishing} onClick={() => void loadState(true)}><RefreshCw data-icon="inline-start" />Обновить состояние</Button>
      </div>
    </CardContent>
  </Card>
}
