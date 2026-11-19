import { useEffect, useState } from 'react';
import type { FaqPageContent } from '../../../api/src/faq-page-model';
import type { CookieNotice } from '../../../api/src/cookie-notice-model';
import { COOKIE_DOCUMENTS } from '../../../api/src/cookie-notice-model';
import { requestJson } from '../lib/admin-api.mjs';
import { Alert, AlertDescription } from './ui/alert';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Checkbox } from './ui/checkbox';
import { PublicationIssueCard } from './PublicationIssueCard';
import type { PublicationReview } from '../lib/publication-review.mjs';
import { renderFaqAnswer } from '../../../web/src/lib/faq-render';

type Scope = 'FAQ' | 'COOKIE_NOTICE';
type Content = { faq?: FaqPageContent | null; seo?: { titleTemplate: string; descriptionTemplate: string; indexState: string; ogTitleTemplate?: string; ogDescriptionTemplate?: string; ogImageUrl?: string } | null; cookie?: CookieNotice | null };
type Review = { ready: boolean; changed: boolean; reviewDigest: string; before: Content; after: Content; report: Pick<PublicationReview['validation'], 'issues'> };
type Result = { id: string; status: string; lastError?: string };

function Snapshot({ value }: { value: Content }) {
  if (!value.faq && !value.cookie) return <p className="text-sm text-muted-foreground">Изменение ещё не опубликовано.</p>;
  return <div className="min-w-0 space-y-3 break-words text-sm">
    {value.faq && <>
      <p className="font-semibold">{value.faq.h1}</p><p>{value.faq.intro}</p>
      {value.faq.groups.map(group => <details key={group.id} className="rounded-md border p-2">
        <summary className="cursor-pointer font-medium">{group.title}</summary>
        {value.faq?.items.filter(item => item.groupId === group.id).map(item => <div className="space-y-1 py-2" key={item.id}>
          <p className="font-semibold">{item.question}</p><div className="[&_ol]:list-decimal [&_ol]:pl-4 [&_ul]:list-disc [&_ul]:pl-4" dangerouslySetInnerHTML={{ __html: renderFaqAnswer(item.answer, { interactive: false }) }} />
        </div>)}
      </details>)}
      <details className="rounded-md border p-2"><summary className="cursor-pointer">Контакты и SEO</summary>
        {Object.values(value.faq.contacts).map((text, index) => <p key={index}>{text}</p>)}
        {value.seo && <dl>{Object.entries(value.seo).filter(([key]) => ['titleTemplate', 'descriptionTemplate', 'indexState', 'ogTitleTemplate', 'ogDescriptionTemplate', 'ogImageUrl'].includes(key)).map(([key, text]) =>
          <div key={key}><dt className="font-medium">{key}</dt><dd>{text || 'По умолчанию'}</dd></div>)}</dl>}
      </details>
    </>}
    {value.cookie && <div className="space-y-1"><p className="font-semibold">{value.cookie.enabled ? 'Показ включён' : 'Показ выключен'}</p>
      <p>{value.cookie.message}</p><p>Кнопка «{value.cookie.button}»</p>
      {value.cookie.links.map((link, index) => <p key={index}>{link.label} → {COOKIE_DOCUMENTS[link.document]}</p>)}
    </div>}
  </div>;
}

export function FaqCookiePublicationCard({ apiUrl, siteId }: { apiUrl: string; siteId: string }) {
  const path = '/admin/sites/' + encodeURIComponent(siteId) + '/faq-cookie-publication';
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [review, setReview] = useState<Review | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [operationId, setOperationId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = result?.status === 'PENDING' || result?.status === 'RUNNING';

  function select(scope: Scope, selected: boolean) {
    setScopes(old => selected ? [...old, scope] : old.filter(value => value !== scope));
    setReview(null); setResult(null); setOperationId(''); setError('');
  }
  async function check() {
    setBusy(true); setReview(null); setResult(null); setError('');
    try {
      setReview(await requestJson<Review>(apiUrl, path + '/review', { method: 'POST', body: { scopes } }));
      setOperationId(crypto.randomUUID());
    } catch (err) { setError(err instanceof Error ? err.message : 'Проверка недоступна.'); }
    finally { setBusy(false); }
  }
  async function publish() {
    if (!review?.ready || !operationId) return;
    setBusy(true); setError('');
    try {
      const answer = await requestJson<{ publicationId: string; status: string }>(apiUrl, path + '/publish', { method: 'POST', body: { scopes, reviewDigest: review.reviewDigest, operationId } });
      setResult({ id: answer.publicationId, status: answer.status });
      setReview(null);
    } catch (err) { setError(err instanceof Error ? err.message : 'Публикация недоступна.'); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (!pending || !operationId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const current = await requestJson<Result>(apiUrl, path + '/operations/' + operationId);
        if (!active) return;
        setResult(current);
        setError('');
        if (current.status === 'SUCCEEDED') window.dispatchEvent(new Event('admin:publication-changed'));
        if (current.status !== 'PENDING' && current.status !== 'RUNNING') return;
      } catch (err) { if (active) setError(err instanceof Error ? err.message : 'Статус пока недоступен.'); }
      if (active) timer = setTimeout(poll, 3000);
    };
    timer = setTimeout(poll, 3000);
    return () => { active = false; clearTimeout(timer); };
  }, [pending, operationId, apiUrl, path]);

  return <div id="faq-cookie-release">
    <Card><CardHeader><CardTitle>Выборочная публикация FAQ и cookie</CardTitle><CardDescription>Выберите сохранённые изменения для выпуска. Проверка покажет текущую и будущую версии.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4">
          <Checkbox disabled={busy || pending} checked={scopes.includes('FAQ')} onCheckedChange={selected => select('FAQ', selected)}>Вопросы и ответы</Checkbox>
          <Checkbox disabled={busy || pending} checked={scopes.includes('COOKIE_NOTICE')} onCheckedChange={selected => select('COOKIE_NOTICE', selected)}>Уведомление о cookie</Checkbox>
        </div>
        <Button type="button" variant="outline" disabled={!scopes.length || busy || pending} onClick={() => void check()}>{busy ? 'Выполняем…' : 'Проверить выбранное'}</Button>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {result && <p role="status">{result.status === 'SUCCEEDED' ? 'Изменения опубликованы.' : result.status === 'FAILED' ? result.lastError || 'Публикация завершилась ошибкой.' : 'Изменения собираются и публикуются.'}</p>}
        {review && <>
          {!review.changed && <p role="status">Выбранное содержимое совпадает с опубликованным.</p>}
          <div className="grid gap-4 rounded-lg border p-4 md:grid-cols-2">
            <div className="min-w-0 space-y-2"><h3 className="font-semibold">На сайте</h3><Snapshot value={review.before} /></div>
            <div className="min-w-0 space-y-2"><h3 className="font-semibold">После выпуска</h3><Snapshot value={review.after} /></div>
          </div>
          {review.report.issues.length > 0 && <ul className="space-y-2">{review.report.issues.map((issue, i) => <PublicationIssueCard key={i} issue={issue} siteId={siteId} />)}</ul>}
          <Button type="button" disabled={!review.ready || busy} onClick={() => void publish()}>Опубликовать выбранное</Button>
        </>}
      </CardContent>
    </Card>
  </div>;
}
