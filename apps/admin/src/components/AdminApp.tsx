import { useCallback, useEffect, useState } from "react"
import { Building2, CircleAlert, FileUp, Inbox, PackageOpen } from "lucide-react"
import { AdminShell } from "./AdminShell"
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
  { title: "Тарифы", description: "Каталог, импорт и состояние пересборки", icon: PackageOpen, href: "/tariffs" },
  { title: "Города", description: "Справочник, импорт и состояние пересборки", icon: Building2, href: "/cities" },
  { title: "Заявки", description: "Рабочий журнал обращений, статусов и доставки", icon: Inbox, href: "/leads" },
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
    <AdminShell apiUrl={apiUrl} user={state.user} active="overview">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6 lg:p-8">
          <div><h1 className="font-heading text-2xl font-semibold">Администрирование платформы</h1><p className="mt-1 text-sm text-muted-foreground">Обзор доступных административных разделов.</p></div>
          <Alert><FileUp /><AlertTitle>Данные загружаются в разделах</AlertTitle><AlertDescription>Тарифы, города и заявки используют административный API. Актуальные счетчики и состояния загружаются внутри каждого раздела.</AlertDescription></Alert>
          <section className="grid gap-4 md:grid-cols-3" aria-label="Разделы админки">
            {sections.map(({ title, description, icon: Icon, href }) => (
              <Card key={title}>
                <CardHeader><Icon /><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
                <CardContent>{href ? <Button variant="outline" asChild><a href={href}>Открыть раздел</a></Button> : <p className="text-sm text-muted-foreground">Экран еще не подключен к API.</p>}</CardContent>
              </Card>
            ))}
          </section>
      </div>
    </AdminShell>
  )
}
