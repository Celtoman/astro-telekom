import { useEffect, useState, type SubmitEvent } from "react"
import { CircleAlert, LockKeyhole } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card"
import { Field, FieldError, FieldGroup, FieldLabel } from "./ui/field"
import { Input } from "./ui/input"

type LoginState = "checking" | "ready" | "submitting"

export function AdminLogin({ apiUrl }: { apiUrl: string }) {
  const endpoint = apiUrl.replace(/\/$/, "")
  const [state, setState] = useState<LoginState>("checking")
  const [error, setError] = useState("")

  useEffect(() => {
    fetch(`${endpoint}/auth/me`, { credentials: "include" })
      .then((response) => {
        if (response.ok) window.location.replace("/")
        else setState("ready")
      })
      .catch(() => setState("ready"))
  }, [endpoint])

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setState("submitting")
    const form = new FormData(event.currentTarget)
    try {
      const response = await fetch(`${endpoint}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { message?: string } | null
        throw new Error(payload?.message || "Не удалось войти")
      }
      window.location.replace("/")
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Не удалось войти")
      setState("ready")
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <div className="flex w-full max-w-md flex-col gap-5">
        <header className="flex items-center gap-3 px-1">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary font-heading text-lg font-semibold text-primary-foreground">д</span>
          <div>
            <p className="font-heading font-semibold">Дом.ру · Платформа</p>
            <p className="text-sm text-muted-foreground">Административный контур</p>
          </div>
        </header>
        <Card>
          <CardHeader>
            <div className="mb-2 flex size-9 items-center justify-center rounded-lg border bg-muted text-muted-foreground"><LockKeyhole /></div>
            <CardTitle>Вход администратора</CardTitle>
            <CardDescription>Используйте учетную запись, созданную при настройке платформы.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-5" onSubmit={submit}>
              <FieldGroup>
                <Field data-invalid={Boolean(error)} data-disabled={state !== "ready"}>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input id="email" name="email" type="email" autoComplete="username" required aria-invalid={Boolean(error)} disabled={state !== "ready"} />
                </Field>
                <Field data-invalid={Boolean(error)} data-disabled={state !== "ready"}>
                  <FieldLabel htmlFor="password">Пароль</FieldLabel>
                  <Input id="password" name="password" type="password" autoComplete="current-password" required aria-invalid={Boolean(error)} disabled={state !== "ready"} />
                  {error ? <FieldError>{error}</FieldError> : null}
                </Field>
              </FieldGroup>
              <Button type="submit" size="lg" disabled={state !== "ready"}>
                {state === "submitting" ? "Выполняется вход…" : state === "checking" ? "Проверка сессии…" : "Войти"}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="text-xs text-muted-foreground">Сессия хранится в защищенной HttpOnly cookie и действует до 12 часов.</CardFooter>
        </Card>
        {error ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Вход не выполнен</AlertTitle>
            <AlertDescription>Проверьте email и пароль и повторите попытку.</AlertDescription>
          </Alert>
        ) : null}
      </div>
    </main>
  )
}
