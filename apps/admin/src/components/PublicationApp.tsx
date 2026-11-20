import { FaqCookiePublicationCard } from "./FaqCookiePublicationCard"
import { PublicationIssueCard } from "./PublicationIssueCard"
import { useCallback, useEffect, useRef, useState } from "react"
import { CheckCircle2, CircleAlert, FileCheck2, History, RefreshCw } from "lucide-react"
import { AdminApiError, requestJson, requestSession } from "../lib/admin-api.mjs"
import { publicationChangeLabel, type PublicationReview } from "../lib/publication-review.mjs"
import { describePublicationState } from "../lib/publication-display.mjs"
import { statusPresentation } from "../lib/status-presentation.mjs"
import { AdminShell } from "./AdminShell"
import { PublicationStatusCard } from "./PublicationStatusCard"
import { usePublicationState } from "./usePublicationState"
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
  const snapshot = usePublicationState(apiUrl, site?.id)
  const state = snapshot.status === "ready" ? snapshot.publication : null
  const [loadingSite, setLoadingSite] = useState(true)
  const [siteError, setSiteError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [visibleIssues, setVisibleIssues] = useState(20)
  const siteRequest = useRef(0)
  const reviewRequest = useRef(0)

  const loadSite = useCallback(async () => {
    const request = ++siteRequest.current
    setLoadingSite(true)
    setSiteError(null)
    try {
      const [session, sites] = await Promise.all([
        requestSession<{ user: Administrator }>(apiUrl),
        requestJson<Site[]>(apiUrl, "/admin/sites?summary=true"),
      ])
      if (request !== siteRequest.current) return
      setUser(session.user)
      const requestedId = new URLSearchParams(window.location.search).get("site")
      const selectedSite = requestedId ? sites.find((item) => item.id === requestedId) : sites.length === 1 ? sites[0] : null
      if (!selectedSite) throw new Error("Не удалось однозначно определить сайт для публикации.")
      setSite(selectedSite)
    } catch (caught) {
      if (request !== siteRequest.current) return
      if (caught instanceof AdminApiError && caught.status === 401) { window.location.replace("/login"); return }
      setSiteError(caught instanceof Error ? caught.message : "Не удалось получить список сайтов.")
    } finally { if (request === siteRequest.current) setLoadingSite(false) }
  }, [apiUrl])

  async function checkPublication() {
    if (!site || checking) return
    const request = ++reviewRequest.current
    setChecking(true)
    setReview(null)
    setReviewError(null)
    try {
      const result = await requestJson<PublicationReview>(apiUrl, `/admin/sites/${encodeURIComponent(site.id)}/publication-review`)
      if (request !== reviewRequest.current) return
      setReview(result)
      setVisibleIssues(20)
      window.dispatchEvent(new Event("admin:publication-refresh"))
    } catch (caught) {
      if (request !== reviewRequest.current) return
      if (caught instanceof AdminApiError && caught.status === 401) { window.location.replace("/login"); return }
      setReviewError(caught instanceof Error ? caught.message : "Проверка недоступна.")
    } finally { if (request === reviewRequest.current) setChecking(false) }
  }

  useEffect(() => {
    void loadSite()
    return () => { siteRequest.current += 1; reviewRequest.current += 1 }
  }, [loadSite])

  useEffect(() => {
    if (!site) return
    const focus = () => { void loadSite() }
    window.addEventListener("focus", focus)
    return () => window.removeEventListener("focus", focus)
  }, [site, loadSite])

  const siteUnavailable = siteError ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Публикация недоступна</AlertTitle><AlertDescription>{siteError}</AlertDescription><Button className="min-h-11" onClick={() => void loadSite()}>Повторить</Button></Alert> : null
  if (!user) return <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-6" aria-busy={loadingSite}>
    {siteUnavailable || <><Skeleton className="h-10 w-64" /><Skeleton className="h-80 w-full" /></>}
  </div>

  const stale = Boolean(state && review && (state.siteId !== review.siteId || state.workingRevision !== review.workingRevision || state.publishedRevision !== review.publishedRevision))
  const currentReview = state && !loadingSite && !siteError && !stale ? review : null
  const issues = currentReview?.validation.issues || []
  const blocking = issues.filter((item) => item.severity === "BLOCKING").length
  const warnings = issues.filter((item) => item.severity === "WARNING").length
  const publicationActive = state && describePublicationState(state).kind === "publishing"
  return <AdminShell apiUrl={apiUrl} user={user} active="publication">
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="mb-1 text-sm text-muted-foreground">{site?.name || "Сайт"}</p><h1 className="font-heading text-2xl font-semibold">Публикация сайта</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Здесь выпускаются сохранённые изменения общих страниц, тарифов и городов. Новости, категории и страница 404 публикуются отдельно из своих редакторов.</p></div>
        <Button className="min-h-11" variant="outline" disabled={!site || loadingSite || Boolean(siteError) || checking} onClick={() => void checkPublication()}><RefreshCw data-icon="inline-start" />{checking ? "Проверяем…" : review ? "Обновить проверку" : "Проверить изменения"}</Button>
      </div>
      {siteUnavailable}
      {reviewError ? <Alert variant="destructive" role="alert"><CircleAlert /><AlertTitle>Проверка недоступна</AlertTitle><AlertDescription>{reviewError}</AlertDescription></Alert> : null}
      {stale ? <Alert role="status"><CircleAlert /><AlertTitle>Проверка устарела</AlertTitle><AlertDescription>Ревизия сайта изменилась. Обновите проверку перед выпуском.</AlertDescription></Alert> : null}
      {site && <FaqCookiePublicationCard key={site.id} apiUrl={apiUrl} siteId={site.id} />}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-6" aria-busy={checking}>
          <Card><CardHeader><CardTitle role="heading" aria-level={2}>Что попадёт на сайт</CardTitle><CardDescription>Сохранения в общем контуре сайта после последней публикации. Черновики новостей, категорий и 404 сюда не входят.</CardDescription></CardHeader><CardContent>
            {!state ? <p className="text-sm text-muted-foreground">Рабочая и опубликованная версии появятся после получения состояния сайта.</p> : !state.hasUnpublishedChanges ? <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-4"><CheckCircle2 className="mt-0.5 size-5 shrink-0" /><div><p className="font-medium">Все изменения общего контура опубликованы</p><p className="mt-1 text-sm text-muted-foreground">Новые сохранения общих страниц, тарифов и городов появятся здесь.</p></div></div> : !currentReview ? <div className="space-y-1 text-sm">
              <p className="font-medium">Есть сохранённые изменения</p>
              <p>Рабочая версия {state.workingRevision} · на сайте версия {state.publishedRevision}</p>
              <p className="text-muted-foreground">Запустите проверку, чтобы увидеть состав выпуска.</p>
            </div> : <>
              <p className="mb-4 text-sm"><span className="font-semibold">Сохранений: {currentReview.totalChanges}</span><span className="text-muted-foreground"> · версии {currentReview.publishedRevision + 1}–{currentReview.workingRevision}</span></p>
              <ul className="divide-y">
                {currentReview.changes.map((change) => <li key={change.id} className="py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="break-words text-sm font-medium">{publicationChangeLabel(change)}{change.subject ? ` · ${change.subject}` : ""}</p><p className="mt-1 text-xs text-muted-foreground">{statusPresentation("contentRevisionAction", change.action).label} · версия {change.siteRevision}</p></div><time className="text-xs text-muted-foreground" dateTime={change.createdAt}>{new Date(change.createdAt).toLocaleString("ru-RU")}</time></div>
                  {change.textChanges.length ? <dl className="mt-3 space-y-3 rounded-lg bg-muted/50 p-3 text-sm">{change.textChanges.map((field) => <div key={field.label}><dt className="font-medium">{field.label}</dt><dd className="mt-1 grid gap-2 sm:grid-cols-2"><div className="min-w-0"><span className="text-xs text-muted-foreground">Было</span><p className="break-words">{field.before || "Не задано"}</p></div><div className="min-w-0"><span className="text-xs text-muted-foreground">Сохранено</span><p className="break-words">{field.after || "Не задано"}</p></div></dd></div>)}</dl> : null}
                </li>)}
              </ul>
              {currentReview.totalChanges > currentReview.changes.length ? <p className="mt-3 text-sm text-muted-foreground">Показаны последние {currentReview.changes.length} сохранений. В публикацию входят все {currentReview.totalChanges}.</p> : null}
              <Button className="mt-4 min-h-11" asChild variant="outline"><a href="/audit"><History data-icon="inline-start" />История изменений</a></Button>
            </>}
          </CardContent></Card>
          <Card><CardHeader><CardTitle role="heading" aria-level={2}>Проверка перед публикацией</CardTitle><CardDescription>Проверяется сохранённая версия: страницы, обязательные блоки, URL и SEO.</CardDescription></CardHeader><CardContent className="space-y-4">
            {checking ? <p role="status" className="text-sm">Проверяем сохранённую версию…</p> : !currentReview ? <p className="text-sm text-muted-foreground">{review && !state ? "Ожидаем актуальное состояние сайта." : "Отчёт появится после проверки изменений."}</p> : <>
              <Alert variant={blocking ? "destructive" : "default"}>
                {blocking ? <CircleAlert /> : <FileCheck2 />}<AlertTitle>{blocking ? "Исправьте ошибки перед публикацией" : publicationActive ? "Проверка пройдена · публикация выполняется" : !currentReview.hasUnpublishedChanges ? "Проверка пройдена" : warnings ? "Можно публиковать · есть предупреждения" : "Можно публиковать · проверка пройдена"}</AlertTitle>
                <AlertDescription>Проверено страниц: {currentReview.validation.checkedUrlCount}. Ошибок: {blocking}. Предупреждений: {warnings}.</AlertDescription>
              </Alert>
              {issues.length ? <ul className="space-y-3">{issues.slice(0, visibleIssues).map((issue, index) => <PublicationIssueCard key={`${issue.path}-${issue.code}-${index}`} issue={issue} siteId={site?.id ?? ""} />)}</ul> : null}
              {issues.length > visibleIssues ? <Button className="min-h-11" variant="outline" onClick={() => setVisibleIssues((count) => count + 20)}>Показать ещё 20</Button> : null}
              <details className="text-sm"><summary className="cursor-pointer rounded py-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">Проверенные страницы ({currentReview.validation.checkedUrlCount})</summary><ul className="mt-2 max-h-64 overflow-auto rounded-lg border p-3">{currentReview.validation.checkedPaths.map((path) => <li className="break-all py-1" key={path}>{path}</li>)}</ul></details>
            </>}
          </CardContent></Card>
        </div>
        <aside id="publication-launch" tabIndex={-1} className="min-w-0 scroll-mt-4 space-y-4" aria-label="Запуск и результат публикации">
          {site ? <PublicationStatusCard apiUrl={apiUrl} siteId={site.id} review={currentReview} reviewUnavailable={checking || Boolean(reviewError)} /> : null}
          {currentReview ? <p className="text-xs text-muted-foreground">Проверена версия {currentReview.workingRevision} · {new Date(currentReview.validation.validatedAt).toLocaleString("ru-RU")}.</p> : null}
        </aside>
      </div>
    </div>
  </AdminShell>
}
