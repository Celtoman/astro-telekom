import { useCallback, useEffect, useRef, useState } from "react"
import { CircleAlert, FileCheck2, FileUp, RefreshCw } from "lucide-react"
import { AdminApiError, requestJson } from "../lib/admin-api.mjs"
import { AdminShell } from "./AdminShell"
import { PublicationStatusCard } from "./PublicationStatusCard"
import { StatusBadge } from "./StatusBadge"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Checkbox } from "./ui/checkbox"
import { Input } from "./ui/input"
import { Skeleton } from "./ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table"

interface Administrator { id: string; email: string }
interface Provider { id: string; name: string; slug: string; sites: Array<{ id: string; name: string; slug: string; status: string }> }
interface ImportIssue { row: number; level: "error" | "warning"; message: string; key?: string }
interface ImportChange { action: "create" | "update" | "archive" | "unchanged"; id: string | null; key: string; citySlug: string; name: string; fields: Array<{ field: string; before: unknown; after: unknown }> }
interface ImportReport { totalRows: number; validRows: number; errorRows: number; warningRows: number; diff: { created: number; updated: number; archived: number; unchanged: number; changes: ImportChange[] }; issues: ImportIssue[] }
interface ImportRun { id: string; providerId: string; fileName: string; status: string; totalRows: number; validRows: number; errorRows: number; warningRows: number; createdAt: string; undoneAt: string | null; canUndo: boolean }
interface WorkspaceData { providers: Provider[]; imports: ImportRun[] }
type ScreenState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; user: Administrator; data: WorkspaceData }

export function TariffImportApp({ apiUrl }: { apiUrl: string }) {
  const [state, setState] = useState<ScreenState>({ status: "loading" })
  const [file, setFile] = useState<File | null>(null)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const [confirmWarnings, setConfirmWarnings] = useState(false)
  const [selectedProviderId, setSelectedProviderId] = useState("")
  const [previewSearch, setPreviewSearch] = useState("")
  const [publicationRefreshKey, setPublicationRefreshKey] = useState(0)
  const [busy, setBusy] = useState<"validate" | "apply" | "refresh" | null>(null)
  const [undoingRunId, setUndoingRunId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const selectionGeneration = useRef(0)
  const fileInput = useRef<HTMLInputElement>(null)

  const loadWorkspace = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") setBusy("refresh")
    else setState({ status: "loading" })
    try {
      const session = await requestJson<{ user: Administrator }>(apiUrl, "/auth/me")
      const [providers, imports] = await Promise.all([
        requestJson<Provider[]>(apiUrl, "/admin/providers"),
        requestJson<ImportRun[]>(apiUrl, "/admin/tariffs/imports"),
      ])
      setSelectedProviderId((current) => providers.some((provider) => provider.id === current)
        ? current
        : providers.length === 1 ? providers[0].id : "")
      setState({ status: "ready", user: session.user, data: { providers, imports } })
    } catch (caught: unknown) {
      if (caught instanceof AdminApiError && caught.status === 401) { window.location.replace("/login"); return }
      setState({ status: "error", message: caught instanceof Error ? caught.message : "API недоступен" })
    } finally { setBusy(null) }
  }, [apiUrl])

  useEffect(() => { void loadWorkspace() }, [loadWorkspace])

  async function validateImport() {
    if (!file || state.status !== "ready") return
    const provider = state.data.providers.find((item) => item.id === selectedProviderId)
    if (!provider) { setActionError("Выберите провайдера для полного импорта"); return }
    const generation = selectionGeneration.current
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
      const result = await requestJson<{ run: { id: string }; report: ImportReport }>(apiUrl, "/admin/tariffs/import/validate", {
        method: "POST", body: { providerId: provider.id, fileName: file.name, fileBase64 },
      })
      if (selectionGeneration.current !== generation) return
      setReport(result.report)
      setRunId(result.run.id)
      setConfirmWarnings(false)
      setPreviewSearch("")
    } catch (caught: unknown) {
      setActionError(caught instanceof Error ? caught.message : "Валидация не выполнена")
    } finally { setBusy(null) }
  }

  async function applyImport() {
    if (!runId || !report) return
    setBusy("apply")
    setActionError(null)
    setActionMessage(null)
    try {
      await requestJson(apiUrl, "/admin/tariffs/import/apply", { method: "POST", body: { runId, confirmWarnings } })
      setReport(null)
      setRunId(null)
      setFile(null)
      if (fileInput.current) fileInput.current.value = ""
      setPublicationRefreshKey((current) => current + 1)
      await loadWorkspace("refresh")
    } catch (caught: unknown) {
      setActionError(caught instanceof Error ? caught.message : "Импорт не применен")
    } finally { setBusy(null) }
  }

  async function undoImport(item: ImportRun) {
    if (!item.canUndo || !window.confirm(`Отменить импорт «${item.fileName}»? Отмена сработает только если затронутые данные не менялись позже.`)) return
    setUndoingRunId(item.id)
    setActionError(null)
    setActionMessage(null)
    try {
      const result = await requestJson<{ workingRevisions: Array<{ siteId: string; workingRevision: number }> }>(apiUrl, `/admin/tariffs/imports/${item.id}/undo`, {
        method: "POST",
        body: { confirm: true },
      })
      setSelectedProviderId(item.providerId)
      setPublicationRefreshKey((current) => current + 1)
      setActionMessage(`Импорт отменен. Создана рабочая версия ${result.workingRevisions.map((revision) => revision.workingRevision).join(", ") || "без изменений"}; опубликуйте ее отдельно.`)
      await loadWorkspace("refresh")
    } catch (caught: unknown) {
      setActionError(caught instanceof Error ? caught.message : "Импорт не отменен")
    } finally {
      setUndoingRunId(null)
    }
  }

  if (state.status === "loading") return <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 p-8" aria-busy="true"><Skeleton className="h-10 w-72" /><Skeleton className="h-96 w-full" /></main>
  if (state.status === "error") return <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6"><Card className="w-full max-w-lg"><CardHeader><CardTitle>Импорт тарифов недоступен</CardTitle></CardHeader><CardContent className="flex flex-col gap-4"><Alert variant="destructive"><CircleAlert /><AlertTitle>Ошибка API</AlertTitle><AlertDescription>{state.message}</AlertDescription></Alert><Button onClick={() => void loadWorkspace()}>Повторить</Button></CardContent></Card></main>
  const selectedProvider = state.data.providers.find((provider) => provider.id === selectedProviderId)
  const visibleChanges = report?.diff.changes.filter((change) => {
    const query = previewSearch.trim().toLowerCase()
    return !query || `${change.citySlug} ${change.name} ${change.key} ${change.action}`.toLowerCase().includes(query)
  }) ?? []

  return <AdminShell apiUrl={apiUrl} user={state.user} active="tariffs-import">
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="font-heading text-2xl font-semibold">Импорт тарифов</h1><p className="mt-1 text-sm text-muted-foreground">Проверка и атомарное применение полного снимка XLSX.</p></div><Button variant="outline" disabled={busy !== null} onClick={() => void loadWorkspace("refresh")}><RefreshCw data-icon="inline-start" />Обновить</Button></div>
      {actionError ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Операция не выполнена</AlertTitle><AlertDescription>{actionError}</AlertDescription></Alert> : null}
      {actionMessage ? <Alert><FileCheck2 /><AlertTitle>Рабочая версия обновлена</AlertTitle><AlertDescription>{actionMessage}</AlertDescription></Alert> : null}
      <Card>
        <CardHeader><CardTitle>Новый импорт</CardTitle><CardDescription>Файл сначала проходит предварительную проверку. При применении он атомарно обновляет каталог, а отсутствующие тарифы архивирует.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <label className="flex max-w-md flex-col gap-2 text-sm font-medium" htmlFor="tariff-provider">Провайдер<select id="tariff-provider" className="h-9 rounded-lg border border-input bg-background px-3 font-normal" value={selectedProviderId} disabled={busy !== null} onChange={(event) => { selectionGeneration.current += 1; setSelectedProviderId(event.target.value); setFile(null); if (fileInput.current) fileInput.current.value = ""; setReport(null); setRunId(null); setPreviewSearch("") }}><option value="">Выберите провайдера</option>{state.data.providers.map((provider) => <option value={provider.id} key={provider.id}>{provider.name}</option>)}</select></label>
          {state.data.providers.length > 1 ? <Alert><CircleAlert /><AlertTitle>Проверьте провайдера</AlertTitle><AlertDescription>Полный импорт архивирует отсутствующие в файле тарифы только выбранного провайдера.</AlertDescription></Alert> : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center"><Input ref={fileInput} type="file" accept=".xlsx" disabled={!selectedProviderId || busy !== null} onChange={(event) => { selectionGeneration.current += 1; setFile(event.target.files?.[0] || null); setReport(null); setRunId(null); setPreviewSearch("") }} /><Button disabled={!file || !selectedProviderId || busy !== null} onClick={() => void validateImport()}><FileUp data-icon="inline-start" />{busy === "validate" ? "Проверяем…" : "Проверить файл"}</Button></div>
          {report ? <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["Строк", report.totalRows], ["Валидно", report.validRows], ["Ошибок", report.errorRows], ["Предупреждений", report.warningRows]].map(([label, value]) => <Card size="sm" key={label}><CardHeader><CardDescription>{label}</CardDescription><CardTitle>{value}</CardTitle></CardHeader></Card>)}</div>
            <Alert><FileCheck2 /><AlertTitle>Изменения полного снимка</AlertTitle><AlertDescription>Создать: {report.diff.created}; обновить: {report.diff.updated}; архивировать: {report.diff.archived}; без изменений: {report.diff.unchanged}.</AlertDescription></Alert>
            <div className="flex flex-col gap-2"><Input value={previewSearch} onChange={(event) => setPreviewSearch(event.target.value)} placeholder="Найти тариф в предпросмотре" aria-label="Поиск по изменениям импорта" /><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Действие</TableHead><TableHead>Город</TableHead><TableHead>Тариф</TableHead><TableHead>Поля</TableHead></TableRow></TableHeader><TableBody>{visibleChanges.slice(0, 250).map((change) => <TableRow key={`${change.action}-${change.id ?? change.key}`}><TableCell>{({ create: "Создать", update: "Обновить", archive: "Архивировать", unchanged: "Без изменений" } as const)[change.action]}</TableCell><TableCell>{change.citySlug || "—"}</TableCell><TableCell>{change.name}</TableCell><TableCell className="whitespace-normal">{change.fields.length ? change.fields.map((field) => field.field).join(", ") : "—"}</TableCell></TableRow>)}{visibleChanges.length === 0 ? <TableRow><TableCell colSpan={4} className="text-muted-foreground">Ничего не найдено.</TableCell></TableRow> : null}</TableBody></Table></div>{visibleChanges.length > 250 ? <p className="text-xs text-muted-foreground">Показаны первые 250 из {visibleChanges.length} строк. Уточните поиск.</p> : null}</div>
            {report.issues.length ? <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Строка</TableHead><TableHead>Уровень</TableHead><TableHead>Сообщение</TableHead></TableRow></TableHeader><TableBody>{report.issues.slice(0, 100).map((issue, index) => <TableRow key={`${issue.row}-${index}`}><TableCell>{issue.row}</TableCell><TableCell><StatusBadge kind="importIssueLevel" value={issue.level} /></TableCell><TableCell className="whitespace-normal">{issue.message}</TableCell></TableRow>)}</TableBody></Table></div> : null}
            {report.warningRows > 0 ? <label className="flex items-center gap-2 text-sm"><Checkbox checked={confirmWarnings} onCheckedChange={(checked) => setConfirmWarnings(checked === true)} />Подтверждаю предупреждения</label> : null}
            <Button disabled={busy !== null || report.errorRows > 0 || (report.warningRows > 0 && !confirmWarnings)} onClick={() => void applyImport()}>{busy === "apply" ? "Применяем…" : "Применить целиком"}</Button>
          </div> : null}
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle>Последние импорты</CardTitle><CardDescription>Сохраненные отчеты проверки. Состояние «Применено» означает, что данные сохранены в рабочей версии, но еще не обязательно опубликованы.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">{state.data.imports.length ? state.data.imports.slice(0, 12).map((item) => <div className="flex flex-wrap items-center justify-between gap-3" key={item.id}><div className="min-w-0 flex-1"><p className="truncate font-medium">{item.fileName}</p><p className="text-xs text-muted-foreground">{item.validRows}/{item.totalRows} строк</p></div><StatusBadge kind="importStatus" value={item.status} />{item.canUndo ? <Button type="button" size="sm" variant="outline" disabled={undoingRunId !== null} onClick={() => void undoImport(item)}>{undoingRunId === item.id ? "Отменяем…" : "Отменить импорт"}</Button> : null}</div>) : <p className="text-sm text-muted-foreground">Импортов еще не было.</p>}</CardContent></Card>
      {selectedProvider?.sites.map((site) => <div className="flex flex-col gap-2" key={site.id}>{selectedProvider.sites.length > 1 ? <p className="text-sm font-medium">Сайт: {site.name}</p> : null}<PublicationStatusCard apiUrl={apiUrl} siteId={site.id} publicationRefreshKey={publicationRefreshKey} /></div>)}
    </div>
  </AdminShell>
}
