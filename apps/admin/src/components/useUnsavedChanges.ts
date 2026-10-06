import { useEffect } from "react"
import { registerUnsavedChanges } from "../lib/admin-navigation-guards.mjs"

export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return
    const unregister = registerUnsavedChanges()
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }
    window.addEventListener("beforeunload", warn)
    return () => { unregister(); window.removeEventListener("beforeunload", warn) }
  }, [dirty])
}
