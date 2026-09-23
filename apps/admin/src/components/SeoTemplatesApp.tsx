import { useCallback, useEffect, useMemo, useState } from "react"
import { CircleAlert, Save } from "lucide-react"
import { AdminApiError, requestJson } from "../lib/admin-api.mjs"
import { AdminShell } from "./AdminShell"
import { PublicationStatusCard } from "./PublicationStatusCard"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Field, FieldDescription, FieldLabel } from "./ui/field"
import { Input } from "./ui/input"
import { Skeleton } from "./ui/skeleton"

type Kind = "HOME" | "COVERAGE" | "CITIES" | "PRIVACY" | "PERSONAL_DATA_CONSENT" | "COOKIE_POLICY" | "CITY_HOME" | "CITY_TARIFF_DETAIL"
type IndexState = "INDEX" | "NOINDEX"
interface Administrator { id: string; email: string }
interface Site { id: string; name: string; slug: string }
interface Template { id: string; kind: Kind; titleTemplate: string; descriptionTemplate: string; indexState: IndexState; ogTitleTemplate?: string | null; ogDescriptionTemplate?: string | null; ogImageUrl?: string | null }
interface Meta { title: string; description: string; indexState: IndexState; ogTitle?: string; ogDescription?: string; ogImage?: string }
interface Diagnostic { code: string; path: string; relatedPath?: string; length?: number }
interface Workspace {
  id: string; slug: string; workingRevision: number; publishedRevision: number; legacySeoCount: number | null
  templates: Template[]; routes: Array<{ id: Kind; path: string; citySlug?: string; tariffSlug?: string }>
  workingByPath: Record<string, Meta> | null; publishedByPath: Record<string, Meta> | null
  workingWarnings: Diagnostic[]; workingError: string | null
}

const labels: Record<Kind, string> = {
  HOME: "Главная сайта", COVERAGE: "Карта покрытия", CITIES: "Города обслуживания",
  PRIVACY: "Политика конфиденциальности", PERSONAL_DATA_CONSENT: "Согласие на обработку данных",
  COOKIE_POLICY: "Политика cookie", CITY_HOME: "Главные страницы городов", CITY_TARIFF_DETAIL: "Страницы тарифов",
}
const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
const textareaClass = "min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"

export function SeoTemplatesApp({ apiUrl }: { apiUrl: string }) {
  const [user, setUser] = useState<Administrator | null>(null)
  const [site, setSite] = useState<Site | null>(null)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [kind, setKind] = useState<Kind>("HOME")
  const [path, setPath] = useState("/")
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
  const [publicationRefreshKey, setPublicationRefreshKey] = useState(0)

  const load = useCallback(async (selectedKind?: Kind) => {
    setLoading(true); setError(null)
    try {
      const [session, sites] = await Promise.all([
        requestJson<{ user: Administrator }>(apiUrl, "/auth/me"),
        requestJson<Site[]>(apiUrl, "/admin/sites"),
      ])
      if (sites.length !== 1) throw new Error("Редактор SEO ожидает единственный сайт Дом.ру")
      const data = await requestJson<Workspace>(apiUrl, `/admin/sites/${sites[0].id}/seo-templates`)
      setUser(session.user); setSite(sites[0]); setWorkspace(data)
      const nextKind = selectedKind || kind
      const template = data.templates.find((item) => item.kind === nextKind)
      if (!template) throw new Error(`Не найден обязательный SEO-шаблон ${nextKind}`)
      setTitleTemplate(template.titleTemplate); setDescriptionTemplate(template.descriptionTemplate); setIndexState(template.indexState)
      setOgTitleTemplate(template.ogTitleTemplate || ""); setOgDescriptionTemplate(template.ogDescriptionTemplate || ""); setOgImageUrl(template.ogImageUrl || "")
      setPath(data.routes.find((route) => route.id === nextKind)?.path || "")
      setConfirmed(false)
    } catch (caught) {
      if (caught instanceof AdminApiError && caught.status === 401) { window.location.replace("/login"); return }
      setError(caught instanceof Error ? caught.message : "Данные SEO недоступны")
    } finally { setLoading(false) }
  }, [apiUrl, kind])

  useEffect(() => { void load() }, [])

  const template = workspace?.templates.find((item) => item.kind === kind)
  const routes = useMemo(() => workspace?.routes.filter((route) => route.id === kind) || [], [workspace, kind])
  const affectedCount = routes.length
  const enteringNoindex = template?.indexState !== "NOINDEX" && indexState === "NOINDEX"
  const changed = Boolean(template && (titleTemplate !== template.titleTemplate || descriptionTemplate !== template.descriptionTemplate || indexState !== template.indexState || ogTitleTemplate !== (template.ogTitleTemplate || "") || ogDescriptionTemplate !== (template.ogDescriptionTemplate || "") || ogImageUrl !== (template.ogImageUrl || "")))
  const canSave = Boolean(changed && titleTemplate.trim() && descriptionTemplate.trim() && (!enteringNoindex || (confirmed && affectedCount > 0)))
  const working = path ? workspace?.workingByPath?.[path] : null
  const published = path ? workspace?.publishedByPath?.[path] : null
  const routeWarnings = workspace?.workingWarnings.filter((warning) => warning.path === path) || []

  function selectKind(nextKind: Kind) {
    if (!workspace) return
    const next = workspace.templates.find((item) => item.kind === nextKind)
    if (!next) return
    setKind(nextKind); setTitleTemplate(next.titleTemplate); setDescriptionTemplate(next.descriptionTemplate)
    setOgTitleTemplate(next.ogTitleTemplate || ""); setOgDescriptionTemplate(next.ogDescriptionTemplate || ""); setOgImageUrl(next.ogImageUrl || "")
    setIndexState(next.indexState); setPath(workspace.routes.find((route) => route.id === nextKind)?.path || "")
    setConfirmed(false); setMessage(null)
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
      setPublicationRefreshKey((value) => value + 1)
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Шаблон не сохранён") }
    finally { setSaving(false) }
  }

  if (loading && !user) return <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-8" aria-busy="true"><Skeleton className="h-10 w-64" /><Skeleton className="h-96 w-full" /></main>
  if (!user) return <main className="flex min-h-screen items-center justify-center p-6"><Alert variant="destructive"><CircleAlert /><AlertTitle>SEO-шаблоны недоступны</AlertTitle><AlertDescription>{error || "Не удалось загрузить данные"}</AlertDescription><Button onClick={() => void load()}>Повторить</Button></Alert></main>

  return <AdminShell apiUrl={apiUrl} user={user} active="seo-templates">
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6 lg:p-8">
      <div><h1 className="font-heading text-2xl font-semibold">SEO-шаблоны</h1><p className="mt-1 text-sm text-muted-foreground">Один шаблон на тип страницы. Переменные разрешаются отдельно для каждого опубликованного URL.</p></div>
      {error ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Ошибка</AlertTitle><AlertDescription>{error}</AlertDescription><Button variant="outline" size="sm" onClick={() => void load(kind)}>Обновить</Button></Alert> : null}
      {message ? <Alert><Save /><AlertTitle>Сохранено</AlertTitle><AlertDescription>{message}</AlertDescription></Alert> : null}
      {workspace?.workingError ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Публикация заблокирована</AlertTitle><AlertDescription>{workspace.workingError}. Исправьте шаблон или исходные данные; сохранённые поля остаются доступны.</AlertDescription></Alert> : null}
      {workspace?.legacySeoCount ? <Alert><CircleAlert /><AlertTitle>Есть старые индивидуальные SEO-значения</AlertTitle><AlertDescription>У {workspace.legacySeoCount} опубликованных записей сохранены прежние Title или Description. Они останутся в базе, но новая публикация возьмёт SEO из шаблонов. Сверьте рабочий и опубликованный preview перед публикацией; очистка старых полей ведётся отдельно.</AlertDescription></Alert> : null}
      {site ? <PublicationStatusCard apiUrl={apiUrl} siteId={site.id} publicationRefreshKey={publicationRefreshKey} /> : null}
      <Card><CardHeader><CardTitle>Редактор</CardTitle><CardDescription>Рабочая версия {workspace?.workingRevision ?? "—"}; опубликована {workspace?.publishedRevision ?? "—"}. Title и Description обязательны. Большая длина и совпадения — предупреждения, не запрет.</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          <Field><FieldLabel htmlFor="seo-kind">Тип страницы</FieldLabel><select id="seo-kind" className={selectClass} value={kind} onChange={(event) => selectKind(event.target.value as Kind)}>{(Object.keys(labels) as Kind[]).map((item) => <option key={item} value={item}>{labels[item]}</option>)}</select><FieldDescription>{affectedCount} опубликованных URL этого типа</FieldDescription></Field>
          <Field><FieldLabel htmlFor="seo-title">Title</FieldLabel><Input id="seo-title" value={titleTemplate} onChange={(event) => setTitleTemplate(event.target.value)} maxLength={1000} /><FieldDescription>{titleTemplate.length} символов · подстановки в фигурных скобках</FieldDescription></Field>
          <Field><FieldLabel htmlFor="seo-description">Description</FieldLabel><textarea id="seo-description" className={textareaClass} value={descriptionTemplate} onChange={(event) => setDescriptionTemplate(event.target.value)} maxLength={1000} /><FieldDescription>{descriptionTemplate.length} символов</FieldDescription></Field>
          <div className="space-y-4 rounded-lg border p-4"><h2 className="font-semibold">Социальные сети · Open Graph</h2><p className="text-sm text-muted-foreground">Все поля необязательны. Пустые Title и Description возьмут обычные SEO-значения; пустое изображение — изображение сайта.</p>
            <Field><FieldLabel htmlFor="seo-og-title">OG Title</FieldLabel><Input id="seo-og-title" value={ogTitleTemplate} onChange={(event) => setOgTitleTemplate(event.target.value)} maxLength={1000} /><FieldDescription>Можно использовать разрешённые переменные этого типа страницы.</FieldDescription></Field>
            <Field><FieldLabel htmlFor="seo-og-description">OG Description</FieldLabel><textarea id="seo-og-description" className={textareaClass} value={ogDescriptionTemplate} onChange={(event) => setOgDescriptionTemplate(event.target.value)} maxLength={1000} /></Field>
            <Field><FieldLabel htmlFor="seo-og-image">OG image URL</FieldLabel><Input id="seo-og-image" value={ogImageUrl} onChange={(event) => setOgImageUrl(event.target.value)} maxLength={2048} placeholder="https://…/image.webp" /><FieldDescription>HTTPS-изображение либо доступный локальный asset; подстановки в URL запрещены.</FieldDescription></Field>
          </div>
          <Field><FieldLabel htmlFor="seo-index">Индексация</FieldLabel><select id="seo-index" className={selectClass} value={indexState} onChange={(event) => { setIndexState(event.target.value as IndexState); setConfirmed(false) }}><option value="INDEX">index</option><option value="NOINDEX">noindex, follow</option></select><FieldDescription>При noindex URL исключаются из sitemap того же снимка публикации.</FieldDescription></Field>
          {enteringNoindex ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Массовое изменение индексации</AlertTitle><AlertDescription>После публикации {affectedCount} URL получат noindex и исчезнут из sitemap. Подтвердите точное число URL перед сохранением.</AlertDescription><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />Подтверждаю noindex для {affectedCount} URL</label></Alert> : null}
          <div className="flex items-center justify-between gap-4 border-t pt-4"><span className="text-sm text-muted-foreground">Изменения вступят в силу после публикации сайта.</span><Button disabled={!canSave || saving || loading} onClick={() => void save()}><Save data-icon="inline-start" />{saving ? "Сохраняем…" : "Сохранить"}</Button></div>
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle>Предпросмотр URL</CardTitle><CardDescription>Рабочий и опубликованный снимки. Черновик в полях выше появится в просмотре после сохранения.</CardDescription></CardHeader><CardContent className="space-y-4">
        <Field><FieldLabel htmlFor="seo-path">Маршрут</FieldLabel><select id="seo-path" className={selectClass} value={path} onChange={(event) => setPath(event.target.value)} disabled={!routes.length}><option value="">{routes.length ? "Выберите URL" : "Нет опубликованных URL этого типа"}</option>{routes.map((route) => <option key={route.path} value={route.path}>{route.path}</option>)}</select></Field>
        <div className="grid gap-4 md:grid-cols-2"><Preview label="Рабочая версия" meta={working} /><Preview label="Опубликованная версия" meta={published} /></div>
        {routeWarnings.length ? <Alert><CircleAlert /><AlertTitle>Предупреждения для {path}</AlertTitle><AlertDescription>{routeWarnings.map((warning) => <p key={`${warning.code}-${warning.relatedPath || ""}`}>{warning.code}{warning.length ? ` · ${warning.length} символов` : ""}{warning.relatedPath ? ` · совпадает с ${warning.relatedPath}` : ""}</p>)}</AlertDescription></Alert> : null}
      </CardContent></Card>
    </div>
  </AdminShell>
}

function Preview({ label, meta }: { label: string; meta: Meta | null | undefined }) {
  return <div className="rounded-lg border p-4 text-sm"><h3 className="mb-3 font-semibold">{label}</h3>{meta ? <dl className="space-y-3"><div><dt className="text-muted-foreground">Title</dt><dd className="break-words">{meta.title}</dd></div><div><dt className="text-muted-foreground">Description</dt><dd className="break-words">{meta.description}</dd></div><div><dt className="text-muted-foreground">OG Title</dt><dd className="break-words">{meta.ogTitle || meta.title}</dd></div><div><dt className="text-muted-foreground">OG Description</dt><dd className="break-words">{meta.ogDescription || meta.description}</dd></div><div><dt className="text-muted-foreground">OG image</dt><dd className="break-all">{meta.ogImage || "/images/home-connection-equipment.webp"}</dd></div><div><dt className="text-muted-foreground">Индексация</dt><dd>{meta.indexState === "NOINDEX" ? "noindex, follow" : "index"}</dd></div></dl> : <p className="text-muted-foreground">Нет данных в этом снимке.</p>}</div>
}
