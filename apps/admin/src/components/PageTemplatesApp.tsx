import { useEffect, useState } from "react"
import { ArrowRight, Layers } from "lucide-react"
import { requestSession } from "../lib/admin-api.mjs"
import { AdminShell } from "./AdminShell"
import { Badge } from "./ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"

export function PageTemplatesApp({ apiUrl }: { apiUrl: string }) {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (window.location.hash === "#block-passports") { window.location.replace("/templates/passports"); return }
    let active = true
    requestSession<{ user: { id: string; email: string } }>(apiUrl).then(result => { if (active) setUser(result.user) }).catch(caught => { if (active) setError(caught.message) })
    return () => { active = false }
  }, [apiUrl])
  if (!user) return <div className="p-6" role="status">{error ?? "Загружаем шаблоны…"}</div>
  const templates = [
    { name: "Техническая поддержка", path: "/{город}/tehpodderzhka", description: "Тексты, ссылки, изображения, области инструкций и отдельный FAQ. Общая композиция для всех городов.", blocks: [{ label: "Редактировать страницу", href: "/templates/support" }] },
    { name: "Вопросы и ответы", path: "/faq", description: "Группы, вопросы и форматированные ответы.", blocks: [{ label: "Редактировать страницу", href: "/templates/faq" }] },
    { name: "Проверка скорости интернета", path: "/proverit-skorost-interneta", description: "Заголовок, шесть информационных разделов и FAQ. Состав карточек и оформление сохраняются.", blocks: [{ label: "Редактировать страницу", href: "/templates/speed-test" }] },
    { name: "Официальный сайт", path: "/official-site-domru", description: "Вступление, иллюстрации, основной переход и FAQ. Принятая структура сохраняется.", blocks: [{ label: "Редактировать страницу", href: "/templates/official-site" }] },
    { name: "Личный кабинет", path: "/lichnyy-kabinet-dom-ru", description: "Вступление, изображения и вопросы. Инструкции и структура страницы сохраняются.", blocks: [{ label: "Редактировать страницу", href: "/templates/account" }] },
    { name: "Проверка подключения", path: "/{город}/proverka-podklyucheniya-k-domru-po-adresu", description: "Восемь редактируемых блоков ADDRESS для всех городов. Тарифы и общие факты подставляются автоматически.", blocks: [{ label: "Редактировать страницу", href: "/templates/home?kind=CITY_ADDRESS_CHECK" }] },
    { name: "Общая главная", path: "/", description: "Десять контентных блоков в утверждённом порядке. Сохранение меняет рабочую версию; публикация выполняется отдельно.", blocks: [{ label: "Редактировать главную", href: "/templates/home?kind=HOME" }] },
    { name: "Главная города", path: "/{город}", description: "Один шаблон для всех городов. Название города и тарифы подставляются автоматически.", blocks: [{ label: "Первый экран", href: "/templates/home?kind=CITY_HOME" }, { label: "Тарифы города", href: "/templates/tariffs" }] },
  ]
  return <AdminShell apiUrl={apiUrl} user={user} active="templates"><div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6 lg:p-8">
    <div><h1 className="font-heading text-2xl font-semibold">Шаблоны страниц</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Выберите страницу и откройте нужный блок. Сохранённые изменения появятся на сайте после ручной публикации.</p></div>
    <div className="grid gap-6 lg:grid-cols-2">{templates.map(template => <Card key={template.path}><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle>{template.name}</CardTitle><Badge variant="secondary">{template.path}</Badge></div><CardDescription>{template.description}</CardDescription></CardHeader><CardContent><ol className="space-y-3">{template.blocks.map((block, index) => <li key={block.href}><a href={block.href} className="flex min-h-14 items-center gap-3 rounded-lg border p-4 text-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"><span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted font-medium">{index + 1}</span><span className="flex-1 font-medium">{block.label}</span><span className="text-muted-foreground">Редактировать</span><ArrowRight className="size-4" /></a></li>)}</ol></CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Layers className="size-5" />Общие элементы</CardTitle><CardDescription>Шапка, подвал и служебные ссылки используются на всех страницах. Их структура задаётся в коде.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-5 text-sm"><a className="font-medium text-primary underline underline-offset-4" href="/templates/passports">Паспорта блоков</a><a className="font-medium text-primary underline underline-offset-4" href="/variables">Переменные сайта</a></CardContent></Card>
    <Alert><AlertTitle>Страницы тарифов</AlertTitle><AlertDescription>Состав этих страниц сохранён. Условия меняются в <a className="font-medium underline" href="/tariffs">каталоге тарифов</a>; <a className="underline" href="/templates/tariff">проверка программного шаблона</a> доступна отдельно.</AlertDescription></Alert>
    <div className="flex flex-wrap gap-5 text-sm"><a className="font-medium text-primary underline underline-offset-4" href="/preview">Предпросмотр страниц</a><a className="font-medium text-primary underline underline-offset-4" href="/publication">Публикация сайта</a></div>
  </div></AdminShell>
}
