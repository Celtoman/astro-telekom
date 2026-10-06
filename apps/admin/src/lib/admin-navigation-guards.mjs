const dirtyOwners = new Set()
export function registerUnsavedChanges() {
  const owner = Symbol("editor")
  dirtyOwners.add(owner)
  return () => dirtyOwners.delete(owner)
}
export function hasUnsavedChanges() { return dirtyOwners.size > 0 }

export function installNavigationGuards(win, doc, options = {}) {
  let index = win.history.state?.index ?? 0
  let restoring = false
  let approvedIndex = null
  let pending = false
  let disposed = false
  const remember = () => { index = win.history.state?.index ?? index }
  const ask = options.confirm || (() => win.confirm("Покинуть раздел и потерять несохранённые изменения?"))
  const confirm = callback => {
    if (pending) return
    pending = true
    Promise.resolve(ask()).then(approved => { pending = false; if (approved && !disposed) callback() })
  }
  const click = event => {
    const link = event.target?.closest?.("a[href]")
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || link.target === "_blank" || link.hasAttribute("download") || link.hasAttribute("data-astro-reload")) return
    const target = new URL(link.href, win.location.href)
    if (target.origin !== win.location.origin || target.pathname === win.location.pathname && target.search === win.location.search) return
    if (hasUnsavedChanges()) {
      event.preventDefault(); event.stopImmediatePropagation()
      confirm(() => options.navigate ? options.navigate(target.href) : win.location.assign(target.href))
    }
  }
  const pop = event => {
    const block = () => { event.preventDefault(); event.stopImmediatePropagation() }
    if (restoring) { restoring = false; block(); return }
    const next = event.detail?.state?.index
    if (!Number.isInteger(next)) return
    if (approvedIndex === next) { approvedIndex = null; index = next; return }
    if (hasUnsavedChanges()) {
      block()
      restoring = true
      win.history.go(index - next)
      confirm(() => { approvedIndex = next; win.history.go(next - index) })
    } else index = next
  }
  doc.addEventListener("click", click, true)
  doc.addEventListener("admin:history-navigation", pop)
  doc.addEventListener("astro:after-swap", remember)
  return () => {
    disposed = true
    doc.removeEventListener("click", click, true)
    doc.removeEventListener("admin:history-navigation", pop)
    doc.removeEventListener("astro:after-swap", remember)
  }
}
