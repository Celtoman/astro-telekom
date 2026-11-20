import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CheckCircle2, CircleAlert, FileSearch, RefreshCw, Save } from "lucide-react"
import { AdminApiError, readSiteSettings, requestJson } from "../lib/admin-api.mjs"
import { AdminShell } from "./AdminShell"
import { useUnsavedChanges } from "./useUnsavedChanges"
import { PublicationStatusCard } from "./PublicationStatusCard"
import { StatusBadge } from "./StatusBadge"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Checkbox } from "./ui/checkbox"
import { Input } from "./ui/input"
import { Skeleton } from "./ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table"
import { Tabs, TabsContent, TabsList, TabsPanels, TabsTrigger } from "./ui/tabs"

type Group = "PAGES" | "CITIES" | "TARIFFS"
interface Administrator { id: string; email: string }
interface Site { id: string; name: string; slug: string; status: string }
interface Entry { path: string; group: Group; sourceType: string; sourceLabel: string; publishStatus: string; eligible: boolean; included: boolean; reason: string | null }
interface Workspace {
  site: Site; origin: string; workingRevision: number; publishedRevision: number
  lastGeneration: { id: string; siteRevision: number; status: string; generatedAt: string; lastError: string | null } | null
}
interface Inventory extends Workspace {
  entries: Entry[]; exclusions: Array<{ path: string; reason: string }>; validation: { errors: string[]; warnings: string[] }
}
type Draft = Record<string, string>
const groupLabels: Record<Group, string> = { PAGES: "Страницы", CITIES: "Города", TARIFFS: "Тарифы" }
const groupFiles: Record<Group, string> = { PAGES: "sitemap-pages.xml", CITIES: "sitemap-cities.xml", TARIFFS: "sitemap-tariffs.xml" }
const PAGE_SIZE = 50

function xmlEscape(value: string) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;") }

export function SitemapApp({ apiUrl }: { apiUrl: string }) {
  const [user, setUser] = useState<Administrator | null>(null)
  const [sites, setSites] = useState<Site[]>([])
  const [siteId, setSiteId] = useState("")
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [inventory, setInventory] = useState<Inventory | null>(null)
  const [checking, setChecking] = useState(false)
  const [inventoryStale, setInventoryStale] = useState(false)
  const [showXml, setShowXml] = useState(false)
  const inventoryRequest = useRef<AbortController | null>(null)
  const settingsRequest = useRef(0)
  const [draft, setDraft] = useState<Draft>({})
  const [group, setGroup] = useState<Group>("PAGES")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const loadWorkspace = useCallback(async (selectedSiteId = siteId, fresh = true) => {
    const request = ++settingsRequest.current
    inventoryRequest.current?.abort()
    inventoryRequest.current = null
    setInventory(null); setDraft({}); setPage(1); setChecking(false); setInventoryStale(false); setShowXml(false)
    setLoading(true); setError(null)
    try {
      const { user, sites, current } = await readSiteSettings(
        apiUrl,
        (availableSites: Site[]) => selectedSiteId ? availableSites.find((site) => site.id === selectedSiteId) ?? null : availableSites[0] ?? null,
        (id) => requestJson<Workspace>(apiUrl, `/admin/sites/${encodeURIComponent(id)}/sitemap/settings`),
        { fresh },
      )
      if (request !== settingsRequest.current) return
      if (selectedSiteId && !current) throw new Error("Выбранный сайт недоступен.")
      setUser(user); setSites(sites); setSiteId(current?.site.id ?? ""); setWorkspace(current?.data ?? null)
    } catch (caught) {
      if (request !== settingsRequest.current) return
      if (caught instanceof AdminApiError && caught.status === 401) { window.location.replace("/login"); return }
      setError(caught instanceof Error ? caught.message : "API недоступен")
    } finally { if (request === settingsRequest.current) setLoading(false) }
  }, [apiUrl, siteId])

  useEffect(() => {
    void loadWorkspace(undefined, false)
    return () => { settingsRequest.current++; inventoryRequest.current?.abort() }
  }, [])
  useEffect(() => { setPage(1) }, [group, search])


  async function checkInventory() {
    if (!workspace) return
    inventoryRequest.current?.abort()
    const request = new AbortController()
    inventoryRequest.current = request
    setChecking(true); setError(null)
    try {
      const data = await requestJson<Inventory>(apiUrl, `/admin/sites/${siteId}/sitemap/inventory?workingRevision=${workspace.workingRevision}`, { signal: request.signal })
      if (request.signal.aborted) return
      setInventory(data)
      setInventoryStale(false)
      if (!inventory) {
        const published = new Set(data.entries.filter(entry => entry.publishStatus === "PUBLISHED").map(entry => entry.path))
        setDraft(Object.fromEntries(data.exclusions.filter(item => published.has(item.path)).map(item => [item.path, item.reason])))
      }
    } catch (caught) {
      if (request.signal.aborted) return
      if (caught instanceof AdminApiError && caught.status === 409) setInventoryStale(true)
      setError(caught instanceof Error ? caught.message : "Маршруты Sitemap недоступны")
    } finally {
      if (!request.signal.aborted) setChecking(false)
    }
  }

  const entries = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru-RU")
    return (inventory?.entries || []).filter((item) => item.group === group && (!query || `${item.path} ${item.sourceLabel} ${item.publishStatus} ${draft[item.path] || ""}`.toLocaleLowerCase("ru-RU").includes(query)))
  }, [inventory, group, search, draft])
  const visible = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE))
  const invalidReasons = Object.entries(draft).filter(([, reason]) => !reason.trim())
  const changed = inventory ? JSON.stringify(Object.fromEntries(inventory.exclusions.map((item) => [item.path, item.reason]))) !== JSON.stringify(draft) : false
  useUnsavedChanges(changed)
  const previewXml = showXml && inventory && !inventoryStale ? `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${inventory.entries.filter((item) => item.group === group && item.eligible && !(item.path in draft)).map((item) => `<url><loc>${xmlEscape(`${inventory.origin}${item.path}`)}</loc></url>`).join("")}</urlset>` : ""

  function toggle(entry: Entry, include: boolean) {
    setDraft((current) => {
      const next = { ...current }
      if (include) delete next[entry.path]
      else next[entry.path] = entry.reason || ""
      return next
    })
  }

  async function save() {
    if (!workspace || !inventory || checking || inventoryStale || inventory.validation.errors.length || invalidReasons.length) return
    setBusy(true); setError(null); setMessage(null)
    try {
      const result = await requestJson<{ changed: boolean; workingRevision: number }>(apiUrl, `/admin/sites/${siteId}/sitemap-exclusions`, {
        method: "PUT", body: { expectedWorkingRevision: workspace.workingRevision, exclusions: Object.entries(draft).map(([path, reason]) => ({ path, reason })) },
      })
      setMessage(result.changed ? `Рабочая версия ${result.workingRevision} сохранена. Опубликуйте ее отдельно.` : "Изменений нет.")
      await loadWorkspace(siteId)
    } catch (caught) {
      if (caught instanceof AdminApiError && caught.status === 409) setInventoryStale(true)
      setError(caught instanceof Error ? caught.message : "Исключения не сохранены")
    }
    finally { setBusy(false) }
  }

  if (loading && !user) return <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 p-8"><Skeleton className="h-10 w-72" /><Skeleton className="h-72 w-full" /></div>
  if (!user) return <div className="flex min-h-screen items-center justify-center p-6"><Alert variant="destructive"><CircleAlert /><AlertTitle>Sitemap недоступен</AlertTitle><AlertDescription>{error || "Не удалось загрузить данные"}</AlertDescription></Alert></div>

  return <AdminShell apiUrl={apiUrl} user={user} active="seo-sitemap"><div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6 lg:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="font-heading text-2xl font-semibold">Sitemap</h1><p className="mt-1 text-sm text-muted-foreground">Управление индексом и отдельными картами страниц, городов и тарифов.</p></div><Button variant="outline" disabled={loading || busy} onClick={() => void loadWorkspace(siteId)}><RefreshCw data-icon="inline-start" />Обновить</Button></div>
    {sites.length > 1 ? <label className="flex max-w-sm flex-col gap-1 text-sm font-medium">Сайт<select className="h-9 rounded-md border bg-background px-3" value={siteId} disabled={loading || busy || checking} onChange={(event) => void loadWorkspace(event.target.value)}>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label> : null}
    {error ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Операция не выполнена</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    {message ? <Alert><CheckCircle2 /><AlertTitle>Изменения сохранены</AlertTitle><AlertDescription>{message}</AlertDescription></Alert> : null}
    {workspace ? <>
      <PublicationStatusCard apiUrl={apiUrl} siteId={siteId} />
      <section className="grid gap-4 md:grid-cols-2"><Card size="sm"><CardHeader><CardDescription>Текущий origin</CardDescription><CardTitle className="break-all text-base">{workspace.origin}</CardTitle></CardHeader></Card><Card size="sm"><CardHeader><CardDescription>Последняя генерация</CardDescription><CardTitle className="text-base">{workspace.lastGeneration ? <StatusBadge kind="sitePublicationStatus" value={workspace.lastGeneration.status} /> : "Еще не запускалась"}</CardTitle>{workspace.lastGeneration ? <CardDescription>Версия {workspace.lastGeneration.siteRevision} · {new Date(workspace.lastGeneration.generatedAt).toLocaleString("ru-RU")}</CardDescription> : null}</CardHeader></Card></section>
      <div><Button variant="outline" disabled={loading || busy || checking} onClick={() => void checkInventory()}>{checking ? "Проверяем маршруты…" : inventory ? "Проверить маршруты заново" : "Проверить маршруты Sitemap"}</Button></div>
      {inventory ? <>
      {inventory.validation.errors.map((item) => <Alert key={item} variant="destructive"><CircleAlert /><AlertTitle>Ошибка перед публикацией</AlertTitle><AlertDescription>{item}</AlertDescription></Alert>)}
      {inventory.validation.warnings.map((item) => <Alert key={item}><CircleAlert /><AlertTitle>Требуется внимание</AlertTitle><AlertDescription>{item}</AlertDescription></Alert>)}
      <Tabs value={group} onValueChange={(value) => setGroup(value as Group)}><TabsList aria-label="Группы sitemap" className="h-auto flex-wrap">{(Object.keys(groupLabels) as Group[]).map((key) => <TabsTrigger key={key} value={key}>{groupLabels[key]} · {inventory.entries.filter((item) => item.group === key && item.included).length}/{inventory.entries.filter((item) => item.group === key).length}</TabsTrigger>)}</TabsList><TabsPanels>
        {(Object.keys(groupLabels) as Group[]).map((key) => <TabsContent key={key} value={key}>{key === group ? <Card><CardHeader><CardTitle>{groupLabels[group]}</CardTitle><CardDescription>{groupFiles[group]} · выключение URL влияет только на sitemap, а не удаляет страницу и не добавляет noindex.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
          <Input aria-label="Поиск URL" placeholder="URL, источник, статус или причина" value={search} onChange={(event) => setSearch(event.target.value)} />
          <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="w-20">В sitemap</TableHead><TableHead>URL</TableHead><TableHead>Источник</TableHead><TableHead>Статус</TableHead><TableHead className="min-w-64">Причина исключения</TableHead></TableRow></TableHeader><TableBody>{visible.map((item) => <TableRow key={item.path}><TableCell><Checkbox aria-label={`Включить ${item.path}`} checked={item.eligible && !(item.path in draft)} disabled={!item.eligible || busy || checking || inventoryStale || inventory.validation.errors.length > 0} onCheckedChange={(checked) => toggle(item, checked === true)} /></TableCell><TableCell className="font-mono text-xs">{item.path}</TableCell><TableCell>{item.sourceLabel}</TableCell><TableCell><StatusBadge kind="publishStatus" value={item.publishStatus} /></TableCell><TableCell>{item.eligible && item.path in draft ? <Input aria-label={`Причина для ${item.path}`} value={draft[item.path]} onChange={(event) => setDraft((current) => ({ ...current, [item.path]: event.target.value }))} placeholder="Почему URL не должен попадать в sitemap" /> : <span className="text-sm text-muted-foreground">{item.reason || "—"}</span>}</TableCell></TableRow>)}</TableBody></Table></div>
          <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-muted-foreground">Показано {visible.length} из {entries.length} · страница {page} из {pages}</span><div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Назад</Button><Button variant="outline" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Далее</Button></div></div>
        </CardContent></Card> : null}</TabsContent>)}</TabsPanels>
      </Tabs>
      {invalidReasons.length ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Нужна причина</AlertTitle><AlertDescription>Для каждого исключенного URL укажите понятную причину.</AlertDescription></Alert> : null}
      <div className="flex justify-end"><Button disabled={!changed || busy || checking || inventoryStale || invalidReasons.length > 0 || inventory.validation.errors.length > 0} onClick={() => void save()}><Save data-icon="inline-start" />{busy ? "Сохраняем…" : "Сохранить рабочую версию"}</Button></div>
      <Card><CardHeader><CardTitle>XML-preview</CardTitle><CardDescription>Предпросмотр {groupFiles[group]} с учетом несохраненных изменений.</CardDescription></CardHeader><CardContent className="space-y-3"><Button variant="outline" disabled={checking || inventoryStale || inventory.validation.errors.length > 0} onClick={() => setShowXml(value => !value)}>{showXml ? "Скрыть XML" : "Показать XML"}</Button>{showXml && !inventoryStale && inventory.validation.errors.length === 0 ? <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-4 text-xs">{previewXml}</pre> : null}</CardContent></Card>
      </> : null}
    </> : <Alert><FileSearch /><AlertTitle>Нет доступного сайта</AlertTitle><AlertDescription>Создайте сайт, чтобы управлять sitemap.</AlertDescription></Alert>}
  </div></AdminShell>
}
