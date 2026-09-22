import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CircleAlert, Eye, FileUp, Pencil, Plus, RefreshCw, X } from "lucide-react"
import { AdminApiError, requestJson } from "../lib/admin-api.mjs"
import { sourcePublicationRecommendation, tariffConnectionLabel } from "../lib/tariff-display"
import { AdminShell } from "./AdminShell"
import { FilterResetButton } from "./FilterResetButton"
import { ServerPagination } from "./ServerPagination"
import { SourceLabel } from "./SourceLabel"
import { StatusBadge } from "./StatusBadge"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Input } from "./ui/input"
import { Skeleton } from "./ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table"

interface Administrator { id: string; email: string }
interface AttributeField { key: string; label: string; group: string; kind: string }
interface Tariff { id: string; name: string; slug: string; serviceType: string; standardPrice: string | number | null; promoPrice: string | number | null; speed: number | null; status: string; availability: "ACTIVE" | "ARCHIVED"; archiveReason: string | null; dataSource: string | null; externalId: string | null; updatedAt: string; publicationState: "PUBLISHED" | "UNPUBLISHED"; city: { name: string; slug: string; region: { name: string } } }
interface TariffDetail extends Tariff { promoText: string | null; connectionFee: string | number | null; identityKey: string | null; attributes: Record<string, unknown> | null; seo: Record<string, unknown> | null; publicPath: string; provider: { id: string; name: string }; city: { id: string; name: string; slug: string; siteId: string; region: { name: string } }; createdAt: string; attributeSchema: AttributeField[]; archivedAt: string | null; archivedByImportRunId: string | null }
interface TariffPage { items: Tariff[]; pageInfo: { limit: number; total: number; hasNextPage: boolean; nextCursor: string | null } }
interface FilterOptions { cities: Array<{ id: string; name: string; region: { id: string; name: string } }>; regions: Array<{ id: string; name: string }>; sources: string[] }
type ScreenState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; user: Administrator }
type Filters = { cityId: string; regionId: string; serviceType: string; status: string; source: string; promotion: string; archiveReason: string; unpublished: string }

const emptyFilters: Filters = { cityId: "", regionId: "", serviceType: "", status: "", source: "", promotion: "", archiveReason: "", unpublished: "" }
const selectClass = "h-9 min-w-0 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
const money = (value: Tariff["standardPrice"]) => value === null ? "—" : `${Number(value).toLocaleString("ru-RU")} ₽`

export function TariffsApp({ apiUrl }: { apiUrl: string }) {
  const [state, setState] = useState<ScreenState>({ status: "loading" })
  const [search, setSearch] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [options, setOptions] = useState<FilterOptions>({ cities: [], regions: [], sources: [] })
  const [tariffPage, setTariffPage] = useState<TariffPage | null>(null)
  const [cursorStack, setCursorStack] = useState([""])
  const [pageSize, setPageSize] = useState(25)
  const [listRevision, setListRevision] = useState(0)
  const [listBusy, setListBusy] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [selectedTariff, setSelectedTariff] = useState<TariffDetail | null>(null)
  const [detailBusy, setDetailBusy] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const detailGeneration = useRef(0)

  const loadWorkspace = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") setRefreshing(true); else setState({ status: "loading" })
    try {
      const [session, filterOptions] = await Promise.all([
        requestJson<{ user: Administrator }>(apiUrl, "/auth/me"),
        requestJson<FilterOptions>(apiUrl, "/admin/tariffs/filter-options"),
      ])
      setOptions(filterOptions); setState({ status: "ready", user: session.user })
    } catch (caught: unknown) {
      if (caught instanceof AdminApiError && caught.status === 401) { window.location.replace("/login"); return }
      setState({ status: "error", message: caught instanceof Error ? caught.message : "API недоступен" })
    } finally { setRefreshing(false) }
  }, [apiUrl])

  useEffect(() => { void loadWorkspace() }, [loadWorkspace])
  useEffect(() => { const timer = window.setTimeout(() => { setSearchQuery(search.trim()); setCursorStack([""]) }, 300); return () => window.clearTimeout(timer) }, [search])
  const currentCursor = cursorStack[cursorStack.length - 1]
  const filterKey = JSON.stringify(filters)
  useEffect(() => {
    let active = true
    const params = new URLSearchParams({ limit: String(pageSize) })
    if (searchQuery) params.set("q", searchQuery)
    if (currentCursor) params.set("cursor", currentCursor)
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value)
    setListBusy(true); setListError(null)
    void requestJson<TariffPage>(apiUrl, `/admin/tariffs?${params.toString()}`).then((page) => { if (active) setTariffPage(page) }).catch((caught: unknown) => {
      if (!active) return
      if (caught instanceof AdminApiError && caught.status === 401) { window.location.replace("/login"); return }
      setListError(caught instanceof Error ? caught.message : "Каталог тарифов не загружен")
    }).finally(() => { if (active) setListBusy(false) })
    return () => { active = false }
  }, [apiUrl, currentCursor, filterKey, listRevision, pageSize, searchQuery])

  function setFilter(key: keyof Filters, value: string) { setFilters((current) => ({ ...current, [key]: value })); setCursorStack([""]) }
  function resetFilters() { setSearch(""); setSearchQuery(""); setFilters(emptyFilters); setCursorStack([""]) }
  async function showDetail(id: string) {
    const generation = ++detailGeneration.current; setDetailBusy(true); setDetailError(null)
    try { const detail = await requestJson<TariffDetail>(apiUrl, `/admin/tariffs/${id}`); if (detailGeneration.current === generation) setSelectedTariff(detail) }
    catch (caught: unknown) { if (detailGeneration.current === generation) setDetailError(caught instanceof Error ? caught.message : "Тариф не загружен") }
    finally { if (detailGeneration.current === generation) setDetailBusy(false) }
  }
  const recommendation = selectedTariff ? sourcePublicationRecommendation(selectedTariff.attributes) : null
  const groupedAttributes = useMemo(() => selectedTariff?.attributeSchema.reduce<Record<string, AttributeField[]>>((groups, field) => { (groups[field.group] ||= []).push(field); return groups }, {}) || {}, [selectedTariff])
  const activeFilters = Boolean(search || searchQuery || Object.values(filters).some(Boolean))

  if (state.status === "loading" || (!tariffPage && listBusy)) return <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 p-8" aria-busy="true"><Skeleton className="h-10 w-72" /><Skeleton className="h-64 w-full" /></main>
  if (state.status === "error" || !tariffPage) { const message = state.status === "error" ? state.message : listError || "Каталог тарифов не загружен"; return <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6"><Card className="w-full max-w-lg"><CardHeader><CardTitle>Тарифы недоступны</CardTitle></CardHeader><CardContent className="flex flex-col gap-4"><Alert variant="destructive"><CircleAlert /><AlertTitle>Ошибка API</AlertTitle><AlertDescription>{message}</AlertDescription></Alert><Button onClick={() => { void loadWorkspace(); setListRevision((value) => value + 1) }}>Повторить</Button></CardContent></Card></main> }

  return <AdminShell apiUrl={apiUrl} user={state.user} active="tariffs"><div className="mx-auto flex w-full max-w-[100rem] flex-col gap-6 p-6 lg:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="font-heading text-2xl font-semibold">Тарифы</h1><p className="mt-1 text-sm text-muted-foreground">Найдите, проверьте и исправьте тариф до отдельной публикации сайта.</p></div><div className="flex flex-wrap gap-2"><Button asChild><a href="/tariffs/edit"><Plus data-icon="inline-start" />Создать тариф</a></Button><Button variant="outline" asChild><a href="/tariffs/import"><FileUp data-icon="inline-start" />Импорт тарифов</a></Button><Button variant="outline" disabled={refreshing || listBusy} onClick={() => { void loadWorkspace("refresh"); setListRevision((value) => value + 1) }}><RefreshCw data-icon="inline-start" />Обновить</Button></div></div>
    <Card><CardHeader><CardTitle>Каталог</CardTitle><CardDescription>{tariffPage.pageInfo.total.toLocaleString("ru-RU")} тарифов соответствует фильтрам.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
      <div className="grid gap-3 lg:grid-cols-4"><Input className="lg:col-span-2" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Название, slug или внешний ID" aria-label="Поиск тарифа" /><select className={selectClass} aria-label="Город" value={filters.cityId} onChange={(event) => setFilter("cityId", event.target.value)}><option value="">Все города</option>{options.cities.map((city) => <option value={city.id} key={city.id}>{city.name}</option>)}</select><select className={selectClass} aria-label="Регион" value={filters.regionId} onChange={(event) => setFilter("regionId", event.target.value)}><option value="">Все регионы</option>{options.regions.map((region) => <option value={region.id} key={region.id}>{region.name}</option>)}</select>
        <select className={selectClass} aria-label="Тип услуги" value={filters.serviceType} onChange={(event) => setFilter("serviceType", event.target.value)}><option value="">Все типы</option><option value="INTERNET">Интернет</option><option value="INTERNET_TV">Интернет + ТВ</option><option value="TV">ТВ</option><option value="OTHER">Другое</option></select><select className={selectClass} aria-label="Рабочий статус" value={filters.status} onChange={(event) => setFilter("status", event.target.value)}><option value="">Все рабочие статусы</option><option value="DRAFT">Черновик</option><option value="PUBLISHED">К публикации</option><option value="ARCHIVED">Архив</option></select><select className={selectClass} aria-label="Источник" value={filters.source} onChange={(event) => setFilter("source", event.target.value)}><option value="">Все источники</option>{options.sources.map((source) => <option value={source} key={source}>{source}</option>)}</select><select className={selectClass} aria-label="Промо" value={filters.promotion} onChange={(event) => setFilter("promotion", event.target.value)}><option value="">С промо и без</option><option value="WITH">Есть промо</option><option value="WITHOUT">Без промо</option></select><select className={selectClass} aria-label="Причина архива" value={filters.archiveReason} onChange={(event) => setFilter("archiveReason", event.target.value)}><option value="">Все причины архива</option><option value="ABSENT_FROM_IMPORT">Нет в импорте</option><option value="MANUAL">Вручную</option><option value="NONE">Не архивирован</option></select><select className={selectClass} aria-label="Состояние публикации" value={filters.unpublished} onChange={(event) => setFilter("unpublished", event.target.value)}><option value="">Любое состояние сайта</option><option value="true">Есть неопубликованные изменения</option><option value="false">Опубликовано без изменений</option></select><div className="lg:col-span-2 lg:justify-self-end"><FilterResetButton active={activeFilters} onReset={resetFilters} /></div></div>
      {listError ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Каталог не обновлен</AlertTitle><AlertDescription>{listError}</AlertDescription></Alert> : null}
      <div className={selectedTariff || detailBusy || detailError ? "grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_26rem]" : "min-w-0"}><div aria-busy={listBusy} className="min-w-0 overflow-x-auto">{tariffPage.items.length ? <Table><TableHeader><TableRow><TableHead>Тариф</TableHead><TableHead>Город</TableHead><TableHead>Тип</TableHead><TableHead>Базовая</TableHead><TableHead>Промо</TableHead><TableHead>Характеристика</TableHead><TableHead>Рабочий статус</TableHead><TableHead>Сайт</TableHead><TableHead>Источник</TableHead><TableHead>Обновлен</TableHead><TableHead className="text-right">Действия</TableHead></TableRow></TableHeader><TableBody>{tariffPage.items.map((tariff) => <TableRow key={tariff.id} className="cursor-pointer" onClick={() => void showDetail(tariff.id)}><TableCell><div className="font-medium">{tariff.name}</div><div className="text-xs text-muted-foreground">{tariff.slug}</div></TableCell><TableCell><div>{tariff.city.name}</div><div className="text-xs text-muted-foreground">{tariff.city.region.name}</div></TableCell><TableCell><StatusBadge kind="serviceType" value={tariff.serviceType} /></TableCell><TableCell>{money(tariff.standardPrice)}</TableCell><TableCell>{money(tariff.promoPrice)}</TableCell><TableCell>{tariff.speed ? `${tariff.speed} Мбит/с` : "—"}</TableCell><TableCell><StatusBadge kind="publishStatus" value={tariff.status} /></TableCell><TableCell><Badge variant={tariff.publicationState === "UNPUBLISHED" ? "warning" : "success"}>{tariff.publicationState === "UNPUBLISHED" ? "Есть изменения" : "Опубликовано"}</Badge></TableCell><TableCell><SourceLabel value={tariff.dataSource} /></TableCell><TableCell className="whitespace-nowrap">{new Date(tariff.updatedAt).toLocaleDateString("ru-RU")}</TableCell><TableCell onClick={(event) => event.stopPropagation()}><div className="flex justify-end gap-1"><Button variant="ghost" size="icon-sm" aria-label={`Быстрый просмотр: ${tariff.name}`} onClick={() => void showDetail(tariff.id)}><Eye /></Button><Button variant="ghost" size="icon-sm" aria-label={`Редактировать: ${tariff.name}`} asChild><a href={`/tariffs/edit?id=${encodeURIComponent(tariff.id)}`}><Pencil /></a></Button></div></TableCell></TableRow>)}</TableBody></Table> : <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center"><p className="font-medium">Тарифы не найдены</p><p className="text-sm text-muted-foreground">Измените фильтры или поисковый запрос.</p></div>}</div>
        {selectedTariff || detailBusy || detailError ? <aside aria-label="Быстрый просмотр"><Card size="sm"><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>Быстрый просмотр</CardTitle><CardDescription>Полный набор параметров без ухода из каталога.</CardDescription></div><Button variant="ghost" size="icon-sm" aria-label="Закрыть быстрый просмотр" onClick={() => { detailGeneration.current += 1; setSelectedTariff(null); setDetailBusy(false); setDetailError(null) }}><X /></Button></div></CardHeader><CardContent className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">{detailBusy ? <Skeleton className="h-52 w-full" /> : detailError ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Тариф не загружен</AlertTitle><AlertDescription>{detailError}</AlertDescription></Alert> : selectedTariff ? <>
          <div><p className="font-medium">{selectedTariff.name}</p><p className="break-all text-xs text-muted-foreground">{selectedTariff.publicPath}</p></div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Город</dt><dd>{selectedTariff.city.name}</dd>
            <dt className="text-muted-foreground">Тип</dt><dd><StatusBadge kind="serviceType" value={selectedTariff.serviceType} /></dd>
            <dt className="text-muted-foreground">Скорость</dt><dd>{selectedTariff.speed ? `${selectedTariff.speed} Мбит/с` : "—"}</dd>
            <dt className="text-muted-foreground">Базовая цена</dt><dd>{money(selectedTariff.standardPrice)}</dd>
            <dt className="text-muted-foreground">Промо-цена</dt><dd>{money(selectedTariff.promoPrice)}</dd>
            <dt className="text-muted-foreground">Подключение</dt><dd>{tariffConnectionLabel(selectedTariff.connectionFee)}</dd>
            <dt className="text-muted-foreground">Промо-текст</dt><dd>{selectedTariff.promoText || "—"}</dd>
            <dt className="text-muted-foreground">Рабочий статус</dt><dd><StatusBadge kind="publishStatus" value={selectedTariff.status} /></dd>
            <dt className="text-muted-foreground">Сайт</dt><dd>{selectedTariff.publicationState === "UNPUBLISHED" ? "Есть неопубликованные изменения" : "Опубликовано"}</dd>
            <dt className="text-muted-foreground">Рекомендация источника</dt><dd>{recommendation ? <Badge variant={recommendation.tone}>{recommendation.label}</Badge> : "—"}</dd>
            <dt className="text-muted-foreground">Источник</dt><dd className="break-all"><SourceLabel value={selectedTariff.dataSource} /></dd>
            <dt className="text-muted-foreground">Жизненный цикл</dt><dd>{selectedTariff.availability === "ACTIVE" ? "Активен" : "Архив"}</dd>
            <dt className="text-muted-foreground">Причина архива</dt><dd>{selectedTariff.archiveReason || "—"}</dd>
            <dt className="text-muted-foreground">Импорт архива</dt><dd className="break-all font-mono text-xs">{selectedTariff.archivedByImportRunId || "—"}</dd>
            <dt className="text-muted-foreground">Внешний ID</dt><dd className="break-all">{selectedTariff.externalId || "—"}</dd>
            <dt className="text-muted-foreground">Identity key</dt><dd className="break-all font-mono text-xs">{selectedTariff.identityKey || "—"}</dd>
            <dt className="text-muted-foreground">Обновлен</dt><dd>{new Date(selectedTariff.updatedAt).toLocaleString("ru-RU")}</dd>
          </dl>
          {Object.entries(groupedAttributes).map(([group, fields]) => <details key={group}><summary className="cursor-pointer text-sm font-medium">{group}</summary><dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs">{fields.map((field) => <span className="contents" key={field.key}><dt className="text-muted-foreground">{field.label}</dt><dd className="break-words">{String(selectedTariff.attributes?.[field.key] ?? "—")}</dd></span>)}</dl></details>)}
          <details><summary className="cursor-pointer text-sm font-medium">SEO</summary><pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs">{selectedTariff.seo ? JSON.stringify(selectedTariff.seo, null, 2) : "—"}</pre></details>
          <Button asChild><a href={`/tariffs/edit?id=${encodeURIComponent(selectedTariff.id)}`}><Pencil data-icon="inline-start" />Редактировать тариф</a></Button>
        </> : null}</CardContent></Card></aside> : null}
      </div><ServerPagination page={cursorStack.length} pageSize={pageSize} itemCount={tariffPage.items.length} total={tariffPage.pageInfo.total} hasNextPage={tariffPage.pageInfo.hasNextPage} busy={listBusy} onPageSizeChange={(value) => { setPageSize(value); setCursorStack([""]) }} onPrevious={() => setCursorStack((current) => current.length > 1 ? current.slice(0, -1) : current)} onNext={() => setCursorStack((current) => tariffPage.pageInfo.nextCursor ? [...current, tariffPage.pageInfo.nextCursor] : current)} />
    </CardContent></Card>
  </div></AdminShell>
}
