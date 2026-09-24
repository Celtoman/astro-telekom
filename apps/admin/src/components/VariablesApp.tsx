import { useCallback, useEffect, useState } from "react"
import { CircleAlert, Save } from "lucide-react"
import { AdminApiError, requestJson } from "../lib/admin-api.mjs"
import { filterVariableCatalogItems } from "../lib/variable-catalog.mjs"
import { AdminShell } from "./AdminShell"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Field, FieldDescription, FieldLabel } from "./ui/field"
import { Input } from "./ui/input"
import { Skeleton } from "./ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs"

interface Administrator { id: string; email: string }
interface SiteSummary { id: string; name: string; slug: string }
interface SiteValues {
  id: string
  name: string
  slug: string
  connectionPhone: string | null
  supportPhone: string | null
  connectionPhoneFormatted: string | null
  supportPhoneFormatted: string | null
  workingRevision: number
  publishedRevision: number
  readinessErrors: string[]
}

type ScreenState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; user: Administrator; site: SiteSummary; values: SiteValues }

interface VariableValue { status: string; value: string | null }
interface VariableUsage {
  code: string
  path: string
  template: string
  entityType: "PAGE" | "BLOCK" | "TARIFF" | "SEO_TEMPLATE"
  entityId: string
  pageType?: string
  blockType?: string
  lifecycleStatus?: string
  visible?: boolean
  editorHref: string | null
}
interface VariableItem {
  code: string
  name: string
  description: string
  type: string
  source: string
  scope: string
  status: "ACTIVE" | "DEPRECATING"
  example: string
  allowedContexts: string[]
  allowedFields: string[]
  working: VariableValue
  published: VariableValue
  changed: boolean | null
  workingUsages: VariableUsage[]
  publishedUsages: VariableUsage[] | null
}
interface VariableCatalog {
  siteId: string
  workingRevision: number
  publishedRevision: number
  cities: Array<{ id: string; name: string; slug: string }>
  tariffs: Array<{ id: string; name: string; slug: string }>
  publishedUsageAvailable: boolean
  publishedTemplateUsageAvailable: boolean
  items: VariableItem[]
}

const typeLabels: Record<string, string> = { text: "Текст", number: "Число", phone: "Телефон", date: "Дата" }
const sourceLabels: Record<string, string> = { Site: "Сайт", Provider: "Провайдер", City: "Город", Tariff: "Тариф", Catalog: "Вычисление" }
const pageLabels: Record<string, string> = { HOME: "Главная", INTERNET: "Интернет", INTERNET_TV: "Интернет и ТВ", TV: "Телевидение", TARIFF: "Тариф", ADDRESS_CHECK: "Проверка адреса", FAQ: "Вопросы и ответы", COVERAGE: "Карта покрытия", CITIES: "Города", PRIVACY: "Политика конфиденциальности", PERSONAL_DATA_CONSENT: "Согласие на обработку данных", COOKIE_POLICY: "Политика cookie" }
const blockLabels: Record<string, string> = { hero: "Первый экран", rich_text: "Текст", tariff_grid: "Тарифы", service_grid: "Услуги", feature_grid: "Преимущества", steps: "Шаги", faq: "Вопросы и ответы" }

function valueLabel(value: VariableValue): string {
  if (value.status === "VALUE") return value.value ?? ""
  if (value.status === "EMPTY") return "Пустое значение"
  if (value.status === "SELECT_CITY") return "Выберите город"
  if (value.status === "SELECT_TARIFF") return "Выберите тариф"
  if (value.status === "NOT_PUBLISHED") return "Нет в этом снимке"
  return "Данные недоступны"
}

function usageLabel(usage: VariableUsage): string {
  if (usage.entityType === "SEO_TEMPLATE") return `SEO-шаблон: ${pageLabels[usage.pageType ?? ""] ?? "тип не определён"}`
  if (usage.entityType === "TARIFF") return "Тариф"
  if (usage.entityType === "BLOCK") return `Блок: ${blockLabels[usage.blockType ?? ""] ?? "тип не определён"}`
  return `Страница: ${pageLabels[usage.pageType ?? ""] ?? "тип не определён"}`
}

function usageStatuses(usage: VariableUsage): string[] {
  const statuses: string[] = []
  if (usage.lifecycleStatus === "DRAFT") statuses.push("Черновик")
  if (usage.lifecycleStatus === "ARCHIVED") statuses.push("Архив")
  if (usage.visible === false) statuses.push("Скрыт")
  return statuses
}

function UsageList({ usages }: { usages: VariableUsage[] | null }) {
  if (usages === null) return <p className="text-sm text-muted-foreground">Места использования не сохранены в прежнем снимке. Они появятся после новой публикации.</p>
  if (usages.length === 0) return <p className="text-sm text-muted-foreground">Не используется.</p>
  return <ul className="space-y-3">{usages.map((usage, index) => <li key={`${usage.path}-${index}`} className="rounded-lg border p-3 text-sm">
    <div className="font-medium">{usageLabel(usage)} {usageStatuses(usage).map((status) => <Badge key={status} variant="outline" className="ml-1">{status}</Badge>)} · <span className="font-mono text-xs text-muted-foreground">{usage.path}</span></div>
    <p className="mt-1 break-words text-muted-foreground">Шаблон: <code>{usage.template}</code></p>
    {usage.editorHref ? <a className="mt-2 inline-block font-medium text-primary underline-offset-4 hover:underline" href={usage.editorHref}>Открыть редактор</a> : <p className="mt-2 text-xs text-muted-foreground">Редактор пока недоступен</p>}
  </li>)}</ul>
}

function VariableCatalogPanel({ apiUrl, siteId }: { apiUrl: string; siteId: string }) {
  const [cityId, setCityId] = useState("")
  const [tariffId, setTariffId] = useState("")
  const [catalog, setCatalog] = useState<VariableCatalog | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [q, setQ] = useState("")
  const [status, setStatus] = useState("")
  const [type, setType] = useState("")
  const [source, setSource] = useState("")
  const [selectedCode, setSelectedCode] = useState("")

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    if (cityId) params.set("cityId", cityId)
    if (tariffId) params.set("tariffId", tariffId)
    const path = `/admin/sites/${siteId}/variable-catalog${params.size ? `?${params}` : ""}`
    void requestJson<VariableCatalog>(apiUrl, path).then((result) => {
      if (active) setCatalog(result)
    }).catch((caught: unknown) => {
      if (!active) return
      if (caught instanceof AdminApiError && caught.status === 401) { window.location.replace("/login"); return }
      setError(caught instanceof Error ? caught.message : "Каталог недоступен")
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [apiUrl, siteId, cityId, tariffId, retry])

  const filters = { q, status, type, source }
  const filtered = filterVariableCatalogItems(catalog?.items ?? [], filters) as VariableItem[]
  const selected = catalog?.items.find((item) => item.code === selectedCode)
  const filtersActive = Boolean(q || status || type || source)
  const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"

  return <div className="space-y-5">
    <Card><CardHeader><CardTitle>Контекст значений</CardTitle><CardDescription>Городские коды показываются после выбора города; тарифные — после выбора тарифа в этом городе. Сравнение не изменяет контент.</CardDescription></CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Field><FieldLabel htmlFor="variable-city">Город</FieldLabel><select id="variable-city" className={selectClass} value={cityId} onChange={(event) => { setCityId(event.target.value); setTariffId("") }}><option value="">Выберите город</option>{catalog?.cities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}</select></Field>
        <Field><FieldLabel htmlFor="variable-tariff">Тариф</FieldLabel><select id="variable-tariff" className={selectClass} value={tariffId} disabled={!cityId} onChange={(event) => setTariffId(event.target.value)}><option value="">Выберите тариф</option>{catalog?.tariffs.map((tariff) => <option key={tariff.id} value={tariff.id}>{tariff.name}</option>)}</select></Field>
      </CardContent>
    </Card>
    {error ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Каталог недоступен</AlertTitle><AlertDescription>{error}</AlertDescription><Button variant="outline" size="sm" onClick={() => setRetry((value) => value + 1)}>Повторить</Button></Alert> : null}
    {loading ? <Card aria-busy="true"><CardContent className="space-y-3 py-6"><Skeleton className="h-9 w-full" /><Skeleton className="h-64 w-full" /></CardContent></Card> : null}
    {!loading && catalog && !error ? <>
      <Card><CardHeader><CardTitle>Каталог подстановок</CardTitle><CardDescription>Все реализованные коды показаны независимо от числа использований. Технический контракт доступен только для просмотра. Рабочая версия {catalog.workingRevision}, опубликована {catalog.publishedRevision}.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {!catalog.publishedUsageAvailable ? <Alert><CircleAlert /><AlertTitle>Исторический снимок</AlertTitle><AlertDescription>Места использования старой публикации не сохранены; нулевое число не предполагается. Новая публикация зафиксирует их отдельно.</AlertDescription></Alert> : null}
          {catalog.publishedUsageAvailable && !catalog.publishedTemplateUsageAvailable ? <Alert><CircleAlert /><AlertTitle>Неполный исторический снимок</AlertTitle><AlertDescription>Опубликованные использования SEO-шаблонов в этом снимке не сохранялись. Показаны только известные места использования; нулевое число не означает, что код не применён в SEO. Новая публикация зафиксирует полный индекс.</AlertDescription></Alert> : null}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field className="lg:col-span-2"><FieldLabel htmlFor="variable-search">Поиск по коду, названию или источнику</FieldLabel><Input id="variable-search" value={q} onChange={(event) => { setQ(event.target.value); setSelectedCode("") }} placeholder="Например, цена" /></Field>
            <Field><FieldLabel htmlFor="variable-status">Статус</FieldLabel><select id="variable-status" className={selectClass} value={status} onChange={(event) => { setStatus(event.target.value); setSelectedCode("") }}><option value="">Все</option><option value="ACTIVE">Активна</option><option value="DEPRECATING">Устаревает</option></select></Field>
            <Field><FieldLabel htmlFor="variable-type">Тип</FieldLabel><select id="variable-type" className={selectClass} value={type} onChange={(event) => { setType(event.target.value); setSelectedCode("") }}><option value="">Все</option>{Object.entries(typeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
            <Field><FieldLabel htmlFor="variable-source">Источник</FieldLabel><select id="variable-source" className={selectClass} value={source} onChange={(event) => { setSource(event.target.value); setSelectedCode("") }}><option value="">Все</option>{Object.entries(sourceLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
          </div>
          <Button variant="outline" size="sm" disabled={!filtersActive} onClick={() => { setQ(""); setStatus(""); setType(""); setSource(""); setSelectedCode("") }}>Сбросить фильтры</Button>
          <p className="text-sm text-muted-foreground" aria-live="polite">Показано {filtered.length} из {catalog.items.length} кодов</p>
          <Table><TableHeader><TableRow><TableHead>Код и назначение</TableHead><TableHead>Статус · тип · источник</TableHead><TableHead>Рабочее значение</TableHead><TableHead>Опубликованное значение</TableHead><TableHead>Использования</TableHead><TableHead><span className="sr-only">Подробнее</span></TableHead></TableRow></TableHeader>
            <TableBody>{filtered.map((item) => <TableRow key={item.code}>
              <TableCell className="min-w-52 whitespace-normal"><code className="font-semibold">{`{${item.code}}`}</code><div className="mt-1 text-muted-foreground">{item.name}</div></TableCell>
              <TableCell className="min-w-40 whitespace-normal"><Badge variant={item.status === "ACTIVE" ? "success" : "warning"}>{item.status === "ACTIVE" ? "Активна" : "Устаревает"}</Badge><div className="mt-2">{typeLabels[item.type] ?? "Неизвестный тип"} · {sourceLabels[item.source.split(".")[0]] ?? "Неизвестный источник"}</div></TableCell>
              <TableCell className="min-w-40 whitespace-normal">{valueLabel(item.working)}</TableCell>
              <TableCell className="min-w-40 whitespace-normal">{valueLabel(item.published)}{item.changed === true ? <Badge variant="warning" className="ml-2">Отличается</Badge> : null}</TableCell>
              <TableCell>{item.workingUsages.length} / {item.publishedUsages?.length ?? "—"}{catalog.publishedUsageAvailable && !catalog.publishedTemplateUsageAvailable ? <span title="Опубликованный индекс не включает SEO-шаблоны">*</span> : null}<span className="sr-only"> рабочих / опубликованных{catalog.publishedUsageAvailable && !catalog.publishedTemplateUsageAvailable ? ", опубликованный индекс неполный" : ""}</span></TableCell>
              <TableCell><Button variant="outline" size="sm" aria-label={`Подробнее о ${item.name}`} onClick={() => setSelectedCode(item.code)}>Подробнее</Button></TableCell>
            </TableRow>)}</TableBody>
          </Table>
          {filtered.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">По выбранным фильтрам ничего не найдено.</p> : null}
        </CardContent>
      </Card>
      {selected ? <Card><CardHeader><CardTitle>{selected.name} <code className="ml-2 text-sm font-normal text-muted-foreground">{`{${selected.code}}`}</code></CardTitle><CardDescription>{selected.description}</CardDescription></CardHeader><CardContent className="space-y-5 text-sm">
        <div className="grid gap-3 sm:grid-cols-2"><div><span className="text-muted-foreground">Авторитетный источник</span><p className="font-mono">{selected.source}</p></div><div><span className="text-muted-foreground">Пример результата</span><p>{selected.example}</p></div></div>
        <div><span className="text-muted-foreground">Допустимые страницы</span><p>{selected.allowedContexts.join(", ")}</p></div>
        <div><span className="text-muted-foreground">Допустимые поля</span><p className="break-words font-mono text-xs">{selected.allowedFields.join(", ")}</p></div>
        <div className="grid gap-5 lg:grid-cols-2"><section><h3 className="mb-2 font-semibold">Места использования · рабочие ({selected.workingUsages.length})</h3><UsageList usages={selected.workingUsages} /></section><section><h3 className="mb-2 font-semibold">Места использования · опубликованные ({selected.publishedUsages?.length ?? "—"})</h3><UsageList usages={selected.publishedUsages} /></section></div>
      </CardContent></Card> : null}
    </> : null}
  </div>
}

export function VariablesApp({ apiUrl }: { apiUrl: string }) {
  const [state, setState] = useState<ScreenState>({ status: "loading" })
  const [connectionPhone, setConnectionPhone] = useState("")
  const [supportPhone, setSupportPhone] = useState("")
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null)

  const load = useCallback(async () => {
    setState({ status: "loading" })
    try {
      const [session, sites] = await Promise.all([
        requestJson<{ user: Administrator }>(apiUrl, "/auth/me"),
        requestJson<SiteSummary[]>(apiUrl, "/admin/sites"),
      ])
      if (sites.length !== 1) throw new Error("Раздел значений сайта ожидает единственный сайт Дом.ру")
      const values = await requestJson<SiteValues>(apiUrl, `/admin/sites/${sites[0].id}/values`)
      setConnectionPhone(values.connectionPhoneFormatted || values.connectionPhone || "")
      setSupportPhone(values.supportPhoneFormatted || values.supportPhone || "")
      setState({ status: "ready", user: session.user, site: sites[0], values })
    } catch (caught: unknown) {
      if (caught instanceof AdminApiError && caught.status === 401) {
        window.location.replace("/login")
        return
      }
      setState({ status: "error", message: caught instanceof Error ? caught.message : "API недоступен" })
    }
  }, [apiUrl])

  useEffect(() => { void load() }, [load])

  async function save() {
    if (state.status !== "ready") return
    setSaving(true)
    setMessage(null)
    try {
      const values = await requestJson<SiteValues>(apiUrl, `/admin/sites/${state.site.id}/values`, {
        method: "PATCH",
        body: {
          expectedWorkingRevision: state.values.workingRevision,
          connectionPhone,
          supportPhone,
        },
      })
      setConnectionPhone(values.connectionPhoneFormatted || "")
      setSupportPhone(values.supportPhoneFormatted || "")
      setState({ ...state, values })
      setMessage({ kind: "success", text: `Рабочая версия ${values.workingRevision} сохранена. Публичный сайт изменится после общей публикации.` })
    } catch (caught: unknown) {
      setMessage({ kind: "error", text: caught instanceof Error ? caught.message : "Значения не сохранены" })
    } finally {
      setSaving(false)
    }
  }

  if (state.status === "loading") return <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-8" aria-busy="true"><Skeleton className="h-10 w-72" /><Skeleton className="h-80 w-full" /></main>
  if (state.status === "error") return <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6"><Card className="w-full max-w-lg"><CardHeader><CardTitle>Переменные недоступны</CardTitle><CardDescription>Не удалось загрузить значения сайта.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><Alert variant="destructive"><CircleAlert /><AlertTitle>Ошибка API</AlertTitle><AlertDescription>{state.message}</AlertDescription></Alert><Button onClick={() => void load()}>Повторить</Button></CardContent></Card></main>

  return <AdminShell apiUrl={apiUrl} user={state.user} active="variables">
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6 lg:p-8">
      <div><h1 className="font-heading text-2xl font-semibold">Переменные</h1><p className="mt-1 text-sm text-muted-foreground">Глобальные значения сайта {state.site.name} и доступный только для просмотра каталог системных подстановок.</p></div>
      <Tabs defaultValue="values" className="w-full">
        <TabsList aria-label="Разделы переменных"><TabsTrigger value="values">Значения сайта</TabsTrigger><TabsTrigger value="catalog">Каталог подстановок</TabsTrigger></TabsList>
        <TabsContent value="values" className="space-y-5">
          {message ? <Alert variant={message.kind === "error" ? "destructive" : "default"}>{message.kind === "error" ? <CircleAlert /> : <Save />}<AlertTitle>{message.kind === "error" ? "Не удалось сохранить" : "Изменения приняты"}</AlertTitle><AlertDescription>{message.text}</AlertDescription></Alert> : null}
          {state.values.readinessErrors.length > 0 ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Публикация заблокирована</AlertTitle><AlertDescription>Заполните: {state.values.readinessErrors.join(", ")}.</AlertDescription></Alert> : null}
          <Card>
            <CardHeader><CardTitle>Значения сайта</CardTitle><CardDescription>Телефоны хранятся в формате 7XXXXXXXXXX, а отображение и ссылка tel: формируются автоматически.</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-5">
              <Field><FieldLabel htmlFor="connection-phone">Телефон подключения</FieldLabel><Input id="connection-phone" inputMode="tel" value={connectionPhone} onChange={(event) => setConnectionPhone(event.target.value)} placeholder="+7 (800) 555-72-44" /><FieldDescription>{state.values.connectionPhoneFormatted ? <a className="underline" href={`tel:+${state.values.connectionPhone}`}>{state.values.connectionPhoneFormatted}</a> : "Не задан"}</FieldDescription></Field>
              <Field><FieldLabel htmlFor="support-phone">Телефон техподдержки</FieldLabel><Input id="support-phone" inputMode="tel" value={supportPhone} onChange={(event) => setSupportPhone(event.target.value)} placeholder="+7 (800) 250-77-77" /><FieldDescription>{state.values.supportPhoneFormatted ? <a className="underline" href={`tel:+${state.values.supportPhone}`}>{state.values.supportPhoneFormatted}</a> : "Не задан"}</FieldDescription></Field>
              <div className="flex items-center justify-between gap-4 border-t pt-4 text-sm text-muted-foreground"><span>Рабочая версия: {state.values.workingRevision}; опубликована: {state.values.publishedRevision}</span><Button disabled={saving || !connectionPhone.trim() || !supportPhone.trim()} onClick={() => void save()}><Save data-icon="inline-start" />{saving ? "Сохраняем…" : "Сохранить"}</Button></div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="catalog"><VariableCatalogPanel apiUrl={apiUrl} siteId={state.site.id} /></TabsContent>
      </Tabs>
    </div>
  </AdminShell>
}
