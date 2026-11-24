import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ComponentType } from "react"
import { AdminShellLayout } from "./AdminShell"
import { AdminWorkspaceContext, type Administrator } from "./AdminWorkspaceContext"
import { installWorkspaceNavigation, type WorkspaceScroll } from "../lib/admin-navigation-guards.mjs"
import { isWorkspacePath, workspaceRoute } from "../lib/admin-workspace-routes.mjs"
import { Skeleton } from "./ui/skeleton"
import { Dialog, Heading, Modal, ModalOverlay, RouterProvider, Text } from "react-aria-components"
import { Button } from "./ui/button"
import { WorkspaceBoundary } from "./WorkspaceBoundary"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"

// Keep the shared chrome alive; each workspace is a separate lazy chunk and is
// mounted afresh on navigation. Only display lists reuse session memory;
// editorial reads remain fresh and preserve their optimistic revision checks.
const screenLoaders = {
  "news-categories": () => import("./NewsCategoriesApp").then(m => ({ default: m.NewsCategoriesApp })),
  "editorial-pages": () => import("./EditorialPagesApp").then(m => ({ default: m.EditorialPagesApp })),
  news: () => import("./NewsApp").then(m => ({ default: m.NewsApp })),
  "news-editor": () => import("./NewsEditorApp").then(m => ({ default: m.NewsEditorApp })),
  "official-site": () => import("./OfficialSitePageApp").then(m => ({ default: m.OfficialSitePageApp })),
  faq: () => import("./FaqPageApp").then(m => ({ default: m.FaqPageApp })),
  routers: () => import("./SpeedTestPageApp").then(m => ({ default: (props: { apiUrl: string }) => <m.SpeedTestPageApp {...props} editor="routers" /> })),
  "speed-test": () => import("./SpeedTestPageApp").then(m => ({ default: m.SpeedTestPageApp })),
  "support": () => import("./SupportPageApp").then(m => ({ default: m.SupportPageApp })),
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

type WorkspaceScreen = ComponentType<{ apiUrl: string }>
const screens = Object.fromEntries(Object.entries(screenLoaders).map(([key, loader]) => [key, lazy<WorkspaceScreen>(loader)])) as Record<keyof typeof screenLoaders, ReturnType<typeof lazy<WorkspaceScreen>>>

function restoreWorkspaceScroll(hash: string, position: WorkspaceScroll | null) {
  const main = document.getElementById("admin-content")
  if (!hash) main?.focus({ preventScroll: true })
  let fragment = hash.slice(1)
  try { fragment = decodeURIComponent(fragment) } catch { /* Unknown fragment. */ }
  const observer = new MutationObserver(() => { if (apply()) cleanup() })
  const stop = window.setTimeout(() => {
    if (position) window.scrollTo(position.left, position.top)
    cleanup()
  }, 6000)
  const frame = window.requestAnimationFrame(() => {
    if (apply()) cleanup()
    else if (main) observer.observe(main, { childList: true, subtree: true })
  })

  function apply() {
    if (position) {
      const height = document.scrollingElement?.scrollHeight ?? 0
      if (position.top > Math.max(0, height - window.innerHeight) + 1) return false
      window.scrollTo(position.left, position.top)
    } else if (fragment) {
      const anchor = document.getElementById(fragment)
      if (!anchor) return false
      anchor.scrollIntoView()
      anchor.focus({ preventScroll: true })
    } else window.scrollTo(0, 0)
    return true
  }

  function cleanup() {
    observer.disconnect()
    window.clearTimeout(stop)
    window.cancelAnimationFrame(frame)
    window.removeEventListener("wheel", cleanup)
    window.removeEventListener("touchstart", cleanup)
  }
  window.addEventListener("wheel", cleanup, { once: true, passive: true })
  window.addEventListener("touchstart", cleanup, { once: true, passive: true })
  return cleanup
}

export function AdminWorkspace({ apiUrl, initialPath }: { apiUrl: string; initialPath: string }) {
  const [path, setPath] = useState(initialPath)
  const [mounted, setMounted] = useState(false)
  const [user, setUser] = useState<Administrator | null>(null)
  const [sessionError, setSessionError] = useState(false)
  const [outdated, setOutdated] = useState(false)
  const [scrollRequest, setScrollRequest] = useState<{ hash: string; position: WorkspaceScroll | null } | null>(null)
  const [confirmation, setConfirmation] = useState<{ resolve: (approved: boolean) => void } | null>(null)
  const navigation = useRef<ReturnType<typeof installWorkspaceNavigation> | null>(null)
  const openAriaLink = useCallback((href: string) => {
    const target = new URL(href, window.location.href)
    if (!navigation.current?.openWorkspace(target)) window.location.assign(target.href)
  }, [])
  useEffect(() => {
    let disposed = false
    let staleBundle = false
    let checkedAt = 0
    const currentBundle = document.querySelector('astro-island[component-export="AdminWorkspace"]')?.getAttribute("component-url")
    const checkVersion = () => {
      if (import.meta.env.DEV || !currentBundle || disposed || staleBundle || Date.now() - checkedAt < 60_000) return
      checkedAt = Date.now()
      void fetch("/workspace-version.json", { cache: "no-store" }).then(response => response.ok ? response.json() : null).then(version => {
        if (!disposed && typeof version?.componentUrl === "string" && version.componentUrl !== currentBundle) {
          staleBundle = true
          setOutdated(true)
        }
      }).catch(() => undefined)
    }
    const navigate = (target: URL, position: WorkspaceScroll | null) => {
      setPath(target.pathname + target.search)
      document.title = workspaceRoute(target.pathname).title
      setScrollRequest({ hash: target.hash, position })
      document.dispatchEvent(new Event("admin:workspace-navigated"))
      checkVersion()
    }
    const expired = () => { setUser(null); window.location.replace("/login") }
    const verified = () => setSessionError(false)
    const verificationFailed = () => setSessionError(true)
    const preload = (event: Event) => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!anchor || anchor.hasAttribute('download')) return
      const url = new URL(anchor.getAttribute('href') || '', window.location.href)
      if (url.origin !== window.location.origin || !isWorkspacePath(url.pathname) || staleBundle) return
      const loader = screenLoaders[workspaceRoute(url.pathname).screen]
      // Chunk preloading never reads API data or full publication catalogs.
      if (loader) void loader().catch(() => undefined)
    }
    setPath(window.location.pathname + window.location.search)
    if (window.location.hash) setScrollRequest({ hash: window.location.hash, position: null })
    setMounted(true)
    checkVersion()
    window.addEventListener("focus", checkVersion)
    window.addEventListener("admin:session-expired", expired)
    window.addEventListener("admin:session-changed", expired)
    window.addEventListener("admin:session-verified", verified)
    window.addEventListener("admin:session-verification-failed", verificationFailed)
    document.addEventListener("pointerover", preload)
    document.addEventListener("focusin", preload)
    const guards = installWorkspaceNavigation(window, document, {
      confirm: () => new Promise<boolean>(resolve => setConfirmation({ resolve })),
      navigate,
      canNavigate: () => !staleBundle,
    })
    navigation.current = guards
    return () => {
      navigation.current = null
      disposed = true
      window.removeEventListener("focus", checkVersion)
      window.removeEventListener("admin:session-expired", expired)
      window.removeEventListener("admin:session-changed", expired)
      window.removeEventListener("admin:session-verified", verified)
      window.removeEventListener("admin:session-verification-failed", verificationFailed)
      document.removeEventListener("pointerover", preload)
      document.removeEventListener("focusin", preload)
      guards.dispose()
    }
  }, [])
  useEffect(() => {
    if (scrollRequest) return restoreWorkspaceScroll(scrollRequest.hash, scrollRequest.position)
  }, [scrollRequest])
  const sessionReady = useCallback((next: Administrator) => {
    setUser(current => current?.id === next.id && current.email === next.email ? current : next)
    if (!window.location.hash) document.getElementById("admin-content")?.focus({ preventScroll: true })
  }, [])
  const route = workspaceRoute(path)
  const Screen = screens[route.screen]
  return <RouterProvider navigate={openAriaLink}><AdminWorkspaceContext.Provider value={sessionReady}>
    <AdminShellLayout apiUrl={apiUrl} user={user} active={route.active}>
      {outdated ? <Alert className="m-6 w-auto"><AlertTitle>Админка обновилась</AlertTitle><AlertDescription>Откройте новую версию, когда закончите работу на этой странице.</AlertDescription><Button variant="outline" onClick={() => window.location.reload()}>Обновить админку</Button></Alert> : null}
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
  </AdminWorkspaceContext.Provider></RouterProvider>
}
