import { useEffect, useState } from "react"
import { requestSession } from "../lib/admin-api.mjs"
import { AdminShell } from "./AdminShell"
import { BlockPassportsPanel } from "./BlockPassportsPanel"
export function BlockPassportsApp({ apiUrl }: { apiUrl: string }) {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    requestSession<{ user: { id: string; email: string } }>(apiUrl).then(result => { if (active) setUser(result.user) }).catch(caught => { if (active) setError(caught.message) })
    return () => { active = false }
  }, [apiUrl])
  if (!user) return <div className="p-6" role="status">{error ?? "Загружаем паспорта…"}</div>
  return <AdminShell apiUrl={apiUrl} user={user} active="block-passports"><div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6 lg:p-8"><div><h1 className="font-heading text-2xl font-semibold">Паспорта блоков</h1><p className="mt-2 text-sm text-muted-foreground">Назначение, поля и правила действующих блоков сайта.</p></div><BlockPassportsPanel apiUrl={apiUrl} refreshKey={0} /></div></AdminShell>
}
