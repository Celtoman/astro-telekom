import { lazy, Suspense, useCallback, useEffect, useState } from "react"
import { AdminShellLayout } from "./AdminShell"
import { AdminWorkspaceContext, type Administrator } from "./AdminWorkspaceContext"
import { installNavigationGuards } from "../lib/admin-navigation-guards.mjs"
import { workspaceRoute } from "../lib/admin-workspace-routes.mjs"
import { Skeleton } from "./ui/skeleton"
import { navigate as navigatePage } from "astro:transitions/client"
import { Dialog, Heading, Modal, ModalOverlay, Text } from "react-aria-components"
import { Button } from "./ui/button"
import { WorkspaceBoundary } from "./WorkspaceBoundary"

// Keep the shared chrome alive; each workspace is a separate lazy chunk and is
// mounted afresh on navigation, so editorial data never comes from a page cache.
const screens = {
  overview: lazy(() => import("./AdminApp").then(m => ({ default: m.AdminApp }))),
  tariffs: lazy(() => import("./TariffsApp").then(m => ({ default: m.TariffsApp }))),
  "tariffs-edit": lazy(() => import("./TariffEditorApp").then(m => ({ default: m.TariffEditorApp }))),
  "tariffs-import": lazy(() => import("./TariffImportApp").then(m => ({ default: m.TariffImportApp }))),
  cities: lazy(() => import("./CitiesApp").then(m => ({ default: m.CitiesApp }))),
  "cities-import": lazy(() => import("./CityImportApp").then(m => ({ default: m.CityImportApp }))),
  leads: lazy(() => import("./LeadsApp").then(m => ({ default: m.LeadsApp }))),
  redirects: lazy(() => import("./RedirectsApp").then(m => ({ default: m.RedirectsApp }))),
  variables: lazy(() => import("./VariablesApp").then(m => ({ default: m.VariablesApp }))),
  publication: lazy(() => import("./PublicationApp").then(m => ({ default: m.PublicationApp }))),
  preview: lazy(() => import("./PreviewApp").then(m => ({ default: m.PreviewApp }))),
  templates: lazy(() => import("./TariffTemplateApp").then(m => ({ default: m.TariffTemplateApp }))),
  "home-screens": lazy(() => import("./HomeScreensApp").then(m => ({ default: m.HomeScreensApp }))),
  "seo-templates": lazy(() => import("./SeoTemplatesApp").then(m => ({ default: m.SeoTemplatesApp }))),
  "seo-sitemap": lazy(() => import("./SitemapApp").then(m => ({ default: m.SitemapApp }))),
  audit: lazy(() => import("./AuditApp").then(m => ({ default: m.AuditApp }))),
  trash: lazy(() => import("./TrashApp").then(m => ({ default: m.TrashApp }))),
}

export function AdminWorkspace({ apiUrl, initialPath }: { apiUrl: string; initialPath: string }) {
  const [path, setPath] = useState(initialPath)
  const [mounted, setMounted] = useState(false)
  const [user, setUser] = useState<Administrator | null>(null)
  const [confirmation, setConfirmation] = useState<{ resolve: (approved: boolean) => void } | null>(null)
  useEffect(() => {
    const navigate = () => setPath(window.location.pathname + window.location.search)
    const expired = () => { setUser(null); window.location.replace("/login") }
    navigate()
    setMounted(true)
    document.addEventListener("astro:after-swap", navigate)
    const versionBoundary = (event: Event) => {
      const nextDocument = (event as Event & { newDocument: Document }).newDocument
      const selector = 'astro-island[data-astro-transition-persist="admin-workspace"]'
      const current = document.querySelector(selector), next = nextDocument.querySelector(selector)
      if (current && next && current.getAttribute("component-url") !== next.getAttribute("component-url")) {
        // A code deployment must mount its new runtime, not persist the old one.
        next.removeAttribute("data-astro-transition-persist")
      }
    }
    document.addEventListener("astro:before-swap", versionBoundary)
    window.addEventListener("admin:session-expired", expired)
    const removeGuards = installNavigationGuards(window, document, {
      confirm: () => new Promise<boolean>(resolve => setConfirmation({ resolve })),
      navigate: href => { void navigatePage(href) },
    })
    return () => {
      document.removeEventListener("astro:after-swap", navigate)
      document.removeEventListener("astro:before-swap", versionBoundary)
      window.removeEventListener("admin:session-expired", expired)
      removeGuards()
    }
  }, [])
  const sessionReady = useCallback((next: Administrator) => {
    setUser(current => current?.id === next.id && current.email === next.email ? current : next)
    if (!window.location.hash) document.getElementById("admin-content")?.focus({ preventScroll: true })
  }, [])
  const route = workspaceRoute(path)
  const Screen = screens[route.screen]
  return <AdminWorkspaceContext.Provider value={sessionReady}>
    <AdminShellLayout apiUrl={apiUrl} user={user} active={route.active}>
      <WorkspaceBoundary key={path}><Suspense fallback={<div className="mx-auto flex max-w-7xl flex-col gap-6 p-6" aria-busy="true" aria-label="Загружаем раздел"><Skeleton className="h-10 w-72" /><Skeleton className="h-80 w-full" /></div>}>
        {mounted ? <Screen key={path} apiUrl={apiUrl} /> : <div aria-busy="true" aria-label="Загружаем раздел" className="p-6"><Skeleton className="h-80 w-full" /></div>}
      </Suspense></WorkspaceBoundary>
    </AdminShellLayout>
    <ModalOverlay isDismissable isOpen={!!confirmation} onOpenChange={open => { if (!open) { confirmation?.resolve(false); setConfirmation(null) } }} className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 p-4 backdrop-blur-xs">
      <Modal className="w-full max-w-md rounded-xl border bg-background p-6 shadow-xl">
        <Dialog className="space-y-4 outline-none">
          <Heading slot="title" className="font-heading text-lg font-semibold">Есть несохранённые изменения</Heading>
          <Text slot="description" className="block text-sm text-muted-foreground">При переходе в другой раздел эти изменения будут потеряны.</Text>
          <div className="flex flex-wrap justify-end gap-2">
            <Button autoFocus variant="outline" onClick={() => { confirmation?.resolve(false); setConfirmation(null) }}>Остаться</Button>
            <Button variant="destructive" onClick={() => { confirmation?.resolve(true); setConfirmation(null) }}>Перейти без сохранения</Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  </AdminWorkspaceContext.Provider>
}
