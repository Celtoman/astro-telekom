import type { ReactNode } from "react"
import { Building2, Home, Inbox, LogOut, PackageOpen } from "lucide-react"
import { requestJson } from "../lib/admin-api.mjs"
import { Button } from "./ui/button"

interface Administrator {
  id: string
  email: string
}

export function AdminShell({ apiUrl, user, active, children }: {
  apiUrl: string
  user: Administrator
  active: "overview" | "tariffs" | "cities" | "leads"
  children: ReactNode
}) {
  async function logout() {
    await requestJson(apiUrl, "/auth/logout", { method: "POST", body: {} }).catch(() => undefined)
    window.location.replace("/login")
  }

  const navVariant = (item: typeof active) => item === active ? "secondary" as const : "ghost" as const

  return (
    <div className="grid min-h-screen bg-muted/30 lg:grid-cols-[240px_1fr]">
      <aside className="border-r bg-background p-4">
        <div className="flex items-center gap-3 px-2 py-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary font-heading text-lg font-semibold text-primary-foreground">д</span>
          <div><p className="font-heading font-semibold">Дом.ру</p><p className="text-xs text-muted-foreground">Платформа</p></div>
        </div>
        <nav className="mt-6 flex flex-col gap-1" aria-label="Разделы админки">
          <Button className="justify-start" variant={navVariant("overview")} asChild><a href="/"><Home data-icon="inline-start" />Обзор</a></Button>
          <Button className="justify-start" variant={navVariant("tariffs")} asChild><a href="/tariffs"><PackageOpen data-icon="inline-start" />Тарифы</a></Button>
          <Button className="justify-start" variant={navVariant("cities")} disabled><Building2 data-icon="inline-start" />Города</Button>
          <Button className="justify-start" variant={navVariant("leads")} disabled><Inbox data-icon="inline-start" />Заявки</Button>
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
