import { useEffect, useState } from "react"
import { Download, FileCheck2, LoaderCircle } from "lucide-react"
import { requestJson } from "../lib/admin-api.mjs"
import type { PublicationState } from "../lib/publication-display.mjs"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Button } from "./ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table"

type ValidationSummary = NonNullable<PublicationState["latestValidation"]>
type ValidationIssue = { severity: "BLOCKING" | "WARNING"; code: string; path: string; message: string; relatedPath?: string }
type ValidationDetail = {
  id: string
  sourceSnapshot: unknown
  report: {
    appVersion: string
    validatedAt: string
    requestedById: string | null
    siteRevision: number
    checkedUrlCount: number
    checkedPaths: string[]
    issues: ValidationIssue[]
    outcome: ValidationSummary["outcome"]
  }
}

const outcomeLabel = {
  BLOCKED: "Публикация заблокирована",
  PASSED_WITH_WARNINGS: "Проверка пройдена с предупреждениями",
  PASSED: "Проверка пройдена",
} as const

export function PublicationValidationPanel({ apiUrl, siteId, validation }: { apiUrl: string; siteId: string; validation: ValidationSummary | null }) {
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<ValidationDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visibleIssues, setVisibleIssues] = useState(100)

  useEffect(() => {
    setDetail(null)
    setError(null)
    setVisibleIssues(100)
  }, [siteId, validation?.id])

  useEffect(() => {
    if (!open || !validation || detail?.id === validation.id) return
    let active = true
    setLoading(true)
    void requestJson<ValidationDetail>(apiUrl, `/admin/sites/${encodeURIComponent(siteId)}/publication-validations/${encodeURIComponent(validation.id)}`)
      .then((result) => { if (active) { setDetail(result); setError(null) } })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : "Отчет недоступен") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [apiUrl, siteId, validation?.id, open, detail?.id])

  if (!validation) return null

  function download() {
    if (!detail) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(detail, null, 2)], { type: "application/json" }))
    const link = document.createElement("a")
    link.href = url
    link.download = `publication-validation-${detail.id}.json`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return <section className="rounded-lg border p-4" aria-label="Отчет проверки публикации">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-sm font-medium">{outcomeLabel[validation.outcome]} · версия {validation.siteRevision}</p>
        <p className="text-sm text-muted-foreground">Проверено URL: {validation.checkedUrlCount}. Приложение {validation.appVersion}. {new Date(validation.validatedAt).toLocaleString("ru-RU")}.</p>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <FileCheck2 data-icon="inline-start" />{open ? "Скрыть отчет" : "Открыть отчет"}
      </Button>
    </div>
    {open && <div className="mt-4 flex flex-col gap-3">
      {loading ? <p className="flex items-center gap-2 text-sm" role="status"><LoaderCircle className="size-4 animate-spin" />Загружаем отчет…</p> : null}
      {error ? <Alert variant="destructive"><AlertTitle>Отчет недоступен</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {detail ? <>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p>Автор: {detail.report.requestedById || "системный запуск"}. Ошибок: {detail.report.issues.filter((issue) => issue.severity === "BLOCKING").length}; предупреждений: {detail.report.issues.filter((issue) => issue.severity === "WARNING").length}.</p>
          <Button type="button" size="sm" variant="outline" onClick={download}><Download data-icon="inline-start" />Скачать полный JSON</Button>
        </div>
        {detail.report.issues.length ? <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Уровень</TableHead><TableHead>Код</TableHead><TableHead>URL</TableHead><TableHead>Причина</TableHead></TableRow></TableHeader><TableBody>
          {detail.report.issues.slice(0, visibleIssues).map((issue, index) => <TableRow key={`${issue.path}-${issue.code}-${index}`}><TableCell>{issue.severity === "BLOCKING" ? "Блокирует" : "Предупреждение"}</TableCell><TableCell>{issue.code}</TableCell><TableCell className="break-all">{issue.path}</TableCell><TableCell className="whitespace-normal">{issue.message}{issue.relatedPath ? ` · связано с ${issue.relatedPath}` : ""}</TableCell></TableRow>)}
        </TableBody></Table></div> : <p className="text-sm text-muted-foreground">Ошибок и предупреждений нет.</p>}
        {detail.report.issues.length > visibleIssues ? <Button type="button" size="sm" variant="outline" onClick={() => setVisibleIssues((count) => count + 100)}>Показать еще 100</Button> : null}
        <details className="text-sm"><summary className="cursor-pointer">Проверенные URL ({detail.report.checkedPaths.length})</summary><div className="mt-2 max-h-64 overflow-y-auto rounded-md border p-2">{detail.report.checkedPaths.map((path) => <p className="break-all" key={path}>{path}</p>)}</div></details>
      </> : null}
    </div>}
  </section>
}
