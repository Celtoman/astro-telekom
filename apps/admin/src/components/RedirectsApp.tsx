import { useCallback, useEffect, useMemo, useState } from "react"
import { Archive, CircleAlert, Pencil, Plus, RefreshCw, RotateCcw, Route } from "lucide-react"
import { AdminApiError, requestJson } from "../lib/admin-api.mjs"
import { AdminShell } from "./AdminShell"
import { FilterResetButton } from "./FilterResetButton"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "./ui/field"
import { Input } from "./ui/input"
import { Skeleton } from "./ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table"

interface Administrator { id: string; email: string }
interface Site { id: string; name: string; slug: string; status: string }
interface RedirectRecord {
  id: string
  siteId: string
  sourcePath: string
  targetPath: string
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED"
  hitCount: number
  lastHitAt: string | null
  updatedAt: string
  site: { id: string; name: string; slug: string }
}
interface WorkspaceData { sites: Site[]; redirects: RedirectRecord[] }

type ScreenState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; user: Administrator; data: WorkspaceData }

const statusVariant = (status: RedirectRecord["status"]) => status === "PUBLISHED" ? "default" as const : status === "ARCHIVED" ? "destructive" as const : "secondary" as const

export function RedirectsApp({ apiUrl }: { apiUrl: string }) {
  const [state, setState] = useState<ScreenState>({ status: "loading" })
  const [search, setSearch] = useState("")
  const [sourcePath, setSourcePath] = useState("")
  const [targetPath, setTargetPath] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingStatus, setEditingStatus] = useState<RedirectRecord["status"]>("PUBLISHED")
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const loadWorkspace = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") setBusy("refresh")
    else setState({ status: "loading" })
    try {
      const session = await requestJson<{ user: Administrator }>(apiUrl, "/auth/me")
      const [sites, redirects] = await Promise.all([
        requestJson<Site[]>(apiUrl, "/admin/sites"),
        requestJson<RedirectRecord[]>(apiUrl, "/admin/redirects"),
      ])
      setState({ status: "ready", user: session.user, data: { sites, redirects } })
    } catch (caught: unknown) {
      if (caught instanceof AdminApiError && caught.status === 401) {
        window.location.replace("/login")
        return
      }
      setState({ status: "error", message: caught instanceof Error ? caught.message : "API недоступен" })
    } finally {
      setBusy(null)
    }
  }, [apiUrl])

  useEffect(() => { void loadWorkspace() }, [loadWorkspace])

  const visibleRedirects = useMemo(() => {
    if (state.status !== "ready") return []
    const query = search.trim().toLocaleLowerCase("ru-RU")
    return state.data.redirects.filter((item) => !query || `${item.sourcePath} ${item.targetPath} ${item.status}`.toLocaleLowerCase("ru-RU").includes(query))
  }, [search, state])

  function resetFilters() {
    setSearch("")
  }

  function resetForm() {
    setSourcePath("")
    setTargetPath("")
    setEditingId(null)
    setEditingStatus("PUBLISHED")
  }

  async function saveRedirect() {
    if (state.status !== "ready" || state.data.sites.length !== 1 || !sourcePath.trim() || !targetPath.trim()) return
    setBusy(editingId || "create")
    setActionError(null)
    try {
      await requestJson(apiUrl, editingId ? `/admin/redirects/${editingId}` : "/admin/redirects", {
        method: editingId ? "PATCH" : "POST",
        body: editingId
          ? { sourcePath, targetPath, status: editingStatus }
          : { siteId: state.data.sites[0].id, sourcePath, targetPath, status: "PUBLISHED" },
      })
      resetForm()
      await loadWorkspace("refresh")
    } catch (caught: unknown) {
      setActionError(caught instanceof Error ? caught.message : "Редирект не сохранен")
    } finally { setBusy(null) }
  }

  async function changeStatus(item: RedirectRecord) {
    setBusy(item.id)
    setActionError(null)
    try {
      if (item.status === "ARCHIVED") {
        await requestJson(apiUrl, `/admin/redirects/${item.id}`, { method: "PATCH", body: { status: "PUBLISHED" } })
      } else {
        await requestJson(apiUrl, `/admin/redirects/${item.id}`, { method: "DELETE" })
      }
      if (editingId === item.id) resetForm()
      await loadWorkspace("refresh")
    } catch (caught: unknown) {
      setActionError(caught instanceof Error ? caught.message : "Статус не изменен")
    } finally { setBusy(null) }
  }

  if (state.status === "loading") return <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 p-8" aria-busy="true"><Skeleton className="h-10 w-72" /><Skeleton className="h-64 w-full" /></main>
  if (state.status === "error") return <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6"><Card className="w-full max-w-lg"><CardHeader><CardTitle>Редиректы недоступны</CardTitle><CardDescription>Не удалось загрузить рабочий экран.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><Alert variant="destructive"><CircleAlert /><AlertTitle>Ошибка API</AlertTitle><AlertDescription>{state.message}</AlertDescription></Alert><Button onClick={() => void loadWorkspace()}>Повторить</Button></CardContent></Card></main>

  const { sites, redirects } = state.data
  const publishedCount = redirects.filter((item) => item.status === "PUBLISHED").length

  return (
    <AdminShell apiUrl={apiUrl} user={state.user} active="redirects">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="font-heading text-2xl font-semibold">Редиректы</h1><p className="mt-1 text-sm text-muted-foreground">Одношаговые HTTP 301, конфликты URL и статистика переходов.</p></div><Button variant="outline" disabled={busy !== null} onClick={() => void loadWorkspace("refresh")}><RefreshCw data-icon="inline-start" />Обновить</Button></div>
        {actionError ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Операция не выполнена</AlertTitle><AlertDescription>{actionError}</AlertDescription></Alert> : null}
        {sites.length !== 1 ? <Alert variant="destructive"><Route /><AlertTitle>Нельзя выбрать сайт однозначно</AlertTitle><AlertDescription>Управление в текущем интерфейсе доступно при ровно одном сайте. Сейчас найдено: {sites.length}.</AlertDescription></Alert> : null}

        <section className="grid gap-4 sm:grid-cols-3" aria-label="Состояние редиректов">
          <Card size="sm"><CardHeader><CardDescription>Всего</CardDescription><CardTitle>{redirects.length}</CardTitle></CardHeader></Card>
          <Card size="sm"><CardHeader><CardDescription>Опубликовано</CardDescription><CardTitle>{publishedCount}</CardTitle></CardHeader></Card>
          <Card size="sm"><CardHeader><CardDescription>Переходов</CardDescription><CardTitle>{redirects.reduce((sum, item) => sum + item.hitCount, 0).toLocaleString("ru-RU")}</CardTitle></CardHeader></Card>
        </section>

        <Card>
          <CardHeader><CardTitle>{editingId ? "Изменить редирект" : "Новый редирект"}</CardTitle><CardDescription>Источник должен быть свободен, а цель — опубликована. Цепочки и петли API не разрешает.</CardDescription></CardHeader>
          <CardContent>
            <FieldGroup>
              <Field data-disabled={sites.length !== 1 || busy !== null}><FieldLabel htmlFor="redirect-source">Старый URL</FieldLabel><Input id="redirect-source" value={sourcePath} onChange={(event) => setSourcePath(event.target.value)} placeholder="/kazan/old-tariff/" disabled={sites.length !== 1 || busy !== null} /><FieldDescription>Внутренний путь без домена.</FieldDescription></Field>
              <Field data-disabled={sites.length !== 1 || busy !== null}><FieldLabel htmlFor="redirect-target">Новый URL</FieldLabel><Input id="redirect-target" value={targetPath} onChange={(event) => setTargetPath(event.target.value)} placeholder="/kazan/new-tariff/" disabled={sites.length !== 1 || busy !== null} /><FieldDescription>Опубликованный URL этого же сайта.</FieldDescription></Field>
              <div className="flex flex-wrap gap-2"><Button disabled={sites.length !== 1 || busy !== null || !sourcePath.trim() || !targetPath.trim()} onClick={() => void saveRedirect()}><Plus data-icon="inline-start" />{editingId ? "Сохранить" : "Создать 301"}</Button>{editingId ? <Button variant="outline" disabled={busy !== null} onClick={resetForm}>Отмена</Button> : null}</div>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Правила</CardTitle><CardDescription>{visibleRedirects.length} из {redirects.length} записей.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <Field><FieldLabel htmlFor="redirect-search" className="sr-only">Поиск редиректа</FieldLabel><Input id="redirect-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Старый URL, новый URL или статус" /></Field>
              <FilterResetButton active={Boolean(search)} onReset={resetFilters} />
            </div>
            {visibleRedirects.length ? <Table><TableHeader><TableRow><TableHead>Источник</TableHead><TableHead>Цель</TableHead><TableHead>Статус</TableHead><TableHead>Переходы</TableHead><TableHead>Последний переход</TableHead><TableHead>Действия</TableHead></TableRow></TableHeader><TableBody>{visibleRedirects.map((item) => <TableRow key={item.id}><TableCell className="font-medium">{item.sourcePath}</TableCell><TableCell>{item.targetPath}</TableCell><TableCell><Badge variant={statusVariant(item.status)}>{item.status}</Badge></TableCell><TableCell>{item.hitCount.toLocaleString("ru-RU")}</TableCell><TableCell>{item.lastHitAt ? new Date(item.lastHitAt).toLocaleString("ru-RU") : "—"}</TableCell><TableCell><div className="flex gap-2"><Button variant="outline" size="sm" disabled={busy !== null} onClick={() => { setEditingId(item.id); setEditingStatus(item.status); setSourcePath(item.sourcePath); setTargetPath(item.targetPath) }}><Pencil data-icon="inline-start" />Изменить</Button><Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void changeStatus(item)}>{item.status === "ARCHIVED" ? <RotateCcw data-icon="inline-start" /> : <Archive data-icon="inline-start" />}{item.status === "ARCHIVED" ? "Вернуть" : "Архив"}</Button></div></TableCell></TableRow>)}</TableBody></Table> : <Alert><Route /><AlertTitle>Редиректов пока нет</AlertTitle><AlertDescription>Создайте первое правило после изменения публичного URL.</AlertDescription></Alert>}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  )
}
