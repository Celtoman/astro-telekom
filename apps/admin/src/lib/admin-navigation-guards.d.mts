export function registerUnsavedChanges(): () => void
export function hasUnsavedChanges(): boolean
export function installNavigationGuards(win: Window, doc: Document, options?: { confirm?: () => boolean | Promise<boolean>; navigate?: (href: string) => void }): () => void
