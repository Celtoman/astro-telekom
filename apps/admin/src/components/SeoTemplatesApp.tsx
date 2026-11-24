import { useCallback, useEffect, useRef, useState } from "react"
import { CircleAlert, Save } from "lucide-react"
import { AdminApiError, readSiteSettings, requestJson } from "../lib/admin-api.mjs"
import { insertVariableAtSelection } from "../lib/variable-insertion.mjs"
import { AdminShell } from "./AdminShell"
import { useUnsavedChanges } from "./useUnsavedChanges"
import { PublicationStatusCard } from "./PublicationStatusCard"
import { VariableInsertionPicker } from "./VariableInsertionPicker"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Field, FieldDescription, FieldLabel } from "./ui/field"
import { Input } from "./ui/input"
import { Skeleton } from "./ui/skeleton"

type Kind = "EQUIPMENT_ROUTER" | "FAQ" | "CITY_SUPPORT" | "SPEED_TEST" | "OFFICIAL_SITE" | "ACCOUNT" | "HOME" | "COVERAGE" | "CITIES" | "PRIVACY" | "PERSONAL_DATA_CONSENT" | "COOKIE_POLICY" | "CITY_HOME" | "CITY_TARIFF_DETAIL" | "CITY_ADDRESS_CHECK"
type IndexState = "INDEX" | "NOINDEX"
type TextField = "titleTemplate" | "descriptionTemplate" | "ogTitleTemplate" | "ogDescriptionTemplate"
interface Administrator { id: string; email: string }
interface Site { id: string; name: string; slug: string }
interface Template { id: string; kind: Kind; titleTemplate: string; descriptionTemplate: string; indexState: IndexState; ogTitleTemplate?: string | null; ogDescriptionTemplate?: string | null; ogImageUrl?: string | null }
interface Meta { title: string; description: string; indexState: IndexState; ogTitle?: string; ogDescription?: string; ogImage?: string }
interface Diagnostic { code: string; path: string; relatedPath?: string; length?: number }
interface Workspace {
  id: string; slug: string; workingRevision: number; publishedRevision: number
  templates: Template[]
}
interface RouteReview {
  workingRevision: number; workingError: string | null; reviewId?: string
  page: number; pageSize: number; total: number; routes: string[]
  detail: { path: string; working: Meta | null; published: Meta | null; publishedPublicationId: string | null; warnings: Diagnostic[] } | null
}

const labels: Record<Kind, string> = {
  CITY_SUPPORT:'Техническая поддержка городов',
  FAQ: "Вопросы и ответы",
  SPEED_TEST: "Проверка скорости интернета",
  EQUIPMENT_ROUTER: "Роутеры",
  OFFICIAL_SITE: "Официальный сайт",
  ACCOUNT: "Личный кабинет",
  HOME: "Главная сайта", COVERAGE: "Карта покрытия", CITIES: "Города обслуживания",
  PRIVACY: "Политика конфиденциальности", PERSONAL_DATA_CONSENT: "Согласие на обработку данных",
  COOKIE_POLICY: "Политика cookie", CITY_ADDRESS_CHECK: "Проверка подключения по адресу", CITY_HOME: "Главные страницы городов", CITY_TARIFF_DETAIL: "Страницы тарифов",
}
const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
const textareaClass = "min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"

export function SeoTemplatesApp({ apiUrl }: { apiUrl: string }) {
  const [user, setUser] = useState<Administrator | null>(null)
  const [site, setSite] = useState<Site | null>(null)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [kind, setKind] = useState<Kind>("HOME")
  const [path, setPath] = useState("")
  const [review, setReview] = useState<RouteReview | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const reviewRequest = useRef<AbortController | null>(null)
  const settingsRequest = useRef(0)
  const [titleTemplate, setTitleTemplate] = useState("")
  const [descriptionTemplate, setDescriptionTemplate] = useState("")
  const [ogTitleTemplate, setOgTitleTemplate] = useState("")
  const [ogDescriptionTemplate, setOgDescriptionTemplate] = useState("")
  const [ogImageUrl, setOgImageUrl] = useState("")
  const [indexState, setIndexState] = useState<IndexState>("INDEX")
  const [confirmed, setConfirmed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [activeField, setActiveField] = useState<TextField | null>(null)
  const [insertionError, setInsertionError] = useState<string | null>(null)
  const activeInput = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)


  const invalidateReview = () => {
    reviewRequest.current?.abort()
    reviewRequest.current = null
    setReview(null); setReviewError(null); setReviewing(false); setPath("")
  }

  const load = useCallback(async (selectedKind?: Kind, fresh = true) => {
    const request = ++settingsRequest.current
    invalidateReview()
    setLoading(true); setError(null)
    try {
      const { user, current } = await readSiteSettings(
        apiUrl,
        (sites: Site[]) => sites.length === 1 ? sites[0] : null,
        (siteId) => requestJson<Workspace>(apiUrl, `/admin/sites/${encodeURIComponent(siteId)}/seo-templates/settings`),
        { fresh },
      )
      if (request !== settingsRequest.current) return
      if (!current) throw new Error("Редактор SEO ожидает единственный сайт Дом.ру")
      const { site, data } = current
      setUser(user); setSite(site); setWorkspace(data)
      const nextKind = selectedKind || kind
      const template = data.templates.find((item) => item.kind === nextKind)
      if (!template) throw new Error(`Не найден обязательный SEO-шаблон ${nextKind}`)
      setTitleTemplate(template.titleTemplate); setDescriptionTemplate(template.descriptionTemplate); setIndexState(template.indexState)
      setOgTitleTemplate(template.ogTitleTemplate || ""); setOgDescriptionTemplate(template.ogDescriptionTemplate || ""); setOgImageUrl(template.ogImageUrl || "")
      setConfirmed(false)
    } catch (caught) {
      if (request !== settingsRequest.current) return
      if (caught instanceof AdminApiError && caught.status === 401) { window.location.replace("/login"); return }
      setError(caught instanceof Error ? caught.message : "Данные SEO недоступны")
    } finally { if (request === settingsRequest.current) setLoading(false) }
  }, [apiUrl, kind])

  useEffect(() => {
    const requestedKind = new URLSearchParams(window.location.search).get("kind")
    const nextKind = requestedKind && Object.prototype.hasOwnProperty.call(labels, requestedKind) ? requestedKind as Kind : "HOME"
    setKind(nextKind)
    void load(nextKind, false)
    return () => { settingsRequest.current++; reviewRequest.current?.abort() }
  }, [])

  const template = workspace?.templates.find((item) => item.kind === kind)
  const routes = review?.routes ?? []
  const affectedCount = !review || review.workingError ? null : review.total
  const enteringNoindex = template?.indexState !== "NOINDEX" && indexState === "NOINDEX"
  const changed = Boolean(template && (titleTemplate !== template.titleTemplate || descriptionTemplate !== template.descriptionTemplate || indexState !== template.indexState || ogTitleTemplate !== (template.ogTitleTemplate || "") || ogDescriptionTemplate !== (template.ogDescriptionTemplate || "") || ogImageUrl !== (template.ogImageUrl || "")))
  useUnsavedChanges(changed)
  const canSave = Boolean(changed && titleTemplate.trim() && descriptionTemplate.trim() && (!enteringNoindex || (confirmed && !reviewing && affectedCount !== null && affectedCount > 0)))
  const detail = review?.detail?.path === path ? review.detail : null

  async function reviewRoutes(page = 1, requestedPath?: string, restart = false) {
    if (!site || !workspace) return
    reviewRequest.current?.abort()
    const request = new AbortController()
    reviewRequest.current = request
    setReviewing(true); setReviewError(null)
    const query = new URLSearchParams({ workingRevision: String(workspace.workingRevision), kind, page: String(page) })
    if (requestedPath) query.set("path", requestedPath)
    if (restart) query.set("startReview", "true")
    else if (review?.reviewId) query.set("reviewId", review.reviewId)
    if (!restart && review?.detail) query.set("publishedPublicationId", review.detail.publishedPublicationId ?? "")
    try {
      const result = await requestJson<RouteReview>(apiUrl, `/admin/sites/${site.id}/seo-templates/review?${query}`, { signal: request.signal, cache: "no-store" })
      if (request.signal.aborted) return
      if (review && review.total !== result.total) setConfirmed(false)
      setReview(result)
      setPath(result.detail?.path ?? "")
    } catch (caught) {
      if (request.signal.aborted) return
      if (caught instanceof AdminApiError && caught.status === 409) {
        setReview(null); setConfirmed(false)
      }
      setReviewError(caught instanceof Error ? caught.message : "Проверка URL недоступна")
    } finally {
      if (!request.signal.aborted) setReviewing(false)
    }
  }

  function selectKind(nextKind: Kind) {
    if (!workspace) return
    const next = workspace.templates.find((item) => item.kind === nextKind)
    if (!next) return
    setKind(nextKind); setTitleTemplate(next.titleTemplate); setDescriptionTemplate(next.descriptionTemplate)
    setOgTitleTemplate(next.ogTitleTemplate || ""); setOgDescriptionTemplate(next.ogDescriptionTemplate || ""); setOgImageUrl(next.ogImageUrl || "")
    setIndexState(next.indexState); invalidateReview()
    setActiveField(null); activeInput.current = null; setInsertionError(null)
    setConfirmed(false); setMessage(null)
  }

  function rememberField(field: TextField, element: HTMLInputElement | HTMLTextAreaElement) {
    activeInput.current = element
    setActiveField(field)
  }

  function insertCode(code: string) {
    const element = activeInput.current
    if (!activeField || !element) return
    const values = { titleTemplate, descriptionTemplate, ogTitleTemplate, ogDescriptionTemplate }
    const setters = { titleTemplate: setTitleTemplate, descriptionTemplate: setDescriptionTemplate, ogTitleTemplate: setOgTitleTemplate, ogDescriptionTemplate: setOgDescriptionTemplate }
    const value = values[activeField]
    const insertion = insertVariableAtSelection(value, element.selectionStart ?? value.length, element.selectionEnd ?? value.length, code, 1000)
    if (!insertion) { setInsertionError("Код не помещается в лимит поля — 1000 символов."); return }
    setters[activeField](insertion.value)
    setInsertionError(null)
    requestAnimationFrame(() => { element.focus(); element.setSelectionRange(insertion.selectionStart, insertion.selectionEnd) })
  }

  async function save() {
    if (!site || !workspace || !canSave) return
    setSaving(true); setError(null); setMessage(null)
    try {
      await requestJson(apiUrl, `/admin/sites/${site.id}/seo-templates/${kind}`, {
        method: "PATCH", body: {
          expectedWorkingRevision: workspace.workingRevision, titleTemplate, descriptionTemplate, indexState,
          ogTitleTemplate: ogTitleTemplate || null, ogDescriptionTemplate: ogDescriptionTemplate || null, ogImageUrl: ogImageUrl || null,
          ...(enteringNoindex ? { confirmNoindexCount: affectedCount } : {}),
        },
      })
      setMessage("Шаблон сохранён в рабочей версии. Публичный сайт изменится после общей публикации.")
      await load(kind)
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Шаблон не сохранён") }
    finally { setSaving(false) }
  }

  if (loading && !user) return <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-8" aria-busy="true"><Skeleton className="h-10 w-64" /><Skeleton className="h-96 w-full" /></div>
  if (!user) return <div className="flex min-h-screen items-center justify-center p-6"><Alert variant="destructive"><CircleAlert /><AlertTitle>SEO-шаблоны недоступны</AlertTitle><AlertDescription>{error || "Не удалось загрузить данные"}</AlertDescription><Button onClick={() => void load()}>Повторить</Button></Alert></div>

  return <AdminShell apiUrl={apiUrl} user={user} active="seo-templates">
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6 lg:p-8">
      <div><h1 className="font-heading text-2xl font-semibold">SEO-шаблоны</h1><p className="mt-1 text-sm text-muted-foreground">Один шаблон на тип страницы. Переменные разрешаются отдельно для каждого опубликованного URL.</p></div>
      {error ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Ошибка</AlertTitle><AlertDescription>{error}</AlertDescription><Button variant="outline" size="sm" onClick={() => void load(kind)}>Обновить</Button></Alert> : null}
      {message ? <Alert><Save /><AlertTitle>Сохранено</AlertTitle><AlertDescription>{message}</AlertDescription></Alert> : null}
      {site ? <PublicationStatusCard apiUrl={apiUrl} siteId={site.id} /> : null}
      <Card><CardHeader><CardTitle>Редактор</CardTitle><CardDescription>Рабочая версия {workspace?.workingRevision ?? "—"}; опубликована {workspace?.publishedRevision ?? "—"}. Title и Description обязательны. Большая длина и совпадения — предупреждения, не запрет.</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          <Field><FieldLabel htmlFor="seo-kind">Тип страницы</FieldLabel><select id="seo-kind" className={selectClass} value={kind} onChange={(event) => selectKind(event.target.value as Kind)}>{(Object.keys(labels) as Kind[]).map((item) => <option key={item} value={item}>{labels[item]}</option>)}</select><FieldDescription>{affectedCount === null ? "Для подсчёта проверьте маршруты" : `${affectedCount} опубликованных URL этого типа`}</FieldDescription></Field>
          <Field><FieldLabel htmlFor="seo-title">Title</FieldLabel><Input id="seo-title" value={titleTemplate} onChange={(event) => setTitleTemplate(event.target.value)} onFocus={(event) => rememberField("titleTemplate", event.currentTarget)} onSelect={(event) => rememberField("titleTemplate", event.currentTarget)} maxLength={1000} /><FieldDescription>{titleTemplate.length} символов · подстановки в фигурных скобках</FieldDescription></Field>
          <Field><FieldLabel htmlFor="seo-description">Description</FieldLabel><textarea id="seo-description" className={textareaClass} value={descriptionTemplate} onChange={(event) => setDescriptionTemplate(event.target.value)} onFocus={(event) => rememberField("descriptionTemplate", event.currentTarget)} onSelect={(event) => rememberField("descriptionTemplate", event.currentTarget)} maxLength={1000} /><FieldDescription>{descriptionTemplate.length} символов</FieldDescription></Field>
          <div className="space-y-4 rounded-lg border p-4"><h2 className="font-semibold">Социальные сети · Open Graph</h2><p className="text-sm text-muted-foreground">Все поля необязательны. Пустые Title и Description возьмут обычные SEO-значения; пустое изображение — изображение сайта.</p>
            <Field><FieldLabel htmlFor="seo-og-title">OG Title</FieldLabel><Input id="seo-og-title" value={ogTitleTemplate} onChange={(event) => setOgTitleTemplate(event.target.value)} onFocus={(event) => rememberField("ogTitleTemplate", event.currentTarget)} onSelect={(event) => rememberField("ogTitleTemplate", event.currentTarget)} maxLength={1000} /><FieldDescription>Можно использовать разрешённые переменные этого типа страницы.</FieldDescription></Field>
            <Field><FieldLabel htmlFor="seo-og-description">OG Description</FieldLabel><textarea id="seo-og-description" className={textareaClass} value={ogDescriptionTemplate} onChange={(event) => setOgDescriptionTemplate(event.target.value)} onFocus={(event) => rememberField("ogDescriptionTemplate", event.currentTarget)} onSelect={(event) => rememberField("ogDescriptionTemplate", event.currentTarget)} maxLength={1000} /></Field>
            <Field><FieldLabel htmlFor="seo-og-image">OG image URL</FieldLabel><Input id="seo-og-image" value={ogImageUrl} onChange={(event) => setOgImageUrl(event.target.value)} maxLength={2048} placeholder="https://…/image.webp" /><FieldDescription>HTTPS-изображение либо доступный локальный asset; подстановки в URL запрещены.</FieldDescription></Field>
          </div>
          {site ? <VariableInsertionPicker apiUrl={apiUrl} siteId={site.id} field={activeField ? `SeoTemplate.${activeField}` : null} context={kind === "CITY_TARIFF_DETAIL" ? "TARIFF" : ["CITY_HOME", "CITY_ADDRESS_CHECK", "CITY_SUPPORT"].includes(kind) ? "CITY" : "SITE"} onInsert={insertCode} /> : null}
          {insertionError ? <Alert variant="destructive"><CircleAlert /><AlertDescription>{insertionError}</AlertDescription></Alert> : null}
          <Field><FieldLabel htmlFor="seo-index">Индексация</FieldLabel><select id="seo-index" className={selectClass} value={indexState} onChange={(event) => { setIndexState(event.target.value as IndexState); setConfirmed(false) }}><option value="INDEX">index</option><option value="NOINDEX">noindex, follow</option></select><FieldDescription>При noindex URL исключаются из sitemap того же снимка публикации.</FieldDescription></Field>
          {enteringNoindex ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Массовое изменение индексации</AlertTitle><AlertDescription>{affectedCount === null ? "Проверьте маршруты, чтобы получить точное число затронутых URL." : `После публикации ${affectedCount} URL получат noindex и исчезнут из sitemap. Подтвердите точное число перед сохранением.`}</AlertDescription><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={!affectedCount || reviewing} onChange={(event) => setConfirmed(event.target.checked)} />Подтверждаю noindex для {affectedCount ?? "—"} URL</label></Alert> : null}
          <div className="flex items-center justify-between gap-4 border-t pt-4"><span className="text-sm text-muted-foreground">Изменения вступят в силу после публикации сайта.</span><Button disabled={!canSave || saving || loading} onClick={() => void save()}><Save data-icon="inline-start" />{saving ? "Сохраняем…" : "Сохранить"}</Button></div>
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle>Предпросмотр URL</CardTitle><CardDescription>Рабочий и опубликованный снимки. Черновик в полях выше появится в просмотре после сохранения.</CardDescription></CardHeader><CardContent className="space-y-4">
        <Button variant="outline" disabled={!workspace || reviewing || loading} onClick={() => void reviewRoutes(review?.page || 1, path || undefined, true)}>{reviewing ? "Проверяем маршруты…" : "Проверить маршруты"}</Button>
        {reviewError ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Проверка URL не завершена</AlertTitle><AlertDescription>{reviewError}</AlertDescription><Button variant="outline" size="sm" onClick={() => void load(kind)}>Обновить шаблоны</Button></Alert> : null}
        {review?.workingError ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Публикация заблокирована</AlertTitle><AlertDescription>{review.workingError}. Исправьте шаблон или исходные данные.</AlertDescription></Alert> : null}
        <Field><FieldLabel htmlFor="seo-path">Маршрут</FieldLabel><select id="seo-path" className={selectClass} value={path} onChange={event => setPath(event.target.value)} disabled={!routes.length || reviewing}><option value="">{routes.length ? "Выберите URL" : review ? "Нет проверенных URL этого типа" : "Маршруты ещё не проверены"}</option>{routes.map(route => <option key={route} value={route}>{route}</option>)}</select></Field>
        {review && review.total > review.pageSize ? <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={review.page <= 1 || reviewing} onClick={() => void reviewRoutes(review.page - 1)}>Назад</Button>
          <span className="text-sm">Страница {review.page} из {Math.ceil(review.total / review.pageSize)}</span>
          <Button variant="outline" size="sm" disabled={review.page * review.pageSize >= review.total || reviewing} onClick={() => void reviewRoutes(review.page + 1)}>Далее</Button>
        </div> : null}
        {path && !detail ? <Button variant="outline" size="sm" disabled={reviewing} onClick={() => void reviewRoutes(review?.page || 1, path)}>Проверить выбранный URL</Button> : null}
        {detail ? <div className="grid gap-4 md:grid-cols-2"><Preview label="Рабочая версия" meta={detail.working} /><Preview label="Опубликованная версия" meta={detail.published} /></div> : null}
        {detail?.warnings.length ? <Alert><CircleAlert /><AlertTitle>Предупреждения для {path}</AlertTitle><AlertDescription>{detail.warnings.map((warning) => <p key={`${warning.code}-${warning.relatedPath || ""}`}>{warning.code}{warning.length ? ` · ${warning.length} символов` : ""}{warning.relatedPath ? ` · совпадает с ${warning.relatedPath}` : ""}</p>)}</AlertDescription></Alert> : null}
      </CardContent></Card>
    </div>
  </AdminShell>
}

function Preview({ label, meta }: { label: string; meta: Meta | null | undefined }) {
  return <div className="rounded-lg border p-4 text-sm"><h3 className="mb-3 font-semibold">{label}</h3>{meta ? <dl className="space-y-3"><div><dt className="text-muted-foreground">Title</dt><dd className="break-words">{meta.title}</dd></div><div><dt className="text-muted-foreground">Description</dt><dd className="break-words">{meta.description}</dd></div><div><dt className="text-muted-foreground">OG Title</dt><dd className="break-words">{meta.ogTitle || meta.title}</dd></div><div><dt className="text-muted-foreground">OG Description</dt><dd className="break-words">{meta.ogDescription || meta.description}</dd></div><div><dt className="text-muted-foreground">OG image</dt><dd className="break-all">{meta.ogImage || "/images/home-connection-equipment.webp"}</dd></div><div><dt className="text-muted-foreground">Индексация</dt><dd>{meta.indexState === "NOINDEX" ? "noindex, follow" : "index"}</dd></div></dl> : <p className="text-muted-foreground">Нет данных в этом снимке.</p>}</div>
}
