import { useEffect, useRef, useState } from 'react'
import { OFFICIAL_SITE_IMAGE_SLOTS, OFFICIAL_SITE_PAGE_SLUG, officialSiteEditableField, officialSiteFieldLabel, type OfficialSiteImageSlot, type OfficialSitePageContent } from '../../../api/src/official-site-page-model'
import { AdminApiError, requestJson, requestSession } from '../lib/admin-api.mjs'
import { editorSiteId } from '../lib/editor-context.mjs'
import { insertVariableAtSelection } from '../lib/variable-insertion.mjs'
import { useUnsavedChanges } from './useUnsavedChanges'
import { AdminShell } from './AdminShell'
import { VariableInsertionPicker } from './VariableInsertionPicker'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card'
import { Field, FieldLabel } from './ui/field'
import { Input } from './ui/input'
import { Alert, AlertDescription } from './ui/alert'

interface Site { id: string; name: string }
interface Workspace { content: OfficialSitePageContent; workingRevision: number; publishedRevision: number | null; missingFields: string[]; published: OfficialSitePageContent | null }
const textareaClass = 'min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary'
const fieldId = (path: string) => `official-site-${path.replaceAll('.', '-')}`

export function OfficialSitePageApp({ apiUrl }: { apiUrl: string }) {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [sites, setSites] = useState<Site[]>([]), [siteId, setSiteId] = useState('')
  const [workspace, setWorkspace] = useState<Workspace | null>(null), [content, setContent] = useState<OfficialSitePageContent | null>(null)
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [refresh, setRefresh] = useState(0)
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [errorField, setErrorField] = useState('')
  const [activeFaq, setActiveFaq] = useState<{ index: number; field: 'question' | 'answer' } | null>(null)
  const faqInput = useRef<HTMLTextAreaElement | null>(null)
  const recoveryFocused = useRef(false)
  const dirty = !!workspace && !!content && JSON.stringify(workspace.content) !== JSON.stringify(content)
  useUnsavedChanges(dirty)
  const report = (caught: unknown) => {
    if (caught instanceof AdminApiError && caught.status === 401) { window.location.replace('/login'); return }
    setError(caught instanceof Error ? caught.message : 'Не удалось выполнить действие')
    const field = caught instanceof AdminApiError ? caught.payload?.field : ''
    if (typeof field === 'string') { setErrorField(field); requestAnimationFrame(() => document.getElementById(fieldId(field))?.focus()) }
  }
  useEffect(() => {
    let current = true
    Promise.all([requestSession<{ user: { id: string; email: string } }>(apiUrl), requestJson<Site[]>(apiUrl, '/admin/sites?summary=true')]).then(([session, sites]) => {
      if (current) { setUser(session.user); setSites(sites); setSiteId(editorSiteId(sites, window.location.search)); setLoading(false) }
    }).catch(caught => { if (current) { report(caught); setLoading(false) } })
    return () => { current = false }
  }, [apiUrl])
  useEffect(() => {
    setWorkspace(null); setContent(null); setError(''); setMessage(''); setActiveFaq(null); faqInput.current = null
    if (!siteId) return
    let current = true; setLoading(true)
    requestJson<Workspace>(apiUrl, `/admin/sites/${encodeURIComponent(siteId)}/official-site`).then(result => {
      if (current) { setWorkspace(result); setContent(structuredClone(result.content)) }
    }).catch(caught => { if (current) report(caught) }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [apiUrl, siteId, refresh])
  useEffect(() => {
    if (!content || recoveryFocused.current) return
    const path = new URLSearchParams(window.location.search).get('field')
    if (officialSiteEditableField(path)) {
      const field = document.getElementById(fieldId(path))
      if (field) { field.focus(); field.scrollIntoView({ block: 'center' }); recoveryFocused.current = true }
    }
  }, [content])
  const errorAttrs = (path: string) => ({ 'aria-invalid': errorField === path || undefined, 'aria-describedby': errorField === path && error ? 'official-site-error' : undefined })
  const update = (mutate: (next: OfficialSitePageContent) => void) => { setContent(old => { if (!old) return old; const next = structuredClone(old); mutate(next); return next }); setMessage(''); setErrorField('') }
  async function save(event: { preventDefault(): void }) {
    event.preventDefault(); if (!workspace || !content || saving) return
    setSaving(true); setError(''); setMessage('')
    try {
      const result = await requestJson<Pick<Workspace, 'content' | 'workingRevision' | 'missingFields'>>(apiUrl, `/admin/sites/${encodeURIComponent(siteId)}/official-site`, { method: 'PATCH', body: { expectedWorkingRevision: workspace.workingRevision, content } })
      setWorkspace({ ...workspace, ...result }); setContent(structuredClone(result.content)); setErrorField('')
      setMessage(result.missingFields.length ? 'Черновик сохранён. Заполните обязательные поля перед публикацией.' : 'Рабочая версия сохранена. Публикация выполняется отдельно.')
    } catch (caught) { report(caught) } finally { setSaving(false) }
  }
  function moveFaq(index: number, direction: number) {
    const target = index + direction
    if (!content || target < 0 || target >= content.faq.items.length) return
    update(next => { [next.faq.items[index], next.faq.items[target]] = [next.faq.items[target], next.faq.items[index]] })
    requestAnimationFrame(() => document.getElementById(fieldId(`faq.items.${target}.question`))?.focus())
  }
  function insertCode(code: string) {
    if (saving || !activeFaq || !faqInput.current || !content) return
    const { index, field } = activeFaq, input = faqInput.current
    const result = insertVariableAtSelection(content.faq.items[index][field], input.selectionStart, input.selectionEnd, code, field === 'question' ? 2000 : 20000)
    if (!result) { setError('Для подстановки не хватает места в поле. Сократите текст.'); return }
    update(next => { next.faq.items[index][field] = result.value })
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(result.selectionStart, result.selectionEnd) })
  }
  if (!user) return <div className="p-6" role="status">{error || 'Загружаем редактор…'}</div>
  const discard = () => !dirty || window.confirm('Отменить несохранённые изменения?')
  return <AdminShell apiUrl={apiUrl} user={user} active="templates"><div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6 lg:p-8">
    <div><h1 className="text-2xl font-semibold">Официальный сайт</h1><p className="mt-2 text-sm text-muted-foreground">Измените вступление, изображения и вопросы. Структура страницы сохраняется.</p></div>
    <Field><FieldLabel htmlFor="official-site-site">Сайт</FieldLabel><select id="official-site-site" className={textareaClass + ' min-h-9'} value={siteId} disabled={saving} onChange={event => { if (discard()) setSiteId(event.target.value) }}><option value="">Выберите сайт</option>{sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select></Field>
    {error && <Alert variant="destructive"><AlertDescription id="official-site-error">{error}</AlertDescription></Alert>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {loading && <p role="status">Загружаем страницу…</p>}
    {workspace && content && <form onSubmit={save} className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={saving || !dirty}>{saving ? 'Сохраняем…' : 'Сохранить'}</Button><Button type="button" variant="outline" disabled={saving} onClick={() => { if (discard()) setRefresh(x => x + 1) }}>Обновить данные</Button><a className="text-sm underline" href={`/preview?siteId=${encodeURIComponent(siteId)}&path=/${OFFICIAL_SITE_PAGE_SLUG}`} onClick={event => { if (dirty) { event.preventDefault(); setError('Сохраните изменения перед предпросмотром.') } }}>Предпросмотр</a><a className="text-sm underline" href={`/seo/templates?siteId=${encodeURIComponent(siteId)}&kind=OFFICIAL_SITE`}>SEO страницы</a></div>
      <p className="text-sm text-muted-foreground">Рабочая ревизия: {workspace.workingRevision}. Опубликованная ревизия сайта: {workspace.publishedRevision ?? 'пока не подтверждена'}.</p>
      <fieldset disabled={saving} className="min-w-0 space-y-6">
      <Card><CardHeader><CardTitle>Основное</CardTitle></CardHeader><CardContent className="space-y-5">
        <Field><FieldLabel htmlFor={fieldId('hero.h1')}>Заголовок страницы</FieldLabel><Input id={fieldId('hero.h1')} value={content.hero.h1} maxLength={200} {...errorAttrs('hero.h1')} onChange={e => update(n => { n.hero.h1 = e.target.value })} /></Field>
        <Field><FieldLabel htmlFor={fieldId('hero.intro')}>Вводный текст</FieldLabel><textarea id={fieldId('hero.intro')} {...errorAttrs('hero.intro')} className={textareaClass} value={content.hero.intro} maxLength={5000} onChange={e => update(n => { n.hero.intro = e.target.value })} /></Field>
        <Field><FieldLabel htmlFor={fieldId('officialUrl')}>Ссылка на официальный сайт</FieldLabel><Input id={fieldId('officialUrl')} {...errorAttrs('officialUrl')} value={content.officialUrl} maxLength={2048} onChange={e => update(n => { n.officialUrl = e.target.value })} /></Field>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Иллюстрации</CardTitle><CardDescription>Замените постоянную ссылку на подготовленное изображение и его описание. Нужен файл /images/…-&lt;SHA256&gt;.png, .jpg или .webp на разрешённом хосте. Положение на странице останется прежним.</CardDescription></CardHeader><CardContent className="space-y-6">
        {(Object.entries(OFFICIAL_SITE_IMAGE_SLOTS) as Array<[OfficialSiteImageSlot, string]>).map(([slot, name]) => <fieldset key={slot} className="space-y-3 rounded-lg border p-4"><legend className="px-2 text-sm font-semibold">{name}</legend>
          {(['src', 'alt', 'caption'] as const).filter(key => slot !== 'hero' || key !== 'caption').map(key => <Field key={key}><FieldLabel htmlFor={fieldId(`images.${slot}.${key}`)}>{key === 'src' ? 'Источник изображения' : key === 'alt' ? 'Текстовое описание изображения' : 'Подпись'}</FieldLabel><Input id={fieldId(`images.${slot}.${key}`)} value={content.images[slot][key] || ''} maxLength={key === 'src' ? 2048 : 500} {...errorAttrs(`images.${slot}.${key}`)} onChange={e => update(n => { n.images[slot][key] = e.target.value })} /></Field>)}
        </fieldset>)}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Вопросы и ответы</CardTitle><CardDescription>Для публикации нужен хотя бы один полный вопрос с ответом.</CardDescription></CardHeader><CardContent className="space-y-5">
        {content.faq.items.map((item, index) => <fieldset key={index} className="space-y-3 rounded-lg border p-4"><legend className="px-2 text-sm font-semibold">Вопрос {index + 1}</legend>
          {(['question', 'answer'] as const).map(field => <Field key={field}><FieldLabel htmlFor={fieldId(`faq.items.${index}.${field}`)}>{field === 'question' ? 'Вопрос' : 'Ответ'}</FieldLabel><textarea className={textareaClass} id={fieldId(`faq.items.${index}.${field}`)} {...errorAttrs(`faq.items.${index}.${field}`)} value={item[field]} maxLength={field === 'question' ? 2000 : 20000} onFocus={e => { setActiveFaq({ index, field }); faqInput.current = e.target }} onChange={e => update(n => { n.faq.items[index][field] = e.target.value })} /></Field>)}
          <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={index === 0} onClick={() => moveFaq(index, -1)} aria-label={`Переместить вопрос ${index + 1} выше`}>Выше</Button><Button type="button" variant="outline" disabled={index === content.faq.items.length - 1} onClick={() => moveFaq(index, 1)} aria-label={`Переместить вопрос ${index + 1} ниже`}>Ниже</Button><Button type="button" variant="outline" onClick={() => { update(n => { n.faq.items.splice(index, 1) }); setActiveFaq(null); faqInput.current = null; requestAnimationFrame(() => (document.getElementById(fieldId(`faq.items.${Math.min(index, content.faq.items.length - 2)}.question`)) || document.getElementById('official-site-add-faq'))?.focus()) }}>Удалить вопрос {index + 1}</Button></div>
        </fieldset>)}
        <div id={fieldId('faq.items')} tabIndex={-1}><Button id="official-site-add-faq" type="button" variant="outline" disabled={content.faq.items.length >= 50} onClick={() => { const index = content.faq.items.length; update(n => { n.faq.items.push({ question: '', answer: '' }) }); requestAnimationFrame(() => document.getElementById(fieldId(`faq.items.${index}.question`))?.focus()) }}>Добавить вопрос</Button></div>
      </CardContent></Card>
      <VariableInsertionPicker apiUrl={apiUrl} siteId={siteId} context="SITE" field={activeFaq ? `Page.content.faq.items[].${activeFaq.field}` : null} onInsert={insertCode} />
      </fieldset>
      <p className="text-sm text-muted-foreground">Телефоны подключения и поддержки меняются в <a className="underline" href="/variables">общих настройках сайта</a>.</p>
      {workspace.missingFields.length > 0 && <Alert><AlertDescription>Перед публикацией заполните: {workspace.missingFields.map(officialSiteFieldLabel).join(', ')}</AlertDescription></Alert>}
    </form>}
  </div></AdminShell>
}
