import { useEffect, useState } from 'react';
import { requestJson } from '../lib/admin-api.mjs';
import { useUnsavedChanges } from './useUnsavedChanges';

type Saved<T> = { content: T | null; workingRevision: number };

export function useFaqCookieEditor<T>(apiUrl: string, siteId: string, route: 'faq' | 'cookie-notice', defaults: () => T) {
  const path = '/admin/sites/' + encodeURIComponent(siteId) + '/' + route;
  const [saved, setSaved] = useState<Saved<T> | null>(null);
  const [content, setContent] = useState<T | null>(null);
  const [loadedSite, setLoadedSite] = useState('');
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const dirty = loadedSite === siteId && !!content && JSON.stringify(content) !== JSON.stringify(saved?.content);
  useUnsavedChanges(dirty);
  useEffect(() => {
    if (!siteId) return;
    let active = true;
    setLoadedSite('');
    setError('');
    setMessage('');
    requestJson<Saved<T>>(apiUrl, path).then((data) => {
      if (!active) return;
      setSaved(data);
      setContent(data.content ?? defaults());
      setLoadedSite(siteId);
    }).catch((err: Error) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [apiUrl, siteId, path, reload, defaults]);

  async function save() {
    if (!saved || !content || !dirty || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await requestJson<Saved<T>>(apiUrl, path, { method: 'PATCH', body: { expectedWorkingRevision: saved.workingRevision, content } });
      setSaved(result);
      setMessage('Рабочая версия сохранена.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Ошибка сохранения.'); }
    finally { setBusy(false); }
  }

  function discard() { return !dirty || window.confirm('Отменить несохранённые изменения?'); }
  return { content: loadedSite === siteId ? content : null, setContent, saved, dirty, busy, save, error, message, discard,
    refresh: () => { if (discard()) setReload(value => value + 1); } };
}
