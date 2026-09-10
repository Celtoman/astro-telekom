import { useEffect, useState } from "react"
import { CircleAlert, Clock3, MapPin, Phone, ShieldCheck } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card"
import { Skeleton } from "./ui/skeleton"

interface LeadCard {
  id: string
  createdAt: string
  phone: string
  name: string | null
  address: string | null
  processingStatus: string
  city: { name: string; slug: string }
  tariff: { name: string } | null
}

type ViewState =
  | { status: "loading" }
  | { status: "ready"; lead: LeadCard }
  | { status: "error"; message: string }

const accessRequests = new Map<string, Promise<LeadCard>>()

function consumeOnce(apiUrl: string, leadId: string, token: string) {
  const key = `${leadId}:${token}`
  const existing = accessRequests.get(key)
  if (existing) return existing
  const request = fetch(`${apiUrl}/lead-access/${encodeURIComponent(leadId)}/consume`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  }).then(async (response) => {
    if (!response.ok) throw new Error("Ссылка недействительна, уже использована или истекла")
    return response.json() as Promise<LeadCard>
  })
  accessRequests.set(key, request)
  return request
}

export function LeadAccessCard({ apiUrl }: { apiUrl: string }) {
  const [state, setState] = useState<ViewState>({ status: "loading" })

  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    const fragment = new URLSearchParams(window.location.hash.slice(1))
    const leadId = query.get("lead")
    const token = fragment.get("token")
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`)

    if (!leadId || !token) {
      setState({ status: "error", message: "В ссылке отсутствуют обязательные данные доступа" })
      return
    }

    consumeOnce(apiUrl.replace(/\/$/, ""), leadId, token)
      .then((lead) => setState({ status: "ready", lead }))
      .catch((error: unknown) => setState({
        status: "error",
        message: error instanceof Error ? error.message : "Не удалось проверить ссылку",
      }))
  }, [apiUrl])

  if (state.status === "loading") {
    return (
      <Card aria-busy="true" aria-label="Проверка одноразовой ссылки" className="w-full max-w-xl shadow-xs">
        <CardHeader>
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (state.status === "error") {
    return (
      <Card className="w-full max-w-xl shadow-xs">
        <CardHeader>
          <CardTitle>Доступ к заявке закрыт</CardTitle>
          <CardDescription>Одноразовая ссылка не прошла серверную проверку.</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Заявка не открыта</AlertTitle>
            <AlertDescription>{state.message}. Запросите новую ссылку у администратора.</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  const { lead } = state
  return (
    <Card className="w-full max-w-xl shadow-xs">
      <CardHeader>
        <div className="mb-2 flex size-9 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
          <ShieldCheck />
        </div>
        <CardTitle>Заявка требует ручной обработки</CardTitle>
        <CardDescription>Одноразовый доступ подтверждён. Отображается только эта заявка.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="flex gap-3">
            <Phone className="mt-0.5 text-muted-foreground" />
            <div><dt className="text-xs text-muted-foreground">Контакт</dt><dd className="font-medium">{lead.name || "Имя не указано"}<br />{lead.phone}</dd></div>
          </div>
          <div className="flex gap-3">
            <MapPin className="mt-0.5 text-muted-foreground" />
            <div><dt className="text-xs text-muted-foreground">Адрес подключения</dt><dd className="font-medium">{lead.address || "Адрес не указан"}</dd></div>
          </div>
          <div className="flex gap-3">
            <MapPin className="mt-0.5 text-muted-foreground" />
            <div><dt className="text-xs text-muted-foreground">Город страницы</dt><dd className="font-medium">{lead.city.name}</dd></div>
          </div>
          <div className="flex gap-3 sm:col-span-2">
            <Clock3 className="mt-0.5 text-muted-foreground" />
            <div><dt className="text-xs text-muted-foreground">Создана</dt><dd className="font-medium">{new Date(lead.createdAt).toLocaleString("ru-RU")}</dd></div>
          </div>
        </dl>
        {lead.tariff && <p className="mt-5 rounded-lg bg-muted px-3 py-2 text-sm"><span className="text-muted-foreground">Тариф:</span> <strong>{lead.tariff.name}</strong></p>}
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground">Ссылка использована и больше не откроет заявку повторно. ID: {lead.id}</CardFooter>
    </Card>
  )
}
