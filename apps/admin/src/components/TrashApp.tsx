import { useCallback, useEffect, useRef, useState } from "react"
import { ArchiveRestore, CircleAlert, RefreshCw, Trash2 } from "lucide-react"
import { AdminApiError, requestJson, requestSession } from "../lib/admin-api.mjs"
import { AdminShell } from "./AdminShell"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Field, FieldLabel } from "./ui/field"
import { Skeleton } from "./ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table"

type TrashEntityType = "CITY" | "PAGE" | "TARIFF" | "REDIRECT" | "PAGE_BLOCK"

interface Administrator { id: string; email: string }
interface Site { id: string; name: string; slug: string }
interface TrashItem {
  id: string
  label: string
  context: string
  archivedAt: string | null
  updatedAt?: string
}
interface TrashGroup {
  entityType: TrashEntityType
  label: string
  total: number
  truncated: boolean
  items: TrashItem[]
}
interface TrashResponse { siteId: string; groups: TrashGroup[] }
interface TariffPurgePreview {
  siteId: string
  offset: number
  limit: number
  total: number
  nextOffset: number | null
  fingerprint: string
  items: Array<{ id: string; name: string; path: string; archivedAt: string | null; blockers: string[] }>
}

type ScreenState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; user: Administrator; sites: Site[] }

const entityLabels: Record<TrashEntityType, string> = {
  CITY: "Город",
  PAGE: "Страница",
  TARIFF: "Тариф",
  REDIRECT: "Редирект",
  PAGE_BLOCK: "Блок страницы",
}

const dateFormatter = new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" })

export function TrashApp({ apiUrl }: { apiUrl: string }) {
  const [state, setState] = useState<ScreenState>({ status: "loading" })
  const [selectedSiteId, setSelectedSiteId] = useState("")
  const [trash, setTrash] = useState<TrashResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [pendingRestore, setPendingRestore] = useState<{ group: TrashGroup; item: TrashItem } | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [purgePreview, setPurgePreview] = useState<TariffPurgePreview | null>(null)
  const [purgeBusy, setPurgeBusy] = useState(false)
  const [pendingPurge, setPendingPurge] = useState(false)
  const [purging, setPurging] = useState(false)
  const purgeGeneration = useRef(0)

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
        requestSession<{ user: Administrator }>(apiUrl),
        requestJson<Site[]>(apiUrl, "/admin/sites?summary=true"),
      ])
      setState({ status: "ready", user: session.user, sites })
      setSelectedSiteId((current) => sites.some((site) => site.id === current) ? current : sites.length === 1 ? sites[0].id : "")
    } catch (caught: unknown) {
      const nextError = handleError(caught, "API недоступен")
      if (nextError) setState({ status: "error", message: nextError })
    }
  }, [apiUrl, handleError])

  useEffect(() => { void loadWorkspace() }, [loadWorkspace])

  useEffect(() => {
    if (state.status !== "ready" || !selectedSiteId) {
      setTrash(null)
      setBusy(false)
      return
    }
    let active = true
    const params = new URLSearchParams({ siteId: selectedSiteId })
    setBusy(true)
    setError(null)
    void requestJson<TrashResponse>(apiUrl, `/admin/trash?${params.toString()}`)
      .then((result) => { if (active) setTrash(result) })
      .catch((caught: unknown) => {
        if (!active) return
        const nextError = handleError(caught, "Корзина не загружена")
        if (nextError) setError(nextError)
      })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [apiUrl, handleError, refreshKey, selectedSiteId, state.status])

  async function restore(group: TrashGroup, item: TrashItem) {
    setRestoring(true)
    setError(null)
    setMessage(null)
    try {
      let route: string
      let method: "POST" | "PATCH"
      let body: Record<string, unknown>
      if (group.entityType === "PAGE_BLOCK") {
        route = `/admin/blocks/${encodeURIComponent(item.id)}/restore`
        method = "POST"
        body = {}
      } else {
        const routePrefix: Record<Exclude<TrashEntityType, "PAGE_BLOCK">, string> = {
          CITY: "/admin/cities/",
          PAGE: "/admin/pages/",
          TARIFF: "/admin/tariffs/",
          REDIRECT: "/admin/redirects/",
        }
        route = `${routePrefix[group.entityType]}${encodeURIComponent(item.id)}`
        method = "PATCH"
        body = group.entityType === "TARIFF"
          ? { status: "DRAFT", expectedUpdatedAt: item.updatedAt, confirmSensitiveChanges: true }
          : { status: "DRAFT" }
      }
      const result = await requestJson<{ workingRevision?: number }>(apiUrl, route, { method, body })
      setMessage(result.workingRevision
        ? `${entityLabels[group.entityType]} восстановлен. Рабочая версия ${result.workingRevision} сохранена; опубликуйте ее отдельно.`
        : `${entityLabels[group.entityType]} восстановлен в рабочей версии.`)
      setPendingRestore(null)
      setPendingPurge(false)
      setPurgePreview(null)
      setRefreshKey((value) => value + 1)
    } catch (caught: unknown) {
      const nextError = handleError(caught, "Восстановление не выполнено")
      if (nextError) setError(nextError)
    } finally {
      setRestoring(false)
    }
  }

  async function loadPurgePreview(offset = 0) {
    if (!selectedSiteId) return
    const generation = ++purgeGeneration.current
    setPurgeBusy(true)
    setPendingPurge(false)
    setError(null)
    try {
      const params = new URLSearchParams({ siteId: selectedSiteId, offset: String(offset) })
      const preview = await requestJson<TariffPurgePreview>(apiUrl, `/admin/tariffs/purge-preview?${params.toString()}`)
      if (purgeGeneration.current === generation) setPurgePreview(preview)
    } catch (caught: unknown) {
      if (purgeGeneration.current === generation) {
        const nextError = handleError(caught, "Предпросмотр очистки не загружен")
        if (nextError) setError(nextError)
      }
    } finally {
      if (purgeGeneration.current === generation) setPurgeBusy(false)
    }
  }

  async function purgeTariffs() {
    if (!purgePreview) return
    const ids = purgePreview.items.filter((item) => item.blockers.length === 0).map((item) => item.id)
    if (!ids.length) return
    setPurging(true)
    setError(null)
    try {
      const result = await requestJson<{ removed: number; workingRevision: number }>(apiUrl, "/admin/tariffs/purge", {
        method: "POST",
        body: { siteId: purgePreview.siteId, offset: purgePreview.offset, ids, fingerprint: purgePreview.fingerprint, confirm: true },
      })
      setMessage(`Удалено ${result.removed} архивных тарифов. Рабочая версия ${result.workingRevision} сохранена; публикация выполняется отдельно.`)
      setPendingPurge(false)
      setPurgePreview(null)
      setRefreshKey((value) => value + 1)
    } catch (caught: unknown) {
      const nextError = handleError(caught, "Очистка не выполнена")
      if (nextError) setError(nextError)
      setPendingPurge(false)
    } finally {
      setPurging(false)
    }
  }

  if (state.status === "loading") return <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 p-8" aria-busy="true"><Skeleton className="h-10 w-72" /><Skeleton className="h-64 w-full" /></div>
  if (state.status === "error") return <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6"><Card className="w-full max-w-lg"><CardHeader><CardTitle>Корзина недоступна</CardTitle><CardDescription>Не удалось загрузить рабочий экран.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><Alert variant="destructive"><CircleAlert /><AlertTitle>Ошибка API</AlertTitle><AlertDescription>{state.message}</AlertDescription></Alert><Button onClick={() => void loadWorkspace()}>Повторить</Button></CardContent></Card></div>

  const total = trash?.groups.reduce((sum, group) => sum + group.total, 0) || 0

  return (
    <AdminShell apiUrl={apiUrl} user={state.user} active="trash">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h1 className="font-heading text-2xl font-semibold">Корзина</h1><p className="mt-1 text-sm text-muted-foreground">Архивные сущности не попадают в следующую публикацию, но остаются доступными для восстановления.</p></div>
          <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!selectedSiteId || purgeBusy || purging} onClick={() => void loadPurgePreview()}><Trash2 data-icon="inline-start" />Проверить очистку тарифов</Button><Button variant="outline" disabled={busy} onClick={() => { setPurgePreview(null); setPendingPurge(false); setRefreshKey((value) => value + 1) }}><RefreshCw data-icon="inline-start" />Обновить</Button></div>
        </div>

        {!state.sites.length ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Сайты не найдены</AlertTitle><AlertDescription>Корзина всегда принадлежит конкретному сайту.</AlertDescription></Alert> : null}
        {message ? <Alert><ArchiveRestore /><AlertTitle>Операция завершена</AlertTitle><AlertDescription>{message}</AlertDescription></Alert> : null}
        {error ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Операция не выполнена</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}

        <Card>
          <CardHeader><CardTitle>Область корзины</CardTitle><CardDescription>{trash ? `Всего архивных записей: ${total.toLocaleString("ru-RU")}.` : "Выберите сайт."}</CardDescription></CardHeader>
          <CardContent className="max-w-md">
            <Field><FieldLabel htmlFor="trash-site">Сайт</FieldLabel><select id="trash-site" className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm" value={selectedSiteId} disabled={purging} onChange={(event) => { purgeGeneration.current += 1; setSelectedSiteId(event.target.value); setPendingRestore(null); setPendingPurge(false); setPurgePreview(null); setPurgeBusy(false); setMessage(null) }}><option value="">Выберите сайт</option>{state.sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></Field>
          </CardContent>
        </Card>

        {pendingRestore ? <Alert><ArchiveRestore /><AlertTitle>Подтвердить восстановление</AlertTitle><AlertDescription><span className="block">«{pendingRestore.item.label}» будет возвращен в рабочую версию. Город, страница, тариф или редирект вернется как черновик; блок страницы — с прежней настройкой видимости. На публичном сайте ничего не изменится до отдельной успешной публикации.</span><span className="mt-3 flex flex-wrap gap-2"><Button disabled={restoring} onClick={() => void restore(pendingRestore.group, pendingRestore.item)}>{restoring ? "Восстанавливаем…" : "Подтвердить восстановление"}</Button><Button variant="outline" disabled={restoring} onClick={() => setPendingRestore(null)}>Отмена</Button></span></AlertDescription></Alert> : null}

        {purgeBusy ? <Card aria-busy="true"><CardContent className="p-6"><Skeleton className="h-32 w-full" /></CardContent></Card> : null}
        {purgePreview && !purgeBusy ? <Card><CardHeader><CardTitle>Предпросмотр очистки тарифов</CardTitle><CardDescription>Архив: {purgePreview.total.toLocaleString("ru-RU")}. Показаны записи {purgePreview.items.length ? purgePreview.offset + 1 : 0}–{purgePreview.offset + purgePreview.items.length}; удаляются только записи без связей.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
          {purgePreview.items.length ? <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Тариф</TableHead><TableHead>Путь</TableHead><TableHead>Проверка связей</TableHead></TableRow></TableHeader><TableBody>{purgePreview.items.map((item) => <TableRow key={item.id}><TableCell className="font-medium">{item.name}</TableCell><TableCell className="break-all font-mono text-xs">{item.path}</TableCell><TableCell>{item.blockers.length ? item.blockers.join("; ") : <Badge variant="success">Можно удалить</Badge>}</TableCell></TableRow>)}</TableBody></Table></div> : <p className="text-sm text-muted-foreground">Архивных тарифов нет.</p>}
          <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={purging || purgePreview.offset === 0} onClick={() => void loadPurgePreview(Math.max(0, purgePreview.offset - purgePreview.limit))}>Предыдущие</Button><Button variant="outline" disabled={purging || purgePreview.nextOffset === null} onClick={() => void loadPurgePreview(purgePreview.nextOffset!)}>Следующие</Button><Button variant="outline" disabled={purging} onClick={() => void loadPurgePreview(purgePreview.offset)}><RefreshCw data-icon="inline-start" />Проверить снова</Button></div>
          {pendingPurge ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Подтвердить необратимую очистку</AlertTitle><AlertDescription><p>Будут физически удалены {purgePreview.items.filter((item) => item.blockers.length === 0).length} тарифов из показанного пакета. Сервер повторно проверит связи; опубликованный сайт не изменится до отдельной публикации.</p><div className="mt-3 flex flex-wrap gap-2"><Button variant="destructive" disabled={purging} onClick={() => void purgeTariffs()}>{purging ? "Удаляем…" : "Удалить безвозвратно"}</Button><Button variant="outline" disabled={purging} onClick={() => setPendingPurge(false)}>Отмена</Button></div></AlertDescription></Alert> : <Button variant="destructive" className="self-start" disabled={purging || !purgePreview.items.some((item) => item.blockers.length === 0)} onClick={() => setPendingPurge(true)}>Очистить доступные в этом пакете</Button>}
        </CardContent></Card> : null}

        {busy ? <div aria-busy="true" className="grid gap-4 md:grid-cols-2"><Skeleton className="h-56 w-full" /><Skeleton className="h-56 w-full" /></div> : null}
        {!busy && selectedSiteId && trash && total === 0 ? <Alert><Trash2 /><AlertTitle>Корзина пуста</AlertTitle><AlertDescription>Архивных городов, страниц, тарифов, редиректов и блоков нет.</AlertDescription></Alert> : null}

        {!busy && trash ? <div className="grid min-w-0 gap-6 xl:grid-cols-2">{trash.groups.map((group) => <Card className="min-w-0" key={group.entityType}><CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle>{group.label}</CardTitle><CardDescription>{group.total.toLocaleString("ru-RU")} в корзине</CardDescription></div><Badge variant="secondary">{entityLabels[group.entityType]}</Badge></div></CardHeader><CardContent className="flex flex-col gap-3">{group.truncated ? <Alert><CircleAlert /><AlertTitle>Показаны первые 100</AlertTitle><AlertDescription>В группе больше записей; восстановите часть и обновите список.</AlertDescription></Alert> : null}{group.items.length ? <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Название</TableHead><TableHead>Контекст</TableHead><TableHead>Архивирован</TableHead><TableHead><span className="sr-only">Действие</span></TableHead></TableRow></TableHeader><TableBody>{group.items.map((item) => <TableRow key={item.id}><TableCell className="font-medium">{item.label}</TableCell><TableCell className="max-w-64 break-words text-muted-foreground">{item.context}</TableCell><TableCell className="whitespace-nowrap">{item.archivedAt ? dateFormatter.format(new Date(item.archivedAt)) : "Смотрите журнал изменений"}</TableCell><TableCell><Button size="sm" variant="outline" disabled={restoring} onClick={() => setPendingRestore({ group, item })}><ArchiveRestore data-icon="inline-start" />Восстановить из корзины</Button></TableCell></TableRow>)}</TableBody></Table></div> : <p className="text-sm text-muted-foreground">Архивных записей этого типа нет.</p>}</CardContent></Card>)}</div> : null}
      </div>
    </AdminShell>
  )
}
