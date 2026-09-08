import { useCallback, useEffect, useMemo, useState } from "react"
import { Building2, CircleAlert, FileCheck2, FileUp, RefreshCw } from "lucide-react"
import { AdminApiError, requestJson } from "../lib/admin-api.mjs"
import { AdminShell } from "./AdminShell"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Checkbox } from "./ui/checkbox"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "./ui/field"
import { Input } from "./ui/input"
import { Skeleton } from "./ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table"

interface Administrator { id: string; email: string }
interface Site { id: string; name: string; slug: string; status: string }
interface City {
  id: string
  name: string
  slug: string
  status: string
  region: { name: string }
  site: { id: string; name: string; slug: string }
}
interface ImportIssue { row: number; level: "error" | "warning"; message: string; key?: string }
interface ImportCandidate { key: string; existingId?: string; changes?: Record<string, { from: unknown; to: unknown }> }
interface ImportReport {
  totalRows: number
  validRows: number
  errorRows: number
  warningRows: number
  issues: ImportIssue[]
  candidates: ImportCandidate[]
}
interface ImportRun { id: string; fileName: string; status: string; totalRows: number; validRows: number; errorRows: number; warningRows: number; createdAt: string }
interface Rebuild { id: string; status: string; requestedRevision: number; publishedRevision: number; triggerEntity: string; updatedAt: string }
interface WorkspaceData { sites: Site[]; cities: City[]; imports: ImportRun[]; rebuilds: Rebuild[] }

type ScreenState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; user: Administrator; data: WorkspaceData }

const statusVariant = (status: string) => status === "PUBLISHED" || status === "APPLIED" || status === "SUCCEEDED"
  ? "default" as const
  : status === "FAILED" || status === "ARCHIVED"
    ? "destructive" as const
    : "secondary" as const

export function CitiesApp({ apiUrl }: { apiUrl: string }) {
  const [state, setState] = useState<ScreenState>({ status: "loading" })
  const [search, setSearch] = useState("")
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
      const [sites, cities, imports, rebuilds] = await Promise.all([
        requestJson<Site[]>(apiUrl, "/admin/sites"),
        requestJson<City[]>(apiUrl, "/admin/cities"),
        requestJson<ImportRun[]>(apiUrl, "/admin/cities/imports"),
        requestJson<Rebuild[]>(apiUrl, "/admin/rebuilds"),
      ])
      setState({ status: "ready", user: session.user, data: { sites, cities, imports, rebuilds } })
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

  const visibleCities = useMemo(() => {
    if (state.status !== "ready") return []
    const query = search.trim().toLocaleLowerCase("ru-RU")
    return state.data.cities.filter((city) => !query || `${city.name} ${city.slug} ${city.region.name}`.toLocaleLowerCase("ru-RU").includes(query))
  }, [search, state])

  async function validateImport() {
    if (!file || state.status !== "ready") return
    const sites = state.data.sites
    if (sites.length !== 1) {
      setActionError("Импорт доступен только когда у платформы настроен ровно один сайт")
      return
    }
    setBusy("validate")
    setActionError(null)
    try {
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error("Не удалось прочитать файл"))
        reader.readAsDataURL(file)
      })
      const result = await requestJson<{ runId: string; report: ImportReport }>(apiUrl, "/admin/cities/import/validate", {
        method: "POST",
        body: { siteId: sites[0].id, fileName: file.name, fileBase64 },
      })
      setReport(result.report)
      setRunId(result.runId)
      setConfirmWarnings(false)
    } catch (caught: unknown) {
      setActionError(caught instanceof Error ? caught.message : "Валидация не выполнена")
    } finally {
      setBusy(null)
    }
  }

  async function applyImport() {
    if (!runId || !report) return
    setBusy("apply")
    setActionError(null)
    try {
      await requestJson(apiUrl, "/admin/cities/import/apply", {
        method: "POST",
        body: { runId, confirmWarnings },
      })
      setReport(null)
      setRunId(null)
      setFile(null)
      await loadWorkspace("refresh")
    } catch (caught: unknown) {
      setActionError(caught instanceof Error ? caught.message : "Импорт не применен")
    } finally {
      setBusy(null)
    }
  }

  if (state.status === "loading") {
    return <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 p-8" aria-busy="true"><Skeleton className="h-10 w-72" /><Skeleton className="h-64 w-full" /></main>
  }
  if (state.status === "error") {
    return <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6"><Card className="w-full max-w-lg"><CardHeader><CardTitle>Города недоступны</CardTitle><CardDescription>Не удалось загрузить рабочий экран.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><Alert variant="destructive"><CircleAlert /><AlertTitle>Ошибка API</AlertTitle><AlertDescription>{state.message}</AlertDescription></Alert><Button onClick={() => void loadWorkspace()}>Повторить</Button></CardContent></Card></main>
  }

  const { sites, cities, imports, rebuilds } = state.data
  const publishedCount = cities.filter((city) => city.status === "PUBLISHED").length
  const createdCount = report?.candidates.filter((candidate) => !candidate.existingId).length || 0
  const updatedCount = report?.candidates.filter((candidate) => candidate.existingId && candidate.changes).length || 0
  const unchangedCount = report?.candidates.filter((candidate) => candidate.existingId && !candidate.changes).length || 0

  return (
    <AdminShell apiUrl={apiUrl} user={state.user} active="cities">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h1 className="font-heading text-2xl font-semibold">Города</h1><p className="mt-1 text-sm text-muted-foreground">Справочник, проверка XLSX и состояние пересборки.</p></div>
          <Button variant="outline" disabled={busy !== null} onClick={() => void loadWorkspace("refresh")}><RefreshCw data-icon="inline-start" />Обновить</Button>
        </div>

        {actionError ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Операция не выполнена</AlertTitle><AlertDescription>{actionError}</AlertDescription></Alert> : null}
        {sites.length !== 1 ? <Alert variant="destructive"><Building2 /><AlertTitle>Нельзя выбрать сайт импорта однозначно</AlertTitle><AlertDescription>Для безопасного импорта должен быть настроен ровно один сайт. Сейчас найдено: {sites.length}.</AlertDescription></Alert> : null}

        <section className="grid gap-4 sm:grid-cols-3" aria-label="Состояние справочника городов">
          <Card size="sm"><CardHeader><CardDescription>Всего городов</CardDescription><CardTitle>{cities.length.toLocaleString("ru-RU")}</CardTitle></CardHeader></Card>
          <Card size="sm"><CardHeader><CardDescription>Опубликовано</CardDescription><CardTitle>{publishedCount.toLocaleString("ru-RU")}</CardTitle></CardHeader></Card>
          <Card size="sm"><CardHeader><CardDescription>Черновики</CardDescription><CardTitle>{(cities.length - publishedCount).toLocaleString("ru-RU")}</CardTitle></CardHeader></Card>
        </section>

        <Card>
          <CardHeader><CardTitle>Импорт справочника</CardTitle><CardDescription>Файл сначала проходит preview. Новые города и их стандартные страницы создаются в DRAFT.</CardDescription></CardHeader>
          <CardContent>
            <FieldGroup>
              <Field data-disabled={sites.length !== 1 || busy !== null}>
                <FieldLabel htmlFor="cities-file">Файл XLS/XLSX</FieldLabel>
                <Input id="cities-file" type="file" accept=".xls,.xlsx" disabled={sites.length !== 1 || busy !== null} onChange={(event) => { setFile(event.target.files?.[0] || null); setReport(null); setRunId(null) }} />
                <FieldDescription>{sites.length === 1 ? `Сайт: ${sites[0].name}` : "Импорт заблокирован до однозначной настройки сайта."}</FieldDescription>
              </Field>
              <Button disabled={!file || sites.length !== 1 || busy !== null} onClick={() => void validateImport()}><FileUp data-icon="inline-start" />{busy === "validate" ? "Проверяем…" : "Проверить файл"}</Button>
            </FieldGroup>

            {report ? <div className="mt-5 flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Card size="sm"><CardHeader><CardDescription>Строк</CardDescription><CardTitle>{report.totalRows}</CardTitle></CardHeader></Card>
                <Card size="sm"><CardHeader><CardDescription>Создать</CardDescription><CardTitle>{createdCount}</CardTitle></CardHeader></Card>
                <Card size="sm"><CardHeader><CardDescription>Обновить</CardDescription><CardTitle>{updatedCount}</CardTitle></CardHeader></Card>
                <Card size="sm"><CardHeader><CardDescription>Без изменений</CardDescription><CardTitle>{unchangedCount}</CardTitle></CardHeader></Card>
              </div>
              <Alert><FileCheck2 /><AlertTitle>Результат проверки</AlertTitle><AlertDescription>Валидно: {report.validRows}; ошибок: {report.errorRows}; предупреждений: {report.warningRows}.</AlertDescription></Alert>
              {report.issues.length ? <Table><TableHeader><TableRow><TableHead>Строка</TableHead><TableHead>Уровень</TableHead><TableHead>Сообщение</TableHead></TableRow></TableHeader><TableBody>{report.issues.slice(0, 100).map((issue, index) => <TableRow key={`${issue.row}-${index}`}><TableCell>{issue.row}</TableCell><TableCell><Badge variant={issue.level === "error" ? "destructive" : "secondary"}>{issue.level}</Badge></TableCell><TableCell className="whitespace-normal">{issue.message}</TableCell></TableRow>)}</TableBody></Table> : null}
              {report.warningRows > 0 ? <Field orientation="horizontal"><Checkbox id="confirm-city-warnings" checked={confirmWarnings} onCheckedChange={(checked) => setConfirmWarnings(checked === true)} /><FieldLabel htmlFor="confirm-city-warnings">Подтверждаю предупреждения</FieldLabel></Field> : null}
              <Button disabled={busy !== null || report.errorRows > 0 || (report.warningRows > 0 && !confirmWarnings)} onClick={() => void applyImport()}>{busy === "apply" ? "Применяем…" : "Применить импорт"}</Button>
            </div> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Справочник</CardTitle><CardDescription>{visibleCities.length.toLocaleString("ru-RU")} из {cities.length.toLocaleString("ru-RU")} городов.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field><FieldLabel htmlFor="city-search" className="sr-only">Поиск города</FieldLabel><Input id="city-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Город, slug или регион" /></Field>
            <Table><TableHeader><TableRow><TableHead>Город</TableHead><TableHead>Регион</TableHead><TableHead>Сайт</TableHead><TableHead>Статус</TableHead></TableRow></TableHeader><TableBody>{visibleCities.map((city) => <TableRow key={city.id}><TableCell><div className="font-medium">{city.name}</div><div className="text-xs text-muted-foreground">{city.slug}</div></TableCell><TableCell>{city.region.name}</TableCell><TableCell>{city.site.name}</TableCell><TableCell><Badge variant={statusVariant(city.status)}>{city.status}</Badge></TableCell></TableRow>)}</TableBody></Table>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card><CardHeader><CardTitle>Последние импорты</CardTitle><CardDescription>Сохраненные validation reports.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">{imports.length ? imports.slice(0, 8).map((item) => <div className="flex items-center justify-between gap-3" key={item.id}><div className="min-w-0"><p className="truncate font-medium">{item.fileName}</p><p className="text-xs text-muted-foreground">{item.validRows}/{item.totalRows} строк</p></div><Badge variant={statusVariant(item.status)}>{item.status}</Badge></div>) : <p className="text-sm text-muted-foreground">Импортов еще не было.</p>}</CardContent></Card>
          <Card><CardHeader><CardTitle>Пересборка сайта</CardTitle><CardDescription>Изменения попадут в static web только после SUCCEEDED.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">{rebuilds.length ? rebuilds.slice(0, 8).map((item) => <div className="flex items-center justify-between gap-3" key={item.id}><div><p className="font-medium">Ревизия {item.requestedRevision}</p><p className="text-xs text-muted-foreground">Опубликована {item.publishedRevision}</p></div><Badge variant={statusVariant(item.status)}>{item.status}</Badge></div>) : <p className="text-sm text-muted-foreground">Пересборок еще не было.</p>}</CardContent></Card>
        </div>
      </div>
    </AdminShell>
  )
}
