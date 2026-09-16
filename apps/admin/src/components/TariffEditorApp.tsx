import { type SyntheticEvent, useEffect, useMemo, useState } from "react"
import { ArrowLeft, CircleAlert, LoaderCircle, Save } from "lucide-react"
import { AdminApiError, requestJson } from "../lib/admin-api.mjs"
import { statusOptions } from "../lib/status-presentation.mjs"
import { AdminShell } from "./AdminShell"
import { PublicationStatusCard } from "./PublicationStatusCard"
import { SourceLabel } from "./SourceLabel"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Checkbox } from "./ui/checkbox"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "./ui/field"
import { Input } from "./ui/input"
import { Skeleton } from "./ui/skeleton"

interface Administrator { id: string; email: string }
interface City { id: string; name: string; slug: string; siteId: string }
interface AttributeField { key: string; label: string; group: string; kind: "text" | "number" | "integer" | "boolean" | "service-status"; maxLength?: number; multiline?: boolean }
interface TariffDetail {
  id: string
  providerId: string
  cityId: string
  name: string
  slug: string
  serviceType: "INTERNET" | "INTERNET_TV" | "TV" | "OTHER"
  standardPrice: string | number | null
  promoPrice: string | number | null
  speed: number | null
  promoText: string | null
  connectionFee: string | number | null
  availability: boolean
  externalId: string | null
  identityKey: string | null
  dataSource: string | null
  attributes: Record<string, unknown> | null
  seo: Record<string, unknown> | null
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED"
  publicPath?: string
  provider: { id: string; name: string }
  city: City
  createdAt: string
  updatedAt: string
  attributeSchema: AttributeField[]
}
interface UpdateResult { tariff: TariffDetail; workingRevision: number; redirectOutcome: string }
interface FormState {
  cityId: string
  name: string
  slug: string
  serviceType: TariffDetail["serviceType"]
  standardPrice: string
  promoPrice: string
  speed: string
  promoText: string
  connectionFee: string
  availability: boolean
  status: TariffDetail["status"]
  attributes: Record<string, string>
  seo: string
}

const inputClass = "flex min-h-24 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
const selectClass = "h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
const serviceTypeOptions = statusOptions("serviceType", ["INTERNET", "INTERNET_TV", "TV", "OTHER"])
const publishStatusOptions = statusOptions("publishStatus", ["DRAFT", "PUBLISHED", "ARCHIVED"])
const jsonText = (value: Record<string, unknown> | null) => value ? JSON.stringify(value, null, 2) : ""
const formFromTariff = (tariff: TariffDetail): FormState => ({
  cityId: tariff.cityId,
  name: tariff.name,
  slug: tariff.slug,
  serviceType: tariff.serviceType,
  standardPrice: tariff.standardPrice === null ? "" : String(tariff.standardPrice),
  promoPrice: tariff.promoPrice === null ? "" : String(tariff.promoPrice),
  speed: tariff.speed === null ? "" : String(tariff.speed),
  promoText: tariff.promoText || "",
  connectionFee: tariff.connectionFee === null ? "" : String(tariff.connectionFee),
  availability: tariff.availability,
  status: tariff.status,
  attributes: Object.fromEntries(tariff.attributeSchema.map((field) => {
    const value = tariff.attributes?.[field.key]
    return [field.key, value === null || value === undefined ? "" : String(value)]
  })),
  seo: jsonText(tariff.seo),
})

function parseObject(value: string, label: string) {
  if (!value.trim()) return null
  const parsed: unknown = JSON.parse(value)
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error(`${label}: требуется JSON-объект`)
  return parsed as Record<string, unknown>
}

function attributesPayload(form: FormState, schema: AttributeField[]) {
  const result: Record<string, string | number | boolean> = {}
  for (const field of schema) {
    const value = form.attributes[field.key]
    if (value === "" || value === undefined) continue
    result[field.key] = field.kind === "boolean"
      ? value === "true"
      : field.kind === "number" || field.kind === "integer" || field.kind === "service-status"
        ? Number(value)
        : value
  }
  return result
}

export function TariffEditorApp({ apiUrl }: { apiUrl: string }) {
  const [user, setUser] = useState<Administrator | null>(null)
  const [tariff, setTariff] = useState<TariffDetail | null>(null)
  const [cities, setCities] = useState<City[]>([])
  const [form, setForm] = useState<FormState | null>(null)
  const [initialForm, setInitialForm] = useState<FormState | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [confirmed, setConfirmed] = useState(false)
  const [savedWorkingRevision, setSavedWorkingRevision] = useState<number | null>(null)
  const [publicationRefreshKey, setPublicationRefreshKey] = useState(0)

  const hasUnsavedChanges = useMemo(() => Boolean(form && initialForm && JSON.stringify(form) !== JSON.stringify(initialForm)), [form, initialForm])
  const needsConfirmation = useMemo(() => Boolean(form && initialForm && (
    form.cityId !== initialForm.cityId || form.slug !== initialForm.slug || form.status !== initialForm.status ||
    form.standardPrice !== initialForm.standardPrice || form.promoPrice !== initialForm.promoPrice ||
    form.connectionFee !== initialForm.connectionFee || form.seo !== initialForm.seo ||
    tariff?.attributeSchema.some((field) => field.kind === "number" && field.key.includes("price") && form.attributes[field.key] !== initialForm.attributes[field.key])
  )), [form, initialForm, tariff])

  useEffect(() => {
    let active = true
    async function load() {
      const tariffId = new URLSearchParams(window.location.search).get("id") || ""
      if (!tariffId) { setError("В адресе не указан тариф"); setLoading(false); return }
      try {
        const session = await requestJson<{ user: Administrator }>(apiUrl, "/auth/me")
        const [detail, cityRows] = await Promise.all([
          requestJson<TariffDetail>(apiUrl, `/admin/tariffs/${tariffId}`),
          requestJson<City[]>(apiUrl, "/admin/cities"),
        ])
        if (!active) return
        const nextForm = formFromTariff(detail)
        setUser(session.user)
        setTariff(detail)
        setCities(cityRows.filter((city) => city.siteId === detail.city.siteId))
        setForm(nextForm)
        setInitialForm(nextForm)
      } catch (caught: unknown) {
        if (!active) return
        if (caught instanceof AdminApiError && caught.status === 401) { window.location.replace("/login"); return }
        setError(caught instanceof Error ? caught.message : "Тариф не загружен")
      } finally { if (active) setLoading(false) }
    }
    void load()
    return () => { active = false }
  }, [apiUrl])

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return
      event.preventDefault()
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [hasUnsavedChanges])

  function update<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => current ? { ...current, [field]: value } : current)
    setFieldErrors((current) => { const next = { ...current }; delete next[field]; return next })
    setConfirmed(false)
  }

  function updateAttribute(key: string, value: string) {
    setForm((current) => current ? { ...current, attributes: { ...current.attributes, [key]: value } } : current)
    setFieldErrors((current) => { const next = { ...current }; delete next[`attribute-${key}`]; return next })
    setConfirmed(false)
  }

  function validate(current: FormState) {
    const errors: Record<string, string> = {}
    if (!current.name.trim()) errors.name = "Укажите название"
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(current.slug)) errors.slug = "Только строчные латинские буквы, цифры и дефисы"
    for (const [field, min] of [["standardPrice", 0.01], ["promoPrice", 0], ["connectionFee", 0]] as const) {
      const value = current[field]
      if (value && (!Number.isFinite(Number(value)) || Number(value) < min)) errors[field] = `Число не меньше ${min}`
    }
    if (current.speed && (!Number.isInteger(Number(current.speed)) || Number(current.speed) < 1)) errors.speed = "Целое число не меньше 1"
    try { parseObject(current.seo, "SEO") } catch (caught) { errors.seo = caught instanceof Error ? caught.message : "Некорректный JSON" }
    for (const field of tariff?.attributeSchema || []) {
      const value = current.attributes[field.key]
      if (!value) continue
      const errorKey = `attribute-${field.key}`
      if (field.kind === "text" && field.maxLength && value.length > field.maxLength) errors[errorKey] = `Не больше ${field.maxLength} символов`
      if ((field.kind === "number" || field.kind === "integer") && (!Number.isFinite(Number(value)) || Number(value) < 0)) errors[errorKey] = "Число не меньше 0"
      if (field.kind === "integer" && !Number.isInteger(Number(value))) errors[errorKey] = "Требуется целое число"
      if (field.kind === "service-status" && ![-1, 0, 1].includes(Number(value))) errors[errorKey] = "Выберите состояние из списка"
    }
    setFieldErrors(errors)
    const first = Object.keys(errors)[0]
    if (first) document.querySelector<HTMLElement>(`[name="${first}"]`)?.focus()
    return Object.keys(errors).length === 0
  }

  async function save(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form || !tariff || !hasUnsavedChanges || !validate(form)) return
    if (needsConfirmation && !confirmed) { setError("Подтвердите изменения цены, URL, статуса публикации или SEO"); return }
    setSaving(true)
    setError(null)
    try {
      const result = await requestJson<UpdateResult>(apiUrl, `/admin/tariffs/${tariff.id}`, {
        method: "PATCH",
        body: {
          expectedUpdatedAt: tariff.updatedAt,
          cityId: form.cityId,
          name: form.name.trim(),
          slug: form.slug,
          serviceType: form.serviceType,
          standardPrice: form.standardPrice ? Number(form.standardPrice) : null,
          promoPrice: form.promoPrice ? Number(form.promoPrice) : null,
          speed: form.speed ? Number(form.speed) : null,
          promoText: form.promoText.trim() || null,
          connectionFee: form.connectionFee ? Number(form.connectionFee) : null,
          availability: form.availability,
          attributes: attributesPayload(form, tariff.attributeSchema),
          seo: parseObject(form.seo, "SEO"),
          status: form.status,
          confirmSensitiveChanges: needsConfirmation && confirmed,
        },
      })
      const savedForm = formFromTariff(result.tariff)
      setTariff(result.tariff)
      setForm(savedForm)
      setInitialForm(savedForm)
      setConfirmed(false)
      setSavedWorkingRevision(result.workingRevision)
      setPublicationRefreshKey((current) => current + 1)
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Тариф не сохранен")
    } finally { setSaving(false) }
  }

  function leaveEditor() {
    if (!hasUnsavedChanges || window.confirm("Отменить несохраненные изменения?")) window.location.assign("/tariffs")
  }

  if (loading) return <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-8" aria-busy="true"><Skeleton className="h-10 w-72" /><Skeleton className="h-96 w-full" /></main>
  if (error && (!user || !tariff || !form)) return <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6"><Card className="w-full max-w-lg"><CardHeader><CardTitle>Редактор недоступен</CardTitle></CardHeader><CardContent className="flex flex-col gap-4"><Alert variant="destructive"><CircleAlert /><AlertTitle>Ошибка</AlertTitle><AlertDescription>{error}</AlertDescription></Alert><Button asChild><a href="/tariffs">Вернуться к тарифам</a></Button></CardContent></Card></main>
  if (!user || !tariff || !form) return null

  const renderSaveButton = () => <Button type="submit" disabled={!hasUnsavedChanges || saving}>{saving ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />}{saving ? "Сохраняем…" : "Сохранить"}</Button>
  const attributeGroups = Object.entries(tariff.attributeSchema.reduce<Record<string, AttributeField[]>>((groups, field) => {
    ;(groups[field.group] ||= []).push(field)
    return groups
  }, {}))

  return <AdminShell apiUrl={apiUrl} user={user} active="tariffs">
    <form onSubmit={(event) => void save(event)} className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><Button type="button" variant="ghost" className="-ml-2 mb-2" onClick={leaveEditor}><ArrowLeft data-icon="inline-start" />К тарифам</Button><h1 className="font-heading text-2xl font-semibold">Редактирование тарифа</h1><p className="mt-1 text-sm text-muted-foreground">{tariff.provider.name} · {tariff.city.name} · {tariff.publicPath}</p></div><div className="flex gap-2"><Button type="button" variant="outline" onClick={leaveEditor}>Отмена</Button>{renderSaveButton()}</div></div>
      {error ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Не удалось сохранить</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {savedWorkingRevision ? <Alert><Save /><AlertTitle>Рабочая версия {savedWorkingRevision} сохранена</AlertTitle><AlertDescription>Изменения еще не опубликованы. Проверьте состояние ниже и запустите публикацию отдельно.</AlertDescription></Alert> : null}
      <PublicationStatusCard apiUrl={apiUrl} siteId={tariff.city.siteId} publicationRefreshKey={publicationRefreshKey} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card id="main"><CardHeader><CardTitle>Основные данные</CardTitle><CardDescription>Поля карточки тарифа и публичного URL.</CardDescription></CardHeader><CardContent><FieldGroup><div className="grid gap-4 md:grid-cols-2"><Field data-invalid={Boolean(fieldErrors.name)}><FieldLabel htmlFor="name">Название</FieldLabel><Input id="name" name="name" value={form.name} onChange={(event) => update("name", event.target.value)} aria-invalid={Boolean(fieldErrors.name)} /><FieldError>{fieldErrors.name}</FieldError></Field><Field data-invalid={Boolean(fieldErrors.slug)}><FieldLabel htmlFor="slug">Slug</FieldLabel><Input id="slug" name="slug" value={form.slug} onChange={(event) => update("slug", event.target.value)} aria-invalid={Boolean(fieldErrors.slug)} /><FieldDescription>Публичный URL без завершающего слэша.</FieldDescription><FieldError>{fieldErrors.slug}</FieldError></Field><Field><FieldLabel htmlFor="cityId">Город</FieldLabel><select id="cityId" name="cityId" className={selectClass} value={form.cityId} onChange={(event) => update("cityId", event.target.value)}>{cities.map((city) => <option value={city.id} key={city.id}>{city.name}</option>)}</select></Field><Field><FieldLabel htmlFor="serviceType">Тип услуги</FieldLabel><select id="serviceType" name="serviceType" className={selectClass} value={form.serviceType} onChange={(event) => update("serviceType", event.target.value as FormState["serviceType"])}>{serviceTypeOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></Field><Field><FieldLabel htmlFor="status">Статус публикации</FieldLabel><select id="status" name="status" className={selectClass} value={form.status} onChange={(event) => update("status", event.target.value as FormState["status"])}>{publishStatusOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></Field><Field orientation="horizontal"><Checkbox id="availability" name="availability" checked={form.availability} onCheckedChange={(checked) => update("availability", checked === true)} /><FieldLabel htmlFor="availability">Доступен для подключения</FieldLabel></Field></div></FieldGroup></CardContent></Card>

          <Card id="conditions"><CardHeader><CardTitle>Условия тарифа</CardTitle><CardDescription>Цена, скорость и текст предложения.</CardDescription></CardHeader><CardContent><FieldGroup><div className="grid gap-4 md:grid-cols-3">{([["standardPrice", "Базовая цена"], ["promoPrice", "Промо-цена"], ["connectionFee", "Подключение"]] as const).map(([field, label]) => <Field key={field} data-invalid={Boolean(fieldErrors[field])}><FieldLabel htmlFor={field}>{label}, ₽</FieldLabel><Input id={field} name={field} type="number" min={field === "standardPrice" ? "0.01" : "0"} step="0.01" value={form[field]} onChange={(event) => update(field, event.target.value)} aria-invalid={Boolean(fieldErrors[field])} /><FieldError>{fieldErrors[field]}</FieldError></Field>)}<Field data-invalid={Boolean(fieldErrors.speed)}><FieldLabel htmlFor="speed">Скорость, Мбит/с</FieldLabel><Input id="speed" name="speed" type="number" min="1" step="1" value={form.speed} onChange={(event) => update("speed", event.target.value)} aria-invalid={Boolean(fieldErrors.speed)} /><FieldError>{fieldErrors.speed}</FieldError></Field></div><Field><FieldLabel htmlFor="promoText">Промо-текст</FieldLabel><textarea id="promoText" name="promoText" className={inputClass} value={form.promoText} onChange={(event) => update("promoText", event.target.value)} /></Field></FieldGroup></CardContent></Card>

          {attributeGroups.map(([group, fields], groupIndex) => <details id={`attributes-${groupIndex}`} open className="rounded-xl border bg-card" key={group}><summary className="cursor-pointer px-6 py-5 font-heading font-semibold">{group}</summary><div className="border-t px-6 py-5"><FieldGroup><div className="grid gap-4 md:grid-cols-2">{fields.map((field) => { const errorKey = `attribute-${field.key}`; const value = form.attributes[field.key] ?? ""; const isPublicationRecommendation = field.key === "show_on_site"; return <Field key={field.key} data-invalid={Boolean(fieldErrors[errorKey])}><FieldLabel htmlFor={errorKey}>{field.label}</FieldLabel>{field.kind === "boolean" ? <select id={errorKey} name={errorKey} className={selectClass} value={value} onChange={(event) => updateAttribute(field.key, event.target.value)}><option value="">Не задано</option><option value="true">{isPublicationRecommendation ? "Рекомендуется показывать" : "Да"}</option><option value="false">{isPublicationRecommendation ? "Рекомендуется не показывать" : "Нет"}</option></select> : field.kind === "service-status" ? <select id={errorKey} name={errorKey} className={selectClass} value={value} onChange={(event) => updateAttribute(field.key, event.target.value)}><option value="">Не задано</option><option value="-1">Недоступен</option><option value="0">Не включен</option><option value="1">Включен</option></select> : field.multiline ? <textarea id={errorKey} name={errorKey} className={inputClass} maxLength={field.maxLength} value={value} onChange={(event) => updateAttribute(field.key, event.target.value)} /> : <Input id={errorKey} name={errorKey} type={field.kind === "number" || field.kind === "integer" ? "number" : "text"} min={field.kind === "number" || field.kind === "integer" ? "0" : undefined} step={field.kind === "integer" ? "1" : field.kind === "number" ? "0.01" : undefined} maxLength={field.maxLength} value={value} onChange={(event) => updateAttribute(field.key, event.target.value)} />}{isPublicationRecommendation ? <FieldDescription>Рекомендация из файла не изменяет статус публикации: им управляет поле «Статус публикации» выше.</FieldDescription> : null}<FieldError>{fieldErrors[errorKey]}</FieldError></Field>})}</div></FieldGroup></div></details>)}
          <Card id="seo"><CardHeader><CardTitle>SEO</CardTitle><CardDescription>Структурированные SEO-переопределения тарифа.</CardDescription></CardHeader><CardContent><Field data-invalid={Boolean(fieldErrors.seo)}><FieldLabel htmlFor="seo-json">SEO JSON</FieldLabel><textarea id="seo-json" name="seo" spellCheck={false} className={`${inputClass} min-h-40 font-mono`} value={form.seo} onChange={(event) => update("seo", event.target.value)} aria-invalid={Boolean(fieldErrors.seo)} /><FieldError>{fieldErrors.seo}</FieldError></Field></CardContent></Card>
        </div>

        <aside className="flex flex-col gap-6 xl:sticky xl:top-6 xl:self-start"><Card><CardHeader><CardTitle>Разделы формы</CardTitle></CardHeader><CardContent><nav className="flex flex-col gap-1 text-sm" aria-label="Разделы редактора"><a className="rounded-md px-2 py-1 hover:bg-muted" href="#main">Основные данные</a><a className="rounded-md px-2 py-1 hover:bg-muted" href="#conditions">Условия</a>{attributeGroups.map(([group], index) => <a className="rounded-md px-2 py-1 hover:bg-muted" href={`#attributes-${index}`} key={group}>{group}</a>)}<a className="rounded-md px-2 py-1 hover:bg-muted" href="#seo">SEO</a></nav></CardContent></Card><Card><CardHeader><CardTitle>Системные данные</CardTitle><CardDescription>Только для чтения.</CardDescription></CardHeader><CardContent><dl className="flex flex-col gap-3 text-sm"><div><dt className="text-muted-foreground">Источник</dt><dd className="break-all"><SourceLabel value={tariff.dataSource} /></dd></div><div><dt className="text-muted-foreground">Внешний ID</dt><dd className="break-all">{tariff.externalId || "—"}</dd></div><div><dt className="text-muted-foreground">Identity key</dt><dd className="break-all font-mono text-xs">{tariff.identityKey || "—"}</dd></div><div><dt className="text-muted-foreground">Обновлен</dt><dd>{new Date(tariff.updatedAt).toLocaleString("ru-RU")}</dd></div></dl></CardContent></Card>{needsConfirmation ? <Card><CardHeader><CardTitle>Подтверждение</CardTitle><CardDescription>Изменены цена, URL, статус публикации или SEO.</CardDescription></CardHeader><CardContent><label className="flex items-start gap-2 text-sm"><Checkbox checked={confirmed} onCheckedChange={(checked) => setConfirmed(checked === true)} /><span>Проверил изменения и подтверждаю сохранение</span></label></CardContent></Card> : null}</aside>
      </div>
      <div className="flex justify-end gap-2 border-t pt-6"><Button type="button" variant="outline" onClick={leaveEditor}>Отмена</Button>{renderSaveButton()}</div>
    </form>
  </AdminShell>
}
