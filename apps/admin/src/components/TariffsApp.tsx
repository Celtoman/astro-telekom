import { useCallback, useEffect, useState } from "react"
import { CircleAlert, FileCheck2, FileUp, RefreshCw } from "lucide-react"
import { AdminApiError, requestJson } from "../lib/admin-api.mjs"
import { AdminShell } from "./AdminShell"
import { ServerPagination } from "./ServerPagination"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Checkbox } from "./ui/checkbox"
import { Input } from "./ui/input"
import { Skeleton } from "./ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table"

interface Administrator { id: string; email: string }
interface Provider { id: string; name: string; slug: string }
interface Tariff { id: string; name: string; slug: string; serviceType: string; standardPrice: string | number | null; promoPrice: string | number | null; city: { name: string; slug: string } }
interface ImportIssue { row: number; level: "error" | "warning"; message: string; key?: string }
interface ImportReport { totalRows: number; validRows: number; errorRows: number; warningRows: number; diff: { created: number; updated: number; deleted: number }; issues: ImportIssue[] }
interface ImportRun { id: string; fileName: string; status: string; totalRows: number; validRows: number; errorRows: number; warningRows: number; createdAt: string }
interface Rebuild { id: string; status: string; triggerEntity: string; requestedRevision: number; publishedRevision: number; updatedAt: string }
interface WorkspaceData { providers: Provider[]; imports: ImportRun[]; rebuilds: Rebuild[] }
interface TariffPage {
  items: Tariff[]
  pageInfo: { limit: number; total: number; hasNextPage: boolean; nextCursor: string | null }
}

type ScreenState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; user: Administrator; data: WorkspaceData }

const money = (value: Tariff["standardPrice"]) => value === null ? "—" : `${Number(value).toLocaleString("ru-RU")} ₽`
const statusVariant = (status: string) => status === "APPLIED" || status === "SUCCEEDED" ? "default" as const : status === "FAILED" ? "destructive" as const : "secondary" as const

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
  const [file, setFile] = useState<File | null>(null)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const [confirmWarnings, setConfirmWarnings] = useState(false)
  const [busy, setBusy] = useState<"validate" | "apply" | "refresh" | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const loadWorkspace = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") setBusy("refresh")
    else setState({ status: "loading" })
    try {
      const session = await requestJson<{ user: Administrator }>(apiUrl, "/auth/me")
      const [providers, imports, rebuilds] = await Promise.all([
        requestJson<Provider[]>(apiUrl, "/admin/providers"),
        requestJson<ImportRun[]>(apiUrl, "/admin/tariffs/imports"),
        requestJson<Rebuild[]>(apiUrl, "/admin/rebuilds"),
      ])
      setState({ status: "ready", user: session.user, data: { providers, imports, rebuilds } })
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(search.trim())
      setCursorStack([""])
    }, 300)
    return () => window.clearTimeout(timer)
  }, [search])

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

  async function validateImport() {
    if (!file || state.status !== "ready") return
    const provider = state.data.providers[0]
    if (!provider) { setActionError("Провайдер не найден"); return }
    setBusy("validate")
    setActionError(null)
    try {
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error("Не удалось прочитать файл"))
        reader.readAsDataURL(file)
      })
      const result = await requestJson<{ run: { id: string }; report: ImportReport }>(apiUrl, "/admin/tariffs/import/validate", {
        method: "POST", body: { providerId: provider.id, fileName: file.name, fileBase64 },
      })
      setReport(result.report)
      setRunId(result.run.id)
      setConfirmWarnings(false)
    } catch (caught: unknown) {
      setActionError(caught instanceof Error ? caught.message : "Валидация не выполнена")
    } finally { setBusy(null) }
  }

  async function applyImport() {
    if (!runId || !report) return
    setBusy("apply")
    setActionError(null)
    try {
      await requestJson(apiUrl, "/admin/tariffs/import/apply", { method: "POST", body: { runId, confirmWarnings } })
      setReport(null)
      setRunId(null)
      setFile(null)
      await loadWorkspace("refresh")
      setListRevision((value) => value + 1)
    } catch (caught: unknown) {
      setActionError(caught instanceof Error ? caught.message : "Импорт не применен")
    } finally { setBusy(null) }
  }

  if (state.status === "loading" || (!tariffPage && listBusy)) return <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 p-8" aria-busy="true"><Skeleton className="h-10 w-72" /><Skeleton className="h-64 w-full" /></main>
  if (state.status === "error" || !tariffPage) {
    const message = state.status === "error" ? state.message : listError || "Каталог тарифов не загружен"
    return <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6"><Card className="w-full max-w-lg"><CardHeader><CardTitle>Тарифы недоступны</CardTitle><CardDescription>Не удалось загрузить рабочий экран.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><Alert variant="destructive"><CircleAlert /><AlertTitle>Ошибка API</AlertTitle><AlertDescription>{message}</AlertDescription></Alert><Button onClick={() => { void loadWorkspace(); setListRevision((value) => value + 1) }}>Повторить</Button></CardContent></Card></main>
  }

  return (
    <AdminShell apiUrl={apiUrl} user={state.user} active="tariffs">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="font-heading text-2xl font-semibold">Тарифы</h1><p className="mt-1 text-sm text-muted-foreground">Каталог, проверка полного XLSX snapshot и состояние пересборки.</p></div><Button variant="outline" disabled={busy !== null || listBusy} onClick={() => { void loadWorkspace("refresh"); setListRevision((value) => value + 1) }}><RefreshCw data-icon="inline-start" />Обновить</Button></div>
        {actionError ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Операция не выполнена</AlertTitle><AlertDescription>{actionError}</AlertDescription></Alert> : null}

        <Card>
          <CardHeader><CardTitle>Импорт полного snapshot</CardTitle><CardDescription>Файл сначала проходит preview. Применение атомарно обновляет весь каталог провайдера.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center"><Input type="file" accept=".xlsx" onChange={(event) => { setFile(event.target.files?.[0] || null); setReport(null); setRunId(null) }} /><Button disabled={!file || busy !== null} onClick={() => void validateImport()}><FileUp data-icon="inline-start" />{busy === "validate" ? "Проверяем…" : "Проверить файл"}</Button></div>
            {report ? <div className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Card size="sm"><CardHeader><CardDescription>Строк</CardDescription><CardTitle>{report.totalRows}</CardTitle></CardHeader></Card><Card size="sm"><CardHeader><CardDescription>Валидно</CardDescription><CardTitle>{report.validRows}</CardTitle></CardHeader></Card><Card size="sm"><CardHeader><CardDescription>Ошибок</CardDescription><CardTitle>{report.errorRows}</CardTitle></CardHeader></Card><Card size="sm"><CardHeader><CardDescription>Предупреждений</CardDescription><CardTitle>{report.warningRows}</CardTitle></CardHeader></Card></div>
              <Alert><FileCheck2 /><AlertTitle>Изменения полного snapshot</AlertTitle><AlertDescription>Создать: {report.diff.created}; обновить: {report.diff.updated}; удалить: {report.diff.deleted}.</AlertDescription></Alert>
              {report.issues.length ? <Table><TableHeader><TableRow><TableHead>Строка</TableHead><TableHead>Уровень</TableHead><TableHead>Сообщение</TableHead></TableRow></TableHeader><TableBody>{report.issues.slice(0, 100).map((issue, index) => <TableRow key={`${issue.row}-${index}`}><TableCell>{issue.row}</TableCell><TableCell><Badge variant={issue.level === "error" ? "destructive" : "secondary"}>{issue.level}</Badge></TableCell><TableCell className="whitespace-normal">{issue.message}</TableCell></TableRow>)}</TableBody></Table> : null}
              {report.warningRows > 0 ? <label className="flex items-center gap-2 text-sm"><Checkbox checked={confirmWarnings} onCheckedChange={(checked) => setConfirmWarnings(checked === true)} />Подтверждаю предупреждения</label> : null}
              <Button disabled={busy !== null || report.errorRows > 0 || (report.warningRows > 0 && !confirmWarnings)} onClick={() => void applyImport()}>{busy === "apply" ? "Применяем…" : "Применить целиком"}</Button>
            </div> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Каталог</CardTitle><CardDescription>{tariffPage.pageInfo.total.toLocaleString("ru-RU")} тарифов соответствует фильтру.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Название, slug или город" aria-label="Поиск тарифа" />
            {listError ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Каталог не обновлен</AlertTitle><AlertDescription>{listError}</AlertDescription></Alert> : null}
            <div aria-busy={listBusy} className="min-w-0 overflow-x-auto">
              {tariffPage.items.length ? <Table><TableHeader><TableRow><TableHead>Тариф</TableHead><TableHead>Город</TableHead><TableHead>Тип</TableHead><TableHead>Цена</TableHead></TableRow></TableHeader><TableBody>{tariffPage.items.map((tariff) => <TableRow key={tariff.id}><TableCell><div className="font-medium">{tariff.name}</div><div className="text-xs text-muted-foreground">{tariff.slug}</div></TableCell><TableCell>{tariff.city.name}</TableCell><TableCell><Badge variant="outline">{tariff.serviceType}</Badge></TableCell><TableCell>{money(tariff.promoPrice ?? tariff.standardPrice)}</TableCell></TableRow>)}</TableBody></Table> : <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center"><p className="font-medium">Тарифы не найдены</p><p className="text-sm text-muted-foreground">Измените поисковый запрос или обновите каталог.</p></div>}
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

        <div className="grid gap-6 xl:grid-cols-2"><Card><CardHeader><CardTitle>Последние импорты</CardTitle><CardDescription>Сохраненные validation reports.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">{state.data.imports.slice(0, 8).map((item) => <div className="flex items-center justify-between gap-3" key={item.id}><div className="min-w-0"><p className="truncate font-medium">{item.fileName}</p><p className="text-xs text-muted-foreground">{item.validRows}/{item.totalRows} строк</p></div><Badge variant={statusVariant(item.status)}>{item.status}</Badge></div>)}</CardContent></Card><Card><CardHeader><CardTitle>Пересборка сайта</CardTitle><CardDescription>Изменения попадут в static web только после SUCCEEDED.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">{state.data.rebuilds.slice(0, 8).map((item) => <div className="flex items-center justify-between gap-3" key={item.id}><div><p className="font-medium">Ревизия {item.requestedRevision}</p><p className="text-xs text-muted-foreground">Опубликована {item.publishedRevision}</p></div><Badge variant={statusVariant(item.status)}>{item.status}</Badge></div>)}</CardContent></Card></div>
      </div>
    </AdminShell>
  )
}
