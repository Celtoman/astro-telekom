import { useEffect, useState } from "react"
import { AdminApiError, requestJson } from "../lib/admin-api.mjs"
import { filterVariableDefinitions } from "../lib/variable-insertion.mjs"
import { Alert, AlertDescription } from "./ui/alert"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Field, FieldLabel } from "./ui/field"
import { Input } from "./ui/input"

interface VariableDefinition {
  code: string
  name: string
  example: string
  scope: "SITE" | "CITY" | "TARIFF"
  status: "ACTIVE" | "DEPRECATING"
  allowedFields: string[]
}

export function VariableInsertionPicker({ apiUrl, siteId, field, context, onInsert }: {
  apiUrl: string
  siteId: string
  field: string | null
  context: "SITE" | "CITY" | "TARIFF"
  onInsert: (code: string) => void
}) {
  const [definitions, setDefinitions] = useState<VariableDefinition[]>([])
  const [query, setQuery] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    void requestJson<VariableDefinition[]>(apiUrl, `/admin/sites/${siteId}/variable-catalog/definitions`).then((result) => {
      if (active) setDefinitions(result)
    }).catch((caught: unknown) => {
      if (!active) return
      if (caught instanceof AdminApiError && caught.status === 401) { window.location.replace("/login"); return }
      setError(caught instanceof Error ? caught.message : "Не удалось загрузить коды")
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [apiUrl, siteId, retry])

  const available = field ? filterVariableDefinitions(definitions, field, context, query) as VariableDefinition[] : []

  return <Card><CardHeader><CardTitle>Вставить переменную</CardTitle><CardDescription>Выберите текстовое поле и поставьте курсор. Каталог предложит только активные коды, допустимые для этого типа страницы; сохранение проверит результат на сервере.</CardDescription></CardHeader>
    <CardContent className="space-y-3">
      <p className="text-sm text-muted-foreground">Поле: {field ? field.split(".").at(-1) : "сначала выберите текстовое поле"}</p>
      <Field><FieldLabel htmlFor="variable-insertion-search">Поиск по коду или названию</FieldLabel><Input id="variable-insertion-search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault() }} placeholder="Например, город" /></Field>
      {error ? <Alert><AlertDescription>{error} <Button type="button" variant="outline" size="sm" onClick={() => setRetry((value) => value + 1)}>Повторить</Button></AlertDescription></Alert> : null}
      {loading ? <p className="text-sm text-muted-foreground">Загружаем коды…</p> : null}
      {!loading && !error && field && available.length === 0 ? <p className="text-sm text-muted-foreground">Для этого поля подходящих активных кодов нет.</p> : null}
      {!loading && !error && available.length > 0 ? <ul className="grid gap-2 sm:grid-cols-2">{available.map((definition) => <li key={definition.code} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border p-2 text-sm"><span className="min-w-0"><code className="block font-semibold">{`{${definition.code}}`}</code><span className="text-muted-foreground">{definition.name} · {definition.example}</span></span><Button type="button" variant="outline" size="sm" onMouseDown={(event) => event.preventDefault()} onClick={() => onInsert(definition.code)} aria-label={`Вставить {${definition.code}}`}>Вставить</Button></li>)}</ul> : null}
    </CardContent>
  </Card>
}
