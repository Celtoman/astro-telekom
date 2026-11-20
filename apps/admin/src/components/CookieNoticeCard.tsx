import { COOKIE_DOCUMENTS, cookieNoticeDefaults, type CookieNotice } from '../../../api/src/cookie-notice-model';
import { Alert, AlertDescription } from './ui/alert';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Field, FieldLabel } from './ui/field';
import { Input } from './ui/input';
import { Checkbox } from './ui/checkbox';
import { useFaqCookieEditor } from './useFaqCookieEditor';

export function CookieNoticeCard({ apiUrl, siteId }: { apiUrl: string; siteId: string }) {
  const editor = useFaqCookieEditor(apiUrl, siteId, 'cookie-notice', cookieNoticeDefaults);
  const notice = editor.content;
  const fieldClass = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm';
  const update = (change: Partial<CookieNotice>) => editor.setContent(current => current ? { ...current, ...change } : current);
  return <Card>
    <CardHeader><CardTitle>Уведомление о cookie</CardTitle><CardDescription>Показывается на публичных страницах. Кнопка закрывает уведомление на 30 дней в браузере посетителя.</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      {editor.error && <Alert variant="destructive"><AlertDescription>{editor.error}</AlertDescription></Alert>}
      {editor.message && <p role="status">{editor.message}</p>}
      {!notice && !editor.error && <p role="status">Загружаем настройки…</p>}
      {notice && <form className="space-y-4" onSubmit={event => { event.preventDefault(); void editor.save(); }}>
        <fieldset className="space-y-4" disabled={editor.busy}>
          <Checkbox checked={notice.enabled} onCheckedChange={enabled => update({ enabled })}>Показывать уведомление</Checkbox>
          <Field><FieldLabel htmlFor="cookie-notice-message">Текст уведомления</FieldLabel><textarea className="min-h-24 w-full rounded-md border border-input bg-background p-3 text-sm" id="cookie-notice-message" value={notice.message} required maxLength={600} onChange={event => update({ message: event.target.value })} /></Field>
          <Field><FieldLabel htmlFor="cookie-notice-button">Подпись кнопки</FieldLabel><Input id="cookie-notice-button" value={notice.button} required maxLength={48} onChange={event => update({ button: event.target.value })} /></Field>
          {notice.links.map((link, index) => {
            const changeLink = (change: Partial<typeof link>) => {
              const links = structuredClone(notice.links);
              links[index] = { ...links[index], ...change };
              update({ links });
            };
            return <fieldset key={index} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2"><legend className="px-1 text-sm">Ссылка {index + 1}</legend>
              <Field><FieldLabel htmlFor={'cookie-label-' + index}>Подпись</FieldLabel><Input id={'cookie-label-' + index} value={link.label} required maxLength={100} onChange={event => changeLink({ label: event.target.value })} /></Field>
              <Field><FieldLabel htmlFor={'cookie-doc-' + index}>Юридический документ</FieldLabel><select id={'cookie-doc-' + index} className={fieldClass} value={link.document}
                onChange={event => changeLink({ document: event.target.value as keyof typeof COOKIE_DOCUMENTS })}>{Object.entries(COOKIE_DOCUMENTS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
            </fieldset>;
          })}
        </fieldset>
        <details className="space-y-3">
          <summary className="cursor-pointer font-medium">Предпросмотр уведомления</summary>
          <div className="w-full max-w-[358px] space-y-4 rounded-[24px] border border-[#dcecf7] bg-white p-4 text-[#18202a]">
            <p className="whitespace-pre-wrap break-words text-base leading-6">{notice.message}</p>
            <div className="grid gap-3 text-sm text-[#1769aa]">{notice.links.map((link, index) => <span key={index} className="break-words">{link.label}</span>)}</div>
            <span className="grid min-h-12 place-items-center rounded-[14px] bg-[#e0231e] px-3 py-2 text-center text-sm font-semibold text-white">{notice.button}</span>
          </div>
        </details>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={!editor.canSave}>{editor.busy ? 'Сохраняем…' : 'Сохранить уведомление'}</Button>
          <Button type="button" variant="outline" disabled={editor.busy} onClick={editor.refresh}>Обновить данные</Button>
          {editor.saved?.content && <a className="text-sm underline" href={'/publication?site=' + encodeURIComponent(siteId) + '#faq-cookie-release'}>Публикация</a>}
        </div>
      </form>}
    </CardContent>
  </Card>;
}
