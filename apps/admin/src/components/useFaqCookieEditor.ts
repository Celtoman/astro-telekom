import { useEffect, useState } from 'react';
import { requestJson } from '../lib/admin-api.mjs';
import { faqCookieEditorState } from '../lib/faq-cookie-editor-state.mjs';
import { useUnsavedChanges } from './useUnsavedChanges';

type Saved<T> = { content: T | null; workingRevision: number };
type Loaded<T> = { siteId: string; saved: Saved<T>; initial: T };

export function useFaqCookieEditor<T>(apiUrl: string, siteId: string, route: 'faq' | 'cookie-notice', defaults: () => T) {
  const path = '/admin/sites/' + encodeURIComponent(siteId) + '/' + route;
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);
  const [content, setContent] = useState<T | null>(null);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const current = loaded?.siteId === siteId ? loaded : null;
  const { dirty, canSave } = faqCookieEditorState(current, content, busy);
  useUnsavedChanges(dirty);
  useEffect(() => {
    if (!siteId) return;
    let active = true;
    setLoaded(null);
    setError('');
    setMessage('');
    requestJson<Saved<T>>(apiUrl, path).then((data) => {
      if (!active) return;
      const initial = data.content ?? defaults();
      setContent(initial);
      setLoaded({ siteId, saved: data, initial });
    }).catch((err: Error) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [apiUrl, siteId, path, reload, defaults]);

  async function save() {
    if (!current || content === null || !canSave) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await requestJson<Saved<T>>(apiUrl, path, {
        method: 'PATCH', body: { expectedWorkingRevision: current.saved.workingRevision, content },
      });
      const initial = result.content ?? content;
      setLoaded(loaded => loaded === current ? { siteId, saved: result, initial } : loaded);
      setContent(draft => draft === content ? initial : draft);
      setMessage('Рабочая версия сохранена.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Ошибка сохранения.'); }
    finally { setBusy(false); }
  }

  function discard() { return !dirty || window.confirm('Отменить несохранённые изменения?'); }
  return { content: current ? content : null, setContent, saved: current?.saved ?? null, canSave, busy, save, error, message, discard,
    refresh: () => { if (discard()) setReload(value => value + 1); } };
}
