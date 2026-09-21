import { useCallback, useEffect, useState } from "react"
import { CircleAlert, Save } from "lucide-react"
import { AdminApiError, requestJson } from "../lib/admin-api.mjs"
import { AdminShell } from "./AdminShell"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Field, FieldDescription, FieldLabel } from "./ui/field"
import { Input } from "./ui/input"
import { Skeleton } from "./ui/skeleton"

interface Administrator { id: string; email: string }
interface SiteSummary { id: string; name: string; slug: string }
interface SiteValues {
  id: string
  name: string
  slug: string
  connectionPhone: string | null
  supportPhone: string | null
  connectionPhoneFormatted: string | null
  supportPhoneFormatted: string | null
  workingRevision: number
  publishedRevision: number
  readinessErrors: string[]
}

type ScreenState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; user: Administrator; site: SiteSummary; values: SiteValues }

export function VariablesApp({ apiUrl }: { apiUrl: string }) {
  const [state, setState] = useState<ScreenState>({ status: "loading" })
  const [connectionPhone, setConnectionPhone] = useState("")
  const [supportPhone, setSupportPhone] = useState("")
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null)

  const load = useCallback(async () => {
    setState({ status: "loading" })
    try {
      const [session, sites] = await Promise.all([
        requestJson<{ user: Administrator }>(apiUrl, "/auth/me"),
        requestJson<SiteSummary[]>(apiUrl, "/admin/sites"),
      ])
      if (sites.length !== 1) throw new Error("Раздел значений сайта ожидает единственный сайт Дом.ру")
      const values = await requestJson<SiteValues>(apiUrl, `/admin/sites/${sites[0].id}/values`)
      setConnectionPhone(values.connectionPhoneFormatted || values.connectionPhone || "")
      setSupportPhone(values.supportPhoneFormatted || values.supportPhone || "")
      setState({ status: "ready", user: session.user, site: sites[0], values })
    } catch (caught: unknown) {
      if (caught instanceof AdminApiError && caught.status === 401) {
        window.location.replace("/login")
        return
      }
      setState({ status: "error", message: caught instanceof Error ? caught.message : "API недоступен" })
    }
  }, [apiUrl])

  useEffect(() => { void load() }, [load])

  async function save() {
    if (state.status !== "ready") return
    setSaving(true)
    setMessage(null)
    try {
      const values = await requestJson<SiteValues>(apiUrl, `/admin/sites/${state.site.id}/values`, {
        method: "PATCH",
        body: {
          expectedWorkingRevision: state.values.workingRevision,
          connectionPhone,
          supportPhone,
        },
      })
      setConnectionPhone(values.connectionPhoneFormatted || "")
      setSupportPhone(values.supportPhoneFormatted || "")
      setState({ ...state, values })
      setMessage({ kind: "success", text: `Рабочая версия ${values.workingRevision} сохранена. Публичный сайт изменится после общей публикации.` })
    } catch (caught: unknown) {
      setMessage({ kind: "error", text: caught instanceof Error ? caught.message : "Значения не сохранены" })
    } finally {
      setSaving(false)
    }
  }

  if (state.status === "loading") return <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-8" aria-busy="true"><Skeleton className="h-10 w-72" /><Skeleton className="h-80 w-full" /></main>
  if (state.status === "error") return <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6"><Card className="w-full max-w-lg"><CardHeader><CardTitle>Переменные недоступны</CardTitle><CardDescription>Не удалось загрузить значения сайта.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><Alert variant="destructive"><CircleAlert /><AlertTitle>Ошибка API</AlertTitle><AlertDescription>{state.message}</AlertDescription></Alert><Button onClick={() => void load()}>Повторить</Button></CardContent></Card></main>

  return <AdminShell apiUrl={apiUrl} user={state.user} active="variables">
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6 lg:p-8">
      <div><h1 className="font-heading text-2xl font-semibold">Переменные</h1><p className="mt-1 text-sm text-muted-foreground">Редактируемые глобальные значения сайта {state.site.name}. Городские и тарифные подстановки будут показаны отдельным каталогом.</p></div>
      {message ? <Alert variant={message.kind === "error" ? "destructive" : "default"}>{message.kind === "error" ? <CircleAlert /> : <Save />}<AlertTitle>{message.kind === "error" ? "Не удалось сохранить" : "Изменения приняты"}</AlertTitle><AlertDescription>{message.text}</AlertDescription></Alert> : null}
      {state.values.readinessErrors.length > 0 ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Публикация заблокирована</AlertTitle><AlertDescription>Заполните: {state.values.readinessErrors.join(", ")}.</AlertDescription></Alert> : null}
      <Card>
        <CardHeader><CardTitle>Значения сайта</CardTitle><CardDescription>Телефоны хранятся в формате 7XXXXXXXXXX, а отображение и ссылка tel: формируются автоматически.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Field><FieldLabel htmlFor="connection-phone">Телефон подключения</FieldLabel><Input id="connection-phone" inputMode="tel" value={connectionPhone} onChange={(event) => setConnectionPhone(event.target.value)} placeholder="+7 (800) 555-72-44" /><FieldDescription>{state.values.connectionPhoneFormatted ? <a className="underline" href={`tel:+${state.values.connectionPhone}`}>{state.values.connectionPhoneFormatted}</a> : "Не задан"}</FieldDescription></Field>
          <Field><FieldLabel htmlFor="support-phone">Телефон техподдержки</FieldLabel><Input id="support-phone" inputMode="tel" value={supportPhone} onChange={(event) => setSupportPhone(event.target.value)} placeholder="+7 (800) 250-77-77" /><FieldDescription>{state.values.supportPhoneFormatted ? <a className="underline" href={`tel:+${state.values.supportPhone}`}>{state.values.supportPhoneFormatted}</a> : "Не задан"}</FieldDescription></Field>
          <div className="flex items-center justify-between gap-4 border-t pt-4 text-sm text-muted-foreground"><span>Рабочая версия: {state.values.workingRevision}; опубликована: {state.values.publishedRevision}</span><Button disabled={saving || !connectionPhone.trim() || !supportPhone.trim()} onClick={() => void save()}><Save data-icon="inline-start" />{saving ? "Сохраняем…" : "Сохранить"}</Button></div>
        </CardContent>
      </Card>
    </div>
  </AdminShell>
}
