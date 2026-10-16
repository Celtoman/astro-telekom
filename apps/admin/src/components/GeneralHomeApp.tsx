import { useEffect, useRef, useState } from "react"
import type { GeneralHomeFieldRule } from "../../../api/src/general-home-model"
import { editRedTitle, parseRedTitle } from "../../../api/src/home-hero-model"
import { generalHomeSections, generalHomeEditorSchemas, generalHomeFieldId, generalHomeFieldRule, generalHomeFieldLabel, updateHomeField, moveFaqItem } from "../lib/general-home-editor.mjs"
import { AdminApiError, requestJson, requestSession, peekNavigationJson } from "../lib/admin-api.mjs"
import { editorSiteId } from "../lib/editor-context.mjs"
import { insertVariableAtSelection } from "../lib/variable-insertion.mjs"
import { useUnsavedChanges } from "./useUnsavedChanges"
import { AdminShell } from "./AdminShell"
import { VariableInsertionPicker } from "./VariableInsertionPicker"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "./ui/field"
import { Input } from "./ui/input"

interface Site { id: string; name: string }
interface Block { id: string; blockType: keyof typeof generalHomeEditorSchemas; data: Record<string, any> }
interface Location { block: string; field: string }
interface Workspace {
  version: string; workingRevision: number; publishedRevision: number; blocks: Block[]; missingFields: Location[];
  published: { blocks: Block[] } | null;
  system: { connectionPhone: string | null; supportPhone: string | null; connectionHours: string; callbackWithinMinutes: number };
}
const leafValue = (value: any, path: string) => path.split('.').reduce((current, key) => current?.[key], value)

export function GeneralHomeApp({ apiUrl }: { apiUrl: string }) {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [sites, setSites] = useState<Site[]>(() => peekNavigationJson(apiUrl, "/admin/sites?summary=true") ?? [])
  const [siteId, setSiteId] = useState(() => editorSiteId(sites, typeof window === "undefined" ? "" : window.location.search))
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null), [message, setMessage] = useState<string | null>(null)
  const [missingTemplate, setMissingTemplate] = useState(false), [refresh, setRefresh] = useState(0)
  const [focus, setFocus] = useState<Location | null>(null), [active, setActive] = useState<Location | null>(null)
  const input = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const dirty = !!workspace && JSON.stringify(blocks) !== JSON.stringify(workspace.blocks)
  useUnsavedChanges(dirty)
  const discard = () => !dirty || window.confirm("Отменить несохранённые изменения?")
  function report(caught: unknown) {
    if (caught instanceof AdminApiError && caught.status === 401) { window.location.replace("/login"); return }
    setError(caught instanceof Error ? caught.message : "Не удалось загрузить данные")
    if (caught instanceof AdminApiError && caught.payload?.block && caught.payload?.field) {
      const location = { block: caught.payload.block, field: caught.payload.field }
      if (generalHomeFieldRule(location.block, location.field)) { setFocus(location); requestAnimationFrame(() => focusField(location)) }
    }
  }
  function focusField(location: Location) {
    const element = document.getElementById(generalHomeFieldId(location.block, location.field))
    element?.focus({ preventScroll: true }); element?.scrollIntoView({ block: "center", behavior: "instant" })
  }
  useEffect(() => {
    let current = true
    Promise.all([requestSession<{ user: { id: string; email: string } }>(apiUrl), requestJson<Site[]>(apiUrl, "/admin/sites?summary=true")])
      .then(([session, list]) => { if (current) { setUser(session.user); setSites(list); setSiteId(editorSiteId(list, window.location.search)); setLoading(false) } })
      .catch(caught => { if (current) { report(caught); setLoading(false) } })
    return () => { current = false }
  }, [apiUrl])
  useEffect(() => {
    setWorkspace(null); setBlocks([]); setActive(null); input.current = null; setFocus(null); setMissingTemplate(false); setMessage(null); setError(null)
    if (!siteId) return
    let current = true
    setLoading(true)
    requestJson<Workspace>(apiUrl, `/admin/sites/${encodeURIComponent(siteId)}/page-templates/general-home`)
      .then(result => { if (current) { setWorkspace(result); setBlocks(structuredClone(result.blocks)) } })
      .catch(caught => { if (current) { if (caught instanceof AdminApiError && caught.status === 404) setMissingTemplate(true); else report(caught) } })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [apiUrl, siteId, refresh])
  useEffect(() => {
    if (loading || !workspace) return
    const query = new URLSearchParams(window.location.search)
    if (query.get("from") !== "publication" && !query.has("block")) return
    const block = query.get("block") || "home.hero", field = query.get("field") || "title"
    if (!generalHomeFieldRule(block, field)) return
    const location = { block, field }; setFocus(location); focusField(location)
  }, [loading, workspace?.version, siteId, refresh])
  function change(block: string, field: string, value: any) {
    setBlocks(current => current.map(item => item.blockType === block ? { ...item, data: updateHomeField(item.data, field, value) } : item))
    if (Array.isArray(value)) { setActive(null); input.current = null; setFocus(null) }
    if (focus?.block === block && focus.field === field) setFocus(null)
  }
  async function save() {
    if (!workspace || saving) return
    setSaving(true); setError(null); setMessage(null)
    try {
      const result = await requestJson<Pick<Workspace, "blocks" | "workingRevision" | "missingFields">>(apiUrl, `/admin/sites/${encodeURIComponent(siteId)}/page-templates/general-home`, {
        method: "PATCH", body: { expectedWorkingRevision: workspace.workingRevision, blocks: blocks.map(({ blockType, data }) => ({ blockType, data })) },
      })
      setWorkspace({ ...workspace, ...result }); setBlocks(structuredClone(result.blocks)); setFocus(null)
      setMessage(result.missingFields.length ? "Черновик сохранён. Заполните обязательные поля перед публикацией." : "Рабочая версия сохранена. Изменения появятся на сайте после публикации.")
    } catch (caught) { report(caught) } finally { setSaving(false) }
  }
  function insertCode(code: string) {
    if (saving || !active || !input.current) return
    const rule = generalHomeFieldRule(active.block, active.field)
    if (!rule?.variables) return
    const block = blocks.find(item => item.blockType === active.block)
    const element = input.current, value = String(leafValue(block?.data, active.field) ?? "")
    const result = insertVariableAtSelection(value, element.selectionStart ?? value.length, element.selectionEnd ?? value.length, code, rule.limit)
    if (!result) { setError("Переменная не помещается в лимит поля"); return }
    change(active.block, active.field, result.value)
    requestAnimationFrame(() => { element.focus(); element.setSelectionRange(result.selectionStart, result.selectionEnd) })
  }
  function colorTitle(remove: boolean) {
    if (active?.block !== "home.hero" || active.field !== "title" || !input.current) { setError("Выделите часть заголовка первого экрана."); return }
    const element = input.current
    try { change("home.hero", "title", editRedTitle(String(blocks[0].data.title), element.selectionStart ?? 0, element.selectionEnd ?? 0, remove)); setError(null) }
    catch (caught) { report(caught) }
    requestAnimationFrame(() => element.focus())
  }
  function renderFields(block: Block, rule: GeneralHomeFieldRule, path = ""): React.ReactNode {
    const value = path ? leafValue(block.data, path) : block.data
    if (rule.kind === "object") {
      const children = Object.entries(rule.fields).map(([key, child]) => renderFields(block, child, path ? `${path}.${key}` : key))
      return path ? <FieldSet key={path}><FieldLegend>{generalHomeFieldLabel(path)}</FieldLegend><FieldGroup>{children}</FieldGroup></FieldSet> : children
    }
    if (rule.kind === "list") {
      const items: Record<string, string>[] = Array.isArray(value) ? value : []
      const faq = block.blockType === "home.faq"
      return <div key={path} id={generalHomeFieldId(block.blockType, path)} tabIndex={-1} className="space-y-4 rounded-lg border p-4">
        <h3 className="font-medium">{faq ? `Вопросы и ответы (${items.length} из ${rule.max})` : "Три шага первого экрана"}</h3>
        {faq && !items.length && <p className="text-sm text-muted-foreground">Вопросов пока нет. Пустой список можно сохранить как черновик; для публикации нужен хотя бы один настоящий вопрос и ответ.</p>}
        {items.map((_, index) => <FieldSet key={`${path}-${index}`} className="rounded-lg border p-4"><FieldLegend>{faq ? `Вопрос ${index + 1}` : `Шаг ${index + 1}`}</FieldLegend><FieldGroup>{renderFields(block, rule.item, `${path}.${index}`)}</FieldGroup>{faq && <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" disabled={saving || index === 0} aria-label={`Поднять вопрос ${index + 1}`} onClick={() => change(block.blockType, path, moveFaqItem(items, index, index - 1))}>Выше</Button><Button type="button" variant="outline" size="sm" disabled={saving || index === items.length - 1} aria-label={`Опустить вопрос ${index + 1}`} onClick={() => change(block.blockType, path, moveFaqItem(items, index, index + 1))}>Ниже</Button><Button type="button" variant="destructive" size="sm" onClick={() => { change(block.blockType, path, items.filter((_, at) => at !== index)); setActive(null); input.current = null }} disabled={saving} aria-label={`Удалить вопрос ${index + 1}`}>Удалить</Button></div>}</FieldSet>)}
        {faq && <Button type="button" variant="outline" disabled={saving || items.length >= rule.max} onClick={() => { change(block.blockType, path, [...items, { question: "", answer: "" }]); requestAnimationFrame(() => focusField({ block: block.blockType, field: `items.${items.length}.question` })) }}>Добавить вопрос</Button>}
      </div>
    }
    const id = generalHomeFieldId(block.blockType, path), label = generalHomeFieldLabel(path)
    const invalid = !String(value ?? "").trim(), highlighted = focus?.block === block.blockType && focus.field === path
    const props = { id, value: String(value ?? ""), maxLength: rule.limit, disabled: saving, "aria-required": true as const, "aria-invalid": invalid, "aria-describedby": `${id}-help`,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => change(block.blockType, path, event.target.value),
      onFocus: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { setActive({ block: block.blockType, field: path }); input.current = event.currentTarget },
    }
    return <Field key={path} data-invalid={invalid} className={highlighted ? "rounded-lg bg-muted p-3 ring-2 ring-primary" : undefined}><FieldLabel htmlFor={id}>{label}</FieldLabel>
      {rule.limit > 250 && rule.kind === "text" ? <textarea {...props} rows={path.endsWith("answer") ? 5 : 3} className="w-full rounded-lg border border-input bg-background p-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm" /> : <Input {...props} className="min-h-11" />}
      <FieldDescription id={`${id}-help`}>{invalid ? "Обязательное поле. Пустое значение можно сохранить в черновике. " : ""}{String(value ?? "").length} из {rule.limit} символов.{rule.kind === "asset" ? " Локальный путь /images/… или HTTPS без логина и пароля." : rule.kind === "https" ? " Только HTTPS-ссылка без логина и пароля." : rule.variables ? " Доступны переменные сайта." : " Переменные не используются."}</FieldDescription>
      {block.blockType === "home.hero" && path === "title" && <><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onMouseDown={event => event.preventDefault()} onClick={() => colorTitle(false)} disabled={saving}>Выделить красным</Button><Button type="button" variant="outline" onMouseDown={event => event.preventDefault()} onClick={() => colorTitle(true)} disabled={saving}>Снять выделение</Button></div><p className="text-sm text-muted-foreground">До 120 видимых символов; цвет хранится маркером &lt;red&gt;…&lt;/red&gt;.</p><p className="rounded-lg border p-3 text-xl font-semibold" aria-label="Предпросмотр заголовка">{(() => { try { return parseRedTitle(String(value)).map((part, index) => <span key={index} className={part.red ? "text-[#e0231e]" : undefined}>{part.text}</span>) } catch { return "Завершите парный маркер выделения." } })()}</p></>}
    </Field>
  }
  if (!user) return <div className="mx-auto flex max-w-xl flex-col gap-4 p-6"><h1 className="text-xl font-semibold">Главная сайта</h1>{loading ? <p role="status">Загружаем…</p> : <Alert variant="destructive"><AlertDescription>{error ?? "Сессия недоступна"}<Button variant="outline" onClick={() => window.location.reload()}>Повторить загрузку</Button></AlertDescription></Alert>}</div>
  return <AdminShell apiUrl={apiUrl} user={user} active="templates"><div className="mx-auto flex max-w-7xl flex-col gap-6 p-4 lg:p-8">
    <div><h1 className="font-heading text-2xl font-semibold">Главная сайта</h1><p className="mt-2 text-sm text-muted-foreground">Редактируется контент в утверждённом порядке. Сохранение меняет рабочую версию; публикация выполняется отдельно.</p></div>
    <div className="flex flex-wrap items-end gap-4"><Field className="min-w-60 flex-1"><FieldLabel htmlFor="general-home-site">Сайт</FieldLabel><select id="general-home-site" className="min-h-11 rounded-lg border bg-background px-3 text-sm" value={siteId} disabled={saving} onChange={event => { if (discard()) setSiteId(event.target.value) }}><option value="">Выберите сайт</option>{sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select></Field><Button asChild variant="outline"><a href={`/templates/home?kind=CITY_HOME&siteId=${encodeURIComponent(siteId)}`}>Первый экран города</a></Button></div>
    {error && <Alert variant="destructive"><AlertTitle>Не удалось выполнить действие</AlertTitle><AlertDescription>{error}<Button type="button" variant="outline" disabled={saving || loading} onClick={() => { if (discard()) setRefresh(value => value + 1) }}>Повторить загрузку</Button></AlertDescription></Alert>}
    {message && <p role="status">{message}</p>}
    {loading && <p role="status">Загружаем контент…</p>}
    {!loading && !siteId && <p>Выберите сайт для редактирования.</p>}
    {!loading && missingTemplate && <Alert><AlertTitle>Полная главная ещё не подготовлена</AlertTitle><AlertDescription>Для этого сайта пока нет рабочей композиции десяти блоков. Переход данных выполняется отдельно.<Button asChild variant="outline"><a href={`/templates/home?kind=HOME&mode=legacy&siteId=${encodeURIComponent(siteId)}`}>Открыть существующий первый экран</a></Button></AlertDescription></Alert>}
    {!loading && workspace && <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
      <form noValidate onSubmit={event => { event.preventDefault(); void save() }} className="flex min-w-0 flex-col gap-6">
        {blocks.map((block, index) => <Card key={block.id} id={`section-${block.blockType}`}><CardHeader><div className="flex flex-wrap items-center gap-2"><CardTitle>{index + 1}. {generalHomeSections.find(section => section.id === block.blockType)?.title}</CardTitle>{workspace.missingFields.some(item => item.block === block.blockType) && <Badge variant="warning">Не готово</Badge>}</div></CardHeader><CardContent><FieldGroup><FieldSet disabled={saving}>{renderFields(block, generalHomeEditorSchemas[block.blockType] as GeneralHomeFieldRule)}</FieldSet></FieldGroup></CardContent></Card>)}
        <div className="sticky bottom-2 z-10 flex flex-wrap items-center gap-3 rounded-xl border bg-background p-4 shadow-sm"><Button type="submit" className="min-h-11" disabled={saving || !dirty}>{saving ? "Сохраняем…" : "Сохранить рабочую версию"}</Button><Button type="button" variant="outline" disabled={saving} onClick={() => { if (discard()) setRefresh(value => value + 1) }}>Обновить данные</Button>{dirty && <Badge variant="warning">Есть несохранённые изменения</Badge>}</div>
      </form>
      <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4"><Card><CardHeader><CardTitle>Проверить изменения</CardTitle><CardDescription>Рабочая ревизия {workspace.workingRevision}. На сайте — {workspace.publishedRevision}.</CardDescription></CardHeader><CardContent className="space-y-4"><nav aria-label="Блоки главной"><ol className="space-y-2 text-sm">{generalHomeSections.map(section => <li key={section.id}><a className="underline underline-offset-4" href={`#section-${section.id}`}>{section.title}</a></li>)}</ol></nav><Button asChild variant="outline"><a href={`/preview?siteId=${encodeURIComponent(siteId)}&path=%2F`} target="_blank" rel="noreferrer">Открыть сохранённую версию</a></Button><p className="text-xs text-muted-foreground">Предпросмотр показывает сохранённую версию. Несохранённый ввод туда не попадает.</p></CardContent></Card>
        <Card><CardHeader><CardTitle>Системные данные</CardTitle><CardDescription>Меняются в источнике, а не в блоках главной.</CardDescription></CardHeader><CardContent><dl className="space-y-3 text-sm"><div><dt>Отдел подключений</dt><dd>{workspace.system.connectionPhone || "Не задан"}</dd></div><div><dt>Поддержка абонентов</dt><dd>{workspace.system.supportPhone || "Не задан"}</dd></div><div><dt>Режим подключений</dt><dd>{workspace.system.connectionHours}</dd></div><div><dt>Обратный звонок</dt><dd>В течение {workspace.system.callbackWithinMinutes} минут</dd></div></dl><p className="mt-4 text-sm text-muted-foreground">Города берутся из опубликованного каталога. Действия, юридические документы, иконки и дизайн задаются системой.</p></CardContent></Card>
        <VariableInsertionPicker apiUrl={apiUrl} siteId={siteId} field={active && generalHomeFieldRule(active.block, active.field)?.variables ? `PageTemplateBlock.data.${active.field}` : null} context="SITE" onInsert={insertCode} />
        <details className="rounded-lg border p-4 text-sm"><summary className="cursor-pointer font-medium">Контент опубликованного снимка</summary>{workspace.published ? workspace.published.blocks.map(block => <section className="mt-4" key={block.id}><h3 className="font-medium">{generalHomeSections.find(section => section.id === block.blockType)?.title}</h3><dl className="mt-2 space-y-2">{(() => { const entries: { path: string; value: string }[] = []; function visit(value: any, path = "") { if (typeof value === "string") entries.push({ path, value }); else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => visit(item, path ? `${path}.${key}` : key)) } visit(block.data); return entries.map(entry => <div key={entry.path}><dt className="text-muted-foreground">{generalHomeFieldLabel(entry.path)}</dt><dd className="break-words whitespace-pre-wrap">{entry.value}</dd></div>) })()}</dl></section>) : <p className="mt-3 text-muted-foreground">В опубликованном снимке полной композиции ещё нет. Рабочие данные не подставляются вместо неё.</p>}</details>
      </aside>
    </div>}
  </div></AdminShell>
}
