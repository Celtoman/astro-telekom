import { useEffect, useState, type SubmitEvent } from 'react';
import { FAQ_CONTACT_FIELDS, faqParagraph, type FaqPageContent } from '../../../api/src/faq-page-model';
import { faqDemoContent } from '../../../api/src/faq-demo';
import { requestJson, requestSession } from '../lib/admin-api.mjs';
import { editorSiteId } from '../lib/editor-context.mjs';
import { AdminShell } from './AdminShell';
import { FaqAnswerEditor } from './FaqAnswerEditor';
import { useFaqCookieEditor } from './useFaqCookieEditor';
import { Alert, AlertDescription } from './ui/alert';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Field, FieldLabel } from './ui/field';
import { Input } from './ui/input';

const selectClass = 'h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm';
const textArea = 'w-full min-h-24 rounded-md border border-input bg-background p-3 text-sm';
type User = { id: string; email: string };
type Site = { id: string; name: string };

function move<T>(items: T[], index: number, direction: -1 | 1) {
  const next = index + direction;
  if (next >= 0 && next < items.length) [items[index], items[next]] = [items[next], items[index]];
}

export function FaqPageApp({ apiUrl }: { apiUrl: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState('');
  const [loadError, setLoadError] = useState('');
  const [selection, setSelection] = useState<string | null>(null);
  const editor = useFaqCookieEditor(apiUrl, siteId, 'faq', faqDemoContent);
  const { content } = editor;
  useEffect(() => {
    let active = true;
    Promise.all([requestSession<{ user: User }>(apiUrl), requestJson<Site[]>(apiUrl, '/admin/sites?summary=true')]).then(([session, rows]) => {
      if (!active) return;
      if (!session?.user) { window.location.assign('/login'); return; }
      setUser(session.user);
      setSites(rows);
      setSiteId(editorSiteId(rows, window.location.search));
    }).catch((error: Error) => { if (active) setLoadError(error.message); });
    return () => { active = false; };
  }, [apiUrl]);

  function update(change: (next: FaqPageContent) => void) {
    editor.setContent(old => {
      if (!old) return old;
      const next = structuredClone(old);
      change(next);
      return next;
    });
  }
  function order(items: FaqPageContent['items'], groupId: string, id: string, direction: -1 | 1) {
    const group = items.filter(item => item.groupId === groupId);
    const index = group.findIndex(item => item.id === id);
    move(group, index, direction);
    let offset = 0;
    return items.map(item => item.groupId === groupId ? group[offset++] : item);
  }
  function save(event: SubmitEvent<HTMLFormElement>) { event.preventDefault(); void editor.save(); }
  if (!user) return <p className="p-6" role="status">{loadError || 'Загружаем редактор…'}</p>;
  const siteQuery = 'siteId=' + encodeURIComponent(siteId);
  const open = content?.items.find(item => item.id === selection);
  return <AdminShell apiUrl={apiUrl} user={user} active="templates"><div className="mx-auto max-w-5xl space-y-5 p-6">
    <h1 className="text-2xl font-semibold">Вопросы и ответы</h1>
    <Field><FieldLabel htmlFor="faq-site">Сайт</FieldLabel><select id="faq-site" className={selectClass} value={siteId} disabled={editor.busy} onChange={event => {
      if (editor.discard()) { setSelection(null); setSiteId(event.target.value); }
    }}><option value="">Выберите сайт</option>{sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select></Field>
    {editor.error && <Alert variant="destructive"><AlertDescription>{editor.error}</AlertDescription></Alert>}
    {editor.message && <p role="status">{editor.message}</p>}
    {!content && !editor.error && <p role="status">Загружаем страницу…</p>}
    {content && <form onSubmit={save} className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={editor.busy || !editor.dirty}>{editor.busy ? 'Сохраняем…' : 'Сохранить'}</Button>
        <Button type="button" variant="outline" disabled={editor.busy} onClick={() => { editor.refresh(); setSelection(null); }}>Обновить данные</Button>
        {editor.saved?.content && <>
          <a className="text-sm underline" href={'/preview?' + siteQuery + '&path=/faq'}>Предпросмотр</a>
          <a className="text-sm underline" href={'/seo/templates?' + siteQuery + '&kind=FAQ'}>SEO страницы</a>
          <a className="text-sm underline" href={'/publication?site=' + encodeURIComponent(siteId) + '#faq-cookie-release'}>Публикация</a>
        </>}
      </div>
      {!editor.saved?.content && <p className="text-sm text-muted-foreground">Начальное наполнение демонстрационное. Сохраните его, чтобы открыть предпросмотр и SEO.</p>}
      <fieldset disabled={editor.busy} className="min-w-0 space-y-5">
        <Card><CardHeader><CardTitle>Введение</CardTitle></CardHeader><CardContent className="space-y-4">
          <Field><FieldLabel htmlFor="faq-h1">Заголовок страницы</FieldLabel><Input id="faq-h1" required maxLength={200} value={content.h1} onChange={event => update(next => { next.h1 = event.target.value; })} /></Field>
          <Field><FieldLabel htmlFor="faq-intro">Вводный текст</FieldLabel><textarea id="faq-intro" required maxLength={2000} className={textArea} value={content.intro} onChange={event => update(next => { next.intro = event.target.value; })} /></Field>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Группы и вопросы</CardTitle></CardHeader><CardContent className="space-y-5">
          {content.groups.map((group, index) => {
            const items = content.items.filter(item => item.groupId === group.id);
            return <fieldset key={group.id} className="min-w-0 space-y-3 rounded-lg border p-4">
              <legend className="px-1 text-sm font-medium">{group.title || 'Новая группа'}</legend>
              <Field><FieldLabel htmlFor={'faq-group-' + group.id}>Название группы</FieldLabel><Input id={'faq-group-' + group.id} required maxLength={120} value={group.title}
                onChange={event => update(next => { next.groups[index].title = event.target.value; })} /></Field>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" disabled={index === 0} onClick={() => update(next => move(next.groups, index, -1))}>Группу выше</Button>
                <Button type="button" size="sm" variant="outline" disabled={index === content.groups.length - 1} onClick={() => update(next => move(next.groups, index, 1))}>Группу ниже</Button>
                <Button type="button" size="sm" variant="ghost" disabled={items.length > 0} onClick={() => update(next => { next.groups.splice(index, 1); })}>Удалить группу</Button>
              </div>
              <ul className="space-y-2">
                {items.map((item, position) => <li key={item.id} className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 p-2">
                  <Button type="button" className="min-w-0 flex-1 justify-start whitespace-normal text-left" variant={item.id === selection ? 'secondary' : 'ghost'} onClick={() => setSelection(item.id)}>{item.question || 'Новый вопрос'}</Button>
                  <Button type="button" variant="ghost" size="sm" aria-label={'Вопрос выше: ' + item.question} disabled={position === 0} onClick={() => update(next => { next.items = order(next.items, group.id, item.id, -1); })}>↑</Button>
                  <Button type="button" variant="ghost" size="sm" aria-label={'Вопрос ниже: ' + item.question} disabled={position === items.length - 1} onClick={() => update(next => { next.items = order(next.items, group.id, item.id, 1); })}>↓</Button>
                </li>)}
              </ul>
              <Button type="button" size="sm" variant="outline" disabled={content.items.length >= 100} onClick={() => {
                const id = crypto.randomUUID();
                update(next => next.items.push({ id, groupId: group.id, question: '', answer: { type: 'doc', content: [faqParagraph('')] } }));
                setSelection(id);
              }}>Добавить вопрос</Button>
            </fieldset>;
          })}
          <Button type="button" variant="outline" disabled={content.groups.length >= 20} onClick={() => {
            const id = crypto.randomUUID();
            update(next => next.groups.push({ id, title: '' }));
          }}>Добавить группу</Button>
          {open && <div key={open.id} className="space-y-4 rounded-lg border p-4">
            <Field><FieldLabel htmlFor="faq-item-group">Группа вопроса</FieldLabel><select className={selectClass} id="faq-item-group" value={open.groupId} onChange={event => update(next => { next.items.find(item => item.id === open.id)!.groupId = event.target.value; })}>
              {content.groups.map(group => <option key={group.id} value={group.id}>{group.title || 'Новая группа'}</option>)}
            </select></Field>
            <Field><FieldLabel htmlFor="faq-item-question">Вопрос</FieldLabel><Input id="faq-item-question" required maxLength={300} value={open.question} onChange={event => update(next => { next.items.find(item => item.id === open.id)!.question = event.target.value; })} /></Field>
            <FaqAnswerEditor value={open.answer} onChange={answer => update(next => { const item = next.items.find(item => item.id === open.id); if (item) item.answer = answer; })} />
            <p className="break-all text-xs text-muted-foreground">Постоянная ссылка /faq#question-{open.id}</p>
            <Button type="button" variant="outline" onClick={() => {
              if (!window.confirm('Удалить этот вопрос?')) return;
              update(next => { next.items = next.items.filter(item => item.id !== open.id); });
              setSelection(null);
            }}>Удалить вопрос</Button>
          </div>}
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Не нашли ответ?</CardTitle></CardHeader><CardContent className="space-y-4">
          {(Object.entries(FAQ_CONTACT_FIELDS) as Array<[keyof FaqPageContent['contacts'], string]>).map(([name, label]) => <Field key={name}>
            <FieldLabel htmlFor={'faq-contact-' + name}>{label}</FieldLabel>
            <Input id={'faq-contact-' + name} required maxLength={name === 'supportTopics' ? 1000 : 200} value={content.contacts[name]} onChange={event => update(next => { next.contacts[name] = event.target.value; })} />
          </Field>)}
        </CardContent></Card>
      </fieldset>
    </form>}
  </div></AdminShell>;
}
