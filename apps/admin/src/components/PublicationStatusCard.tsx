import { useState } from "react"
import { CheckCircle2, CircleAlert, CloudUpload, LoaderCircle, RefreshCw } from "lucide-react"
import { describePublicationState } from "../lib/publication-display.mjs"
import { requestJson } from "../lib/admin-api.mjs"
import { refreshPublicationState } from "../lib/publication-state.mjs"
import { usePublicationState } from "./usePublicationState"
import { canPublishReviewedRevision, type PublicationReview } from "../lib/publication-review.mjs"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Skeleton } from "./ui/skeleton"
import { StatusBadge } from "./StatusBadge"
import { PublicationValidationPanel } from "./PublicationValidationPanel"
import { PublicationProgress } from "./PublicationProgress"

interface PublicationStatusCardProps {
  apiUrl: string
  siteId: string
  review?: PublicationReview | null
  reviewUnavailable?: boolean
}

export function PublicationStatusCard({ apiUrl, siteId, review, reviewUnavailable = false }: PublicationStatusCardProps) {
  const { publication: state, status, error } = usePublicationState(apiUrl, siteId)
  const loading = status === "loading"
  const stateUnavailable = status === "error"
  const [publishing, setPublishing] = useState(false)
  const [publishFailure, setPublishFailure] = useState<{ siteId: string; message: string } | null>(null)
  const publishError = publishFailure?.siteId === siteId ? publishFailure.message : null

  async function publish() {
    if (!canPublishReviewedRevision(state, review ?? null, { unavailable: stateUnavailable || reviewUnavailable || loading, busy: publishing }) || !review) return
    setPublishing(true)
    setPublishFailure(null)
    try {
      await requestJson(apiUrl, `/admin/sites/${siteId}/publications`, {
        method: "POST",
        body: { expectedWorkingRevision: review.workingRevision },
      })
    } catch (caught: unknown) {
      const message = caught instanceof Error ? caught.message : "Не удалось подтвердить запуск публикации"
      await refreshPublicationState(apiUrl, siteId)
      setPublishFailure({ siteId, message })
    } finally {
      setPublishing(false)
    }
  }

  const presentation = state && status === "ready" ? describePublicationState(state) : null
  const canPublish = canPublishReviewedRevision(state, review ?? null, { unavailable: stateUnavailable || reviewUnavailable || loading, busy: publishing })

  return <Card aria-label="Публикация сайта">
    <CardHeader>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><CardTitle role="heading" aria-level={2}>{review === undefined ? "Публикация сайта" : "Запуск публикации"}</CardTitle>{review === undefined ? <CardDescription>Сохранение создаёт рабочую версию. Сайт меняется только после успешной публикации.</CardDescription> : null}</div>
        {presentation ? <StatusBadge kind="publicationView" value={presentation.kind} /> : null}
      </div>
    </CardHeader>
    <CardContent className="flex flex-col gap-4">
      {loading && state ? <p role="status" className="text-sm text-muted-foreground">Обновляем состояние публикации…</p> : null}
      {loading && !state ? <div className="flex flex-col gap-2" aria-busy="true"><Skeleton className="h-5 w-64" /><Skeleton className="h-4 w-full max-w-xl" /></div> : null}
      {presentation ? <Alert role="status" aria-live="polite" variant={presentation.kind === "failed" ? "destructive" : "default"}>
        {presentation.kind === "published" ? <CheckCircle2 /> : presentation.kind === "failed" ? <CircleAlert /> : presentation.kind === "publishing" ? <LoaderCircle className="animate-spin motion-reduce:animate-none" /> : <CloudUpload />}
        <AlertTitle>{presentation.title}</AlertTitle>
        <AlertDescription>{presentation.description}</AlertDescription>
      </Alert> : null}
      {state ? <PublicationProgress state={state} unavailable={stateUnavailable} /> : null}
      {error ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Состояние не обновлено</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {publishError ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Запуск публикации не подтверждён</AlertTitle><AlertDescription>{publishError}</AlertDescription></Alert> : null}
      {review === undefined ? <>
        <Button asChild className="min-h-11"><a href={`/publication?site=${encodeURIComponent(siteId)}`}><CloudUpload data-icon="inline-start" />Проверить и опубликовать изменения</a></Button>
      </> : <>
      <div className="flex flex-col gap-2">
        <Button className="min-h-11 w-full" type="button" disabled={!canPublish} onClick={() => void publish()}>
          {publishing ? <LoaderCircle className="animate-spin motion-reduce:animate-none" data-icon="inline-start" /> : <CloudUpload data-icon="inline-start" />}
          {publishing ? "Запускаем публикацию…" : "Опубликовать изменения"}
        </Button>
        <p className="text-sm text-muted-foreground">Публикуются все сохранённые изменения сайта. Несохранённые поля в редакторах в публикацию не входят.</p>
        {state && review && state.workingRevision !== review.workingRevision ? <p role="status" className="text-sm">Появились новые сохранения. Обновите проверку перед публикацией.</p> : null}
      </div>
      <PublicationValidationPanel apiUrl={apiUrl} siteId={siteId} validation={state?.latestValidation || null} />
      </>}
      <div className="flex flex-wrap gap-2">
        <Button className="min-h-11" type="button" variant="outline" disabled={loading || publishing} onClick={() => { setPublishFailure(null); void refreshPublicationState(apiUrl, siteId) }}><RefreshCw data-icon="inline-start" />Обновить состояние</Button>
      </div>
    </CardContent>
  </Card>
}
