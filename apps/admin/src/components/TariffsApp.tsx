import { useCallback, useEffect, useRef, useState } from "react"
import { CircleAlert, Eye, FileUp, Pencil, RefreshCw, X } from "lucide-react"
import { AdminApiError, requestJson } from "../lib/admin-api.mjs"
import { sourcePublicationRecommendation, tariffConnectionLabel } from "../lib/tariff-display"
import { AdminShell } from "./AdminShell"
import { FilterResetButton } from "./FilterResetButton"
import { ServerPagination } from "./ServerPagination"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Input } from "./ui/input"
import { Skeleton } from "./ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table"

interface Administrator { id: string; email: string }
interface Tariff { id: string; name: string; slug: string; serviceType: string; standardPrice: string | number | null; promoPrice: string | number | null; speed: number | null; status: string; availability: boolean; city: { name: string; slug: string } }
interface TariffDetail extends Tariff { promoText: string | null; connectionFee: string | number | null; externalId: string | null; identityKey: string | null; dataSource: string | null; attributes: Record<string, unknown> | null; seo: Record<string, unknown> | null; publicPath: string; provider: { id: string; name: string }; city: { id: string; name: string; slug: string; siteId: string }; createdAt: string; updatedAt: string }
interface TariffPage {
  items: Tariff[]
  pageInfo: { limit: number; total: number; hasNextPage: boolean; nextCursor: string | null }
}

type ScreenState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; user: Administrator }

const money = (value: Tariff["standardPrice"]) => value === null ? "—" : `${Number(value).toLocaleString("ru-RU")} ₽`

export function TariffsApp({ apiUrl }: { apiUrl: string }) {
  const [state, setState] = useState<ScreenState>({ status: "loading" })
  const [search, setSearch] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
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
    if (mode === "refresh") setRefreshing(true)
    else setState({ status: "loading" })
    try {
      const session = await requestJson<{ user: Administrator }>(apiUrl, "/auth/me")
      setState({ status: "ready", user: session.user })
    } catch (caught: unknown) {
      if (caught instanceof AdminApiError && caught.status === 401) {
        window.location.replace("/login")
        return
      }
      setState({ status: "error", message: caught instanceof Error ? caught.message : "API недоступен" })
    } finally {
      setRefreshing(false)
    }
  }, [apiUrl])

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
    setCursorStack([""])
  }

  const currentCursor = cursorStack[cursorStack.length - 1]
  useEffect(() => {
    let active = true
    const params = new URLSearchParams({ limit: String(pageSize) })
    if (searchQuery) params.set("q", searchQuery)
    if (currentCursor) params.set("cursor", currentCursor)
    setListBusy(true)
    setListError(null)
    void requestJson<TariffPage>(apiUrl, `/admin/tariffs?${params.toString()}`)
      .then((page) => { if (active) setTariffPage(page) })
      .catch((caught: unknown) => {
        if (!active) return
        if (caught instanceof AdminApiError && caught.status === 401) {
          window.location.replace("/login")
          return
        }
        setListError(caught instanceof Error ? caught.message : "Каталог тарифов не загружен")
      })
      .finally(() => { if (active) setListBusy(false) })
    return () => { active = false }
  }, [apiUrl, currentCursor, listRevision, pageSize, searchQuery])

  async function showDetail(id: string) {
    const generation = ++detailGeneration.current
    setDetailBusy(true)
    setDetailError(null)
    try {
      const tariff = await requestJson<TariffDetail>(apiUrl, `/admin/tariffs/${id}`)
      if (detailGeneration.current === generation) setSelectedTariff(tariff)
    } catch (caught: unknown) {
      if (detailGeneration.current === generation) setDetailError(caught instanceof Error ? caught.message : "Тариф не загружен")
    } finally {
      if (detailGeneration.current === generation) setDetailBusy(false)
    }
  }

  const recommendation = selectedTariff ? sourcePublicationRecommendation(selectedTariff.attributes) : null

  if (state.status === "loading" || (!tariffPage && listBusy)) return <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 p-8" aria-busy="true"><Skeleton className="h-10 w-72" /><Skeleton className="h-64 w-full" /></main>
  if (state.status === "error" || !tariffPage) {
    const message = state.status === "error" ? state.message : listError || "Каталог тарифов не загружен"
    return <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6"><Card className="w-full max-w-lg"><CardHeader><CardTitle>Тарифы недоступны</CardTitle><CardDescription>Не удалось загрузить рабочий экран.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><Alert variant="destructive"><CircleAlert /><AlertTitle>Ошибка API</AlertTitle><AlertDescription>{message}</AlertDescription></Alert><Button onClick={() => { void loadWorkspace(); setListRevision((value) => value + 1) }}>Повторить</Button></CardContent></Card></main>
  }

  return (
    <AdminShell apiUrl={apiUrl} user={state.user} active="tariffs">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="font-heading text-2xl font-semibold">Тарифы</h1><p className="mt-1 text-sm text-muted-foreground">Каталог, быстрый просмотр и ручное управление тарифами.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" asChild><a href="/tariffs/import"><FileUp data-icon="inline-start" />Импорт тарифов</a></Button><Button variant="outline" disabled={refreshing || listBusy} onClick={() => { void loadWorkspace("refresh"); setListRevision((value) => value + 1) }}><RefreshCw data-icon="inline-start" />Обновить</Button></div></div>

        <Card>
          <CardHeader><CardTitle>Каталог</CardTitle><CardDescription>{tariffPage.pageInfo.total.toLocaleString("ru-RU")} тарифов соответствует фильтру.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Название, slug или город" aria-label="Поиск тарифа" />
              <FilterResetButton active={Boolean(search || searchQuery)} onReset={resetFilters} />
            </div>
            {listError ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Каталог не обновлен</AlertTitle><AlertDescription>{listError}</AlertDescription></Alert> : null}
            <div className={selectedTariff || detailBusy || detailError ? "grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]" : "min-w-0"}>
              <div aria-busy={listBusy} className="min-w-0 overflow-x-auto">
                {tariffPage.items.length ? <Table><TableHeader><TableRow><TableHead>Тариф</TableHead><TableHead>Город</TableHead><TableHead>Тип</TableHead><TableHead>Цена</TableHead><TableHead className="text-right">Действия</TableHead></TableRow></TableHeader><TableBody>{tariffPage.items.map((tariff) => <TableRow key={tariff.id}><TableCell><button type="button" className="text-left hover:underline" onClick={() => void showDetail(tariff.id)}><div className="font-medium">{tariff.name}</div><div className="text-xs text-muted-foreground">{tariff.slug}</div></button></TableCell><TableCell>{tariff.city.name}</TableCell><TableCell><Badge variant="outline">{tariff.serviceType}</Badge></TableCell><TableCell>{money(tariff.promoPrice ?? tariff.standardPrice)}</TableCell><TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon-sm" aria-label={`Быстрый просмотр: ${tariff.name}`} onClick={() => void showDetail(tariff.id)}><Eye /></Button><Button variant="ghost" size="icon-sm" aria-label={`Редактировать: ${tariff.name}`} asChild><a href={`/tariffs/edit?id=${encodeURIComponent(tariff.id)}`}><Pencil /></a></Button></div></TableCell></TableRow>)}</TableBody></Table> : <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center"><p className="font-medium">Тарифы не найдены</p><p className="text-sm text-muted-foreground">Измените поисковый запрос или обновите каталог.</p></div>}
              </div>
              {selectedTariff || detailBusy || detailError ? <aside aria-label="Быстрый просмотр"><Card size="sm"><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>Быстрый просмотр</CardTitle><CardDescription>Основные данные без ухода из каталога.</CardDescription></div><Button variant="ghost" size="icon-sm" aria-label="Закрыть быстрый просмотр" onClick={() => { detailGeneration.current += 1; setSelectedTariff(null); setDetailBusy(false); setDetailError(null) }}><X /></Button></div></CardHeader><CardContent className="flex flex-col gap-4">{detailBusy ? <Skeleton className="h-52 w-full" /> : detailError ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Тариф не загружен</AlertTitle><AlertDescription>{detailError}</AlertDescription></Alert> : selectedTariff ? <><div><p className="font-medium">{selectedTariff.name}</p><p className="break-all text-xs text-muted-foreground">{selectedTariff.publicPath}</p></div><dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm"><dt className="text-muted-foreground">Город</dt><dd>{selectedTariff.city.name}</dd><dt className="text-muted-foreground">Тип</dt><dd>{selectedTariff.serviceType}</dd><dt className="text-muted-foreground">Скорость</dt><dd>{selectedTariff.speed ? `${selectedTariff.speed} Мбит/с` : "—"}</dd><dt className="text-muted-foreground">Цена</dt><dd>{money(selectedTariff.promoPrice ?? selectedTariff.standardPrice)}</dd><dt className="text-muted-foreground">Подключение</dt><dd>{tariffConnectionLabel(selectedTariff.connectionFee)}</dd><dt className="text-muted-foreground">Статус</dt><dd><Badge variant="outline">{selectedTariff.status}</Badge></dd><dt className="text-muted-foreground">Рекомендация источника</dt><dd>{recommendation ? <Badge variant="outline" className={recommendation.className}>{recommendation.label}</Badge> : null}</dd><dt className="text-muted-foreground">Источник</dt><dd className="break-all">{selectedTariff.dataSource || "Вручную"}</dd></dl><p className="text-xs text-muted-foreground">Рекомендация из файла не изменяет статус публикации.</p><Button asChild><a href={`/tariffs/edit?id=${encodeURIComponent(selectedTariff.id)}`}><Pencil data-icon="inline-start" />Редактировать тариф</a></Button></> : null}</CardContent></Card></aside> : null}
            </div>
            <ServerPagination
              page={cursorStack.length}
              pageSize={pageSize}
              itemCount={tariffPage.items.length}
              total={tariffPage.pageInfo.total}
              hasNextPage={tariffPage.pageInfo.hasNextPage}
              busy={listBusy}
              onPageSizeChange={(value) => { setPageSize(value); setCursorStack([""]) }}
              onPrevious={() => setCursorStack((current) => current.length > 1 ? current.slice(0, -1) : current)}
              onNext={() => setCursorStack((current) => tariffPage.pageInfo.nextCursor ? [...current, tariffPage.pageInfo.nextCursor] : current)}
            />
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  )
}
