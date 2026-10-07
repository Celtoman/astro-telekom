import { useCallback, useEffect, useMemo, useState } from "react"
import { CircleAlert, Maximize2, Monitor, RefreshCw, Smartphone, Tablet } from "lucide-react"
import { tariffView, type TariffView } from "../../../web/src/data/tariff-view"
import { AdminApiError, requestJson } from "../lib/admin-api.mjs"
import { tariffPreviewDiff, tariffTemplateBlocks } from "../lib/tariff-template.mjs"
import { AdminShell } from "./AdminShell"
import { TariffTemplateCanvas } from "./TariffTemplateCanvas"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Input } from "./ui/input"
import { Skeleton } from "./ui/skeleton"

interface Administrator { id: string; email: string }
interface Site { id: string; name: string; slug: string }
interface CityOption { slug: string; name: string; working: boolean; published: boolean }
interface TariffOption { slug: string; name: string; externalId: string | null; working: boolean; published: boolean; workingStatus: string | null }
interface TariffRecord extends Record<string, unknown> { id?: string; name: string; slug: string; updatedAt?: string; status?: string }
interface Preview {
  siteId: string; siteSlug: string; siteDomain: string | null; workingRevision: number; publishedRevision: number; publishedAt: string | null
  city: { slug: string; name: string; nameIn: string }
  tariff: { working: TariffRecord | null; published: TariffRecord | null }
  variableDiagnostics: { working: Diagnostic | null; published: Diagnostic | null }
  related: { working: TariffRecord[]; published: TariffRecord[] }
}
interface CodeStatus {
  appVersion: string; available: boolean; reason?: string; applicationStatus?: string | null
  latestDeployment?: { id?: string; status?: string; startedAt?: string } | null
  lastSuccessful?: { id?: string; commit?: string; finishedAt?: string } | null
}
interface Scenario {
  id: string; title: string; warning: string | null
  match: { citySlug: string; tariffSlug: string; name: string; version: Version } | null
}
interface ScenarioResult { scenarios: Scenario[]; checkedTariffCount: number; invalidTariffCount: number }
interface Diagnostic { severity: "BLOCKING" | "WARNING"; code: string; path: string; template?: string; block?: string; field?: string; message: string }
interface DiagnosticsResult {
  path: string; version: Version; siteRevision: number; current: Diagnostic[]
  publicationReport: { id: string; appVersion: string; validatedAt: string; outcome: string; staleCode: boolean; issues: Diagnostic[] } | null
}
type ScreenState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; user: Administrator; sites: Site[] }
type Version = "working" | "published"
type Viewport = "desktop" | "tablet" | "mobile" | "full"

const sizes: Record<Viewport, { label: string; width: number | null; icon: typeof Monitor }> = {
  desktop: { label: "Компьютер", width: 1440, icon: Monitor },
  tablet: { label: "Планшет", width: 834, icon: Tablet },
  mobile: { label: "Телефон", width: 390, icon: Smartphone },
  full: { label: "Вся ширина", width: null, icon: Maximize2 },
}
const selectClass = "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
const date = (value?: string | null) => value ? new Date(value).toLocaleString("ru-RU") : "—"

export function TariffTemplateApp({ apiUrl }: { apiUrl: string }) {
  const [state, setState] = useState<ScreenState>({ status: "loading" })
  const [siteId, setSiteId] = useState("")
  const [citySlug, setCitySlug] = useState("")
  const [tariffSlug, setTariffSlug] = useState("")
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const [cities, setCities] = useState<CityOption[]>([])
  const [tariffs, setTariffs] = useState<TariffOption[]>([])
  const [tariffTotal, setTariffTotal] = useState(0)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [codeStatus, setCodeStatus] = useState<CodeStatus | null>(null)
  const [scenarios, setScenarios] = useState<ScenarioResult | null>(null)
  const [scenarioError, setScenarioError] = useState<string | null>(null)
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResult | null>(null)
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null)
  const [version, setVersion] = useState<Version>("working")
  const [viewport, setViewport] = useState<Viewport>("desktop")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [refresh, setRefresh] = useState(0)



  const handleError = useCallback((caught: unknown) => {
    if (caught instanceof AdminApiError && caught.status === 401) { window.location.replace("/login"); return null }
    return caught instanceof Error ? caught.message : "API недоступен"
  }, [])

  useEffect(() => {
    void Promise.all([
      requestJson<{ user: Administrator }>(apiUrl, "/auth/me"),
      requestJson<Site[]>(apiUrl, "/admin/sites?summary=true"),
    ]).then(([session, sites]) => {
      setState({ status: "ready", user: session.user, sites })
      const params = new URLSearchParams(window.location.search)
      const requestedSite = params.get("siteId")
      setSiteId(requestedSite && sites.some((item) => item.id === requestedSite) ? requestedSite : sites[0]?.id ?? "")
      setCitySlug(params.get("citySlug") ?? "")
      setSearch(params.get("tariffSlug") ?? "")
      setTariffSlug(params.get("tariffSlug") ?? "")
    }).catch((caught: unknown) => { const message = handleError(caught); if (message) setState({ status: "error", message }) })
  }, [apiUrl, handleError])

  useEffect(() => { const timer = window.setTimeout(() => setQuery(search.trim()), 250); return () => window.clearTimeout(timer) }, [search])

  useEffect(() => {
    if (!siteId) { setCities([]); setCodeStatus(null); return }
    let active = true
    const base = `/admin/sites/${encodeURIComponent(siteId)}/tariff-template`
    void Promise.all([
      requestJson<{ cities: CityOption[] }>(apiUrl, `${base}/cities`),
      requestJson<CodeStatus>(apiUrl, `${base}/code-status`),
    ]).then(([cityResult, status]) => {
      if (!active) return
      setCities(cityResult.cities); setCodeStatus(status)
      setCitySlug((current) => cityResult.cities.some((item) => item.slug === current) ? current : cityResult.cities[0]?.slug ?? "")
    }).catch((caught: unknown) => { if (active) setError(handleError(caught)) })
    return () => { active = false }
  }, [apiUrl, handleError, refresh, siteId])

  useEffect(() => {
    if (!siteId) { setScenarios(null); return }
    let active = true
    setScenarios(null); setScenarioError(null)
    void requestJson<ScenarioResult>(apiUrl, `/admin/sites/${encodeURIComponent(siteId)}/tariff-template/scenarios?version=${version}`)
      .then((result) => { if (active) setScenarios(result) })
      .catch((caught: unknown) => { if (active) setScenarioError(handleError(caught)) })
    return () => { active = false }
  }, [apiUrl, handleError, refresh, siteId, version])

  useEffect(() => {
    if (!siteId || !citySlug) { setTariffs([]); setTariffTotal(0); return }
    let active = true
    const params = new URLSearchParams({ citySlug }); if (query) params.set("q", query)
    void requestJson<{ tariffs: TariffOption[]; total: number }>(apiUrl, `/admin/sites/${encodeURIComponent(siteId)}/tariff-template/tariffs?${params}`)
      .then((result) => {
        if (!active) return
        setTariffs(result.tariffs); setTariffTotal(result.total)
        setTariffSlug((current) => result.tariffs.some((item) => item.slug === current) ? current : result.tariffs[0]?.slug ?? "")
      }).catch((caught: unknown) => { if (active) setError(handleError(caught)) })
    return () => { active = false }
  }, [apiUrl, citySlug, handleError, query, refresh, siteId])

  useEffect(() => {
    if (!siteId || !citySlug || !tariffSlug) { setPreview(null); return }
    let active = true
    setLoading(true); setError(null); setPreview(null)
    const params = new URLSearchParams({ citySlug, tariffSlug })
    void requestJson<Preview>(apiUrl, `/admin/sites/${encodeURIComponent(siteId)}/tariff-template/preview?${params}`)
      .then((result) => {
        if (!active) return
        setPreview(result)
        setVersion((current) => result.tariff[current] ? current : result.tariff.working ? "working" : "published")
      }).catch((caught: unknown) => { if (active) setError(handleError(caught)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [apiUrl, citySlug, handleError, refresh, siteId, tariffSlug])

  const selected = preview?.tariff[version] ?? null

  useEffect(() => {
    if (!preview || !selected || preview.siteId !== siteId) { setDiagnostics(null); return }
    let active = true
    setDiagnostics(null); setDiagnosticsError(null)
    const params = new URLSearchParams({ citySlug, tariffSlug, version })
    void requestJson<DiagnosticsResult>(apiUrl, `/admin/sites/${encodeURIComponent(siteId)}/tariff-template/diagnostics?${params}`)
      .then((result) => { if (active) setDiagnostics(result) })
      .catch((caught: unknown) => { if (active) setDiagnosticsError(handleError(caught)) })
    return () => { active = false }
  }, [apiUrl, citySlug, handleError, preview, refresh, selected, siteId, tariffSlug, version])

  const activeDiagnostics = diagnostics?.current ?? []
  const markedBlocks = useMemo(() => new Set(activeDiagnostics.map((item) => item.block).filter((block): block is string => Boolean(block))), [activeDiagnostics])
  const rendered = useMemo((): { view: TariffView | null; error: string | null } => {
    if (!selected) return { view: null, error: null }
    if (preview?.variableDiagnostics[version]) return { view: null, error: preview.variableDiagnostics[version].message }
    try { return { view: tariffView(selected), error: null } }
    catch (caught: unknown) { return { view: null, error: caught instanceof Error ? caught.message : "Невозможно отрисовать тариф" } }
  }, [preview, selected, version])
  const related = useMemo(() => (preview?.related[version] ?? []).flatMap((row) => {
    try { const view = tariffView(row); return [{ slug: view.slug, name: view.name, speed: view.speed, price: view.price }] }
    catch { return [] }
  }), [preview, version])
  const differences = useMemo(() => tariffPreviewDiff(preview?.tariff.working ?? null, preview?.tariff.published ?? null), [preview])

  if (state.status === "loading") return <div className="mx-auto max-w-7xl space-y-5 p-8" aria-busy="true"><Skeleton className="h-10 w-72" /><Skeleton className="h-96" /></div>
  if (state.status === "error") return <div className="mx-auto max-w-xl p-8"><Alert variant="destructive"><CircleAlert /><AlertTitle>Шаблоны недоступны</AlertTitle><AlertDescription>{state.message}</AlertDescription></Alert></div>

  const selectedSite = state.sites.find((item) => item.id === siteId)
  const frame = sizes[viewport]
  const testContourUrl = preview?.siteDomain && /^[a-z0-9.-]+$/i.test(preview.siteDomain) ? `https://${preview.siteDomain}` : null
  const chooseScenario = (scenario: Scenario) => {
    if (!scenario.match) return
    setVersion(scenario.match.version)
    setCitySlug(scenario.match.citySlug)
    setSearch(scenario.match.tariffSlug)
    setQuery(scenario.match.tariffSlug)
    setTariffSlug(scenario.match.tariffSlug)
    setPreview(null)
  }
  const focusBlock = (block: string) => {
    const canvas = [...document.querySelectorAll<HTMLElement>("[data-tariff-block]")].find((item) => item.dataset.tariffBlock === block)
    const schema = [...document.querySelectorAll<HTMLElement>("[data-template-block-id]")].find((item) => item.dataset.templateBlockId === block)
    ;(canvas ?? schema)?.scrollIntoView({ behavior: "smooth", block: "center" })
  }
  return <AdminShell apiUrl={apiUrl} user={state.user} active="templates"><div className="mx-auto flex w-full max-w-[1680px] flex-col gap-6 p-6 lg:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="font-heading text-2xl font-semibold">Проверка шаблона тарифа</h1><p className="mt-1 text-sm text-muted-foreground">Технический предпросмотр тарифной страницы и диагностика её данных.</p></div><Button variant="outline" onClick={() => setRefresh((current) => current + 1)}><RefreshCw data-icon="inline-start" />Обновить</Button></div>
    {error ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Не удалось загрузить предпросмотр</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    <Card><CardHeader><div className="flex flex-wrap items-center gap-2"><CardTitle>Страница тарифа</CardTitle><Badge variant="secondary">Программный шаблон</Badge></div><CardDescription>Один шаблон для тарифов «Интернет» и «Интернет + ТВ». Порядок блоков фиксирован; видимость зависит от типизированных данных тарифа.</CardDescription></CardHeader><CardContent className="grid gap-5 lg:grid-cols-2">
      <div><h2 className="mb-3 font-semibold">Состав блоков</h2><ol className="space-y-2">{tariffTemplateBlocks.map((block, index) => <li key={block.id} data-template-block-id={block.id} className={`rounded-lg border p-3 text-sm ${markedBlocks.has(block.id) ? "border-red-500 bg-red-50" : ""}`} aria-invalid={markedBlocks.has(block.id) || undefined}><strong>{index + 1}. {block.title}</strong>{markedBlocks.has(block.id) ? <span className="ml-2 font-semibold text-red-700">Ошибка</span> : null}<span className="mt-1 block text-muted-foreground">{block.source}</span></li>)}</ol></div>
      <div className="space-y-4"><h2 className="font-semibold">Состояние кода и данных</h2><dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm"><dt className="text-muted-foreground">Версия приложения</dt><dd>{codeStatus?.appVersion ?? "—"}</dd><dt className="text-muted-foreground">Состояние приложения</dt><dd>{codeStatus?.applicationStatus ?? codeStatus?.reason ?? "—"}</dd><dt className="text-muted-foreground">Последний deployment</dt><dd>{codeStatus?.latestDeployment ? `${codeStatus.latestDeployment.status} · ${codeStatus.latestDeployment.id}` : "—"}</dd><dt className="text-muted-foreground">Последний успешный код</dt><dd>{codeStatus?.lastSuccessful ? <>{codeStatus.lastSuccessful.commit?.slice(0, 12) ?? "SHA неизвестен"} · {date(codeStatus.lastSuccessful.finishedAt)}</> : "—"}</dd><dt className="text-muted-foreground">Рабочие данные</dt><dd>Ревизия {preview?.workingRevision ?? "—"}</dd><dt className="text-muted-foreground">На сайте</dt><dd>Ревизия {preview?.publishedRevision ?? "—"} · {date(preview?.publishedAt)}</dd></dl><p className="text-xs text-muted-foreground">Публикация данных не меняет версию кода. Будущий код проверяется после его deployment в защищённый test-контур.</p>{testContourUrl ? <a className="text-sm font-medium text-primary underline" href={testContourUrl}>Открыть защищённый test-контур</a> : null}</div>
    </CardContent></Card>
    <Card aria-label="Контрольные сценарии"><CardHeader><CardTitle>Контрольные сценарии</CardTitle><CardDescription>Автоматически выбираются реальные тарифы текущей {version === "working" ? "рабочей" : "опубликованной"} версии. Отсутствующий сценарий остаётся предупреждением.</CardDescription></CardHeader><CardContent className="space-y-4">
      <div className="flex gap-2"><Button size="sm" variant={version === "working" ? "default" : "outline"} onClick={() => setVersion("working")}>Рабочие данные</Button><Button size="sm" variant={version === "published" ? "default" : "outline"} onClick={() => setVersion("published")}>Опубликованные данные</Button></div>
      {scenarioError ? <p role="alert" className="text-sm text-red-700">{scenarioError}</p> : null}
      {!scenarios && !scenarioError ? <p role="status" className="text-sm text-muted-foreground">Подбираем сценарии…</p> : null}
      {scenarios ? <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{scenarios.scenarios.map((scenario) => scenario.match
        ? <Button key={scenario.id} type="button" variant="outline" className="h-auto min-h-20 flex-col items-start whitespace-normal text-left" onClick={() => chooseScenario(scenario)}><span className="font-semibold">{scenario.title}</span><span className="text-xs text-muted-foreground">{scenario.match.name} · /{scenario.match.citySlug}/{scenario.match.tariffSlug}</span></Button>
        : <div key={scenario.id} className="rounded-lg border border-amber-500 bg-amber-50 p-3 text-sm"><strong>{scenario.title}</strong><p className="mt-1 text-amber-900">{scenario.warning}</p></div>)}</div>
        <p className="text-xs text-muted-foreground">Проверено тарифов: {scenarios.checkedTariffCount}. {scenarios.invalidTariffCount ? `${scenarios.invalidTariffCount} не подошли для автоматического preview из-за ошибки отображения или расчёта.` : ""}</p></> : null}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Предпросмотр тарифа</CardTitle><CardDescription>Выберите город, затем найдите тариф по названию, slug или внешнему ID. Черновики доступны в рабочей версии.</CardDescription></CardHeader><CardContent className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><label className="text-sm font-medium">Сайт<select className={`${selectClass} mt-1`} value={siteId} onChange={(event) => { setSiteId(event.target.value); setCitySlug(""); setTariffSlug(""); setPreview(null) }}>{state.sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label><label className="text-sm font-medium">Город<select className={`${selectClass} mt-1`} value={citySlug} onChange={(event) => { setCitySlug(event.target.value); setTariffSlug(""); setSearch("") }}><option value="">Выберите город</option>{cities.map((city) => <option key={city.slug} value={city.slug}>{city.name}</option>)}</select></label><label className="text-sm font-medium">Поиск тарифа<Input className="mt-1" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Название, slug или внешний ID" /></label><label className="text-sm font-medium">Тариф<select className={`${selectClass} mt-1`} value={tariffSlug} onChange={(event) => setTariffSlug(event.target.value)}><option value="">Выберите тариф</option>{tariffs.map((tariff) => <option key={tariff.slug} value={tariff.slug}>{tariff.name} · {tariff.slug}{tariff.workingStatus ? ` · ${tariff.workingStatus}` : ""}</option>)}</select></label></div>
      {tariffTotal > 100 ? <p className="text-xs text-muted-foreground">Показаны первые 100 из {tariffTotal}; уточните поиск.</p> : null}
      {preview ? <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">Данные:</span><Button size="sm" variant={version === "working" ? "default" : "outline"} disabled={!preview.tariff.working} aria-pressed={version === "working"} onClick={() => setVersion("working")}>Рабочие</Button><Button size="sm" variant={version === "published" ? "default" : "outline"} disabled={!preview.tariff.published} aria-pressed={version === "published"} onClick={() => setVersion("published")}>Опубликованные</Button><span className="text-xs text-muted-foreground">Тариф обновлён: {date(selected?.updatedAt)}</span>{preview.tariff.working?.id ? <Button asChild size="sm" variant="outline"><a href={`/tariffs/edit?id=${encodeURIComponent(preview.tariff.working.id)}`}>Редактировать данные тарифа</a></Button> : null}</div> : null}
      {preview ? <div className="rounded-lg border bg-muted/30 p-4 text-sm"><strong>Отличия рабочих данных от опубликованных</strong><p className="mt-1 text-muted-foreground">{differences.length ? differences.join(" · ") : "Отличий в полях тарифа нет"}</p></div> : null}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Размер предпросмотра">{(Object.entries(sizes) as Array<[Viewport, typeof frame]>).map(([key, item]) => { const Icon = item.icon; return <Button key={key} type="button" size="sm" variant={viewport === key ? "default" : "outline"} aria-pressed={viewport === key} onClick={() => setViewport(key)}><Icon data-icon="inline-start" />{item.label}</Button> })}</div>
      <p className="text-xs text-muted-foreground">Предпросмотр доступен только в админке. В нём работают выбор опций и расчёт цены; отправка заявки и переходы отключены.</p>
    </CardContent></Card>
    {preview ? <Card aria-label="Диагностика предпросмотра"><CardHeader><CardTitle>Диагностика предпросмотра</CardTitle><CardDescription>URL {`/${citySlug}/${tariffSlug}`} · шаблон тарифной страницы · {version === "working" ? "рабочая" : "опубликованная"} ревизия.</CardDescription></CardHeader><CardContent className="space-y-4">
      {diagnosticsError ? <p role="alert" className="text-sm text-red-700">{diagnosticsError}</p> : null}
      {!diagnostics && !diagnosticsError ? <p role="status" className="text-sm text-muted-foreground">Проверяем выбранный тариф…</p> : null}
      {diagnostics ? <>
        <p className="text-sm">Текущий preview: {diagnostics.current.filter((item) => item.severity === "BLOCKING").length} ошибок, {diagnostics.current.filter((item) => item.severity === "WARNING").length} предупреждений. {diagnostics.publicationReport ? `Последний отчёт ревизии ${diagnostics.siteRevision}: ${diagnostics.publicationReport.outcome} · ${date(diagnostics.publicationReport.validatedAt)}.` : "Для этой ревизии ещё нет отчёта проверки публикации."}</p>
        {diagnostics.publicationReport ? <p className="rounded-lg border border-amber-500 bg-amber-50 p-3 text-sm">Отчёт публикации создан {date(diagnostics.publicationReport.validatedAt)} для ревизии {diagnostics.siteRevision}{diagnostics.publicationReport.staleCode ? ` на другой версии приложения (${diagnostics.publicationReport.appVersion})` : ""}. Его ошибки показаны как история и не подсвечивают текущий шаблон.</p> : null}
        {diagnostics.current.length || diagnostics.publicationReport?.issues.length ? <ul className="space-y-2">{[
          ...diagnostics.current.map((item) => ({ ...item, source: "Текущий preview" })),
          ...(diagnostics.publicationReport?.issues ?? []).map((item) => ({ ...item, source: "Отчёт публикации" })),
        ].map((item, index) => <li key={`${item.source}-${item.code}-${index}`} className={`rounded-lg border p-3 text-sm ${item.severity === "BLOCKING" ? "border-red-500 bg-red-50" : "border-amber-500 bg-amber-50"}`}><div className="flex flex-wrap items-center gap-2"><strong>{item.severity === "BLOCKING" ? "Ошибка" : "Предупреждение"} · {item.source}</strong><span className="font-mono text-xs">{item.code}</span>{item.block && item.source === "Текущий preview" ? <Button type="button" size="sm" variant="outline" onClick={() => focusBlock(item.block!)}>Показать блок</Button> : null}</div><p className="mt-1">{item.message}</p><p className="mt-1 text-xs text-muted-foreground">URL: {item.path} · шаблон: {item.template ?? "не указан"} · блок: {item.block ?? "не указан"} · поле: {item.field ?? "не указано"}</p></li>)}</ul>
          : <p className="text-sm text-muted-foreground">Для выбранного тарифа ошибок и предупреждений нет.</p>}
      </> : null}
    </CardContent></Card> : null}
    {loading ? <Card aria-busy="true"><CardContent className="p-6"><Skeleton className="h-[700px] w-full" /></CardContent></Card> : null}
    {rendered.error ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Рабочие данные требуют исправления</AlertTitle><AlertDescription>{rendered.error}. Редактирование доступно в карточке тарифа; просмотр не меняет данные.</AlertDescription></Alert> : null}
    {preview && rendered.view ? <Card className="overflow-hidden"><CardHeader className="border-b"><CardTitle>Предпросмотр: {rendered.view.name}</CardTitle><CardDescription>{selectedSite?.name} · {frame.label}{frame.width ? ` ${frame.width}px` : ""}. Структура соответствует программным блокам текущей версии приложения.</CardDescription></CardHeader><CardContent className="overflow-auto bg-muted p-4"><div className="mx-auto overflow-hidden rounded-lg border bg-white shadow-sm" style={{ width: frame.width ?? "100%", maxWidth: frame.width ? "none" : "100%" }}><TariffTemplateCanvas apiUrl={apiUrl} siteId={siteId} city={preview.city} tariff={rendered.view} related={related} version={version} compact={viewport === "mobile" || viewport === "tablet"} markedBlocks={markedBlocks} /></div></CardContent></Card> : null}
  </div></AdminShell>
}
