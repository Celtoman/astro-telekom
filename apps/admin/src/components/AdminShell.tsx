import type { ReactNode } from "react"
import { Building2, FileClock, FileUp, Home, Inbox, List, LogOut, PackageOpen, Route } from "lucide-react"
import { requestJson } from "../lib/admin-api.mjs"
import { Button } from "./ui/button"

interface Administrator {
  id: string
  email: string
}

export function AdminShell({ apiUrl, user, active, children }: {
  apiUrl: string
  user: Administrator
  active: "overview" | "tariffs" | "tariffs-import" | "cities" | "cities-import" | "leads" | "redirects" | "audit"
  children: ReactNode
}) {
  async function logout() {
    await requestJson(apiUrl, "/auth/logout", { method: "POST", body: {} }).catch(() => undefined)
    window.location.replace("/login")
  }

  const navVariant = (item: typeof active) => item === active ? "secondary" as const : "ghost" as const
  const sectionVariant = (item: "tariffs" | "cities") => (active === item || active === `${item}-import`) ? "secondary" as const : "ghost" as const

  return (
    <div className="grid min-h-screen bg-muted/30 lg:grid-cols-[240px_1fr]">
      <aside className="border-r bg-background p-4">
        <div className="flex items-center gap-3 px-2 py-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary font-heading text-lg font-semibold text-primary-foreground">д</span>
          <div><p className="font-heading font-semibold">Дом.ру</p><p className="text-xs text-muted-foreground">Платформа</p></div>
        </div>
        <nav className="mt-6 flex flex-col gap-1" aria-label="Разделы админки">
          <Button className="justify-start" variant={navVariant("overview")} asChild><a href="/"><Home data-icon="inline-start" />Обзор</a></Button>
          <Button className="justify-start" variant={sectionVariant("tariffs")} asChild><a href="/tariffs"><PackageOpen data-icon="inline-start" />Тарифы</a></Button>
          <div className="ml-4 flex flex-col gap-1 border-l pl-3">
            <Button size="sm" className="justify-start" variant={navVariant("tariffs")} asChild><a href="/tariffs"><List data-icon="inline-start" />Каталог</a></Button>
            <Button size="sm" className="justify-start" variant={navVariant("tariffs-import")} asChild><a href="/tariffs/import"><FileUp data-icon="inline-start" />Импорт</a></Button>
          </div>
          <Button className="justify-start" variant={sectionVariant("cities")} asChild><a href="/cities"><Building2 data-icon="inline-start" />Города</a></Button>
          <div className="ml-4 flex flex-col gap-1 border-l pl-3">
            <Button size="sm" className="justify-start" variant={navVariant("cities")} asChild><a href="/cities"><List data-icon="inline-start" />Каталог</a></Button>
            <Button size="sm" className="justify-start" variant={navVariant("cities-import")} asChild><a href="/cities/import"><FileUp data-icon="inline-start" />Импорт</a></Button>
          </div>
          <Button className="justify-start" variant={navVariant("leads")} asChild><a href="/leads"><Inbox data-icon="inline-start" />Заявки</a></Button>
          <Button className="justify-start" variant={navVariant("redirects")} asChild><a href="/redirects"><Route data-icon="inline-start" />Редиректы</a></Button>
          <Button className="justify-start" variant={navVariant("audit")} asChild><a href="/audit"><FileClock data-icon="inline-start" />История изменений</a></Button>
        </nav>
      </aside>
      <main className="min-w-0">
        <header className="flex min-h-16 items-center justify-between gap-4 border-b bg-background px-6">
          <div><p className="text-sm font-medium">Администратор</p><p className="text-xs text-muted-foreground">{user.email}</p></div>
          <Button variant="outline" onClick={() => void logout()}><LogOut data-icon="inline-start" />Выйти</Button>
        </header>
        {children}
      </main>
    </div>
  )
}
