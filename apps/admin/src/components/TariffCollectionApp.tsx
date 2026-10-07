import { usePublicationFieldFocus } from "./usePublicationFieldFocus"
import { useEffect, useRef, useState } from "react"
import { AdminApiError, requestJson } from "../lib/admin-api.mjs"
import { editorSiteId } from "../lib/editor-context.mjs"
import { insertVariableAtSelection } from "../lib/variable-insertion.mjs"
import { AdminShell } from "./AdminShell"
import { useUnsavedChanges } from "./useUnsavedChanges"
import { VariableInsertionPicker } from "./VariableInsertionPicker"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Badge } from "./ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Field, FieldDescription, FieldLabel } from "./ui/field"

interface Content { title: string; text: string; connectButtonText: string; detailsButtonText: string; moreButtonText: string; initialCount: number; sort: string }
interface Workspace { workingRevision: number; publishedRevision: number; data: Content; missingFields: string[]; published: Content | null }
const textFields = [{ key: "title", label: "Заголовок", limit: 120 }, { key: "text", label: "Описание", limit: 1000 }, { key: "connectButtonText", label: "Кнопка подключения", limit: 80 }, { key: "detailsButtonText", label: "Кнопка подробностей", limit: 80 }, { key: "moreButtonText", label: "Кнопка раскрытия", limit: 80 }] as const

export function TariffCollectionApp({ apiUrl }: { apiUrl: string }) {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [sites, setSites] = useState<{ id: string; name: string }[]>([])
  const [siteId, setSiteId] = useState("")
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [data, setData] = useState<Content | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [activeField, setActiveField] = useState<"title" | "text" | null>(null)
  const input = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const publicationFocus = usePublicationFieldFocus(!loading && !!data && !!workspace, siteId, "collection")
  const dirty = !!workspace && JSON.stringify(data) !== JSON.stringify(workspace.data)
  useUnsavedChanges(dirty)
  function handleError(caught: unknown) {
    if (caught instanceof AdminApiError && caught.status === 401) { window.location.replace("/login"); return }
    setError(caught instanceof Error ? caught.message : "Не удалось загрузить блок")
  }
  useEffect(() => {
    let active = true
    Promise.all([requestJson<{ user: { id: string; email: string } }>(apiUrl, "/auth/me"), requestJson<{ id: string; name: string }[]>(apiUrl, "/admin/sites?summary=true")]).then(([session, list]) => {
      if (active) { setUser(session.user); setSites(list); setSiteId(editorSiteId(list, window.location.search)); if (!editorSiteId(list, window.location.search)) setLoading(false) }
    }).catch(caught => { if (active) { handleError(caught); setLoading(false) } })
    return () => { active = false }
  }, [apiUrl])
  useEffect(() => {
    if (!siteId) return
    let active = true
    setLoading(true); setWorkspace(null); setData(null); setError(null); setMessage(null); setActiveField(null); input.current = null
    requestJson<Workspace>(apiUrl, `/admin/sites/${encodeURIComponent(siteId)}/page-templates/tariff-collection`).then(result => { if (active) { setWorkspace(result); setData({ ...result.data }) } }).catch(caught => { if (active) handleError(caught) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [apiUrl, siteId, refresh])
  async function save() {
    if (!workspace || !data || saving) return
    setSaving(true); setError(null); setMessage(null)
    try {
      const result = await requestJson<Pick<Workspace, "data" | "missingFields" | "workingRevision">>(apiUrl, `/admin/sites/${encodeURIComponent(siteId)}/page-templates/tariff-collection`, { method: "PATCH", body: { expectedWorkingRevision: workspace.workingRevision, data } })
      setWorkspace({ ...workspace, ...result }); setData({ ...result.data }); setMessage(result.missingFields.length ? "Черновик сохранён. Заполните обязательные поля перед публикацией." : "Рабочая версия сохранена. Чтобы показать изменения на сайте, опубликуйте её.")
    } catch (caught) { handleError(caught) } finally { setSaving(false) }
  }
  function insertCode(code: string) {
    if (!data || !activeField || !input.current || saving) return
    const element = input.current, value = data[activeField]
    const result = insertVariableAtSelection(value, element.selectionStart ?? value.length, element.selectionEnd ?? value.length, code, activeField === "title" ? 120 : 1000)
    if (!result) { setError("Переменная не помещается в лимит поля"); return }
    setData({ ...data, [activeField]: result.value }); requestAnimationFrame(() => { element.focus(); element.setSelectionRange(result.selectionStart, result.selectionEnd) })
  }
  if (!user) return <div className="p-6" role="status">{error ?? "Загружаем редактор…"}</div>
  return <AdminShell apiUrl={apiUrl} user={user} active="templates"><div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6 lg:p-8">
    <a className="w-fit text-sm font-medium text-primary underline underline-offset-4" href="/templates">← Шаблоны страниц</a>
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="font-heading text-2xl font-semibold">Тарифы города</h1><p className="mt-2 max-w-xl text-sm text-muted-foreground">Общий блок всех городских главных. Карточки берутся из опубликованного каталога каждого города.</p></div>{workspace && <Badge variant="secondary">{workspace.missingFields.length ? "Не готово к публикации" : "Готово к публикации"}</Badge>}</div>
    {sites.length > 1 && <Field><FieldLabel htmlFor="collection-site">Сайт</FieldLabel><select id="collection-site" value={siteId} disabled={saving} className="h-11 rounded-md border bg-background px-3" onChange={event => { if (!dirty || window.confirm("Отменить несохранённые изменения?")) setSiteId(event.target.value) }}><option value="">Выберите сайт</option>{sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select></Field>}
    {publicationFocus.label && <Alert><AlertTitle>Поле из проверки публикации: «{publicationFocus.label}»</AlertTitle><AlertDescription>Проверьте выделенное поле, сохраните исправление и повторите проверку публикации.</AlertDescription></Alert>}
    {error && <Alert variant="destructive"><AlertTitle>Не удалось выполнить действие</AlertTitle><AlertDescription>{error}. Введённые данные сохранены в форме. <Button variant="outline" size="sm" disabled={saving} onClick={() => { if (!dirty || window.confirm("Отменить несохранённые изменения и загрузить актуальную версию?")) setRefresh(value => value + 1) }}>Загрузить актуальную версию</Button></AlertDescription></Alert>}
    {message && <p role="status" className="rounded-lg border bg-muted p-4 text-sm">{message} <a className="font-medium text-primary underline" href="/publication">Публикация сайта</a></p>}
    {loading ? <p role="status">Загружаем блок…</p> : !sites.length ? <p>Нет доступных сайтов.</p> : !siteId ? <p>Выберите сайт для редактирования блока.</p> : data && workspace && <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <form onSubmit={event => { event.preventDefault(); void save() }} className="space-y-6"><Card><CardHeader><CardTitle>Содержание блока</CardTitle><CardDescription>Подписи применяются ко всем карточкам. Назначение кнопок сохраняется.</CardDescription></CardHeader><CardContent className="space-y-5">{textFields.map(field => {
        const props = { id: `collection-${field.key}`, value: data[field.key], maxLength: field.limit, disabled: saving, "aria-required": field.key !== "text", onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setData({ ...data, [field.key]: event.target.value }), onFocus: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { if (field.key === "title" || field.key === "text") { setActiveField(field.key); input.current = event.currentTarget } } }
        return <Field key={field.key} className={publicationFocus.field === field.key ? "rounded-lg bg-muted p-3 ring-2 ring-primary" : undefined}><FieldLabel htmlFor={props.id}>{field.label}{field.key === "text" ? " · необязательно" : ""}</FieldLabel>{field.key === "text" ? <textarea {...props} rows={3} className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary" /> : <Input {...props} />}<FieldDescription>До {field.limit} символов.{field.key === "moreButtonText" ? " Число оставшихся тарифов добавляется автоматически." : ""}</FieldDescription></Field>
      })}</CardContent></Card>
      <Card><CardHeader><CardTitle>Показ карточек</CardTitle></CardHeader><CardContent className="space-y-5"><Field className={publicationFocus.field === "initialCount" ? "rounded-lg bg-muted p-3 ring-2 ring-primary" : undefined}><FieldLabel htmlFor="collection-count">Тарифов до кнопки «Показать ещё»</FieldLabel><Input id="collection-count" type="number" min={1} max={100} step={1} value={data.initialCount} disabled={saving} onChange={event => setData({ ...data, initialCount: Number(event.target.value) })} /><FieldDescription>По умолчанию 6. Один клик открывает все оставшиеся тарифы. Если их меньше, кнопка не появится.</FieldDescription></Field><Field className={publicationFocus.field === "sort" ? "rounded-lg bg-muted p-3 ring-2 ring-primary" : undefined}><FieldLabel htmlFor="collection-sort">Сортировка по цене</FieldLabel><select id="collection-sort" value={data.sort} disabled={saving} className="h-11 w-full rounded-md border bg-background px-3 text-sm" onChange={event => setData({ ...data, sort: event.target.value })}><option value="PRICE_ASC">Сначала дешевле</option><option value="PRICE_DESC">Сначала дороже</option></select><FieldDescription>Сначала закреплённые тарифы, затем остальные. В каждой группе — по текущей ежемесячной цене с учётом акции.</FieldDescription></Field></CardContent></Card>
      <div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={!dirty || saving}>{saving ? "Сохраняем…" : "Сохранить изменения"}</Button><span className="text-sm text-muted-foreground">{dirty ? "Есть несохранённые изменения" : "Рабочая версия сохранена"}</span></div></form>
      <aside className="space-y-5"><Card><CardHeader><CardTitle>После сохранения</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><p>Проверьте рабочую версию в предпросмотре, затем опубликуйте изменения.</p><a className="block font-medium text-primary underline" href={`/preview?siteId=${encodeURIComponent(siteId)}`}>Предпросмотр</a><a className="block font-medium text-primary underline" href="/publication">Публикация сайта</a><p className="text-xs text-muted-foreground">Рабочая ревизия: {workspace.workingRevision}. На сайте: {workspace.publishedRevision}.</p></CardContent></Card><Card><CardHeader><CardTitle>Данные карточек</CardTitle></CardHeader><CardContent className="space-y-3 text-sm text-muted-foreground"><p>Цены, скорость, состав и закрепление меняются в каталоге тарифов или при импорте.</p><a className="font-medium text-primary underline" href="/tariffs">Каталог тарифов</a></CardContent></Card><VariableInsertionPicker apiUrl={apiUrl} siteId={siteId} field={saving ? null : activeField} context="CITY" onInsert={insertCode} />{workspace.published ? <details className="rounded-lg border p-4 text-sm"><summary className="cursor-pointer font-medium">Опубликованные настройки</summary><dl className="mt-3 space-y-2">{textFields.map(field => <div key={field.key}><dt className="text-muted-foreground">{field.label}</dt><dd className="break-words">{workspace.published![field.key] || "—"}</dd></div>)}<div><dt className="text-muted-foreground">Первых карточек</dt><dd>{workspace.published.initialCount}</dd></div><div><dt className="text-muted-foreground">Сортировка</dt><dd>{workspace.published.sort === "PRICE_ASC" ? "Сначала дешевле" : "Сначала дороже"}</dd></div></dl></details> : <p className="text-xs text-muted-foreground">На сайте ещё версия до появления этого редактора. Новые настройки будут зафиксированы при публикации.</p>}</aside>
    </div>}
  </div></AdminShell>
}
