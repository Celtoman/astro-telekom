import { useCallback, useEffect, useMemo, useState } from "react"
import { CircleAlert, FileUp, Pencil, RefreshCw, Save, X } from "lucide-react"
import { AdminApiError, requestJson } from "../lib/admin-api.mjs"
import { statusOptions } from "../lib/status-presentation.mjs"
import { AdminShell } from "./AdminShell"
import { FilterResetButton } from "./FilterResetButton"
import { PublicationStatusCard } from "./PublicationStatusCard"
import { StatusBadge } from "./StatusBadge"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Field, FieldLabel } from "./ui/field"
import { Input } from "./ui/input"
import { Skeleton } from "./ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table"

interface Administrator { id: string; email: string }
interface City {
  id: string
  name: string
  slug: string
  status: string
  region: { name: string }
  site: { id: string; name: string; slug: string }
}

type ScreenState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; user: Administrator; cities: City[] }

const publishStatusOptions = statusOptions("publishStatus", ["DRAFT", "PUBLISHED", "ARCHIVED"])

export function CitiesApp({ apiUrl }: { apiUrl: string }) {
  const [state, setState] = useState<ScreenState>({ status: "loading" })
  const [search, setSearch] = useState("")
  const [refreshing, setRefreshing] = useState(false)
  const [selectedCity, setSelectedCity] = useState<City | null>(null)
  const [cityForm, setCityForm] = useState({ name: "", status: "DRAFT" })
  const [saving, setSaving] = useState(false)
  const [actionMessage, setActionMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null)
  const [publicationRefreshKey, setPublicationRefreshKey] = useState(0)

  const loadCities = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") setRefreshing(true)
    else setState({ status: "loading" })
    try {
      const [session, cities] = await Promise.all([
        requestJson<{ user: Administrator }>(apiUrl, "/auth/me"),
        requestJson<City[]>(apiUrl, "/admin/cities"),
      ])
      setState({ status: "ready", user: session.user, cities })
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

  useEffect(() => { void loadCities() }, [loadCities])

  const visibleCities = useMemo(() => {
    if (state.status !== "ready") return []
    const query = search.trim().toLocaleLowerCase("ru-RU")
    return state.cities.filter((city) => !query || `${city.name} ${city.slug} ${city.region.name}`.toLocaleLowerCase("ru-RU").includes(query))
  }, [search, state])

  function resetFilters() {
    setSearch("")
  }

  function editCity(city: City) {
    setSelectedCity(city)
    setCityForm({ name: city.name, status: city.status })
    setActionMessage(null)
  }

  async function saveCity() {
    if (!selectedCity || state.status !== "ready" || !cityForm.name.trim()) return
    setSaving(true)
    setActionMessage(null)
    try {
      const result = await requestJson<{ workingRevision: number }>(apiUrl, `/admin/cities/${selectedCity.id}`, {
        method: "PATCH",
        body: { name: cityForm.name.trim(), status: cityForm.status },
      })
      setActionMessage({ kind: "success", text: `Рабочая версия ${result.workingRevision} сохранена. Изменения нужно опубликовать отдельно.` })
      setPublicationRefreshKey((current) => current + 1)
      await loadCities("refresh")
      setSelectedCity(null)
    } catch (caught: unknown) {
      setActionMessage({ kind: "error", text: `${caught instanceof Error ? caught.message : "Город не сохранен"}. Обновите каталог, чтобы проверить фактическое состояние.` })
    } finally { setSaving(false) }
  }

  if (state.status === "loading") {
    return <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 p-8" aria-busy="true"><Skeleton className="h-10 w-72" /><Skeleton className="h-64 w-full" /></main>
  }
  if (state.status === "error") {
    return <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6"><Card className="w-full max-w-lg"><CardHeader><CardTitle>Города недоступны</CardTitle><CardDescription>Не удалось загрузить каталог.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><Alert variant="destructive"><CircleAlert /><AlertTitle>Ошибка API</AlertTitle><AlertDescription>{state.message}</AlertDescription></Alert><Button onClick={() => void loadCities()}>Повторить</Button></CardContent></Card></main>
  }

  const publishedCount = state.cities.filter((city) => city.status === "PUBLISHED").length
  const siteIds = [...new Set(state.cities.map((city) => city.site.id))]

  return (
    <AdminShell apiUrl={apiUrl} user={state.user} active="cities">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h1 className="font-heading text-2xl font-semibold">Города</h1><p className="mt-1 text-sm text-muted-foreground">Просмотр и управление справочником городов.</p></div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild><a href="/cities/import"><FileUp data-icon="inline-start" />Импорт городов</a></Button>
            <Button variant="outline" disabled={refreshing} onClick={() => void loadCities("refresh")}><RefreshCw data-icon="inline-start" />{refreshing ? "Обновляем…" : "Обновить"}</Button>
          </div>
        </div>

        <section className="grid gap-4 sm:grid-cols-3" aria-label="Состояние справочника городов">
          <Card size="sm"><CardHeader><CardDescription>Всего городов</CardDescription><CardTitle>{state.cities.length.toLocaleString("ru-RU")}</CardTitle></CardHeader></Card>
          <Card size="sm"><CardHeader><CardDescription>Опубликовано</CardDescription><CardTitle>{publishedCount.toLocaleString("ru-RU")}</CardTitle></CardHeader></Card>
          <Card size="sm"><CardHeader><CardDescription>Черновики</CardDescription><CardTitle>{(state.cities.length - publishedCount).toLocaleString("ru-RU")}</CardTitle></CardHeader></Card>
        </section>

        {actionMessage ? <Alert variant={actionMessage.kind === "error" ? "destructive" : "default"}>{actionMessage.kind === "error" ? <CircleAlert /> : <Save />}<AlertTitle>{actionMessage.kind === "error" ? "Операция не подтверждена" : "Изменения приняты"}</AlertTitle><AlertDescription>{actionMessage.text}</AlertDescription></Alert> : null}
        {siteIds.length === 1 ? <PublicationStatusCard apiUrl={apiUrl} siteId={siteIds[0]} publicationRefreshKey={publicationRefreshKey} /> : null}

        <Card>
          <CardHeader><CardTitle>Справочник</CardTitle><CardDescription>{visibleCities.length.toLocaleString("ru-RU")} из {state.cities.length.toLocaleString("ru-RU")} городов.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <Field><FieldLabel htmlFor="city-search" className="sr-only">Поиск города</FieldLabel><Input id="city-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Город, slug или регион" /></Field>
              <FilterResetButton active={Boolean(search)} onReset={resetFilters} />
            </div>
            <div className={selectedCity ? "grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]" : "min-w-0"}>
              <div className="min-w-0 overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Город</TableHead><TableHead>Регион</TableHead><TableHead>Сайт</TableHead><TableHead>Статус</TableHead><TableHead className="text-right">Действия</TableHead></TableRow></TableHeader><TableBody>{visibleCities.map((city) => <TableRow key={city.id}><TableCell><div className="font-medium">{city.name}</div><div className="text-xs text-muted-foreground">{city.slug}</div></TableCell><TableCell>{city.region.name}</TableCell><TableCell>{city.site.name}</TableCell><TableCell><StatusBadge kind="publishStatus" value={city.status} /></TableCell><TableCell className="text-right"><Button size="icon-sm" variant="ghost" aria-label={`Редактировать: ${city.name}`} onClick={() => editCity(city)}><Pencil /></Button></TableCell></TableRow>)}</TableBody></Table></div>
              {selectedCity ? <aside aria-label="Редактирование города"><Card size="sm"><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>Управление городом</CardTitle><CardDescription>Основные данные и публикационный статус.</CardDescription></div><Button size="icon-sm" variant="ghost" aria-label="Закрыть редактор" onClick={() => setSelectedCity(null)}><X /></Button></div></CardHeader><CardContent className="flex flex-col gap-4"><Field><FieldLabel htmlFor="city-name">Название</FieldLabel><Input id="city-name" value={cityForm.name} onChange={(event) => setCityForm((current) => ({ ...current, name: event.target.value }))} /></Field><Field><FieldLabel htmlFor="city-status">Статус</FieldLabel><select id="city-status" className="h-9 rounded-lg border border-input bg-background px-3 text-sm" value={cityForm.status} onChange={(event) => setCityForm((current) => ({ ...current, status: event.target.value }))}>{publishStatusOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></Field><dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 border-t pt-4 text-sm"><dt className="text-muted-foreground">Slug</dt><dd>{selectedCity.slug}</dd><dt className="text-muted-foreground">Регион</dt><dd>{selectedCity.region.name}</dd><dt className="text-muted-foreground">Сайт</dt><dd>{selectedCity.site.name}</dd></dl><Button disabled={saving || !cityForm.name.trim()} onClick={() => void saveCity()}><Save data-icon="inline-start" />{saving ? "Сохраняем…" : "Сохранить"}</Button></CardContent></Card></aside> : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  )
}
