import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, ChevronRight, ExternalLink, Layers } from "lucide-react"
import { Dialog, Modal, ModalOverlay } from "react-aria-components"
import { AdminApiError, requestJson } from "../lib/admin-api.mjs"
import {
  filterPassports, passportContent, passportDesignLink, passportGroups, passportName,
  passportPlacement, passportSource, passportStatus, passportSummary, type Passport,
} from "../lib/block-passport-presentation.mjs"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Input } from "./ui/input"

interface Registry { lifecycle: string[]; passports: Passport[] }
type State = { status: "loading" } | { status: "ready"; registry: Registry } | { status: "error"; message: string }

function PassportExample({ passport }: { passport: Passport }) {
  const schematic = ["header", "hero", "home.hero"].includes(passport.id)
  return <figure className="overflow-hidden rounded-lg border">
    <div className="border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">Визуальный пример</div>
    <div className="bg-muted/20 p-4" aria-hidden="true">
      {passport.id === "header" ? <div className="rounded-lg border bg-background p-4 text-xs">
        <div className="flex flex-wrap justify-between gap-2 border-b pb-3 text-muted-foreground"><span>Москва</span><span>Проверить адрес · Техподдержка</span></div>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4"><strong className="text-lg">Дом.ру</strong><span>Тарифы · Города · Покрытие</span></div>
      </div> : schematic ? <div className="space-y-3 rounded-lg border bg-background p-4">
        <strong className="block max-w-sm text-lg leading-snug">{passport.id === "hero" ? "Домашний интернет в вашем городе" : "Подключение домашнего интернета и телевидения"}</strong>
        <p className="text-xs text-muted-foreground">Проверьте возможность подключения по вашему адресу.</p>
        {passport.id === "hero" ? <p className="text-xs text-muted-foreground">Стоимость, скорость и каналы — из тарифов города</p> : null}
        <div className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-xs"><span className="text-muted-foreground">Введите ваш адрес</span><strong>Проверить</strong></div>
      </div> : <div className="flex min-h-36 flex-col items-center justify-center gap-3 text-center text-muted-foreground"><Layers className="size-6" /><p className="text-sm">Визуальный пример ещё не подготовлен</p></div>}
    </div>
    <figcaption className="px-4 py-3 text-xs text-muted-foreground">{schematic ? "Схематичный пример. Значения не являются данными сайта." : "Для этого блока пока нет визуального примера."}</figcaption>
  </figure>
}

function PassportDetails({ passport }: { passport: Passport }) {
  const fields = passportContent(passport)
  const source = passportSource(passport)
  const designLink = passportDesignLink(passport)
  const summary = passportSummary(passport)
  const statusVariant = passport.status === "DRAFT" || passport.status === "DEPRECATED" ? "warning" : passport.status === "ACTIVE" || passport.status === "APPROVED" ? "success" : "neutral"
  return <Card className="min-w-0" aria-label={`Паспорт: ${passportName(passport)}`}>
    <CardHeader className="gap-3">
      <div className="flex flex-wrap items-center gap-2"><h2 className="font-heading text-xl font-semibold">{passportName(passport)}</h2><Badge variant={statusVariant}>{passportStatus(passport.status)}</Badge></div>
      <CardDescription>{passport.id === "hero" ? "Знакомит с предложениями города и открывает проверку подключения." : passport.purpose}</CardDescription>
      <p className="flex items-center gap-2 text-xs text-muted-foreground"><Layers className="size-4 shrink-0" />{passportPlacement(passport)}</p>
      {source.href || designLink ? <div className="flex flex-wrap gap-2">
        {source.href ? <Button asChild className="h-auto min-h-11 whitespace-normal py-2"><a href={source.href}>{source.label}</a></Button> : null}
        {designLink ? <Button asChild variant="outline" className="min-h-11"><a href={designLink} target="_blank" rel="noreferrer">Открыть макет<ExternalLink className="size-4" /></a></Button> : null}
      </div> : null}
      {source.note ? <p className="text-xs text-muted-foreground">{source.note}</p> : null}
    </CardHeader>
    <CardContent className="space-y-5 text-sm">
      <PassportExample passport={passport} />
      <section className="space-y-2"><h3 className="font-semibold">{passport.id === "header" ? "Где изменить контент" : "Контент блока"}</h3>
        {fields.length ? <ul className="divide-y rounded-lg border px-3">{fields.map(field => <li key={field.key} className="flex flex-wrap items-center justify-between gap-2 py-3"><span>{field.label}<span className="mt-1 block text-xs text-muted-foreground">{passport.id === "header" ? "Глобальные значения сайта" : field.required ? "Обязательное поле" : "Необязательное поле"}</span></span><span className="text-xs text-muted-foreground">{passport.id === "header" ? "В переменных сайта" : "В шаблоне"}</span></li>)}</ul>
          : <p className="text-muted-foreground">Содержимое поступает из настроек сайта, каталога или задаётся программно.</p>}
      </section>
      {summary ? <div className="space-y-1 rounded-lg bg-muted/50 p-4"><h3 className="font-medium">Задаётся системой</h3><p className="text-muted-foreground">{summary}</p></div> : null}
      <section className="space-y-2"><h3 className="font-semibold">Размещение</h3><p className="text-muted-foreground">{passportPlacement(passport)}</p></section>
      <details className="border-t pt-4">
        <summary className="cursor-pointer rounded-sm py-2 font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">Технические подробности</summary>
        <div className="mt-3 space-y-4">
          {passport.design ? <div><h3 className="mb-2 font-medium">Варианты макета</h3><ul className="flex flex-wrap gap-3">{passport.design.variants.map(variant => <li key={variant.nodeId}><a className="inline-flex min-h-11 items-center underline underline-offset-4" href={passportDesignLink(passport, variant.nodeId)!} target="_blank" rel="noreferrer">{({ Desktop: "Компьютер", Tablet: "Планшет", Mobile: "Телефон" } as Record<string, string>)[variant.device] ?? "Вариант макета"}</a></li>)}</ul></div> : null}
          {passport.runtimeRules?.length ? <div><h3 className="font-medium">Правила работы</h3><ul className="mt-2 list-disc space-y-1 pl-5">{passport.runtimeRules.map(rule => <li key={rule} className="break-words">{rule}</li>)}</ul></div> : null}
          <h3 className="font-medium">Полный контракт</h3>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-3 text-xs">{JSON.stringify(passport, null, 2)}</pre>
        </div>
      </details>
    </CardContent>
  </Card>
}

export function BlockPassportsPanel({ apiUrl, refreshKey = 0 }: { apiUrl: string; refreshKey?: number }) {
  const [state, setState] = useState<State>({ status: "loading" })
  const [query, setQuery] = useState("")
  const [group, setGroup] = useState("all")
  const [selectedId, setSelectedId] = useState("hero")
  const [mobile, setMobile] = useState(false)
  const [open, setOpen] = useState(false)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)")
    const update = () => { setMobile(media.matches); if (!media.matches) setOpen(false) }
    update(); media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])
  useEffect(() => {
    let active = true
    setState({ status: "loading" })
    void requestJson<Registry>(apiUrl, "/admin/block-passports")
      .then((registry) => { if (active) setState({ status: "ready", registry }) })
      .catch((caught: unknown) => {
        if (!active) return
        if (caught instanceof AdminApiError && caught.status === 401) { window.location.replace("/login"); return }
        setState({ status: "error", message: caught instanceof Error ? caught.message : "Реестр недоступен" })
      })
    return () => { active = false }
  }, [apiUrl, refresh, refreshKey])
  const passports = state.status === "ready" ? state.registry.passports : []
  const filtered = useMemo(() => filterPassports(passports, query, group), [passports, query, group])
  const selected = filtered.find(passport => passport.id === selectedId) ?? filtered[0] ?? null

  return <section id="block-passports" aria-label="Паспорта блоков" className="space-y-4">
    <p className="text-sm text-muted-foreground">Выберите блок, чтобы посмотреть его назначение и доступный контент. Паспорта показывают разрешённый контент блока.</p>
    {state.status === "loading" ? <p role="status" className="text-sm text-muted-foreground">Загружаем реестр…</p> : null}
    {state.status === "error" ? <Alert variant="destructive"><AlertTitle>Не удалось загрузить паспорта</AlertTitle><AlertDescription><p>{state.message}</p><Button variant="outline" className="mt-3 min-h-11" onClick={() => setRefresh(value => value + 1)}>Повторить загрузку</Button></AlertDescription></Alert> : null}
    {state.status === "ready" ? <div className="grid items-start gap-5 lg:grid-cols-[minmax(240px,340px)_minmax(0,1fr)]">
      <Card className="min-w-0"><CardHeader className="gap-3"><CardTitle>Блоки</CardTitle>
        <label className="space-y-1 text-sm"><span className="sr-only">Поиск блока</span><Input type="search" placeholder="Найти блок" value={query} onChange={event => setQuery(event.target.value)} className="min-h-11" /></label>
        <label className="space-y-1 text-xs text-muted-foreground"><span>Размещение</span><select value={group} onChange={event => setGroup(event.target.value)} className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50">{passportGroups.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <p role="status" className="text-xs text-muted-foreground">{filtered.length} из {passports.length}</p>
      </CardHeader><CardContent>
        {filtered.length ? <ul className="space-y-1 lg:max-h-[34rem] lg:overflow-y-auto">{filtered.map(passport => <li key={passport.id}><Button variant="ghost" aria-pressed={passport.id === selected?.id} onClick={() => { setSelectedId(passport.id); if (mobile) setOpen(true) }} className={`h-auto min-h-16 w-full justify-between gap-2 whitespace-normal px-3 py-3 text-left ${passport.id === selected?.id ? "bg-muted" : ""}`}>
          <span className="min-w-0"><span className="block font-medium">{passportName(passport)}</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{passportPlacement(passport)}</span></span><ChevronRight className="size-4" />
        </Button></li>)}</ul> : <div className="space-y-3 py-6 text-center"><p className="text-sm text-muted-foreground">{passports.length ? "Ничего не найдено" : "В реестре пока нет паспортов"}</p>{passports.length ? <Button variant="outline" className="min-h-11" onClick={() => { setQuery(""); setGroup("all") }}>Сбросить поиск и фильтр</Button> : null}</div>}
      </CardContent></Card>
      {!mobile ? selected ? <PassportDetails key={selected.id} passport={selected} /> : <Card><CardContent className="py-10 text-center text-muted-foreground">Выберите блок из списка.</CardContent></Card> : null}
      {mobile && selected ? <ModalOverlay isDismissable isOpen={open} onOpenChange={setOpen} className="fixed inset-0 z-50 bg-foreground/35">
        <Modal className="fixed inset-0 overflow-y-auto bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Dialog aria-label={`Паспорт: ${passportName(selected)}`} className="space-y-3 outline-none">
            <Button autoFocus variant="ghost" className="min-h-11" onClick={() => setOpen(false)}><ArrowLeft />К списку</Button>
            <PassportDetails key={selected.id} passport={selected} />
          </Dialog>
        </Modal>
      </ModalOverlay> : null}
    </div> : null}
  </section>
}
