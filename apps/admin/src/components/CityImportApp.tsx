import { useCallback, useEffect, useState } from "react"
import { ArrowLeft, Building2, CircleAlert, FileCheck2, FileUp, RefreshCw } from "lucide-react"
import { AdminApiError, requestJson, requestSession } from "../lib/admin-api.mjs"
import { AdminShell } from "./AdminShell"
import { PublicationStatusCard } from "./PublicationStatusCard"
import { StatusBadge } from "./StatusBadge"
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
interface ImportIssue { row: number; level: "error" | "warning"; message: string; key?: string }
type ImportAction = "create" | "update" | "skip"
interface ImportCandidate {
  key: string
  row: number
  subject: string
  name: string
  slug: string
  existingId?: string
  changes?: Record<string, { from: unknown; to: unknown }>
}
interface ImportReport {
  totalRows: number
  validRows: number
  errorRows: number
  warningRows: number
  issues: ImportIssue[]
  candidates: ImportCandidate[]
}
interface ImportRun { id: string; fileName: string; status: string; totalRows: number; validRows: number; errorRows: number; warningRows: number; createdAt: string; canUndo: boolean }
interface WorkspaceData { sites: Site[]; imports: ImportRun[] }

type ScreenState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; user: Administrator; data: WorkspaceData }

const changeLabels: Record<string, string> = {
  subject: "Регион",
  name: "Название",
  nameInstrumental: "Именительный падеж",
  namePrepositional: "Предложный падеж",
  nameGenitive: "Родительный падеж",
  legacyUrl: "Legacy URL",
  officeAddress: "Адрес офиса",
  officeHours: "Режим работы",
}

const displayValue = (value: unknown) => value === null || value === undefined || value === "" ? "—" : String(value)

export function CityImportApp({ apiUrl }: { apiUrl: string }) {
  const [state, setState] = useState<ScreenState>({ status: "loading" })
  const [file, setFile] = useState<File | null>(null)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const [actions, setActions] = useState<Record<string, ImportAction | "">>({})
  const [confirmWarnings, setConfirmWarnings] = useState(false)
  const [busy, setBusy] = useState<"validate" | "apply" | "refresh" | "undo" | null>(null)
  const [undoingRunId, setUndoingRunId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  const loadWorkspace = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") setBusy("refresh")
    else setState({ status: "loading" })
    try {
      const session = await requestSession<{ user: Administrator }>(apiUrl)
      const [sites, imports] = await Promise.all([
        requestJson<Site[]>(apiUrl, "/admin/sites?summary=true"),
        requestJson<ImportRun[]>(apiUrl, "/admin/cities/imports"),
      ])
      setState({ status: "ready", user: session.user, data: { sites, imports } })
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

  async function validateImport() {
    if (!file || state.status !== "ready") return
    const sites = state.data.sites
    if (sites.length !== 1) {
      setActionError("Импорт доступен только когда у платформы настроен ровно один сайт")
      return
    }
    setBusy("validate")
    setActionError(null)
    setActionMessage(null)
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
      setActions(Object.fromEntries(result.report.candidates.map((candidate) => [candidate.key, ""])))
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
    setActionMessage(null)
    try {
      const result = await requestJson<{ workingRevision?: number }>(apiUrl, "/admin/cities/import/apply", {
        method: "POST",
        body: { runId, actions, confirmWarnings },
      })
      setReport(null)
      setRunId(null)
      setActions({})
      setFile(null)
      setActionMessage(result.workingRevision
        ? `Рабочая версия ${result.workingRevision} сохранена. Опубликуйте ее отдельно.`
        : "Импорт применен без изменений; публиковать нечего.")
      await loadWorkspace("refresh")
    } catch (caught: unknown) {
      setActionError(caught instanceof Error ? caught.message : "Импорт не применен")
    } finally {
      setBusy(null)
    }
  }

  async function undoImport(item: ImportRun) {
    if (!item.canUndo || !window.confirm(`Отменить импорт «${item.fileName}»? Отмена сработает только если города, созданные страницы и регионы не менялись позже и у новых городов нет зависимых данных.`)) return
    setBusy("undo")
    setUndoingRunId(item.id)
    setActionError(null)
    setActionMessage(null)
    try {
      const result = await requestJson<{ workingRevision: number }>(apiUrl, `/admin/cities/imports/${item.id}/undo`, {
        method: "POST",
        body: { confirm: true },
      })
      setActionMessage(`Импорт отменен. Рабочая версия ${result.workingRevision} сохранена; опубликуйте ее отдельно.`)
      await loadWorkspace("refresh")
    } catch (caught: unknown) {
      setActionError(caught instanceof Error ? caught.message : "Импорт не отменен")
    } finally {
      setUndoingRunId(null)
      setBusy(null)
    }
  }

  if (state.status === "loading") {
    return <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 p-8" aria-busy="true"><Skeleton className="h-10 w-72" /><Skeleton className="h-64 w-full" /></div>
  }
  if (state.status === "error") {
    return <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6"><Card className="w-full max-w-lg"><CardHeader><CardTitle>Импорт городов недоступен</CardTitle><CardDescription>Не удалось загрузить рабочий экран.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><Alert variant="destructive"><CircleAlert /><AlertTitle>Ошибка API</AlertTitle><AlertDescription>{state.message}</AlertDescription></Alert><Button onClick={() => void loadWorkspace()}>Повторить</Button></CardContent></Card></div>
  }

  const { sites, imports } = state.data
  const createdCount = report?.candidates.filter((candidate) => !candidate.existingId).length || 0
  const updatedCount = report?.candidates.filter((candidate) => candidate.existingId && candidate.changes).length || 0
  const unchangedCount = report?.candidates.filter((candidate) => candidate.existingId && !candidate.changes).length || 0
  const unresolvedActionCount = report?.candidates.filter((candidate) => !actions[candidate.key]).length || 0
  const selectedCounts = report?.candidates.reduce((counts, candidate) => {
    const action = actions[candidate.key]
    if (action) counts[action] += 1
    return counts
  }, { create: 0, update: 0, skip: 0 } as Record<ImportAction, number>) || { create: 0, update: 0, skip: 0 }

  return (
    <AdminShell apiUrl={apiUrl} user={state.user} active="cities-import">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><Button variant="ghost" size="sm" asChild className="mb-2 -ml-3"><a href="/cities"><ArrowLeft data-icon="inline-start" />К городам</a></Button><h1 className="font-heading text-2xl font-semibold">Импорт городов</h1><p className="mt-1 text-sm text-muted-foreground">Проверка XLSX, решения по строкам и контроль публикации.</p></div>
          <Button variant="outline" disabled={busy !== null} onClick={() => void loadWorkspace("refresh")}><RefreshCw data-icon="inline-start" />Обновить</Button>
        </div>

        {actionError ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Операция не выполнена</AlertTitle><AlertDescription>{actionError}</AlertDescription></Alert> : null}
        {actionMessage ? <Alert><FileCheck2 /><AlertTitle>Рабочая версия обновлена</AlertTitle><AlertDescription>{actionMessage}</AlertDescription></Alert> : null}
        {sites.length !== 1 ? <Alert variant="destructive"><Building2 /><AlertTitle>Нельзя выбрать сайт импорта однозначно</AlertTitle><AlertDescription>Для безопасного импорта должен быть настроен ровно один сайт. Сейчас найдено: {sites.length}.</AlertDescription></Alert> : null}

        <Card>
          <CardHeader><CardTitle>Новый импорт</CardTitle><CardDescription>Файл сначала проходит предварительную проверку. Применение сохраняет рабочую версию городов и их главных страниц; на сайте она появится только после отдельной успешной публикации.</CardDescription></CardHeader>
          <CardContent>
            <FieldGroup>
              <Field data-disabled={sites.length !== 1 || busy !== null}>
                <FieldLabel htmlFor="cities-file">Файл XLSX</FieldLabel>
                <Input id="cities-file" type="file" accept=".xlsx" disabled={sites.length !== 1 || busy !== null} onChange={(event) => { setFile(event.target.files?.[0] || null); setReport(null); setRunId(null); setActions({}) }} />
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
              {report.issues.length ? <Table><TableHeader><TableRow><TableHead>Строка</TableHead><TableHead>Уровень</TableHead><TableHead>Сообщение</TableHead></TableRow></TableHeader><TableBody>{report.issues.slice(0, 100).map((issue, index) => <TableRow key={`${issue.row}-${index}`}><TableCell>{issue.row}</TableCell><TableCell><StatusBadge kind="importIssueLevel" value={issue.level} /></TableCell><TableCell className="whitespace-normal">{issue.message}</TableCell></TableRow>)}</TableBody></Table> : null}
              <div className="flex flex-col gap-3">
                <div><h2 className="font-heading font-semibold">Решения по строкам</h2><p className="text-sm text-muted-foreground">Выбрано: создать {selectedCounts.create}, обновить {selectedCounts.update}, пропустить {selectedCounts.skip}. Без решения: {unresolvedActionCount}.</p></div>
                <div className="min-w-0 overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>Строка</TableHead><TableHead>Город</TableHead><TableHead>Состояние и изменения</TableHead><TableHead>Действие</TableHead></TableRow></TableHeader>
                    <TableBody>{report.candidates.map((candidate) => {
                      const changes = Object.entries(candidate.changes || {})
                      return <TableRow key={candidate.key}>
                        <TableCell>{candidate.row}</TableCell>
                        <TableCell><div className="font-medium">{candidate.name}</div><div className="text-xs text-muted-foreground">{candidate.subject} · {candidate.slug}</div></TableCell>
                        <TableCell className="min-w-72 whitespace-normal">{!candidate.existingId ? <Badge>Новый</Badge> : changes.length ? <div className="flex flex-col gap-1">{changes.map(([field, change]) => <p className="text-xs" key={field}><span className="font-medium">{changeLabels[field] || field}:</span> <span className="text-muted-foreground">{displayValue(change.from)}</span> → {displayValue(change.to)}</p>)}</div> : <Badge variant="secondary">Без изменений</Badge>}</TableCell>
                        <TableCell><select className="h-9 min-w-36 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50" value={actions[candidate.key] || ""} disabled={busy !== null || report.errorRows > 0} aria-label={`Действие для строки ${candidate.row}: ${candidate.name}`} onChange={(event) => setActions((current) => ({ ...current, [candidate.key]: event.target.value as ImportAction | "" }))}><option value="">Выберите действие</option>{candidate.existingId ? <option value="update">Обновить</option> : <option value="create">Создать</option>}<option value="skip">Пропустить</option></select></TableCell>
                      </TableRow>
                    })}</TableBody>
                  </Table>
                </div>
              </div>
              {report.warningRows > 0 ? <Field orientation="horizontal"><Checkbox checked={confirmWarnings} onCheckedChange={setConfirmWarnings}>Подтверждаю предупреждения</Checkbox></Field> : null}
              <Button disabled={busy !== null || report.errorRows > 0 || unresolvedActionCount > 0 || (report.warningRows > 0 && !confirmWarnings)} onClick={() => void applyImport()}>{busy === "apply" ? "Применяем…" : "Применить выбранные действия"}</Button>
            </div> : null}
          </CardContent>
        </Card>

        <Card><CardHeader><CardTitle>Последние импорты</CardTitle><CardDescription>Сохраненные отчеты проверки. Состояние «Применено» означает рабочую версию, а не публикацию на сайте. Безопасная отмена тоже создаёт новую рабочую версию.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">{imports.length ? imports.slice(0, 8).map((item) => <div className="flex flex-wrap items-center justify-between gap-3" key={item.id}><div className="min-w-0 flex-1"><p className="truncate font-medium">{item.fileName}</p><p className="text-xs text-muted-foreground">{item.validRows}/{item.totalRows} строк</p></div><StatusBadge kind="importStatus" value={item.status} />{item.canUndo ? <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void undoImport(item)}>{undoingRunId === item.id ? "Отменяем…" : "Отменить импорт"}</Button> : null}</div>) : <p className="text-sm text-muted-foreground">Импортов еще не было.</p>}</CardContent></Card>
        {sites.length === 1 ? <PublicationStatusCard apiUrl={apiUrl} siteId={sites[0].id} /> : null}
      </div>
    </AdminShell>
  )
}
