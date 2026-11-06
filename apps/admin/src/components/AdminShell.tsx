import { useContext, useEffect, useState, type ReactNode } from "react"
import { AdminWorkspaceContext } from "./AdminWorkspaceContext"
import { CloudUpload, LogOut, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react"
import { cn } from "cn"
import { Dialog, Heading, Modal, ModalOverlay, Text } from "react-aria-components"
import {
  activeNavigationGroup,
  adminNavigation,
  ADMIN_GROUPS_STORAGE_KEY,
  ADMIN_SIDEBAR_STORAGE_KEY,
  readStoredGroups,
  readStoredSidebarExpanded,
  shouldToggleSidebar,
  type AdminSection,
} from "../lib/admin-navigation.mjs"
import { requestJson } from "../lib/admin-api.mjs"
import { hasUnsavedChanges } from "../lib/admin-navigation-guards.mjs"
import { clearEditorialRecovery } from "../lib/editorial-recovery.mjs"
import { AdminNavigation } from "./AdminNavigation"
import { PublicationIndicator } from "./PublicationIndicator"
import { Button } from "./ui/button"

interface Administrator {
  id: string
  email: string
}

export function AdminShell({ apiUrl, user, active, children }: {
  apiUrl: string
  user: Administrator
  active: AdminSection
  children: ReactNode
}) {
  const sessionReady = useContext(AdminWorkspaceContext)
  useEffect(() => { sessionReady?.(user) }, [sessionReady, user.id, user.email])
  if (sessionReady) return <>{children}</>
  return <AdminShellLayout apiUrl={apiUrl} user={user} active={active}>{children}</AdminShellLayout>
}

export function AdminShellLayout({ apiUrl, user, active, children }: {
  apiUrl: string; user: Administrator | null; active: AdminSection; children: ReactNode
}) {
  const activeGroup = activeNavigationGroup(adminNavigation, active)
  const [sidebarExpanded, setSidebarExpanded] = useState(true)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set(activeGroup ? [activeGroup] : []))
  const [mobileOpen, setMobileOpen] = useState(false)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [logoutBusy, setLogoutBusy] = useState(false)
  const [logoutError, setLogoutError] = useState('')

  useEffect(() => {
    const storedSidebar = readStoredSidebarExpanded(window.localStorage.getItem(ADMIN_SIDEBAR_STORAGE_KEY))
    if (storedSidebar !== null) setSidebarExpanded(storedSidebar)

    const groupIds = adminNavigation.filter((item) => item.children?.length).map((item) => item.id)
    const storedGroups = readStoredGroups(window.localStorage.getItem(ADMIN_GROUPS_STORAGE_KEY), groupIds)
    setExpandedGroups(new Set(activeGroup ? [...storedGroups, activeGroup] : storedGroups))
  }, [activeGroup])

  useEffect(() => { setMobileOpen(false) }, [active])
  useEffect(() => {
    const close = () => setMobileOpen(false)
    document.addEventListener("astro:after-swap", close)
    return () => document.removeEventListener("astro:after-swap", close)
  }, [])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target instanceof HTMLElement ? event.target : null
      if (!shouldToggleSidebar({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        targetTag: target?.tagName,
        contentEditable: target?.isContentEditable,
      })) return

      event.preventDefault()
      if (window.matchMedia("(max-width: 1023px)").matches) {
        setMobileOpen((current) => !current)
      } else {
        setSidebarExpanded((current) => {
          const next = !current
          window.localStorage.setItem(ADMIN_SIDEBAR_STORAGE_KEY, String(next))
          return next
        })
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  function setDesktopSidebarExpanded(expanded: boolean) {
    setSidebarExpanded(expanded)
    window.localStorage.setItem(ADMIN_SIDEBAR_STORAGE_KEY, String(expanded))
  }

  function setGroupOpen(id: string, open: boolean) {
    setExpandedGroups((current) => {
      const next = new Set(current)
      if (open) next.add(id)
      else next.delete(id)
      window.localStorage.setItem(ADMIN_GROUPS_STORAGE_KEY, JSON.stringify([...next]))
      return next
    })
  }

  async function logout(confirmed=false) {
    if(!confirmed&&hasUnsavedChanges()){setLogoutOpen(true);return}
    setLogoutBusy(true);setLogoutError('')
    try {
      await requestJson(apiUrl, "/auth/logout", { method: "POST", body: {} })
      try { if(user)clearEditorialRecovery(window.localStorage,user.id) } catch {}
      window.location.replace("/login")
    } catch {setLogoutError('Не удалось завершить сессию. Повторите выход.');setLogoutOpen(true)}
    finally {setLogoutBusy(false)}
  }

  return (
    <>
      <a href="#admin-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-background focus:p-3 focus:ring-3 focus:ring-ring">Перейти к содержимому</a>
      <div className="min-h-screen bg-muted/30 lg:flex">
        <aside className={cn("hidden shrink-0 flex-col border-r bg-background transition-[width] duration-200 lg:flex", sidebarExpanded ? "w-60" : "w-12")}>
          <div className={cn("flex items-center gap-2 p-2", !sidebarExpanded && "flex-col")}>
            <a href="/" className={cn("flex min-w-0 items-center gap-3 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50", !sidebarExpanded && "justify-center")} aria-label="Дом.ру — обзор админки">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary font-heading font-semibold text-primary-foreground">д</span>
              {sidebarExpanded ? <span className="min-w-0"><span className="block truncate font-heading font-semibold">Дом.ру</span><span className="block text-xs text-muted-foreground">Платформа</span></span> : null}
            </a>
            <Button className={cn(sidebarExpanded && "ml-auto")} size="icon" variant="ghost" onClick={() => setDesktopSidebarExpanded(!sidebarExpanded)} aria-label={sidebarExpanded ? "Свернуть боковую панель" : "Развернуть боковую панель"} title={`${sidebarExpanded ? "Свернуть" : "Развернуть"} боковую панель (Ctrl+B)`}>
              {sidebarExpanded ? <PanelLeftClose /> : <PanelLeftOpen />}
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <AdminNavigation active={active} collapsed={!sidebarExpanded} expandedGroups={expandedGroups} onGroupOpenChange={setGroupOpen} />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="flex min-h-16 flex-wrap items-center gap-2 border-b bg-background px-4 py-2 sm:gap-4 sm:px-6">
            <div className="flex min-w-0 flex-1 items-center gap-3">
                <Button className="min-h-11 min-w-11 lg:hidden" size="icon" variant="outline" aria-label="Открыть меню" title="Открыть меню (Ctrl+B)" onClick={() => setMobileOpen(true)}>
                  <Menu />
                </Button>
              <div className="min-w-0"><p className="text-sm font-medium">Администратор</p><p className="truncate text-xs text-muted-foreground">{user?.email ?? "Проверяем доступ…"}</p></div>
            </div>
            <div className="order-3 flex w-full flex-wrap items-center gap-2 sm:order-none sm:w-auto">
              {user ? <PublicationIndicator key={user.id} apiUrl={apiUrl} /> : null}
              <Button asChild variant={['news','news-categories','pages-news','pages-not-found'].includes(active)?'outline':'default'} className="min-h-11"><a href={active === "publication" ? "#publication-launch" : "/publication"}><CloudUpload data-icon="inline-start" />{['news','news-categories','pages-news','pages-not-found'].includes(active)?'Публикация других разделов':'Опубликовать изменения'}</a></Button>
            </div>
            <Button variant="outline" onClick={() => void logout()}><LogOut data-icon="inline-start" /><span className="hidden sm:inline">Выйти</span><span className="sr-only sm:hidden">Выйти</span></Button>
          </header>
          <main id="admin-content" tabIndex={-1}>{children}</main>
        </div>
      </div>

      <ModalOverlay isDismissable isOpen={mobileOpen} onOpenChange={setMobileOpen} className="fixed inset-0 bg-foreground/35 backdrop-blur-xs lg:hidden">
        <Modal className="fixed inset-y-0 left-0 w-72 max-w-[85vw] border-r bg-background p-2 shadow-xl lg:hidden">
        <Dialog className="flex h-full flex-col outline-none">
          <Heading slot="title" className="sr-only">Навигация админки</Heading>
          <Text slot="description" className="sr-only">Выберите раздел административного интерфейса.</Text>
          <div className="flex items-center gap-3 px-2 py-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary font-heading font-semibold text-primary-foreground">д</span>
            <div className="min-w-0 flex-1"><p className="font-heading font-semibold">Дом.ру</p><p className="text-xs text-muted-foreground">Платформа</p></div>
              <Button className="min-h-11 min-w-11" size="icon" variant="ghost" aria-label="Закрыть меню" onClick={() => setMobileOpen(false)}><X /></Button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-4">
            <AdminNavigation active={active} expandedGroups={expandedGroups} onGroupOpenChange={setGroupOpen} onNavigate={() => setMobileOpen(false)} />
          </div>
        </Dialog>
        </Modal>
      </ModalOverlay>
      <ModalOverlay isDismissable={!logoutBusy} isOpen={logoutOpen} onOpenChange={setLogoutOpen} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><Modal className="w-full max-w-lg rounded-xl border bg-background p-5 text-foreground shadow-lg"><Dialog className="space-y-5 outline-none"><Heading slot="title" className="text-lg font-semibold">Выйти из админки?</Heading><Text slot="description" className="text-sm text-muted-foreground">Несохранённые изменения будут потеряны. При выходе временные копии новостей в этом браузере удаляются. Сохранённые черновики останутся на сервере.</Text>{logoutError&&<p role="alert" className="text-sm text-destructive">{logoutError}</p>}<div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={logoutBusy} onClick={()=>setLogoutOpen(false)}>Продолжить работу</Button><Button type="button" disabled={logoutBusy} onClick={()=>void logout(true)}>Выйти</Button></div></Dialog></Modal></ModalOverlay>
    </>
  )
}
