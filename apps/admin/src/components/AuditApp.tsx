import { useCallback, useEffect, useRef, useState } from "react"
import { CircleAlert, FileClock, RefreshCw, Search } from "lucide-react"
import { AdminApiError, requestJson } from "../lib/admin-api.mjs"
import { statusPresentation } from "../lib/status-presentation.mjs"
import { AdminShell } from "./AdminShell"
import { FilterResetButton } from "./FilterResetButton"
import { ServerPagination } from "./ServerPagination"
import { SourceLabel } from "./SourceLabel"
import { StatusBadge } from "./StatusBadge"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Field, FieldLabel } from "./ui/field"
import { Input } from "./ui/input"
import { Skeleton } from "./ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table"

type EntityType = "PROVIDER" | "SITE" | "REGION" | "CITY" | "PAGE" | "PAGE_TEMPLATE" | "TARIFF" | "REDIRECT"
type AuditAction = "CREATE" | "UPDATE" | "IMPORT" | "UNDO" | "ARCHIVE" | "RESTORE" | "PURGE"

interface Administrator { id: string; email: string }
interface Site { id: string; name: string; slug: string }
interface AuditEvent {
  id: string
  siteId: string
  siteRevision: number
  entityType: EntityType
  entityId: string
  action: AuditAction
  changedFields: string[]
  source: string
  actorId: string | null
  actor: Administrator | null
  site: Site
  createdAt: string
}
interface AuditEventDetail extends AuditEvent {
  changes: Record<string, { before?: unknown; after?: unknown }>
}
interface AuditPage {
  items: AuditEvent[]
  pageInfo: { limit: number; total: number; hasNextPage: boolean; nextCursor: string | null }
}

type ScreenState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; user: Administrator; sites: Site[] }

type DetailState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; event: AuditEventDetail }

const entityValues: EntityType[] = ["PROVIDER", "SITE", "REGION", "CITY", "PAGE", "PAGE_TEMPLATE", "TARIFF", "REDIRECT"]
const actionValues: AuditAction[] = ["CREATE", "UPDATE", "IMPORT", "UNDO", "ARCHIVE", "RESTORE", "PURGE"]
const entityLabels = Object.fromEntries(entityValues.map((value) => [value, statusPresentation("contentEntityType", value).label])) as Record<EntityType, string>
const actionLabels = Object.fromEntries(actionValues.map((value) => [value, statusPresentation("contentRevisionAction", value).label])) as Record<AuditAction, string>

const fieldLabels: Record<string, string> = {
  name: "Название",
  slug: "Адрес страницы",
  status: "Статус",
  tariffs: "Тарифы",
  cities: "Города",
  blocks: "Блоки страницы",
  titleTemplate: "Заголовок шаблона",
  redirects: "Редиректы",
  leadAssignments: "Связи с заявками",
  phone: "Телефон подключения",
  connectionPhone: "Телефон подключения",
  supportPhone: "Телефон техподдержки",
  seo: "SEO",
  content: "Контент",
  settings: "Настройки",
}

const dateFormatter = new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" })

function fieldLabel(field: string) {
  return fieldLabels[field] || field
}

function valueSummary(value: unknown) {
  if (value === null || value === undefined) return "Не задано"
  if (typeof value === "boolean") return value ? "Да" : "Нет"
  if (typeof value === "string" || typeof value === "number") return String(value)
  if (Array.isArray(value)) return `Элементов: ${value.length}`
  if (typeof value === "object") return `Полей: ${Object.keys(value).length}`
  return String(value)
}

function ValueView({ value }: { value: unknown }) {
  const complex = value !== null && typeof value === "object"
  if (!complex) return <p className="break-words text-sm">{valueSummary(value)}</p>
  return (
    <details className="rounded-lg border bg-muted/30 p-3">
      <summary className="cursor-pointer text-sm font-medium">{valueSummary(value)}</summary>
      <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(value, null, 2)}</pre>
    </details>
  )
}

export function AuditApp({ apiUrl }: { apiUrl: string }) {
  const [state, setState] = useState<ScreenState>({ status: "loading" })
  const [selectedSiteId, setSelectedSiteId] = useState("")
  const [entityType, setEntityType] = useState<"ALL" | EntityType>("ALL")
  const [action, setAction] = useState<"ALL" | AuditAction>("ALL")
  const [search, setSearch] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [pageSize, setPageSize] = useState(25)
  const [cursorStack, setCursorStack] = useState([""])
  const [page, setPage] = useState<AuditPage | null>(null)
  const [listBusy, setListBusy] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [listRevision, setListRevision] = useState(0)
  const [selectedEventId, setSelectedEventId] = useState("")
  const [detail, setDetail] = useState<DetailState>({ status: "idle" })
  const detailGeneration = useRef(0)

  const handleError = useCallback((caught: unknown, fallback: string) => {
    if (caught instanceof AdminApiError && caught.status === 401) {
      window.location.replace("/login")
      return null
    }
    return caught instanceof Error ? caught.message : fallback
  }, [])

  const loadWorkspace = useCallback(async () => {
    setState({ status: "loading" })
    try {
      const [session, sites] = await Promise.all([
        requestJson<{ user: Administrator }>(apiUrl, "/auth/me"),
        requestJson<Site[]>(apiUrl, "/admin/sites"),
      ])
      setState({ status: "ready", user: session.user, sites })
      setSelectedSiteId((current) => sites.some((site) => site.id === current) ? current : sites.length === 1 ? sites[0].id : "")
    } catch (caught: unknown) {
      const message = handleError(caught, "API недоступен")
      if (message) setState({ status: "error", message })
    }
  }, [apiUrl, handleError])

  useEffect(() => { void loadWorkspace() }, [loadWorkspace])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(search.trim())
      setCursorStack([""])
    }, 300)
    return () => window.clearTimeout(timer)
  }, [search])

  const currentCursor = cursorStack[cursorStack.length - 1]
  useEffect(() => {
    if (state.status !== "ready" || !selectedSiteId) {
      setPage(null)
      setListBusy(false)
      return
    }
    let active = true
    const params = new URLSearchParams({ siteId: selectedSiteId, limit: String(pageSize) })
    if (entityType !== "ALL") params.set("entityType", entityType)
    if (action !== "ALL") params.set("action", action)
    if (searchQuery) params.set("q", searchQuery)
    if (currentCursor) params.set("cursor", currentCursor)
    setListBusy(true)
    setListError(null)
    void requestJson<AuditPage>(apiUrl, `/admin/audit-events?${params.toString()}`)
      .then((result) => { if (active) setPage(result) })
      .catch((caught: unknown) => {
        if (!active) return
        const message = handleError(caught, "История изменений не загружена")
        if (message) setListError(message)
      })
      .finally(() => { if (active) setListBusy(false) })
    return () => { active = false }
  }, [action, apiUrl, currentCursor, entityType, handleError, listRevision, pageSize, searchQuery, selectedSiteId, state.status])

  const loadDetail = useCallback(async (id: string) => {
    const generation = ++detailGeneration.current
    setSelectedEventId(id)
    setDetail({ status: "loading" })
    try {
      const event = await requestJson<AuditEventDetail>(apiUrl, `/admin/audit-events/${encodeURIComponent(id)}`)
      if (detailGeneration.current === generation) setDetail({ status: "ready", event })
    } catch (caught: unknown) {
      const message = handleError(caught, "Запись истории не загружена")
      if (detailGeneration.current === generation && message) setDetail({ status: "error", message })
    }
  }, [apiUrl, handleError])

  function resetDetail() {
    detailGeneration.current += 1
    setSelectedEventId("")
    setDetail({ status: "idle" })
  }

  function resetFilters() {
    setSearch("")
    setSearchQuery("")
    setEntityType("ALL")
    setAction("ALL")
    setCursorStack([""])
  }

  function changeScope(siteId: string) {
    setSelectedSiteId(siteId)
    setCursorStack([""])
    resetDetail()
  }

  if (state.status === "loading") return <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 p-8" aria-busy="true"><Skeleton className="h-10 w-72" /><Skeleton className="h-64 w-full" /></main>
  if (state.status === "error") return <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6"><Card className="w-full max-w-lg"><CardHeader><CardTitle>История недоступна</CardTitle><CardDescription>Не удалось загрузить рабочий экран.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><Alert variant="destructive"><CircleAlert /><AlertTitle>Ошибка API</AlertTitle><AlertDescription>{state.message}</AlertDescription></Alert><Button onClick={() => void loadWorkspace()}>Повторить</Button></CardContent></Card></main>

  const filtersActive = Boolean(search || entityType !== "ALL" || action !== "ALL")
  const changeEntries = detail.status === "ready" && detail.event.changes && typeof detail.event.changes === "object"
    ? Object.entries(detail.event.changes)
    : []

  return (
    <AdminShell apiUrl={apiUrl} user={state.user} active="audit">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h1 className="font-heading text-2xl font-semibold">История изменений</h1><p className="mt-1 text-sm text-muted-foreground">Кто, когда и какие поля менял в рабочей версии CMS.</p></div>
          <Button variant="outline" disabled={listBusy} onClick={() => { setListRevision((value) => value + 1); if (selectedEventId) void loadDetail(selectedEventId) }}><RefreshCw data-icon="inline-start" />Обновить</Button>
        </div>

        {!state.sites.length ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Сайты не найдены</AlertTitle><AlertDescription>Журнал привязан к сайту, поэтому без Site его открыть нельзя.</AlertDescription></Alert> : null}
        {state.sites.length > 1 && !selectedSiteId ? <Alert><FileClock /><AlertTitle>Выберите сайт</AlertTitle><AlertDescription>Истории разных сайтов не смешиваются автоматически.</AlertDescription></Alert> : null}

        <Card>
          <CardHeader><CardTitle>Фильтры журнала</CardTitle><CardDescription>Поиск работает по ID сущности, источнику операции и email автора.</CardDescription></CardHeader>
          <CardContent className="grid gap-3 lg:grid-cols-[minmax(12rem,1fr)_minmax(10rem,0.8fr)_minmax(10rem,0.8fr)_minmax(14rem,1.4fr)_auto]">
            <Field><FieldLabel htmlFor="audit-site">Сайт</FieldLabel><select id="audit-site" className="h-8 rounded-md border border-input bg-transparent px-2 text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" value={selectedSiteId} onChange={(event) => changeScope(event.target.value)}><option value="">Выберите сайт</option>{state.sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></Field>
            <Field><FieldLabel htmlFor="audit-entity">Сущность</FieldLabel><select id="audit-entity" className="h-8 rounded-md border border-input bg-transparent px-2 text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" value={entityType} onChange={(event) => { setEntityType(event.target.value as "ALL" | EntityType); setCursorStack([""]); resetDetail() }}><option value="ALL">Все сущности</option>{Object.entries(entityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field><FieldLabel htmlFor="audit-action">Действие</FieldLabel><select id="audit-action" className="h-8 rounded-md border border-input bg-transparent px-2 text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" value={action} onChange={(event) => { setAction(event.target.value as "ALL" | AuditAction); setCursorStack([""]); resetDetail() }}><option value="ALL">Все действия</option>{Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field><FieldLabel htmlFor="audit-search" className="sr-only">Поиск в журнале</FieldLabel><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-muted-foreground" /><Input id="audit-search" className="pl-8" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ID, источник или email" /></div></Field>
            <div className="self-end"><FilterResetButton active={filtersActive} onReset={resetFilters} /></div>
          </CardContent>
        </Card>

        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(22rem,1fr)]">
          <Card className="min-w-0">
            <CardHeader><CardTitle>События</CardTitle><CardDescription>{page ? `${page.pageInfo.total.toLocaleString("ru-RU")} записей по текущим фильтрам.` : "Выберите сайт для загрузки истории."}</CardDescription></CardHeader>
            <CardContent className="flex min-w-0 flex-col gap-4">
              {listError ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Журнал не загружен</AlertTitle><AlertDescription>{listError}</AlertDescription></Alert> : null}
              {listBusy ? <div aria-busy="true" className="flex flex-col gap-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div> : null}
              {!listBusy && page?.items.length ? <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Дата</TableHead><TableHead>Версия</TableHead><TableHead>Сущность</TableHead><TableHead>Действие</TableHead><TableHead>Автор</TableHead><TableHead>Поля</TableHead><TableHead><span className="sr-only">Открыть</span></TableHead></TableRow></TableHeader><TableBody>{page.items.map((event) => <TableRow key={event.id} data-state={selectedEventId === event.id ? "selected" : undefined}><TableCell className="whitespace-nowrap">{dateFormatter.format(new Date(event.createdAt))}</TableCell><TableCell>#{event.siteRevision}</TableCell><TableCell><div className="font-medium">{entityLabels[event.entityType] || "Неизвестная сущность"}</div><div className="max-w-40 truncate text-xs text-muted-foreground" title={event.entityId}>{event.entityId}</div></TableCell><TableCell><StatusBadge kind="contentRevisionAction" value={event.action} /></TableCell><TableCell>{event.actor?.email || "Системная операция"}</TableCell><TableCell>{event.changedFields.map(fieldLabel).join(", ") || "—"}</TableCell><TableCell><Button size="sm" variant={selectedEventId === event.id ? "secondary" : "outline"} onClick={() => void loadDetail(event.id)}>Открыть</Button></TableCell></TableRow>)}</TableBody></Table></div> : null}
              {!listBusy && selectedSiteId && page && !page.items.length ? <Alert><FileClock /><AlertTitle>Записей не найдено</AlertTitle><AlertDescription>Измените фильтры или дождитесь первой рабочей правки.</AlertDescription></Alert> : null}
              {page ? <ServerPagination page={cursorStack.length} pageSize={pageSize} itemCount={page.items.length} total={page.pageInfo.total} hasNextPage={page.pageInfo.hasNextPage} busy={listBusy} onPageSizeChange={(value) => { setPageSize(value); setCursorStack([""]); resetDetail() }} onPrevious={() => { setCursorStack((stack) => stack.slice(0, -1)); resetDetail() }} onNext={() => { if (page.pageInfo.nextCursor) setCursorStack((stack) => [...stack, page.pageInfo.nextCursor || ""]); resetDetail() }} /> : null}
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader><CardTitle>Подробности изменения</CardTitle><CardDescription>Значения до и после сохраненной рабочей операции.</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-4">
              {detail.status === "idle" ? <Alert><FileClock /><AlertTitle>Выберите запись</AlertTitle><AlertDescription>Откройте событие в таблице, чтобы увидеть изменения полей.</AlertDescription></Alert> : null}
              {detail.status === "loading" ? <div aria-busy="true" className="flex flex-col gap-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-32 w-full" /></div> : null}
              {detail.status === "error" ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Подробности не загружены</AlertTitle><AlertDescription>{detail.message}</AlertDescription></Alert> : null}
              {detail.status === "ready" ? <>
                <dl className="grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Сайт и версия</dt><dd className="font-medium">{detail.event.site.name} · #{detail.event.siteRevision}</dd></div><div><dt className="text-muted-foreground">Дата</dt><dd>{dateFormatter.format(new Date(detail.event.createdAt))}</dd></div><div><dt className="text-muted-foreground">Сущность</dt><dd>{entityLabels[detail.event.entityType]} · {detail.event.entityId}</dd></div><div><dt className="text-muted-foreground">Действие</dt><dd>{actionLabels[detail.event.action]}</dd></div><div><dt className="text-muted-foreground">Автор</dt><dd>{detail.event.actor?.email || "Системная операция"}</dd></div><div><dt className="text-muted-foreground">Источник</dt><dd className="break-all"><SourceLabel value={detail.event.source} /></dd></div></dl>
                <div><h2 className="font-heading font-medium">Измененные поля</h2><p className="mt-1 text-sm text-muted-foreground">{detail.event.changedFields.map(fieldLabel).join(", ") || "Список полей не сохранен"}</p></div>
                {changeEntries.length ? <div className="flex flex-col gap-4">{changeEntries.map(([field, change]) => <section key={field} className="rounded-lg border p-4"><h3 className="font-heading font-medium">{fieldLabel(field)}</h3><div className="mt-3 grid gap-4 md:grid-cols-2"><div><p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">До изменения</p><ValueView value={change?.before} /></div><div><p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">После изменения</p><ValueView value={change?.after} /></div></div></section>)}</div> : <Alert><FileClock /><AlertTitle>Подробных значений нет</AlertTitle><AlertDescription>Событие содержит метаданные операции, но не содержит field-level diff.</AlertDescription></Alert>}
              </> : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminShell>
  )
}
