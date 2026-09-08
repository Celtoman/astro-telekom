import { useCallback, useEffect, useState } from "react"
import { Building2, CircleAlert, FileUp, Inbox, LogOut, PackageOpen, Settings2 } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Skeleton } from "./ui/skeleton"

interface Administrator {
  id: string
  email: string
}

type AppState =
  | { status: "loading" }
  | { status: "ready"; user: Administrator }
  | { status: "error"; message: string }

const sections = [
  { title: "Тарифы", description: "Каталог, импорт и состояние пересборки", icon: PackageOpen },
  { title: "Города", description: "Справочник из 207 городов; опубликована только Казань", icon: Building2 },
  { title: "Заявки", description: "Перенос рабочего журнала из временного CRM-приложения", icon: Inbox },
]

export function AdminApp({ apiUrl }: { apiUrl: string }) {
  const endpoint = apiUrl.replace(/\/$/, "")
  const [state, setState] = useState<AppState>({ status: "loading" })

  const verifySession = useCallback(async () => {
    setState({ status: "loading" })
    try {
      const response = await fetch(`${endpoint}/auth/me`, { credentials: "include" })
      if (response.status === 401) {
        window.location.replace("/login")
        return
      }
      if (!response.ok) throw new Error(`API вернул ${response.status}`)
      const payload = await response.json() as { user: Administrator }
      setState({ status: "ready", user: payload.user })
    } catch (caught: unknown) {
      setState({ status: "error", message: caught instanceof Error ? caught.message : "API недоступен" })
    }
  }, [endpoint])

  useEffect(() => { void verifySession() }, [verifySession])

  async function logout() {
    await fetch(`${endpoint}/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }).catch(() => undefined)
    window.location.replace("/login")
  }

  if (state.status === "loading") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-6 py-8" aria-busy="true" aria-label="Проверка сессии администратора">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </main>
    )
  }

  if (state.status === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
        <Card className="w-full max-w-lg">
          <CardHeader><CardTitle>Админка временно недоступна</CardTitle><CardDescription>Не удалось проверить административную сессию.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Alert variant="destructive"><CircleAlert /><AlertTitle>Ошибка подключения</AlertTitle><AlertDescription>{state.message}</AlertDescription></Alert>
            <Button onClick={() => void verifySession()}>Повторить проверку</Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <div className="grid min-h-screen bg-muted/30 lg:grid-cols-[240px_1fr]">
      <aside className="border-r bg-background p-4">
        <div className="flex items-center gap-3 px-2 py-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary font-heading text-lg font-semibold text-primary-foreground">д</span>
          <div><p className="font-heading font-semibold">Дом.ру</p><p className="text-xs text-muted-foreground">Платформа</p></div>
        </div>
        <nav className="mt-6 flex flex-col gap-1" aria-label="Разделы админки">
          <Button className="justify-start" variant="secondary"><Settings2 data-icon="inline-start" />Обзор</Button>
          <Button className="justify-start" variant="ghost" disabled><PackageOpen data-icon="inline-start" />Тарифы</Button>
          <Button className="justify-start" variant="ghost" disabled><Building2 data-icon="inline-start" />Города</Button>
          <Button className="justify-start" variant="ghost" disabled><Inbox data-icon="inline-start" />Заявки</Button>
        </nav>
      </aside>
      <main className="min-w-0">
        <header className="flex min-h-16 items-center justify-between gap-4 border-b bg-background px-6">
          <div><p className="text-sm font-medium">Администратор</p><p className="text-xs text-muted-foreground">{state.user.email}</p></div>
          <Button variant="outline" onClick={() => void logout()}><LogOut data-icon="inline-start" />Выйти</Button>
        </header>
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6 lg:p-8">
          <div><h1 className="font-heading text-2xl font-semibold">Администрирование платформы</h1><p className="mt-1 text-sm text-muted-foreground">Показываются только реализованные возможности и подтвержденные данные.</p></div>
          <Alert><FileUp /><AlertTitle>Миграция интерфейса продолжается</AlertTitle><AlertDescription>Старые демонстрационные KPI удалены. Рабочие разделы подключаются к API последовательно: тарифы, города, затем заявки.</AlertDescription></Alert>
          <section className="grid gap-4 md:grid-cols-3" aria-label="Планируемые рабочие разделы">
            {sections.map(({ title, description, icon: Icon }) => (
              <Card key={title}>
                <CardHeader><Icon /><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
                <CardContent><p className="text-sm text-muted-foreground">Экран еще не подключен к API.</p></CardContent>
              </Card>
            ))}
          </section>
        </div>
      </main>
    </div>
  )
}
