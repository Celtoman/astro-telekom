import { useEffect, useState } from 'react'
import { publicationFieldLabels } from '../lib/publication-issue-presentation.mjs'

export function usePublicationFieldFocus(ready: boolean, identity: string, prefix: 'collection' | 'home') {
  const [field, setField] = useState<string | null>(null)
  useEffect(() => {
    if (!ready) { setField(null); return }
    const query = new URLSearchParams(window.location.search)
    if (query.get('from') !== 'publication') return
    const key = query.get('field')
    if (!key || !publicationFieldLabels[key]) return
    const id = prefix === 'collection' ? key === 'initialCount' ? 'collection-count' : `collection-${key}`
      : key === 'chips' ? 'home-chip-0' : key.startsWith('chips.') ? `home-chip-${key.slice(6)}` : `home-${key}`
    const element = document.getElementById(id)
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) return
    setField(key)
    element.focus({ preventScroll: true })
    element.scrollIntoView({ block: 'center', behavior: 'instant' })
    const clear = () => setField(null)
    element.addEventListener('input', clear)
    return () => element.removeEventListener('input', clear)
  }, [ready, identity, prefix])
  return { field, label: field ? publicationFieldLabels[field] : null }
}
