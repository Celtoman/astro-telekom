/**
 * @template T
 * @param {{ initial: T, saved: { content: T | null } } | null} loaded
 * @param {T | null} content
 * @param {boolean} busy
 */
export function faqCookieEditorState(loaded, content, busy) {
  if (!loaded || content === null) return { dirty: false, canSave: false };
  const dirty = content !== loaded.initial && JSON.stringify(content) !== JSON.stringify(loaded.initial);
  return { dirty, canSave: !busy && (dirty || loaded.saved.content === null) };
}
