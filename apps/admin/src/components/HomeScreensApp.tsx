import { useUnsavedChanges } from "./useUnsavedChanges"
import { useEffect, useRef, useState } from "react"
import { AdminApiError, requestJson } from "../lib/admin-api.mjs"
import { insertVariableAtSelection } from "../lib/variable-insertion.mjs"
import { editorSiteId } from "../lib/editor-context.mjs"
import { AdminShell } from "./AdminShell"
import { VariableInsertionPicker } from "./VariableInsertionPicker"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "./ui/field"
import { Input } from "./ui/input"

type Kind = "HOME" | "CITY_HOME"
interface Screen { kind: Kind; data: Record<string, any>; missingFields: string[]; published: Record<string, any> | null }
interface Workspace { workingRevision: number; publishedRevision: number; screens: Screen[] }
interface Site { id: string; name: string }
const names: Record<Kind, string> = { HOME: "Первый экран главной", CITY_HOME: "Первый экран города" }
const fields = {
  title: { label: "Заголовок", limit: 120 }, text: { label: "Описание", limit: 1000 },
  image: { label: "Изображение", limit: 2048 }, imageAlt: { label: "Описание изображения", limit: 250 },
  addressPlaceholder: { label: "Подсказка адреса", limit: 120 }, checkButtonText: { label: "Текст кнопки проверки", limit: 80 },
  tariffsCtaText: { label: "Текст перехода к тарифам", limit: 80 },
}
type FieldKey = keyof typeof fields
const clone = (data: Record<string, any>) => JSON.parse(JSON.stringify(data))

export function HomeScreensApp({ apiUrl }: { apiUrl: string }) {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [sites, setSites] = useState<Site[]>([])
  const [siteId, setSiteId] = useState("")
  const [kind, setKind] = useState<Kind>("HOME")
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [data, setData] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [activeField, setActiveField] = useState<"title" | "text" | null>(null)
  const input = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const selected = workspace?.screens.find(screen => screen.kind === kind)
  const dirty = !!selected && JSON.stringify(data) !== JSON.stringify(selected.data)
  const handleError = (caught: unknown) => {
    if (caught instanceof AdminApiError && caught.status === 401) { window.location.replace("/login"); return }
    setError(caught instanceof Error ? caught.message : "Не удалось загрузить данные")
  }

  useEffect(() => {
    let active = true
    Promise.all([requestJson<{ user: { id: string; email: string } }>(apiUrl, "/auth/me"), requestJson<Site[]>(apiUrl, "/admin/sites?summary=true")])
      .then(([session, list]) => {
        if (!active) return
        setUser(session.user); setSites(list)
        setKind(new URLSearchParams(window.location.search).get("kind") === "CITY_HOME" ? "CITY_HOME" : "HOME")
        setSiteId(editorSiteId(list, window.location.search)); setLoading(false)
      }).catch(caught => { if (active) { handleError(caught); setLoading(false) } })
    return () => { active = false }
  }, [apiUrl])
  useEffect(() => {
    if (!siteId) { setWorkspace(null); return }
    let active = true
    setLoading(true); setError(null); setWorkspace(null)
    setActiveField(null); input.current = null
    requestJson<Workspace>(apiUrl, `/admin/sites/${encodeURIComponent(siteId)}/page-templates/first-screens`)
      .then(result => { if (active) { setWorkspace(result); setData(clone(result.screens.find(screen => screen.kind === kind)?.data ?? {})); setMessage(null) } })
      .catch(caught => { if (active) handleError(caught) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [apiUrl, siteId, refresh])
  useUnsavedChanges(dirty)
  function discard() { return !dirty || window.confirm("Отменить несохранённые изменения?") }
  function changeKind(next: Kind) {
    if (!discard()) return
    setKind(next); setData(clone(workspace?.screens.find(screen => screen.kind === next)?.data ?? {}))
    setActiveField(null); input.current = null; setMessage(null); setError(null)
  }
  async function save() {
    if (!workspace || !selected || saving) return
    setSaving(true); setError(null); setMessage(null)
    try {
      const result = await requestJson<Screen & { workingRevision: number }>(apiUrl, `/admin/sites/${encodeURIComponent(siteId)}/page-templates/first-screens/${kind}`, {
        method: "PATCH", body: { expectedWorkingRevision: workspace.workingRevision, data },
      })
      setWorkspace({ ...workspace, workingRevision: result.workingRevision, screens: workspace.screens.map(screen => screen.kind === kind ? { ...screen, ...result } : screen) })
      setData(clone(result.data)); setMessage(result.missingFields.length ? "Черновик сохранён. Заполните обязательные поля перед публикацией." : "Рабочая версия сохранена. Изменения появятся на сайте после публикации.")
    } catch (caught) { handleError(caught) } finally { setSaving(false) }
  }
  function insertCode(code: string) {
    if (saving) return
    const element = input.current
    if (!activeField || !element) return
    const value = String(data[activeField] ?? "")
    const result = insertVariableAtSelection(value, element.selectionStart ?? value.length, element.selectionEnd ?? value.length, code, fields[activeField].limit)
    if (!result) { setError("Переменная не помещается в лимит поля"); return }
    setData({ ...data, [activeField]: result.value })
    requestAnimationFrame(() => { element.focus(); element.setSelectionRange(result.selectionStart, result.selectionEnd) })
  }
  function field(key: FieldKey) {
    const descriptionId = `home-${key}-help`
    const invalid = !String(data[key] ?? "").trim()
    const props = { id: `home-${key}`, value: String(data[key] ?? ""), maxLength: fields[key].limit, disabled: saving, "aria-required": true as const, "aria-invalid": invalid, "aria-describedby": descriptionId,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setData({ ...data, [key]: event.target.value }),
      onFocus: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { if (key === "title" || key === "text") { setActiveField(key); input.current = event.currentTarget } },
    }
    return <Field key={key} data-invalid={invalid}><FieldLabel htmlFor={props.id}>{fields[key].label}</FieldLabel>
      {key === "text" ? <textarea {...props} rows={4} className="w-full rounded-lg border border-input bg-background p-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm" /> : <Input {...props} className="min-h-11" />}
      <FieldDescription id={descriptionId}>{invalid ? "Обязательное поле. Пустое значение можно сохранить в черновике." : key === "image" ? "Локальный путь /images/… или HTTPS URL." : key === "imageAlt" ? "Кратко опишите изображение для доступности." : `${String(data[key] ?? "").length} из ${fields[key].limit} символов`}</FieldDescription>
    </Field>
  }
  if (!user) return <div className="mx-auto flex max-w-xl flex-col gap-4 p-6"><h1 className="text-xl font-semibold">Первые экраны</h1>{loading ? <p role="status">Загружаем…</p> : <Alert variant="destructive"><AlertDescription>{error ?? "Сессия недоступна"}<Button variant="outline" onClick={() => window.location.reload()}>Повторить загрузку</Button></AlertDescription></Alert>}</div>
  return <AdminShell apiUrl={apiUrl} user={user} active="templates"><div className="mx-auto flex max-w-7xl flex-col gap-6 p-4 lg:p-8">
    <div><h1 className="font-heading text-2xl font-semibold">Первые экраны</h1><p className="mt-2 text-sm text-muted-foreground">Изменения сохраняются в рабочую версию. Публикация сайта выполняется отдельно.</p></div>
    <div className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor="home-site">Сайт</FieldLabel><select id="home-site" className="min-h-11 rounded-lg border bg-background px-3 text-sm" value={siteId} disabled={saving} onChange={event => { if (discard()) setSiteId(event.target.value) }}><option value="">Выберите сайт</option>{sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select></Field>
      <Field><FieldLabel htmlFor="home-kind">Первый экран</FieldLabel><select id="home-kind" className="min-h-11 rounded-lg border bg-background px-3 text-sm" value={kind} disabled={saving || loading} onChange={event => changeKind(event.target.value as Kind)}>{Object.entries(names).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></Field></div>
    {error ? <Alert variant="destructive"><AlertTitle>Не удалось выполнить действие</AlertTitle><AlertDescription>{error}<Button variant="outline" disabled={saving || loading} onClick={() => { if (discard()) setRefresh(value => value + 1) }}>Повторить загрузку</Button></AlertDescription></Alert> : null}
    {message ? <p role="status" className="text-sm">{message}</p> : null}
    {loading ? <p role="status">Загружаем контент…</p> : siteId && !selected ? <Alert><AlertDescription>Шаблон не найден. Проверьте применение миграции данных.</AlertDescription></Alert> : null}
    {!loading && selected ? <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
      <Card><CardHeader><div className="flex flex-wrap items-center gap-2"><CardTitle>{names[kind]}</CardTitle><Badge variant={selected.missingFields.length ? "warning" : "success"}>{selected.missingFields.length ? "Не готово" : "Готов к проверке"}</Badge>{dirty ? <Badge variant="warning">Есть несохранённые изменения</Badge> : null}</div><CardDescription>{kind === "CITY_HOME" ? "Один шаблон для всех городов. Название города подставляется автоматически." : "Контент общей главной страницы."}</CardDescription></CardHeader>
        <CardContent><form noValidate onSubmit={event => { event.preventDefault(); void save() }} className="flex flex-col gap-6"><FieldGroup>
          <FieldSet disabled={saving}><FieldLegend>Текст первого экрана</FieldLegend><FieldGroup>{field("title")}{field("text")}</FieldGroup></FieldSet>
          <FieldSet disabled={saving}><FieldLegend>Изображение</FieldLegend><FieldGroup>{field("image")}{field("imageAlt")}</FieldGroup></FieldSet>
          <FieldSet disabled={saving}><FieldLegend>Проверка адреса</FieldLegend><FieldGroup>{field("addressPlaceholder")}{field("checkButtonText")}</FieldGroup></FieldSet>
          {kind === "CITY_HOME" ? field("tariffsCtaText") : <FieldSet disabled={saving}><FieldLegend>Три пояснения под формой</FieldLegend><FieldGroup>{[0, 1, 2].map(index => <Field key={index}><FieldLabel htmlFor={`home-chip-${index}`}>Пояснение {index + 1}</FieldLabel><Input id={`home-chip-${index}`} value={data.chips?.[index] ?? ""} maxLength={80} aria-required="true" className="min-h-11" onChange={event => { const chips = [...(data.chips ?? ["", "", ""])]; chips[index] = event.target.value; setData({ ...data, chips }) }} /></Field>)}</FieldGroup></FieldSet>}
        </FieldGroup><div className="flex flex-wrap gap-3"><Button type="submit" className="min-h-11" disabled={saving || !dirty}>{saving ? "Сохраняем…" : "Сохранить рабочую версию"}</Button><Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={() => { if (discard()) setRefresh(value => value + 1) }}>Обновить данные</Button></div></form></CardContent>
      </Card>
      <aside className="flex min-w-0 flex-col gap-4"><Card><CardHeader><CardTitle>Проверить изменения</CardTitle><CardDescription>Рабочая ревизия {workspace?.workingRevision}. На сайте — {workspace?.publishedRevision}.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><p className="text-sm text-muted-foreground">{kind === "CITY_HOME" ? "Стоимость, скорость и каналы берутся из тарифов города. Переход к тарифам всегда ведёт к #tariffs." : "Порядок и иконки пояснений закреплены в дизайне."} Логика адресной формы общая.</p><Button asChild variant="outline" className="min-h-11"><a href={`/preview?siteId=${encodeURIComponent(siteId)}&path=${kind === "HOME" ? "%2F" : "CITY_HOME"}`} target="_blank" rel="noreferrer">Открыть сохранённую версию</a></Button><Button asChild variant="outline" className="min-h-11"><a href="/templates/passports">Открыть паспорт блока</a></Button><p className="text-xs text-muted-foreground">В предпросмотре формы и переходы отключены. Несохранённые значения туда не попадают.</p></CardContent></Card>
        <details className="rounded-lg border p-4 text-sm"><summary className="cursor-pointer font-medium">Контент опубликованного снимка</summary>{selected.published ? <dl className="mt-4 flex flex-col gap-3">{Object.entries(selected.published).map(([key, value]) => <div key={key}><dt className="text-muted-foreground">{key === "chips" ? "Три пояснения" : fields[key as FieldKey]?.label ?? key}</dt><dd className="break-words">{Array.isArray(value) ? value.join(" · ") : String(value)}</dd></div>)}</dl> : <p className="mt-3 text-muted-foreground">В опубликованном снимке нет контента этого утверждённого паспорта. Рабочие данные не подставляются вместо него.</p>}</details>
        <VariableInsertionPicker apiUrl={apiUrl} siteId={siteId} field={activeField ? `PageTemplateBlock.data.${activeField}` : null} context={kind === "HOME" ? "SITE" : "CITY"} onInsert={insertCode} />
      </aside>
    </div> : null}
  </div></AdminShell>
}
