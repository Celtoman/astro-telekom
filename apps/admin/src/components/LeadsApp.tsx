import { useCallback, useEffect, useMemo, useState } from "react"
import { CircleAlert, Inbox, RefreshCw, Save, Search } from "lucide-react"
import { AdminApiError, requestJson } from "../lib/admin-api.mjs"
import { AdminShell } from "./AdminShell"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Badge } from "./ui/badge"
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
interface LeadHistory { id: string; fromStatus?: LeadStatus; toStatus: LeadStatus; comment?: string; actorId?: string; createdAt: string }
interface DeliveryAttempt { id: string; attemptNumber: number; channel: string; status: string; error?: string; createdAt: string }
interface ActivityEvent { id: string; type: string; createdAt: string }
interface LeadSummary {
  id: string
  name?: string
  phone: string
  email?: string
  address?: string
  source?: string
  pageUrl?: string
  formName?: string
  deviceType?: string
  timeOnSiteSeconds?: number
  status: LeadStatus
  processingStatus: string
  createdAt: string
  updatedAt: string
  city: RelatedCity
  page?: RelatedPage
  tariff?: RelatedTariff
  history: LeadHistory[]
  deliveryAttempts: DeliveryAttempt[]
  activityEvents: ActivityEvent[]
  duplicateOf?: { id: string; phone: string; createdAt: string }
  duplicateReason?: string
}
interface LeadDetail extends LeadSummary {
  site: { id: string; name: string; slug: string }
  addressCheck?: { status: string }
  contractResult?: Record<string, unknown>
  apiResult?: Record<string, unknown>
}

type ScreenState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; user: Administrator; leads: LeadSummary[] }

type DetailState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; lead: LeadDetail }

const statusLabels: Record<LeadStatus, string> = {
  NEW: "Новая",
  IN_PROGRESS: "В работе",
  CALL_LATER: "Перезвонить",
  CONNECTED: "Подключена",
  REJECTED: "Отклонена",
}

const processingLabels: Record<string, string> = {
  PENDING: "Ожидает передачи",
  DELIVERED: "Передана",
  DUPLICATE_SUPPRESSED: "Дубликат подавлен",
  ACTIVE_SUBSCRIBER_NOT_SENT: "Действующий абонент",
  PROVIDER_NOT_AVAILABLE_NOT_SENT: "Дом.ру по адресу недоступен",
  NO_PROVIDERS_NOT_SENT: "Провайдеры не найдены",
  MANUAL_CHECK: "Ручная проверка",
  ADDRESS_CLARIFICATION: "Уточнение адреса",
  MANUAL_CHECK_API: "Проверка API вручную",
  DELIVERY_ERROR_EMAIL_SENT: "Ошибка API, email отправлен",
  DELIVERY_ERROR_EMAIL_FAILED: "Ошибка API и email",
}

const dateFormatter = new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" })

function statusVariant(status: string) {
  if (["CONNECTED", "DELIVERED", "SUCCEEDED"].includes(status)) return "default" as const
  if (["REJECTED", "FAILED", "DELIVERY_ERROR_EMAIL_FAILED"].includes(status)) return "destructive" as const
  return "secondary" as const
}

function recordText(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key]
  if (typeof value === "string" || typeof value === "number") return String(value)
  if (typeof value === "boolean") return value ? "Да" : "Нет"
  return "—"
}

export function LeadsApp({ apiUrl }: { apiUrl: string }) {
  const [state, setState] = useState<ScreenState>({ status: "loading" })
  const [detail, setDetail] = useState<DetailState>({ status: "idle" })
  const [selectedLeadId, setSelectedLeadId] = useState("")
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"ALL" | LeadStatus>("ALL")
  const [nextStatus, setNextStatus] = useState<LeadStatus>("NEW")
  const [comment, setComment] = useState("")
  const [busy, setBusy] = useState<"refresh" | "status" | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const handleError = useCallback((caught: unknown, fallback: string) => {
    if (caught instanceof AdminApiError && caught.status === 401) {
      window.location.replace("/login")
      return null
    }
    return caught instanceof Error ? caught.message : fallback
  }, [])

  const loadWorkspace = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") setBusy("refresh")
    else setState({ status: "loading" })
    try {
      const [session, leads] = await Promise.all([
        requestJson<{ user: Administrator }>(apiUrl, "/auth/me"),
        requestJson<LeadSummary[]>(apiUrl, "/crm/leads"),
      ])
      setState({ status: "ready", user: session.user, leads })
    } catch (caught: unknown) {
      const message = handleError(caught, "API недоступен")
      if (message) setState({ status: "error", message })
    } finally {
      setBusy(null)
    }
  }, [apiUrl, handleError])

  useEffect(() => { void loadWorkspace() }, [loadWorkspace])

  const visibleLeads = useMemo(() => {
    if (state.status !== "ready") return []
    const query = search.trim().toLocaleLowerCase("ru-RU")
    return state.leads.filter((lead) => {
      if (statusFilter !== "ALL" && lead.status !== statusFilter) return false
      if (!query) return true
      return `${lead.id} ${lead.phone} ${lead.name || ""} ${lead.address || ""} ${lead.city.name}`.toLocaleLowerCase("ru-RU").includes(query)
    })
  }, [search, state, statusFilter])

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
      const [leads, lead] = await Promise.all([
        requestJson<LeadSummary[]>(apiUrl, "/crm/leads"),
        requestJson<LeadDetail>(apiUrl, `/crm/leads/${encodeURIComponent(selectedLeadId)}`),
      ])
      setState((current) => current.status === "ready" ? { ...current, leads } : current)
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

  if (state.status === "loading") {
    return <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 p-8" aria-busy="true"><Skeleton className="h-10 w-72" /><Skeleton className="h-64 w-full" /></main>
  }
  if (state.status === "error") {
    return <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6"><Card className="w-full max-w-lg"><CardHeader><CardTitle>Заявки недоступны</CardTitle><CardDescription>Не удалось загрузить рабочий журнал.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><Alert variant="destructive"><CircleAlert /><AlertTitle>Ошибка API</AlertTitle><AlertDescription>{state.message}</AlertDescription></Alert><Button onClick={() => void loadWorkspace()}>Повторить</Button></CardContent></Card></main>
  }

  const newCount = state.leads.filter((lead) => lead.status === "NEW").length
  const pendingCount = state.leads.filter((lead) => lead.processingStatus === "PENDING").length

  return (
    <AdminShell apiUrl={apiUrl} user={state.user} active="leads">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h1 className="font-heading text-2xl font-semibold">Заявки</h1><p className="mt-1 text-sm text-muted-foreground">Рабочий журнал обращений и доставки в кол-центр.</p></div>
          <Button variant="outline" disabled={busy !== null} onClick={() => void loadWorkspace("refresh")}><RefreshCw data-icon="inline-start" />Обновить</Button>
        </div>

        {actionError ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Операция не выполнена</AlertTitle><AlertDescription>{actionError}</AlertDescription></Alert> : null}

        <section className="grid gap-4 sm:grid-cols-3" aria-label="Состояние журнала заявок">
          <Card size="sm"><CardHeader><CardDescription>Всего заявок</CardDescription><CardTitle>{state.leads.length.toLocaleString("ru-RU")}</CardTitle></CardHeader></Card>
          <Card size="sm"><CardHeader><CardDescription>Новые</CardDescription><CardTitle>{newCount.toLocaleString("ru-RU")}</CardTitle></CardHeader></Card>
          <Card size="sm"><CardHeader><CardDescription>Ожидают передачи</CardDescription><CardTitle>{pendingCount.toLocaleString("ru-RU")}</CardTitle></CardHeader></Card>
        </section>

        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(22rem,1fr)]">
          <Card className="min-w-0">
            <CardHeader><CardTitle>Журнал</CardTitle><CardDescription>{visibleLeads.length.toLocaleString("ru-RU")} из {state.leads.length.toLocaleString("ru-RU")} заявок.</CardDescription></CardHeader>
            <CardContent className="flex min-w-0 flex-col gap-4">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_13rem]">
                <Field><FieldLabel htmlFor="lead-search" className="sr-only">Поиск заявки</FieldLabel><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input id="lead-search" className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Телефон, адрес, имя или ID" /></div></Field>
                <Field><FieldLabel htmlFor="lead-status-filter" className="sr-only">Фильтр по статусу</FieldLabel><select id="lead-status-filter" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "ALL" | LeadStatus)}><option value="ALL">Все статусы</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
              </div>
              {visibleLeads.length ? <Table><TableHeader><TableRow><TableHead>Создана</TableHead><TableHead>Контакт</TableHead><TableHead>Город и адрес</TableHead><TableHead>Статус</TableHead><TableHead><span className="sr-only">Действие</span></TableHead></TableRow></TableHeader><TableBody>{visibleLeads.map((lead) => <TableRow key={lead.id} data-state={selectedLeadId === lead.id ? "selected" : undefined}><TableCell className="whitespace-nowrap">{dateFormatter.format(new Date(lead.createdAt))}</TableCell><TableCell><div className="font-medium">{lead.phone}</div><div className="text-xs text-muted-foreground">{lead.name || lead.source || "Имя не указано"}</div></TableCell><TableCell><div className="font-medium">{lead.city.name}</div><div className="max-w-64 truncate text-xs text-muted-foreground">{lead.address || "Адрес не указан"}</div></TableCell><TableCell><Badge variant={statusVariant(lead.status)}>{statusLabels[lead.status]}</Badge></TableCell><TableCell><Button variant="ghost" size="sm" onClick={() => void loadDetail(lead.id)}>Открыть</Button></TableCell></TableRow>)}</TableBody></Table> : <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center"><Inbox className="text-muted-foreground" aria-hidden="true" /><p className="font-medium">Заявки не найдены</p><p className="text-sm text-muted-foreground">Измените поиск или фильтр либо дождитесь первого обращения.</p></div>}
            </CardContent>
          </Card>

          <LeadDetailCard detail={detail} nextStatus={nextStatus} setNextStatus={setNextStatus} comment={comment} setComment={setComment} busy={busy === "status"} onSave={updateStatus} />
        </div>
      </div>
    </AdminShell>
  )
}

function LeadDetailCard({ detail, nextStatus, setNextStatus, comment, setComment, busy, onSave }: {
  detail: DetailState
  nextStatus: LeadStatus
  setNextStatus: (status: LeadStatus) => void
  comment: string
  setComment: (comment: string) => void
  busy: boolean
  onSave: () => Promise<void>
}) {
  if (detail.status === "idle") return <Card><CardHeader><CardTitle>Карточка заявки</CardTitle><CardDescription>Выберите заявку в журнале.</CardDescription></CardHeader><CardContent className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">Детали появятся здесь.</CardContent></Card>
  if (detail.status === "loading") return <Card aria-busy="true"><CardHeader><Skeleton className="h-6 w-48" /><Skeleton className="h-4 w-36" /></CardHeader><CardContent className="flex flex-col gap-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-32 w-full" /></CardContent></Card>
  if (detail.status === "error") return <Card><CardHeader><CardTitle>Карточка не загружена</CardTitle></CardHeader><CardContent><Alert variant="destructive"><CircleAlert /><AlertTitle>Ошибка API</AlertTitle><AlertDescription>{detail.message}</AlertDescription></Alert></CardContent></Card>

  const lead = detail.lead
  return <Card>
    <CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>{lead.name || lead.phone}</CardTitle><CardDescription>{lead.phone} · {dateFormatter.format(new Date(lead.createdAt))}</CardDescription></div><Badge variant={statusVariant(lead.status)}>{statusLabels[lead.status]}</Badge></div></CardHeader>
    <CardContent className="flex flex-col gap-6">
      <section className="flex flex-col gap-2"><h2 className="font-heading text-sm font-medium">Контакт и контекст</h2><dl className="grid gap-2 text-sm"><DetailRow label="Email" value={lead.email} /><DetailRow label="Город" value={lead.city.name} /><DetailRow label="Адрес" value={lead.address} /><DetailRow label="Страница" value={lead.pageUrl || lead.page?.slug} /><DetailRow label="Тариф" value={lead.tariff?.name} /><DetailRow label="Источник" value={lead.source} /><DetailRow label="Форма" value={lead.formName} /></dl></section>
      <section className="flex flex-col gap-2"><h2 className="font-heading text-sm font-medium">Проверки и доставка</h2><dl className="grid gap-2 text-sm"><DetailRow label="Обработка" value={processingLabels[lead.processingStatus] || lead.processingStatus} /><DetailRow label="Проверка адреса" value={lead.addressCheck?.status || recordText(lead.apiResult, "status")} /><DetailRow label="Статус договора" value={recordText(lead.contractResult, "status")} /><DetailRow label="Внешняя заявка" value={recordText(lead.apiResult, "id")} /></dl>{lead.duplicateOf ? <Alert><CircleAlert /><AlertTitle>Дубликат заявки {lead.duplicateOf.id}</AlertTitle><AlertDescription>{lead.duplicateReason || "Причина не указана"}</AlertDescription></Alert> : null}</section>
      <FieldGroup>
        <Field><FieldLabel htmlFor="lead-next-status">Новый статус</FieldLabel><select id="lead-next-status" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" value={nextStatus} disabled={busy} onChange={(event) => setNextStatus(event.target.value as LeadStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        <Field><FieldLabel htmlFor="lead-status-comment">Комментарий к истории</FieldLabel><Input id="lead-status-comment" value={comment} maxLength={5000} disabled={busy} onChange={(event) => setComment(event.target.value)} placeholder="Необязательно" /><FieldDescription>Комментарий сохранится вместе с переходом статуса.</FieldDescription></Field>
        <Button disabled={busy || nextStatus === lead.status} onClick={() => void onSave()}><Save data-icon="inline-start" />{busy ? "Сохраняем…" : "Сохранить статус"}</Button>
      </FieldGroup>
      <Timeline title="История статусов" empty="Переходов статуса еще не было.">{lead.history.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt)).map((item) => <li className="rounded-md border p-3" key={item.id}><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium">{item.fromStatus ? `${statusLabels[item.fromStatus]} → ` : ""}{statusLabels[item.toStatus]}</span><time className="text-xs text-muted-foreground">{dateFormatter.format(new Date(item.createdAt))}</time></div>{item.comment ? <p className="mt-1 text-sm text-muted-foreground">{item.comment}</p> : null}</li>)}</Timeline>
      <Timeline title="Попытки передачи" empty="Попыток передачи еще не было.">{lead.deliveryAttempts.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt)).map((item) => <li className="rounded-md border p-3" key={item.id}><div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{item.channel} · попытка {item.attemptNumber}</span><Badge variant={statusVariant(item.status)}>{item.status}</Badge></div>{item.error ? <p className="mt-1 text-sm text-destructive">{item.error}</p> : null}</li>)}</Timeline>
      <Timeline title="Активность до формы" empty="События не передавались.">{lead.activityEvents.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12).map((item) => <li className="flex items-center justify-between gap-3 rounded-md border p-3" key={item.id}><span className="text-sm font-medium">{item.type}</span><time className="text-xs text-muted-foreground">{dateFormatter.format(new Date(item.createdAt))}</time></li>)}</Timeline>
    </CardContent>
  </Card>
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  return <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="min-w-0 break-words font-medium">{value || "—"}</dd></div>
}

function Timeline({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return <section className="flex flex-col gap-2"><h2 className="font-heading text-sm font-medium">{title}</h2>{children.length ? <ul className="flex flex-col gap-2">{children}</ul> : <p className="text-sm text-muted-foreground">{empty}</p>}</section>
}
