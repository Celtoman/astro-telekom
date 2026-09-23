import { useCallback, useEffect, useState, type ReactNode } from "react"
import { CircleAlert, Inbox, RefreshCw, Save, Search } from "lucide-react"
import { AdminApiError, requestJson } from "../lib/admin-api.mjs"
import { sourcePresentation, statusOptions, statusPresentation, type StatusKind } from "../lib/status-presentation.mjs"
import { AdminShell } from "./AdminShell"
import { FilterResetButton } from "./FilterResetButton"
import { ServerPagination } from "./ServerPagination"
import { SourceLabel } from "./SourceLabel"
import { StatusBadge } from "./StatusBadge"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "./ui/field"
import { Input } from "./ui/input"
import { Skeleton } from "./ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table"

type LeadStatus = "NEW" | "IN_PROGRESS" | "CALL_LATER" | "CONNECTED" | "REJECTED"

interface Administrator { id: string; email: string }
interface RelatedCity { id: string; name: string; slug: string }
interface RelatedPage { id: string; slug: string }
interface RelatedTariff { id: string; name: string; slug: string }
interface ConfigurationSnapshot {
  version: number
  tariff: { id: string; slug: string; name: string }
  components: Array<{ kind: string; code: string; title: string; methodTitle?: string }>
  charges: { monthly: Array<{ code: string; title: string; amount: number }>;
    oneTime: Array<{ code: string; title: string; amount: number | null }> }
  totals: { monthly: number; oneTime: number | null; knownOneTime: number }
  capturedAt?: string
}
interface LeadHistory { id: string; fromStatus?: LeadStatus; toStatus: LeadStatus; comment?: string; actorId?: string; createdAt: string }
interface DeliveryAttempt { id: string; attemptNumber: number; channel: string; status: string; error?: string; nextAttemptAt?: string; createdAt: string }
interface LeadNotification { id: string; status: string; attempts: number; maxAttempts: number; transport?: string; errorCode?: string; httpStatus?: number; providerMessageId?: string; updatedAt: string }
interface ActivityEvent { id: string; type: string; createdAt: string }
interface LeadReasonOption { code: string; label: string; route: "SALES" | "NON_SALES" | "MANUAL"; version: number }
interface CommentEvidence { category: string; fragment: string; start: number; end: number }
interface LeadSummary {
  id: string
  name?: string
  phone: string
  email?: string
  address?: string
  source?: string
  reasonCode?: string | null
  reasonLabel?: string | null
  reasonRoute?: string | null
  reasonRegistryVersion?: number | null
  pageUrl?: string
  formName?: string
  deviceType?: string
  timeOnSiteSeconds?: number
  status: LeadStatus
  processingStatus: string
  externalLeadId?: string
  externalStatus?: string
  createdAt: string
  updatedAt: string
  city: RelatedCity
  page?: RelatedPage
  tariff?: RelatedTariff
  history: LeadHistory[]
  deliveryAttempts: DeliveryAttempt[]
  notification?: LeadNotification
  activityEvents: ActivityEvent[]
  duplicateOf?: { id: string; phone: string; createdAt: string }
  duplicateReason?: string
}
interface LeadDetail extends LeadSummary {
  site: { id: string; name: string; slug: string }
  addressCheck?: { status: string }
  contractResult?: Record<string, unknown>
  apiResult?: Record<string, unknown>
  configurationSnapshot?: ConfigurationSnapshot | null
  comment?: string | null
  commentAnalysisVersion?: number | null
  commentAnalysisOutcome?: string | null
  commentAnalysisCategory?: string | null
  commentAnalysisEvidence?: unknown
  commentAnalysisExplanation?: string | null
}

function hasUnknownDeliveryOutcome(lead: LeadDetail): boolean {
  if (lead.processingStatus === "DELIVERY_EMAIL_OUTCOME_UNKNOWN") return true
  const latestApi = lead.deliveryAttempts.filter((item) => item.channel === "API")
    .toSorted((a, b) => b.attemptNumber - a.attemptNumber)[0]
  return lead.processingStatus === "PENDING" && latestApi?.status === "FAILED"
    && latestApi.nextAttemptAt == null && Date.now() - Date.parse(lead.updatedAt) >= 2 * 60_000
}

interface LeadPage {
  items: LeadSummary[]
  pageInfo: { limit: number; total: number; hasNextPage: boolean; nextCursor: string | null }
  summary: { total: number; new: number; pending: number; attention: number }
}

type ScreenState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; user: Administrator; reasons: LeadReasonOption[] }

type DetailState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; lead: LeadDetail }

const leadStatusOptions = statusOptions("leadStatus", ["NEW", "IN_PROGRESS", "CALL_LATER", "CONNECTED", "REJECTED"])

const dateFormatter = new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" })

function recordText(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key]
  if (typeof value === "string" || typeof value === "number") return String(value)
  if (typeof value === "boolean") return value ? "Да" : "Нет"
  return "—"
}

function presentationText(kind: StatusKind, value: unknown, fallback = "Неизвестный статус") {
  const presentation = statusPresentation(kind, value)
  return presentation.known ? presentation.label : fallback
}

function sourcePresentationText(value: unknown) {
  return typeof value === "string" && value ? sourcePresentation(value).label : ""
}

function reasonRouteExplanation(route: string | null | undefined, version: number | null | undefined) {
  const suffix = version ? ` Справочник v${version}.` : ""
  if (route === "NON_SALES") return `Несбытовое обращение: сохранено для оператора без проверки абонента и передачи в Tarifnik.${suffix}`
  if (route === "MANUAL") return `Требует ручного решения оператора; автоматическая передача не запускалась.${suffix}`
  if (route === "SALES") return `Причина допускает проверку подключения и последующую передачу при успешных проверках.${suffix}`
  return "Историческая заявка без снимка причины."
}

const commentCategoryLabels: Record<string, string> = {
  technical_problem: "Техническая проблема действующего абонента",
  billing: "Оплата или начисления",
  cancellation: "Отключение или расторжение",
  complaint: "Жалоба или претензия",
  relocation: "Переезд",
  new_connection: "Новое подключение",
}

function isCommentEvidence(value: unknown): value is CommentEvidence {
  if (!value || typeof value !== "object") return false
  const item = value as Record<string, unknown>
  return typeof item.category === "string" && typeof item.fragment === "string"
    && typeof item.start === "number" && typeof item.end === "number"
}

export function LeadsApp({ apiUrl }: { apiUrl: string }) {
  const [state, setState] = useState<ScreenState>({ status: "loading" })
  const [detail, setDetail] = useState<DetailState>({ status: "idle" })
  const [selectedLeadId, setSelectedLeadId] = useState("")
  const [search, setSearch] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"ALL" | LeadStatus>("ALL")
  const [reasonFilter, setReasonFilter] = useState("ALL")
  const [leadPage, setLeadPage] = useState<LeadPage | null>(null)
  const [cursorStack, setCursorStack] = useState([""])
  const [pageSize, setPageSize] = useState(25)
  const [listRevision, setListRevision] = useState(0)
  const [listBusy, setListBusy] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [nextStatus, setNextStatus] = useState<LeadStatus>("NEW")
  const [comment, setComment] = useState("")
  const [busy, setBusy] = useState<"status" | "retryDelivery" | "retryNotification" | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

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
      const [session, reasons] = await Promise.all([
        requestJson<{ user: Administrator }>(apiUrl, "/auth/me"),
        requestJson<LeadReasonOption[]>(apiUrl, "/crm/leads/reasons"),
      ])
      setState({ status: "ready", user: session.user, reasons })
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

  function resetFilters() {
    setSearch("")
    setSearchQuery("")
    setStatusFilter("ALL")
    setReasonFilter("ALL")
    setCursorStack([""])
  }

  const currentCursor = cursorStack[cursorStack.length - 1]
  useEffect(() => {
    let active = true
    const params = new URLSearchParams({ limit: String(pageSize) })
    if (searchQuery) params.set("q", searchQuery)
    if (statusFilter !== "ALL") params.set("status", statusFilter)
    if (reasonFilter !== "ALL") params.set("reasonCode", reasonFilter)
    if (currentCursor) params.set("cursor", currentCursor)
    setListBusy(true)
    setListError(null)
    void requestJson<LeadPage>(apiUrl, `/crm/leads?${params.toString()}`)
      .then((page) => { if (active) setLeadPage(page) })
      .catch((caught: unknown) => {
        if (!active) return
        const message = handleError(caught, "Журнал заявок не загружен")
        if (message) setListError(message)
      })
      .finally(() => { if (active) setListBusy(false) })
    return () => { active = false }
  }, [apiUrl, currentCursor, handleError, listRevision, pageSize, searchQuery, statusFilter, reasonFilter])

  async function loadDetail(id: string) {
    setSelectedLeadId(id)
    setDetail({ status: "loading" })
    setActionError(null)
    try {
      const lead = await requestJson<LeadDetail>(apiUrl, `/crm/leads/${encodeURIComponent(id)}`)
      setDetail({ status: "ready", lead })
      setNextStatus(lead.status)
      setComment("")
    } catch (caught: unknown) {
      const message = handleError(caught, "Карточка не загружена")
      if (message) setDetail({ status: "error", message })
    }
  }

  async function updateStatus() {
    if (detail.status !== "ready" || nextStatus === detail.lead.status) return
    setBusy("status")
    setActionError(null)
    try {
      await requestJson(apiUrl, `/crm/leads/${encodeURIComponent(selectedLeadId)}/status`, {
        method: "PATCH",
        body: { status: nextStatus, comment: comment.trim() || undefined },
      })
      const lead = await requestJson<LeadDetail>(apiUrl, `/crm/leads/${encodeURIComponent(selectedLeadId)}`)
      setListRevision((value) => value + 1)
      setDetail({ status: "ready", lead })
      setNextStatus(lead.status)
      setComment("")
    } catch (caught: unknown) {
      const message = handleError(caught, "Статус не изменен")
      if (message) setActionError(message)
    } finally {
      setBusy(null)
    }
  }

  async function retryDelivery() {
    if (detail.status !== "ready") return
    const unknownOutcome = hasUnknownDeliveryOutcome(detail.lead)
    if (unknownOutcome && !window.confirm("Результат резервного письма неизвестен. Сначала проверьте почту или журнал внешнего сервиса. Повторная передача может создать дубль. Вы проверили результат и подтверждаете повтор?")) return
    setBusy("retryDelivery")
    setActionError(null)
    try {
      await requestJson(apiUrl, `/crm/leads/${encodeURIComponent(selectedLeadId)}/retry-delivery`, {
        method: "POST", ...(unknownOutcome ? { body: { confirmUnknownOutcome: true } } : {}),
      })
      const lead = await requestJson<LeadDetail>(apiUrl, `/crm/leads/${encodeURIComponent(selectedLeadId)}`)
      setListRevision((value) => value + 1)
      setDetail({ status: "ready", lead })
    } catch (caught: unknown) {
      const message = handleError(caught, "Повторная передача не запущена")
      if (message) setActionError(message)
    } finally {
      setBusy(null)
    }
  }

  async function retryNotification() {
    if (detail.status !== "ready") return
    setBusy("retryNotification")
    setActionError(null)
    try {
      await requestJson(apiUrl, `/crm/leads/${encodeURIComponent(selectedLeadId)}/retry-notification`, { method: "POST" })
      const lead = await requestJson<LeadDetail>(apiUrl, `/crm/leads/${encodeURIComponent(selectedLeadId)}`)
      setListRevision((value) => value + 1)
      setDetail({ status: "ready", lead })
    } catch (caught: unknown) {
      const message = handleError(caught, "Повторное оповещение не запущено")
      if (message) setActionError(message)
    } finally {
      setBusy(null)
    }
  }

  if (state.status === "loading" || (!leadPage && listBusy)) {
    return <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 p-8" aria-busy="true"><Skeleton className="h-10 w-72" /><Skeleton className="h-64 w-full" /></main>
  }
  if (state.status === "error" || !leadPage) {
    const message = state.status === "error" ? state.message : listError || "Журнал заявок не загружен"
    return <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6"><Card className="w-full max-w-lg"><CardHeader><CardTitle>Заявки недоступны</CardTitle><CardDescription>Не удалось загрузить рабочий журнал.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><Alert variant="destructive"><CircleAlert /><AlertTitle>Ошибка API</AlertTitle><AlertDescription>{message}</AlertDescription></Alert><Button onClick={() => { void loadWorkspace(); setListRevision((value) => value + 1) }}>Повторить</Button></CardContent></Card></main>
  }

  const newCount = leadPage.summary.new
  const pendingCount = leadPage.summary.pending
  const attentionCount = leadPage.summary.attention

  return (
    <AdminShell apiUrl={apiUrl} user={state.user} active="leads">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h1 className="font-heading text-2xl font-semibold">Заявки</h1><p className="mt-1 text-sm text-muted-foreground">Рабочий журнал обращений и доставки в кол-центр.</p></div>
          <Button variant="outline" disabled={busy !== null || listBusy} onClick={() => setListRevision((value) => value + 1)}><RefreshCw data-icon="inline-start" />Обновить</Button>
        </div>

        {actionError ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Операция не выполнена</AlertTitle><AlertDescription>{actionError}</AlertDescription></Alert> : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Состояние журнала заявок">
          <Card size="sm"><CardHeader><CardDescription>Всего заявок</CardDescription><CardTitle>{leadPage.summary.total.toLocaleString("ru-RU")}</CardTitle></CardHeader></Card>
          <Card size="sm"><CardHeader><CardDescription>Новые</CardDescription><CardTitle>{newCount.toLocaleString("ru-RU")}</CardTitle></CardHeader></Card>
          <Card size="sm"><CardHeader><CardDescription>Ожидают передачи</CardDescription><CardTitle>{pendingCount.toLocaleString("ru-RU")}</CardTitle></CardHeader></Card>
          <Card size="sm"><CardHeader><CardDescription>Требуют внимания</CardDescription><CardTitle>{attentionCount.toLocaleString("ru-RU")}</CardTitle></CardHeader></Card>
        </section>

        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(22rem,1fr)]">
          <Card className="min-w-0">
            <CardHeader><CardTitle>Журнал</CardTitle><CardDescription>{leadPage.pageInfo.total.toLocaleString("ru-RU")} заявок соответствует фильтру.</CardDescription></CardHeader>
            <CardContent className="flex min-w-0 flex-col gap-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_12rem_12rem_auto]">
                <Field><FieldLabel htmlFor="lead-search" className="sr-only">Поиск заявки</FieldLabel><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input id="lead-search" className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Телефон, адрес, имя или ID" /></div></Field>
                <Field><FieldLabel htmlFor="lead-status-filter" className="sr-only">Фильтр по статусу</FieldLabel><select id="lead-status-filter" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as "ALL" | LeadStatus); setCursorStack([""]) }}><option value="ALL">Все статусы</option>{leadStatusOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></Field>
                <Field><FieldLabel htmlFor="lead-reason-filter" className="sr-only">Фильтр по причине обращения</FieldLabel><select id="lead-reason-filter" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" value={reasonFilter} onChange={(event) => { setReasonFilter(event.target.value); setCursorStack([""]) }}><option value="ALL">Все причины</option>{state.reasons.map(({ code, label }) => <option key={code} value={code}>{label}</option>)}<option value="NONE">Без причины</option></select></Field>
                <FilterResetButton active={Boolean(search || searchQuery || statusFilter !== "ALL" || reasonFilter !== "ALL")} onReset={resetFilters} />
              </div>
              {listError ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Журнал не обновлен</AlertTitle><AlertDescription>{listError}</AlertDescription></Alert> : null}
              <div aria-busy={listBusy} className="min-w-0 overflow-x-auto">
                {leadPage.items.length ? <Table><TableHeader><TableRow><TableHead>Создана</TableHead><TableHead>Контакт</TableHead><TableHead>Адрес подключения</TableHead><TableHead>Причина</TableHead><TableHead>Статус</TableHead><TableHead>Обработка</TableHead><TableHead>Оповещение</TableHead><TableHead><span className="sr-only">Действие</span></TableHead></TableRow></TableHeader><TableBody>{leadPage.items.map((lead) => <TableRow key={lead.id} data-state={selectedLeadId === lead.id ? "selected" : undefined}><TableCell className="whitespace-nowrap">{dateFormatter.format(new Date(lead.createdAt))}</TableCell><TableCell><div className="font-medium">{lead.phone}</div><div className="text-xs text-muted-foreground">{lead.name || sourcePresentationText(lead.source) || "Имя не указано"}</div></TableCell><TableCell><div className="max-w-64 truncate font-medium">{lead.address || "Адрес не указан"}</div><div className="text-xs text-muted-foreground">Город страницы: {lead.city.name}</div></TableCell><TableCell>{lead.reasonLabel || "Не указана"}</TableCell><TableCell><StatusBadge kind="leadStatus" value={lead.status} /></TableCell><TableCell><StatusBadge kind="leadProcessingStatus" value={lead.processingStatus} /></TableCell><TableCell><StatusBadge kind="leadNotificationStatus" value={lead.notification?.status || "PENDING"} /></TableCell><TableCell><Button variant="ghost" size="sm" onClick={() => void loadDetail(lead.id)}>Открыть</Button></TableCell></TableRow>)}</TableBody></Table> : <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center"><Inbox className="text-muted-foreground" aria-hidden="true" /><p className="font-medium">Заявки не найдены</p><p className="text-sm text-muted-foreground">Измените поиск или фильтр либо дождитесь первого обращения.</p></div>}
              </div>
              <ServerPagination
                page={cursorStack.length}
                pageSize={pageSize}
                itemCount={leadPage.items.length}
                total={leadPage.pageInfo.total}
                hasNextPage={leadPage.pageInfo.hasNextPage}
                busy={listBusy}
                onPageSizeChange={(value) => { setPageSize(value); setCursorStack([""]) }}
                onPrevious={() => setCursorStack((current) => current.length > 1 ? current.slice(0, -1) : current)}
                onNext={() => setCursorStack((current) => leadPage.pageInfo.nextCursor ? [...current, leadPage.pageInfo.nextCursor] : current)}
              />
            </CardContent>
          </Card>

          <LeadDetailCard detail={detail} nextStatus={nextStatus} setNextStatus={setNextStatus} comment={comment} setComment={setComment} busy={busy !== null} deliveryRetryBusy={busy === "retryDelivery"} notificationRetryBusy={busy === "retryNotification"} onSave={updateStatus} onRetryDelivery={retryDelivery} onRetryNotification={retryNotification} />
        </div>
      </div>
    </AdminShell>
  )
}

function LeadDetailCard({ detail, nextStatus, setNextStatus, comment, setComment, busy, deliveryRetryBusy, notificationRetryBusy, onSave, onRetryDelivery, onRetryNotification }: {
  detail: DetailState
  nextStatus: LeadStatus
  setNextStatus: (status: LeadStatus) => void
  comment: string
  setComment: (comment: string) => void
  busy: boolean
  deliveryRetryBusy: boolean
  notificationRetryBusy: boolean
  onSave: () => Promise<void>
  onRetryDelivery: () => Promise<void>
  onRetryNotification: () => Promise<void>
}) {
  if (detail.status === "idle") return <Card><CardHeader><CardTitle>Карточка заявки</CardTitle><CardDescription>Выберите заявку в журнале.</CardDescription></CardHeader><CardContent className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">Детали появятся здесь.</CardContent></Card>
  if (detail.status === "loading") return <Card aria-busy="true"><CardHeader><Skeleton className="h-6 w-48" /><Skeleton className="h-4 w-36" /></CardHeader><CardContent className="flex flex-col gap-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-32 w-full" /></CardContent></Card>
  if (detail.status === "error") return <Card><CardHeader><CardTitle>Карточка не загружена</CardTitle></CardHeader><CardContent><Alert variant="destructive"><CircleAlert /><AlertTitle>Ошибка API</AlertTitle><AlertDescription>{detail.message}</AlertDescription></Alert></CardContent></Card>

  const lead = detail.lead
  const unknownOutcome = hasUnknownDeliveryOutcome(lead)
  const unknownOutcomeOldEnough = Date.now() - Date.parse(lead.updatedAt) >= 2 * 60_000
  const configuration = lead.configurationSnapshot
  const commentEvidence = Array.isArray(lead.commentAnalysisEvidence) ? lead.commentAnalysisEvidence.filter(isCommentEvidence) : []
  const rubles = (amount: number) => `${new Intl.NumberFormat("ru-RU").format(amount)} ₽`
  const addressStatus = lead.addressCheck?.status || recordText(lead.apiResult, "status")
  const contractStatus = recordText(lead.contractResult, "status")
  const canRetryDelivery = ["DELIVERY_QUEUE_ERROR", "DELIVERY_ERROR_EMAIL_SENT", "DELIVERY_ERROR_EMAIL_FAILED"].includes(lead.processingStatus)
    || (lead.processingStatus === "PENDING" && lead.deliveryAttempts.length === 0)
    || (unknownOutcome && unknownOutcomeOldEnough)
  const canRetryNotification = lead.notification?.status === "FAILED"
  const externalLead = lead.externalLeadId
    ? `${lead.externalLeadId} · ${presentationText("externalLeadStatus", lead.externalStatus, "Статус Tarifnik не распознан")}`
    : "Не создана"
  const processingPresentation = statusPresentation("leadProcessingStatus", lead.processingStatus)
  return <Card>
    <CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>{lead.name || lead.phone}</CardTitle><CardDescription>{lead.phone} · {dateFormatter.format(new Date(lead.createdAt))}</CardDescription></div><StatusBadge kind="leadStatus" value={lead.status} /></div></CardHeader>
    <CardContent className="flex flex-col gap-6">
      <section className="flex flex-col gap-2"><h2 className="font-heading text-sm font-medium">Контакт и контекст</h2><dl className="grid gap-2 text-sm"><DetailRow label="Email" value={lead.email} /><DetailRow label="Город страницы" value={lead.city.name} /><DetailRow label="Адрес подключения" value={lead.address} /><DetailRow label="Страница" value={lead.pageUrl || lead.page?.slug} /><DetailRow label="Тариф" value={configuration?.tariff.name || lead.tariff?.name} /><DetailRow label="Причина обращения" value={lead.reasonLabel || "Не указана"} description={reasonRouteExplanation(lead.reasonRoute, lead.reasonRegistryVersion)} /><DetailRow label="Источник" value={lead.source ? <SourceLabel value={lead.source} /> : undefined} /><DetailRow label="Форма" value={lead.formName} /></dl></section>
      {lead.comment ? <section className="flex flex-col gap-3"><h2 className="font-heading text-sm font-medium">Комментарий пользователя</h2><p className="whitespace-pre-wrap break-words text-sm">{lead.comment}</p>{lead.commentAnalysisVersion ? <Alert><CircleAlert /><AlertTitle>{lead.commentAnalysisOutcome === "MANUAL_REVIEW" ? "Нужна ручная проверка" : lead.commentAnalysisOutcome === "WARNING" ? "Есть предупреждение" : "Анализ комментария"}</AlertTitle><AlertDescription>{lead.commentAnalysisExplanation || "Результат анализа сохранён."} Структурированная причина: {lead.reasonLabel || "не указана"}. Правила v{lead.commentAnalysisVersion}.</AlertDescription></Alert> : null}{commentEvidence.length ? <ul className="space-y-2 text-sm">{commentEvidence.map((item, index) => <li className="rounded-md border p-2" key={`${item.start}-${item.end}-${index}`}><span className="font-medium">{commentCategoryLabels[item.category] || "Неизвестная категория"}</span><span className="block break-words text-muted-foreground">Найденный фрагмент: «{item.fragment}»</span></li>)}</ul> : <p className="text-sm text-muted-foreground">Значимых фрагментов не найдено.</p>}</section> : null}
      {configuration ? <section className="flex flex-col gap-2"><h2 className="font-heading text-sm font-medium">Комплектация при отправке</h2><p className="text-xs text-muted-foreground">Неизменяемый снимок условий заявки{configuration.capturedAt ? ` · ${dateFormatter.format(new Date(configuration.capturedAt))}` : ""}.</p><dl className="grid gap-2 text-sm"><DetailRow label="Тариф" value={configuration.tariff.name} /><DetailRow label="ID тарифа" value={configuration.tariff.id} /></dl>{configuration.components.length ? <ul className="list-disc pl-5 text-sm">{configuration.components.map((item) => <li key={item.code}>{item.title} ({item.code}){item.methodTitle ? ` — ${item.methodTitle}` : ""}</li>)}</ul> : <p className="text-sm text-muted-foreground">Дополнительные опции не выбраны.</p>}<h3 className="text-sm font-medium">Ежемесячно</h3><ul className="list-disc pl-5 text-sm">{configuration.charges.monthly.map((item) => <li key={item.code}>{item.title}: {rubles(item.amount)}</li>)}</ul><strong className="text-sm">{rubles(configuration.totals.monthly)}/мес.</strong><h3 className="text-sm font-medium">Разовые платежи</h3><ul className="list-disc pl-5 text-sm">{configuration.charges.oneTime.map((item) => <li key={item.code}>{item.title}: {item.amount === null ? "стоимость уточняется" : rubles(item.amount)}</li>)}</ul><strong className="text-sm">{configuration.totals.oneTime === null ? `Известная часть: ${rubles(configuration.totals.knownOneTime)}; полная сумма уточняется` : rubles(configuration.totals.oneTime)}</strong></section> : null}
      <section className="flex flex-col gap-3"><h2 className="font-heading text-sm font-medium">Проверки и доставка</h2><dl className="grid gap-2 text-sm"><DetailRow label="Обработка" value={<StatusBadge kind="leadProcessingStatus" value={lead.processingStatus} />} description={processingPresentation.description} /><DetailRow label="Проверка адреса" value={presentationText("addressCheckStatus", addressStatus, "Результат проверки адреса отсутствует")} /><DetailRow label="Статус договора" value={presentationText("contractStatus", contractStatus, "Результат проверки договора отсутствует")} /><DetailRow label="Внешняя заявка" value={externalLead} /></dl>{unknownOutcome ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Проверьте результат резервного письма</AlertTitle><AlertDescription>Отправка могла состояться, но подтверждение не сохранилось. Проверьте почту или журнал внешнего сервиса до повтора: повторная передача может создать дубль.{!unknownOutcomeOldEnough ? " Обновите карточку через две минуты." : ""}</AlertDescription></Alert> : null}{canRetryDelivery ? <Button variant="outline" disabled={busy} onClick={() => void onRetryDelivery()}><RefreshCw data-icon="inline-start" />{deliveryRetryBusy ? "Ставим в очередь…" : unknownOutcome ? "Проверил результат — повторить" : "Повторить передачу"}</Button> : null}{lead.duplicateOf ? <Alert><CircleAlert /><AlertTitle>Повторная заявка {lead.duplicateOf.id}</AlertTitle><AlertDescription>{statusPresentation("duplicateReason", lead.duplicateReason).description}</AlertDescription></Alert> : null}</section>
      <section className="flex flex-col gap-3"><h2 className="font-heading text-sm font-medium">Оповещение оператора</h2><dl className="grid gap-2 text-sm"><DetailRow label="Статус" value={lead.notification ? <StatusBadge kind="leadNotificationStatus" value={lead.notification.status} /> : "Нет записи"} /><DetailRow label="Канал" value={presentationText("notificationTransport", lead.notification?.transport, "Еще не выбран")} /><DetailRow label="Попытки" value={lead.notification ? `${lead.notification.attempts} из ${lead.notification.maxAttempts}` : "—"} /></dl>{canRetryNotification ? <Button variant="outline" disabled={busy} onClick={() => void onRetryNotification()}><RefreshCw data-icon="inline-start" />{notificationRetryBusy ? "Ставим в очередь…" : "Повторить оповещение"}</Button> : null}{lead.notification?.errorCode ? <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Техническая информация</summary><p className="mt-1 break-words text-destructive">Код: {lead.notification.errorCode}{lead.notification.httpStatus ? ` · HTTP ${lead.notification.httpStatus}` : ""}</p></details> : null}</section>
      <FieldGroup>
        <Field><FieldLabel htmlFor="lead-next-status">Новый статус</FieldLabel><select id="lead-next-status" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" value={nextStatus} disabled={busy} onChange={(event) => setNextStatus(event.target.value as LeadStatus)}>{leadStatusOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></Field>
        <Field><FieldLabel htmlFor="lead-status-comment">Комментарий к истории</FieldLabel><Input id="lead-status-comment" value={comment} maxLength={5000} disabled={busy} onChange={(event) => setComment(event.target.value)} placeholder="Необязательно" /><FieldDescription>Комментарий сохранится вместе с переходом статуса.</FieldDescription></Field>
        <Button disabled={busy || nextStatus === lead.status} onClick={() => void onSave()}><Save data-icon="inline-start" />{busy ? "Сохраняем…" : "Сохранить статус"}</Button>
      </FieldGroup>
      <Timeline title="История статусов" empty="Переходов статуса еще не было.">{lead.history.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt)).map((item) => <li className="rounded-md border p-3" key={item.id}><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium">{item.fromStatus ? `${presentationText("leadStatus", item.fromStatus)} → ` : ""}{presentationText("leadStatus", item.toStatus)}</span><time className="text-xs text-muted-foreground">{dateFormatter.format(new Date(item.createdAt))}</time></div>{item.comment ? <p className="mt-1 text-sm text-muted-foreground">{item.comment}</p> : null}</li>)}</Timeline>
      <Timeline title="Попытки передачи" empty="Попыток передачи еще не было.">{lead.deliveryAttempts.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt)).map((item) => <li className="rounded-md border p-3" key={item.id}><div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{presentationText("deliveryChannel", item.channel, "Неизвестный канал")} · попытка {item.attemptNumber}</span><StatusBadge kind="deliveryAttemptStatus" value={item.status} /></div>{item.nextAttemptAt ? <p className="mt-1 text-sm text-muted-foreground">Следующая попытка: {dateFormatter.format(new Date(item.nextAttemptAt))}</p> : null}{item.error ? <details className="mt-2 text-sm"><summary className="cursor-pointer text-muted-foreground">Техническая информация</summary><p className="mt-1 break-words text-destructive">{item.error}</p></details> : null}</li>)}</Timeline>
      <Timeline title="Активность до формы" empty="События не передавались.">{lead.activityEvents.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12).map((item) => <li className="flex items-center justify-between gap-3 rounded-md border p-3" key={item.id}><span className="text-sm font-medium">{item.type}</span><time className="text-xs text-muted-foreground">{dateFormatter.format(new Date(item.createdAt))}</time></li>)}</Timeline>
    </CardContent>
  </Card>
}

function DetailRow({ label, value, description }: { label: string; value?: ReactNode; description?: string }) {
  return <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="min-w-0 break-words"><span className="font-medium">{value || "—"}</span>{description ? <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span> : null}</dd></div>
}

function Timeline({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return <section className="flex flex-col gap-2"><h2 className="font-heading text-sm font-medium">{title}</h2>{children.length ? <ul className="flex flex-col gap-2">{children}</ul> : <p className="text-sm text-muted-foreground">{empty}</p>}</section>
}
