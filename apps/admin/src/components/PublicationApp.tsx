import { PublicationIssueCard } from "./PublicationIssueCard"
import { useCallback, useEffect, useRef, useState } from "react"
import { CheckCircle2, CircleAlert, FileCheck2, History, RefreshCw } from "lucide-react"
import { AdminApiError, requestJson } from "../lib/admin-api.mjs"
import { publicationChangeLabel, type PublicationReview } from "../lib/publication-review.mjs"
import { describePublicationState, type PublicationState } from "../lib/publication-display.mjs"
import { statusPresentation } from "../lib/status-presentation.mjs"
import { AdminShell } from "./AdminShell"
import { PublicationStatusCard } from "./PublicationStatusCard"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Skeleton } from "./ui/skeleton"

interface Administrator { id: string; email: string }
interface Site { id: string; name: string }

export function PublicationApp({ apiUrl }: { apiUrl: string }) {
  const [user, setUser] = useState<Administrator | null>(null)
  const [site, setSite] = useState<Site | null>(null)
  const [review, setReview] = useState<PublicationReview | null>(null)
  const [state, setState] = useState<PublicationState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [visibleIssues, setVisibleIssues] = useState(20)
  const sequence = useRef(0)

  const load = useCallback(async () => {
    const request = ++sequence.current
    setLoading(true)
    try {
      const [session, sites] = await Promise.all([
        requestJson<{ user: Administrator }>(apiUrl, "/auth/me"),
        requestJson<Site[]>(apiUrl, "/admin/sites?summary=true"),
      ])
      if (request !== sequence.current) return
      setUser(session.user)
      const requestedId = new URLSearchParams(window.location.search).get("site")
      const selectedSite = requestedId ? sites.find((item) => item.id === requestedId) : sites.length === 1 ? sites[0] : null
      if (!selectedSite) throw new Error("Не удалось однозначно определить сайт для публикации.")
      setSite(selectedSite)
      const result = await requestJson<PublicationReview>(apiUrl, `/admin/sites/${encodeURIComponent(selectedSite.id)}/publication-review`)
      if (request !== sequence.current) return
      setReview(result)
      setVisibleIssues(20)
      setError(null)
      setRefreshKey((value) => value + 1)
      window.dispatchEvent(new Event("admin:publication-refresh"))
    } catch (caught) {
      if (request !== sequence.current) return
      if (caught instanceof AdminApiError && caught.status === 401) { window.location.replace("/login"); return }
      setError(caught instanceof Error ? caught.message : "Проверка недоступна")
    } finally { if (request === sequence.current) setLoading(false) }
  }, [apiUrl])

  useEffect(() => {
    void load()
    const refresh = () => { void load() }
    window.addEventListener("admin:publication-changed", refresh)
    window.addEventListener("focus", refresh)
    return () => { sequence.current += 1; window.removeEventListener("admin:publication-changed", refresh); window.removeEventListener("focus", refresh) }
  }, [load])

  // A completed publication changes the baseline for the list of pending saves.
  useEffect(() => {
    if (state && review && state.publishedRevision !== review.publishedRevision && !loading && !error) void load()
  }, [state?.publishedRevision, review?.publishedRevision, load, loading, error])

  if (!user) return <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-6" aria-busy={loading}>
    {error ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Публикация недоступна</AlertTitle><AlertDescription>{error}</AlertDescription><Button className="min-h-11" onClick={() => void load()}>Повторить</Button></Alert> : <><Skeleton className="h-10 w-64" /><Skeleton className="h-80 w-full" /></>}
  </div>

  const stale = Boolean(state && review && (state.workingRevision !== review.workingRevision || state.publishedRevision !== review.publishedRevision))
  const issues = review?.validation.issues || []
  const blocking = issues.filter((item) => item.severity === "BLOCKING").length
  const warnings = issues.filter((item) => item.severity === "WARNING").length
  const publicationActive = state && describePublicationState(state).kind === "publishing"
  return <AdminShell apiUrl={apiUrl} user={user} active="publication">
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="mb-1 text-sm text-muted-foreground">{site?.name || "Сайт"}</p><h1 className="font-heading text-2xl font-semibold">Публикация сайта</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Сначала сохраните правки в редакторе. Здесь проверьте их и опубликуйте одним действием для всего сайта.</p></div>
        <Button className="min-h-11" variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw data-icon="inline-start" />{loading ? "Проверяем…" : "Обновить проверку"}</Button>
      </div>
      {error ? <Alert variant="destructive" role="alert"><CircleAlert /><AlertTitle>Проверка недоступна</AlertTitle><AlertDescription>{error}. Публикация недоступна до успешного обновления проверки.</AlertDescription></Alert> : null}
      {stale && !loading ? <Alert role="status"><CircleAlert /><AlertTitle>Список изменений устарел</AlertTitle><AlertDescription>Состояние сайта изменилось после проверки. Обновите проверку, чтобы увидеть точный состав публикации.</AlertDescription></Alert> : null}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-6" aria-busy={loading}>
          <Card><CardHeader><CardTitle role="heading" aria-level={2}>Что попадёт на сайт</CardTitle><CardDescription>Все сохранения после последней успешной публикации.</CardDescription></CardHeader><CardContent>
            {!review ? <Skeleton className="h-40 w-full" /> : !review.hasUnpublishedChanges ? <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-4"><CheckCircle2 className="mt-0.5 size-5 shrink-0" /><div><p className="font-medium">Всё сохранённое уже опубликовано</p><p className="mt-1 text-sm text-muted-foreground">После новых сохранений они появятся здесь.</p></div></div> : <>
              <p className="mb-4 text-sm"><span className="font-semibold">Сохранений: {review.totalChanges}</span><span className="text-muted-foreground"> · версии {review.publishedRevision + 1}–{review.workingRevision}</span></p>
              <ul className="divide-y">
                {review.changes.map((change) => <li key={change.id} className="py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="break-words text-sm font-medium">{publicationChangeLabel(change)}{change.subject ? ` · ${change.subject}` : ""}</p><p className="mt-1 text-xs text-muted-foreground">{statusPresentation("contentRevisionAction", change.action).label} · версия {change.siteRevision}</p></div><time className="text-xs text-muted-foreground" dateTime={change.createdAt}>{new Date(change.createdAt).toLocaleString("ru-RU")}</time></div>
                  {change.textChanges.length ? <dl className="mt-3 space-y-3 rounded-lg bg-muted/50 p-3 text-sm">{change.textChanges.map((field) => <div key={field.label}><dt className="font-medium">{field.label}</dt><dd className="mt-1 grid gap-2 sm:grid-cols-2"><div className="min-w-0"><span className="text-xs text-muted-foreground">Было</span><p className="break-words">{field.before || "Не задано"}</p></div><div className="min-w-0"><span className="text-xs text-muted-foreground">Сохранено</span><p className="break-words">{field.after || "Не задано"}</p></div></dd></div>)}</dl> : null}
                </li>)}
              </ul>
              {review.totalChanges > review.changes.length ? <p className="mt-3 text-sm text-muted-foreground">Показаны последние {review.changes.length} сохранений. В публикацию входят все {review.totalChanges}.</p> : null}
              <Button className="mt-4 min-h-11" asChild variant="outline"><a href="/audit"><History data-icon="inline-start" />История изменений</a></Button>
            </>}
          </CardContent></Card>
          <Card><CardHeader><CardTitle role="heading" aria-level={2}>Проверка перед публикацией</CardTitle><CardDescription>Проверяется сохранённая версия: страницы, обязательные блоки, URL и SEO.</CardDescription></CardHeader><CardContent className="space-y-4">
            {!review ? <Skeleton className="h-20 w-full" /> : <>
              <Alert variant={blocking ? "destructive" : "default"}>
                {blocking ? <CircleAlert /> : <FileCheck2 />}<AlertTitle>{blocking ? "Исправьте ошибки перед публикацией" : publicationActive ? "Проверка пройдена · публикация выполняется" : !review.hasUnpublishedChanges ? "Проверка пройдена" : warnings ? "Можно публиковать · есть предупреждения" : "Можно публиковать · проверка пройдена"}</AlertTitle>
                <AlertDescription>Проверено страниц: {review.validation.checkedUrlCount}. Ошибок: {blocking}. Предупреждений: {warnings}.</AlertDescription>
              </Alert>
              {issues.length ? <ul className="space-y-3">{issues.slice(0, visibleIssues).map((issue, index) => <PublicationIssueCard key={`${issue.path}-${issue.code}-${index}`} issue={issue} siteId={site?.id ?? ""} />)}</ul> : null}
              {issues.length > visibleIssues ? <Button className="min-h-11" variant="outline" onClick={() => setVisibleIssues((count) => count + 20)}>Показать ещё 20</Button> : null}
              <details className="text-sm"><summary className="cursor-pointer rounded py-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">Проверенные страницы ({review.validation.checkedUrlCount})</summary><ul className="mt-2 max-h-64 overflow-auto rounded-lg border p-3">{review.validation.checkedPaths.map((path) => <li className="break-all py-1" key={path}>{path}</li>)}</ul></details>
            </>}
          </CardContent></Card>
        </div>
        <aside id="publication-launch" className="min-w-0 scroll-mt-4 space-y-4" aria-label="Запуск и результат публикации">
          {site ? <PublicationStatusCard apiUrl={apiUrl} siteId={site.id} publicationRefreshKey={refreshKey} review={review} reviewUnavailable={loading || Boolean(error) || stale} onStateChange={setState} /> : null}
          {review ? <p className="text-xs text-muted-foreground">Проверена версия {review.workingRevision} · {new Date(review.validation.validatedAt).toLocaleString("ru-RU")}. На сайте: версия {state?.publishedRevision ?? review.publishedRevision}.</p> : null}
        </aside>
      </div>
    </div>
  </AdminShell>
}
