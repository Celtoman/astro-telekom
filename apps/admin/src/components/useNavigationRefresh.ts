import { useEffect, useRef } from "react"

// Only mounted screens subscribe. Editors do not use this hook: an automatic
// refresh must never replace a form containing the operator's changes.
export function useNavigationRefresh(refresh: () => void) {
  const current = useRef(refresh)
  current.current = refresh
  useEffect(() => {
    const update = () => current.current()
    const visible = () => { if (document.visibilityState === "visible") update() }
    window.addEventListener("admin:navigation-invalidated", update)
    window.addEventListener("focus", update)
    document.addEventListener("visibilitychange", visible)
    return () => {
      window.removeEventListener("admin:navigation-invalidated", update)
      window.removeEventListener("focus", update)
      document.removeEventListener("visibilitychange", visible)
    }
  }, [])
}
