export function registerUnsavedChanges(): () => void
export function hasUnsavedChanges(): boolean
export type WorkspaceScroll = { left: number; top: number }
export function installWorkspaceNavigation(win: Window, doc: Document, options: {
  confirm: () => boolean | Promise<boolean>
  navigate: (target: URL, position: WorkspaceScroll | null) => void
  canNavigate?: () => boolean
}): { openWorkspace: (target: URL) => boolean; dispose: () => void }
