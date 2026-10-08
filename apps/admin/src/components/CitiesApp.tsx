import { useUnsavedChanges } from "./useUnsavedChanges"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Dialog, Heading, Modal, ModalOverlay, Text } from "react-aria-components"
import { CircleAlert, FileUp, Pencil, Plus, RefreshCw, Save, X } from "lucide-react"
import { AdminApiError, requestJson, requestSession, readNavigationJson, peekNavigationJson } from "../lib/admin-api.mjs"
import { useNavigationRefresh } from "./useNavigationRefresh"
import { statusOptions } from "../lib/status-presentation.mjs"
import { AdminShell } from "./AdminShell"
import { FilterResetButton } from "./FilterResetButton"
import { PublicationStatusCard } from "./PublicationStatusCard"
import { ServerPagination } from "./ServerPagination"
import { StatusBadge } from "./StatusBadge"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Field, FieldLabel } from "./ui/field"
import { Input } from "./ui/input"
import { Skeleton } from "./ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table"

interface Administrator { id: string; email: string }
interface SiteSummary { id: string; name: string; slug: string; workingRevision: number; publishedRevision: number }
interface Region { id: string; name: string; slug: string; siteId: string }
interface Profile { key: string; city: string; region: string }
interface CityReadiness { ready: boolean; blockers: string[]; warnings: string[] }
interface City {
  workingRevision: number;
  id: string; siteId: string; regionId: string; name: string; slug: string; namePrepositional: string | null; nameGenitive: string | null;
  legacyUrl: string | null; officeState: "HAS_OFFICE" | "NO_OFFICE"; officeAddress: string | null; officeHours: string | null;
  subscriberProfileKey: string | null; status: string; publicUrl: string; readiness: CityReadiness; publishedTariffCount: number;
  subscriberProfileReady: boolean; hasUnpublishedChanges: boolean; lastSuccessfulPublicationAt: string | null;
  region: { id: string; name: string; slug: string }; site: { id: string; name: string; slug: string };
}
interface CityPage { items: City[]; pageInfo: { limit: number; total: number; hasNextPage: boolean; nextCursor: string | null } }
interface CityForm {
  id: string | null; regionId: string; name: string; slug: string; namePrepositional: string; nameGenitive: string; legacyUrl: string;
  officeState: "HAS_OFFICE" | "NO_OFFICE"; officeAddress: string; officeHours: string; subscriberProfileKey: string; status: string;
}

type ScreenState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; user: Administrator; site: SiteSummary; regions: Region[]; profiles: Profile[] }
const emptyForm = (): CityForm => ({ id: null, regionId: "", name: "", slug: "", namePrepositional: "", nameGenitive: "", legacyUrl: "", officeState: "NO_OFFICE", officeAddress: "", officeHours: "", subscriberProfileKey: "", status: "DRAFT" })
const publishStatusOptions = statusOptions("publishStatus", ["DRAFT", "PUBLISHED", "ARCHIVED"])
const selectClass = "h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
const initialFilters = { regionId: "", status: "", readiness: "", profile: "", tariffs: "", unpublished: "", sort: "city", direction: "asc" }
const initialListRoute = "/admin/cities?limit=25&sort=city&direction=asc"

function cachedWorkspace(apiUrl: string): ScreenState {
  const session = peekNavigationJson<{ user: Administrator }>(apiUrl, "/auth/me")
  const sites = peekNavigationJson<SiteSummary[]>(apiUrl, "/admin/sites?summary=true")
  const regions = peekNavigationJson<Region[]>(apiUrl, "/admin/regions")
  const profiles = peekNavigationJson<Profile[]>(apiUrl, "/admin/cities/profiles")
  return session && sites?.length === 1 && regions && profiles
    ? { status: "ready", user: session.user, site: sites[0], regions: regions.filter(region => region.siteId === sites[0].id), profiles }
    : { status: "loading" }
}

export function CitiesApp({ apiUrl }: { apiUrl: string }) {
  const [state, setState] = useState<ScreenState>(() => cachedWorkspace(apiUrl))
  const [page, setPage] = useState<CityPage | null>(() => peekNavigationJson(apiUrl, initialListRoute))
  const [metadataBusy, setMetadataBusy] = useState(true)
  const [formRevision, setFormRevision] = useState<number | null>(null)
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const [filters, setFilters] = useState(initialFilters)
  const [cursorStack, setCursorStack] = useState([""])
  const [pageSize, setPageSize] = useState(25)
  const [listRevision, setListRevision] = useState(0)
  const [listBusy, setListBusy] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [form, setForm] = useState<CityForm>(emptyForm)
  const [initialForm, setInitialForm] = useState<CityForm>(emptyForm)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [slugImpactCount, setSlugImpactCount] = useState(0)
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null)
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initialForm), [form, initialForm])

  const loadWorkspace = useCallback(async () => {
    setMetadataBusy(true)
    try {
      const [session, sites, regions, profiles] = await Promise.all([
        requestSession<{ user: Administrator }>(apiUrl),
        requestJson<SiteSummary[]>(apiUrl, "/admin/sites?summary=true"),
        requestJson<Region[]>(apiUrl, "/admin/regions"),
        requestJson<Profile[]>(apiUrl, "/admin/cities/profiles"),
      ])
      if (sites.length !== 1) throw new Error("Каталог городов ожидает единственный сайт Дом.ру")
      setState({ status: "ready", user: session.user, site: sites[0], regions: regions.filter((region) => region.siteId === sites[0].id), profiles })
    } catch (caught: unknown) {
      if (caught instanceof AdminApiError && caught.status === 401) { window.location.replace("/login"); return }
      setState({ status: "error", message: caught instanceof Error ? caught.message : "API недоступен" })
    } finally { setMetadataBusy(false) }
  }, [apiUrl])
  useEffect(() => { void loadWorkspace() }, [loadWorkspace])
  useNavigationRefresh(() => { void loadWorkspace(); setListRevision(value => value + 1) })
  useEffect(() => { const timer = window.setTimeout(() => { setQuery(search.trim()); setCursorStack([""]) }, 300); return () => window.clearTimeout(timer) }, [search])
  useUnsavedChanges(dirty)

  const currentCursor = cursorStack[cursorStack.length - 1]
  useEffect(() => {
    let active = true
    const params = new URLSearchParams({ limit: String(pageSize), sort: filters.sort, direction: filters.direction })
    if (query) params.set("q", query)
    if (currentCursor) params.set("cursor", currentCursor)
    for (const key of ["regionId", "status", "readiness", "profile", "tariffs", "unpublished"] as const) if (filters[key]) params.set(key, filters[key])
    setListBusy(true); setListError(null)
    const accept = (result: CityPage) => { if (active) setPage(result) }
    const fail = (caught: unknown) => { if (active) setListError(caught instanceof Error ? caught.message : "Каталог не загружен") }
    void readNavigationJson<CityPage>(apiUrl, `/admin/cities?${params.toString()}`, { onUpdate: accept, onError: fail, onSettled: () => { if (active) setListBusy(false) } })
      .then((result) => { if (active) setPage(result) })
      .catch(fail)
    return () => { active = false }
  }, [apiUrl, currentCursor, filters, listRevision, pageSize, query])

  function openCreate() { if (metadataBusy || listBusy || state.status !== "ready") return; setFormRevision(state.site.workingRevision); const next = emptyForm(); setForm(next); setInitialForm(next); setSlugImpactCount(0); setMessage(null); setDrawerOpen(true) }
  function openEdit(city: City) {
    if (metadataBusy || listBusy) return
    setFormRevision(city.workingRevision)
    const next: CityForm = { id: city.id, regionId: city.regionId, name: city.name, slug: city.slug, namePrepositional: city.namePrepositional || "", nameGenitive: city.nameGenitive || "", legacyUrl: city.legacyUrl || "", officeState: city.officeState, officeAddress: city.officeAddress || "", officeHours: city.officeHours || "", subscriberProfileKey: city.subscriberProfileKey || "", status: city.status }
    setForm(next); setInitialForm(next); setSlugImpactCount(city.publishedTariffCount + 1); setMessage(null); setDrawerOpen(true)
  }
  function finishEditing() {
    const next = emptyForm()
    setForm(next); setInitialForm(next); setFormRevision(null); setDrawerOpen(false)
  }
  function requestClose() { if (dirty && !window.confirm("Закрыть форму и потерять несохраненные изменения?")) return; finishEditing() }
  function resetFilters() { setSearch(""); setQuery(""); setFilters(initialFilters); setCursorStack([""]) }
  async function saveCity() {
    if (state.status !== "ready" || formRevision === null || !form.name.trim() || !form.slug.trim() || !form.regionId) return
    setSaving(true); setMessage(null)
    try {
      const confirmMissingSubscriberProfile = form.status === "PUBLISHED" && !form.subscriberProfileKey
        ? window.confirm("Профиль проверки абонента не выбран. Все равно включить город в рабочую версию?") : false
      if (form.status === "PUBLISHED" && !form.subscriberProfileKey && !confirmMissingSubscriberProfile) return
      const body = { siteId: state.site.id, regionId: form.regionId, name: form.name, slug: form.slug, namePrepositional: form.namePrepositional || null, nameGenitive: form.nameGenitive || null, legacyUrl: form.legacyUrl || null, officeState: form.officeState, officeAddress: form.officeState === "HAS_OFFICE" ? form.officeAddress : null, officeHours: form.officeState === "HAS_OFFICE" ? form.officeHours : null, subscriberProfileKey: form.subscriberProfileKey || null, status: form.status, expectedWorkingRevision: formRevision, confirmMissingSubscriberProfile }
      const result = await requestJson<{ workingRevision: number }>(apiUrl, form.id ? `/admin/cities/${form.id}` : "/admin/cities", { method: form.id ? "PATCH" : "POST", body })
      setMessage({ kind: "success", text: `Рабочая версия ${result.workingRevision} сохранена. Изменения нужно опубликовать отдельно.` })
      finishEditing(); setListRevision((value) => value + 1); await loadWorkspace()
    } catch (caught: unknown) { setMessage({ kind: "error", text: caught instanceof Error ? caught.message : "Город не сохранен" }) }
    finally { setSaving(false) }
  }

  async function changePublishedSlug(nextSlug: string) {
    if (state.status !== "ready" || !form.id || initialForm.status !== "PUBLISHED" || !nextSlug.trim()) return
    const normalized = nextSlug.trim().toLowerCase()
    if (!window.confirm(`Изменить публичный URL /${initialForm.slug} на /${normalized}? Будет затронуто ${slugImpactCount} URL; для прежних адресов будут подготовлены 301-редиректы.`)) return
    setSaving(true); setMessage(null)
    try {
      const result = await requestJson<{ affectedUrls: number; workingRevision: number }>(apiUrl, `/admin/cities/${form.id}/change-slug`, { method: "POST", body: { slug: normalized, confirm: true, expectedWorkingRevision: formRevision } })
      setMessage({ kind: "success", text: `Slug изменен в рабочей версии ${result.workingRevision}; подготовлено редиректов: ${result.affectedUrls}. Изменения нужно опубликовать отдельно.` })
      finishEditing(); setListRevision((value) => value + 1); await loadWorkspace()
    } catch (caught: unknown) { setMessage({ kind: "error", text: caught instanceof Error ? caught.message : "Slug не изменен" }) }
    finally { setSaving(false) }
  }

  if (state.status === "loading" || (!page && listBusy)) return <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 p-8" aria-busy="true"><Skeleton className="h-10 w-72" /><Skeleton className="h-64 w-full" /></div>
  if (state.status === "error" || !page) { const error = state.status === "error" ? state.message : listError || "Каталог не загружен"; return <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6"><Card className="w-full max-w-lg"><CardHeader><CardTitle>Города недоступны</CardTitle></CardHeader><CardContent><Alert variant="destructive"><CircleAlert /><AlertTitle>Ошибка API</AlertTitle><AlertDescription>{error}</AlertDescription></Alert></CardContent></Card></div> }
  const filterActive = Boolean(search || query || filters.regionId || filters.status || filters.readiness || filters.profile || filters.tariffs || filters.unpublished || filters.sort !== "city" || filters.direction !== "asc")

  return <AdminShell apiUrl={apiUrl} user={state.user} active="cities">
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="font-heading text-2xl font-semibold">Города</h1><p className="mt-1 text-sm text-muted-foreground">Эксплуатационный каталог городов Дом.ру.</p></div><div className="flex gap-2"><Button disabled={metadataBusy || listBusy} onClick={openCreate}><Plus data-icon="inline-start" />Добавить город</Button><Button variant="outline" asChild><a href="/cities/import"><FileUp data-icon="inline-start" />Импорт</a></Button><Button variant="outline" disabled={metadataBusy || listBusy} onClick={() => { void loadWorkspace(); setListRevision((value) => value + 1) }}><RefreshCw data-icon="inline-start" />Обновить</Button></div></div>
      {message ? <Alert variant={message.kind === "error" ? "destructive" : "default"}><AlertTitle>{message.kind === "error" ? "Не удалось сохранить" : "Изменения приняты"}</AlertTitle><AlertDescription>{message.text}</AlertDescription></Alert> : null}
      <PublicationStatusCard apiUrl={apiUrl} siteId={state.site.id} publicationRefreshKey={listRevision} />
      <Card><CardHeader><CardTitle>Справочник</CardTitle><CardDescription>{page.pageInfo.total.toLocaleString("ru-RU")} городов соответствует фильтрам.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 lg:grid-cols-4"><Input className="lg:col-span-2" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Название, slug или legacy URL" aria-label="Поиск города" />
          <Select value={filters.regionId} onChange={(value) => { setFilters((current) => ({ ...current, regionId: value })); setCursorStack([""]) }} label="Все регионы" options={state.regions.map((region) => ({ value: region.id, label: region.name }))} />
          <Select value={filters.status} onChange={(value) => { setFilters((current) => ({ ...current, status: value })); setCursorStack([""]) }} label="Все статусы" options={publishStatusOptions} />
          <Select value={filters.readiness} onChange={(value) => { setFilters((current) => ({ ...current, readiness: value })); setCursorStack([""]) }} label="Любая полнота" options={[{ value: "READY", label: "Готово" }, { value: "NOT_READY", label: "Не готово" }]} />
          <Select value={filters.profile} onChange={(value) => { setFilters((current) => ({ ...current, profile: value })); setCursorStack([""]) }} label="Любой профиль" options={[{ value: "CONFIGURED", label: "Профиль готов" }, { value: "MISSING", label: "Без профиля" }]} />
          <Select value={filters.tariffs} onChange={(value) => { setFilters((current) => ({ ...current, tariffs: value })); setCursorStack([""]) }} label="Любое число тарифов" options={[{ value: "WITH", label: "Есть тарифы" }, { value: "WITHOUT", label: "Без тарифов" }]} />
          <Select value={filters.unpublished} onChange={(value) => { setFilters((current) => ({ ...current, unpublished: value })); setCursorStack([""]) }} label="Любое состояние версии" options={[{ value: "true", label: "Есть изменения" }, { value: "false", label: "Нет изменений" }]} />
          <Select value={filters.sort} onChange={(value) => { setFilters((current) => ({ ...current, sort: value })); setCursorStack([""]) }} label="Сортировка: город" options={[{ value: "region", label: "Регион" }, { value: "status", label: "Статус" }, { value: "tariffs", label: "Число тарифов" }, { value: "lastPublication", label: "Последняя публикация" }]} />
          <div className="flex gap-2"><Select value={filters.direction} onChange={(value) => { setFilters((current) => ({ ...current, direction: value })); setCursorStack([""]) }} label="По возрастанию" options={[{ value: "desc", label: "По убыванию" }]} /><FilterResetButton active={filterActive} onReset={resetFilters} /></div>
        </div>
        <p role="status" className="text-xs text-muted-foreground">{metadataBusy || listBusy ? "Обновляем данные…" : listError ? "Показаны ранее загруженные данные" : "Данные обновлены"}</p>
      {listError ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Каталог не обновлен</AlertTitle><AlertDescription>{listError}</AlertDescription></Alert> : null}
        <div className="min-w-0 overflow-x-auto" aria-busy={listBusy}><Table><TableHeader><TableRow><TableHead>Город</TableHead><TableHead>Регион</TableHead><TableHead>Публичный URL</TableHead><TableHead>Статус</TableHead><TableHead>Полнота</TableHead><TableHead>Тарифы</TableHead><TableHead>Профиль</TableHead><TableHead>Версия</TableHead><TableHead>Публикация</TableHead><TableHead className="text-right">Действия</TableHead></TableRow></TableHeader><TableBody>{page.items.map((city) => <TableRow key={city.id}><TableCell><div className="font-medium">{city.name}</div><div className="text-xs text-muted-foreground">{city.slug}</div></TableCell><TableCell>{city.region.name}</TableCell><TableCell><a className="text-xs underline" href={city.publicUrl} target="_blank" rel="noreferrer">{city.publicUrl}</a></TableCell><TableCell><StatusBadge kind="publishStatus" value={city.status} /></TableCell><TableCell><Badge variant={city.readiness.ready ? "secondary" : "destructive"} title={city.readiness.blockers.join("; ")}>{city.readiness.ready ? "Готово" : "Не готово"}</Badge></TableCell><TableCell>{city.publishedTariffCount}</TableCell><TableCell><Badge variant={city.subscriberProfileReady ? "secondary" : "outline"}>{city.subscriberProfileReady ? "Готов" : "Не выбран"}</Badge></TableCell><TableCell>{city.hasUnpublishedChanges ? "Есть изменения" : "Опубликовано"}</TableCell><TableCell>{city.lastSuccessfulPublicationAt ? new Date(city.lastSuccessfulPublicationAt).toLocaleString("ru-RU") : "—"}</TableCell><TableCell className="text-right"><Button size="icon-sm" variant="ghost" disabled={metadataBusy || listBusy} aria-label={`Редактировать: ${city.name}`} onClick={() => openEdit(city)}><Pencil /></Button></TableCell></TableRow>)}</TableBody></Table></div>
        <ServerPagination page={cursorStack.length} pageSize={pageSize} itemCount={page.items.length} total={page.pageInfo.total} hasNextPage={page.pageInfo.hasNextPage} busy={listBusy} onPageSizeChange={(value) => { setPageSize(value); setCursorStack([""]) }} onPrevious={() => setCursorStack((current) => current.length > 1 ? current.slice(0, -1) : current)} onNext={() => setCursorStack((current) => page.pageInfo.nextCursor ? [...current, page.pageInfo.nextCursor] : current)} />
      </CardContent></Card>
    </div>
    <CityDrawer open={drawerOpen} form={form} initialStatus={initialForm.status} slugImpactCount={slugImpactCount} regions={state.regions} profiles={state.profiles} saving={saving} onChange={setForm} onClose={requestClose} onSave={() => void saveCity()} onChangePublishedSlug={(slug) => void changePublishedSlug(slug)} />
  </AdminShell>
}

function Select({ value, label, options, onChange }: { value: string; label: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return <select className={selectClass} value={value} onChange={(event) => onChange(event.target.value)}><option value="">{label}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
}

function CityDrawer({ open, form, initialStatus, slugImpactCount, regions, profiles, saving, onChange, onClose, onSave, onChangePublishedSlug }: { open: boolean; form: CityForm; initialStatus: string; slugImpactCount: number; regions: Region[]; profiles: Profile[]; saving: boolean; onChange: (value: CityForm) => void; onClose: () => void; onSave: () => void; onChangePublishedSlug: (slug: string) => void }) {
  const [nextSlug, setNextSlug] = useState("")
  useEffect(() => { if (open) setNextSlug("") }, [open, form.id])
  const field = (key: keyof CityForm, value: string) => onChange({ ...form, [key]: value })
  return <ModalOverlay isDismissable isOpen={open} onOpenChange={(next) => { if (!next) onClose() }} className="fixed inset-0 z-40 bg-foreground/35 backdrop-blur-xs"><Modal className="fixed inset-y-0 right-0 z-50 w-full max-w-xl overflow-y-auto border-l bg-background p-6 shadow-2xl"><Dialog className="outline-none"><div className="flex items-start justify-between gap-3"><div><Heading slot="title" className="font-heading text-xl font-semibold">{form.id ? "Редактирование города" : "Новый город"}</Heading><Text slot="description" className="text-sm text-muted-foreground">Структурированные данные рабочей версии.</Text></div><Button size="icon-sm" variant="ghost" aria-label="Закрыть редактор" onClick={onClose}><X /></Button></div><div className="mt-6 flex flex-col gap-4">
    <Field><FieldLabel htmlFor="city-region">Регион</FieldLabel><select id="city-region" className={selectClass} value={form.regionId} onChange={(event) => field("regionId", event.target.value)}><option value="">Выберите регион</option>{regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}</select></Field>
    <Field><FieldLabel htmlFor="city-name">Название</FieldLabel><Input id="city-name" value={form.name} onChange={(event) => field("name", event.target.value)} /></Field>
    <div className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor="city-genitive">Родительный падеж</FieldLabel><Input id="city-genitive" value={form.nameGenitive} onChange={(event) => field("nameGenitive", event.target.value)} /></Field><Field><FieldLabel htmlFor="city-prepositional">Предложный падеж</FieldLabel><Input id="city-prepositional" value={form.namePrepositional} onChange={(event) => field("namePrepositional", event.target.value)} /></Field></div>
    <Field><FieldLabel htmlFor="city-slug">Slug</FieldLabel><Input id="city-slug" value={form.slug} disabled={Boolean(form.id && initialStatus === "PUBLISHED")} onChange={(event) => field("slug", event.target.value)} /></Field>
    {form.id && initialStatus === "PUBLISHED" ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3"><p className="text-sm font-medium">Опасное изменение URL</p><p className="mt-1 text-xs text-muted-foreground">Затронет городской URL и опубликованные тарифы: {slugImpactCount}. Изменение создаст 301-редиректы и попадет только в рабочую версию.</p><div className="mt-3 flex gap-2"><Input aria-label="Новый slug опубликованного города" value={nextSlug} onChange={(event) => setNextSlug(event.target.value)} placeholder="novyy-slug" /><Button variant="destructive" disabled={saving || !nextSlug.trim() || nextSlug.trim() === form.slug} onClick={() => onChangePublishedSlug(nextSlug)}>Изменить URL</Button></div></div> : null}
    <Field><FieldLabel htmlFor="city-legacy">Legacy URL</FieldLabel><Input id="city-legacy" value={form.legacyUrl} onChange={(event) => field("legacyUrl", event.target.value)} /></Field>
    <Field><FieldLabel htmlFor="city-office">Офис</FieldLabel><select id="city-office" className={selectClass} value={form.officeState} onChange={(event) => field("officeState", event.target.value)}><option value="NO_OFFICE">Офиса нет</option><option value="HAS_OFFICE">Есть офис</option></select></Field>
    {form.officeState === "HAS_OFFICE" ? <div className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor="city-office-address">Адрес офиса</FieldLabel><Input id="city-office-address" value={form.officeAddress} onChange={(event) => field("officeAddress", event.target.value)} /></Field><Field><FieldLabel htmlFor="city-office-hours">Режим работы</FieldLabel><Input id="city-office-hours" value={form.officeHours} onChange={(event) => field("officeHours", event.target.value)} /></Field></div> : null}
    <Field><FieldLabel htmlFor="city-profile">Профиль проверки абонента</FieldLabel><select id="city-profile" className={selectClass} value={form.subscriberProfileKey} onChange={(event) => field("subscriberProfileKey", event.target.value)}><option value="">Не выбран</option>{profiles.map((profile) => <option key={profile.key} value={profile.key}>{profile.city}, {profile.region}</option>)}</select></Field>
    <Field><FieldLabel htmlFor="city-status">Рабочий статус</FieldLabel><select id="city-status" className={selectClass} value={form.status} onChange={(event) => field("status", event.target.value)}>{publishStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
    <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-background py-4"><Button variant="outline" onClick={onClose}>Отмена</Button><Button disabled={saving || !form.name.trim() || !form.slug.trim() || !form.regionId} onClick={onSave}><Save data-icon="inline-start" />{saving ? "Сохраняем…" : "Сохранить"}</Button></div>
  </div></Dialog></Modal></ModalOverlay>
}
