import { isWorkspacePath } from "./admin-workspace-routes.mjs"

const dirtyOwners = new Set()
export function registerUnsavedChanges() {
  const owner = Symbol("editor")
  dirtyOwners.add(owner)
  return () => dirtyOwners.delete(owner)
}
export function hasUnsavedChanges() { return dirtyOwners.size > 0 }

const historyKey = "__adminWorkspace"
const screenPath = url => url.pathname + url.search

export function installWorkspaceNavigation(win, doc, { confirm, navigate, canNavigate = () => true }) {
  const saved = win.history.state?.[historyKey]
  const owner = saved?.owner ?? win.crypto.randomUUID()
  let index = Number.isSafeInteger(saved?.index) ? saved.index : 0
  let currentPath = screenPath(win.location)
  let pending = false
  let restoring = null
  let approved = null
  let disposed = false
  const positions = new Map()
  const previousRestoration = win.history.scrollRestoration
  win.history.scrollRestoration = "manual"
  win.history.replaceState({ ...win.history.state, [historyKey]: { owner, index } }, "")

  const remember = () => positions.set(index, { left: win.scrollX, top: win.scrollY })
  function commit(target, next, scroll) {
    index = next
    currentPath = screenPath(target)
    navigate(target, scroll)
  }
  function ask(action) {
    if (pending) return
    pending = true
    void Promise.resolve().then(confirm).then(accept => {
      pending = false
      if (accept && !disposed) action()
    }, () => { pending = false })
  }

  function openWorkspace(target) {
    if (target.origin !== win.location.origin || !isWorkspacePath(target.pathname) || !canNavigate()) return false
    if (target.href === win.location.href || pending || restoring !== null) return true

    const open = () => {
      if (win.history.state?.[historyKey]?.index !== index) return
      remember()
      const next = index + 1
      try { win.history.pushState({ [historyKey]: { owner, index: next } }, "", target.href) }
      catch { win.location.assign(target.href); return }
      // A new branch of history replaces any recorded forward position.
      positions.delete(next)
      commit(target, next, null)
    }
    if (screenPath(target) !== screenPath(win.location) && hasUnsavedChanges()) ask(open)
    else open()
    return true
  }

  function click(event) {
    const link = event.target?.closest?.("a[href]")
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey
      || (link.target && link.target.toLowerCase() !== "_self") || link.hasAttribute("download") || link.hasAttribute("data-astro-reload")) return
    if (openWorkspace(new URL(link.href, win.location.href))) event.preventDefault()
  }

  function pop(event) {
    const target = new URL(win.location.href)
    const next = event.state?.[historyKey]
    if (next?.owner !== owner || !Number.isSafeInteger(next.index) || !isWorkspacePath(target.pathname)) {
      if (screenPath(target) !== currentPath) win.location.reload()
      return
    }
    if (restoring !== null) {
      if (next.index !== index) return
      const destination = restoring.destination
      restoring = null
      if (destination !== null) ask(() => {
        approved = destination
        win.history.go(destination - index)
      })
      return
    }
    if (next.index === approved) {
      approved = null
    } else if (next.index !== index && (pending || (screenPath(target) !== currentPath && hasUnsavedChanges()))) {
      restoring = { destination: pending ? null : next.index }
      win.history.go(index - next.index)
      return
    }
    remember()
    commit(target, next.index, positions.get(next.index) ?? null)
  }

  doc.addEventListener("click", click)
  win.addEventListener("popstate", pop)
  return {
    openWorkspace,
    dispose() {
      disposed = true
      doc.removeEventListener("click", click)
      win.removeEventListener("popstate", pop)
      win.history.scrollRestoration = previousRestoration
    },
  }
}
