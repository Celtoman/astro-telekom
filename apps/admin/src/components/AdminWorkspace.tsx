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
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"

// Keep the shared chrome alive; each workspace is a separate lazy chunk and is
// mounted afresh on navigation. Only display lists reuse session memory;
// editorial reads remain fresh and preserve their optimistic revision checks.
const screenLoaders = {
  account: () => import("./AccountPageApp").then(m => ({ default: m.AccountPageApp })),
  overview: () => import("./AdminApp").then(m => ({ default: m.AdminApp })),
  tariffs: () => import("./TariffsApp").then(m => ({ default: m.TariffsApp })),
  "tariffs-edit": () => import("./TariffEditorApp").then(m => ({ default: m.TariffEditorApp })),
  "tariffs-import": () => import("./TariffImportApp").then(m => ({ default: m.TariffImportApp })),
  cities: () => import("./CitiesApp").then(m => ({ default: m.CitiesApp })),
  "cities-import": () => import("./CityImportApp").then(m => ({ default: m.CityImportApp })),
  leads: () => import("./LeadsApp").then(m => ({ default: m.LeadsApp })),
  redirects: () => import("./RedirectsApp").then(m => ({ default: m.RedirectsApp })),
  variables: () => import("./VariablesApp").then(m => ({ default: m.VariablesApp })),
  publication: () => import("./PublicationApp").then(m => ({ default: m.PublicationApp })),
  preview: () => import("./PreviewApp").then(m => ({ default: m.PreviewApp })),
  templates: () => import("./PageTemplatesApp").then(m => ({ default: m.PageTemplatesApp })),
  "block-passports": () => import("./BlockPassportsApp").then(m => ({ default: m.BlockPassportsApp })),
  "tariff-collection": () => import("./TariffCollectionApp").then(m => ({ default: m.TariffCollectionApp })),
  "tariff-template": () => import("./TariffTemplateApp").then(m => ({ default: m.TariffTemplateApp })),
  "home-screens": () => import("./HomeScreensApp").then(m => ({ default: m.HomeScreensApp })),
  "seo-templates": () => import("./SeoTemplatesApp").then(m => ({ default: m.SeoTemplatesApp })),
  "seo-sitemap": () => import("./SitemapApp").then(m => ({ default: m.SitemapApp })),
  audit: () => import("./AuditApp").then(m => ({ default: m.AuditApp })),
  trash: () => import("./TrashApp").then(m => ({ default: m.TrashApp })),
}

const screens = Object.fromEntries(Object.entries(screenLoaders).map(([key, loader]) => [key, lazy(loader)])) as Record<keyof typeof screenLoaders, ReturnType<typeof lazy>>

export function AdminWorkspace({ apiUrl, initialPath }: { apiUrl: string; initialPath: string }) {
  const [path, setPath] = useState(initialPath)
  const [mounted, setMounted] = useState(false)
  const [user, setUser] = useState<Administrator | null>(null)
  const [sessionError, setSessionError] = useState(false)
  const [confirmation, setConfirmation] = useState<{ resolve: (approved: boolean) => void } | null>(null)
  useEffect(() => {
    const navigate = () => setPath(window.location.pathname + window.location.search)
    const expired = () => { setUser(null); window.location.replace("/login") }
    const verified = () => setSessionError(false)
    const verificationFailed = () => setSessionError(true)
    const preload = (event: Event) => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!anchor || anchor.hasAttribute('download')) return
      const url = new URL(anchor.getAttribute('href') || '', window.location.href)
      if (url.origin !== window.location.origin) return
      const loader = screenLoaders[workspaceRoute(url.pathname).screen]
      // Chunk preloading never reads API data or full publication catalogs.
      if (loader) void loader().catch(() => undefined)
    }
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
    window.addEventListener("admin:session-changed", expired)
    window.addEventListener("admin:session-verified", verified)
    window.addEventListener("admin:session-verification-failed", verificationFailed)
    document.addEventListener("pointerover", preload)
    document.addEventListener("focusin", preload)
    const removeGuards = installNavigationGuards(window, document, {
      confirm: () => new Promise<boolean>(resolve => setConfirmation({ resolve })),
      navigate: href => { void navigatePage(href) },
    })
    return () => {
      document.removeEventListener("astro:after-swap", navigate)
      document.removeEventListener("astro:before-swap", versionBoundary)
      window.removeEventListener("admin:session-expired", expired)
      window.removeEventListener("admin:session-changed", expired)
      window.removeEventListener("admin:session-verified", verified)
      window.removeEventListener("admin:session-verification-failed", verificationFailed)
      document.removeEventListener("pointerover", preload)
      document.removeEventListener("focusin", preload)
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
      {sessionError ? <Alert variant="destructive" className="m-6 w-auto"><AlertTitle>Не удалось проверить доступ</AlertTitle><AlertDescription>Проверка сессии временно недоступна. При следующем переходе доступ будет проверен заново.</AlertDescription></Alert> : null}
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
