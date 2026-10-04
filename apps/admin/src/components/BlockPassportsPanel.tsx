import { useEffect, useState } from "react"
import { AdminApiError, requestJson } from "../lib/admin-api.mjs"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Badge } from "./ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"

interface PassportField {
  key: string; type: string; required: boolean; source: string; validation: string; control: string
}
interface Passport {
  id: string; title: string; kind: "MANAGED" | "PROGRAMMATIC"; purpose: string
  proposedAllowedPages: string[]; proposedContentScope: string; visualVariants: string[]; fields: PassportField[]
  emptyBehavior: string; editorForm: string; previewScenarios: string[]; accessibility: string[]
  status: string; passportVersion: string; approvedBy: string | null; implementation: string
  design?: { fileKey: string; nodeId: string; name: string; variants: { device: string; nodeId: string }[] }
  runtimeRules?: string[]
}
interface Registry { lifecycle: string[]; passports: Passport[] }
type State = { status: "loading" } | { status: "ready"; registry: Registry } | { status: "error"; message: string }

function PassportDetails({ passport }: { passport: Passport }) {
  return <details className="rounded-lg border p-4 text-sm">
    <summary className="cursor-pointer font-medium"><span>{passport.title}</span> <span className="font-normal text-muted-foreground">{passport.id}</span></summary>
    <div className="mt-4 space-y-4">
      <p>{passport.purpose}</p>
      <dl className="grid gap-2 sm:grid-cols-[max-content_1fr] sm:gap-x-4">
        <dt className="text-muted-foreground">Статус и версия</dt><dd>{passport.status} · {passport.passportVersion}; утверждающий: {passport.approvedBy ?? "нет"}</dd>
        <dt className="text-muted-foreground">Допустимые страницы</dt><dd>{passport.proposedAllowedPages.join(", ")} (черновое предложение)</dd>
        <dt className="text-muted-foreground">Область контента</dt><dd>{passport.proposedContentScope} (черновое предложение)</dd>
        <dt className="text-muted-foreground">Визуальные варианты</dt><dd>{passport.visualVariants.join("; ")}</dd>
        {passport.design ? <><dt className="text-muted-foreground">Дизайн Figma</dt><dd className="space-y-1"><a className="underline underline-offset-4" href={`https://www.figma.com/design/${passport.design.fileKey}?node-id=${passport.design.nodeId.replace(":", "-")}`} target="_blank" rel="noreferrer">{passport.design.name}</a><ul className="flex flex-wrap gap-x-4 gap-y-1">{passport.design.variants.map((variant) => <li key={variant.nodeId}><a className="underline underline-offset-4" href={`https://www.figma.com/design/${passport.design!.fileKey}?node-id=${variant.nodeId.replace(":", "-")}`} target="_blank" rel="noreferrer">{({ Desktop: "Компьютер", Tablet: "Планшет", Mobile: "Телефон" } as Record<string, string>)[variant.device] ?? variant.device}</a></li>)}</ul></dd></> : null}
        <dt className="text-muted-foreground">Пустые данные</dt><dd>{passport.emptyBehavior}</dd>
        <dt className="text-muted-foreground">Форма редактирования</dt><dd>{passport.editorForm}</dd>
        <dt className="text-muted-foreground">Реализация</dt><dd>{passport.implementation}</dd>
      </dl>
      <div className="overflow-x-auto"><table className="w-full min-w-[680px] border-collapse text-left text-xs"><caption className="mb-2 text-left font-medium">Поля и источники</caption><thead><tr className="border-b"><th className="p-2">Поле</th><th className="p-2">Тип и форма</th><th className="p-2">Источник</th><th className="p-2">Правило</th></tr></thead><tbody>{passport.fields.map((field) => <tr key={field.key} className="border-b align-top"><th scope="row" className="p-2 font-medium">{field.key}{field.required ? " *" : ""}</th><td className="p-2">{field.type} · {field.control}</td><td className="p-2">{field.source}</td><td className="p-2">{field.validation}</td></tr>)}</tbody></table></div>
      <div><h4 className="font-medium">Сценарии preview</h4><ul className="mt-1 list-disc pl-5">{passport.previewScenarios.map((item) => <li key={item}>{item}</li>)}</ul></div>
      {passport.runtimeRules?.length ? <div><h4 className="font-medium">Правила работы</h4><ul className="mt-1 list-disc pl-5">{passport.runtimeRules.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
      <div><h4 className="font-medium">Доступность</h4><ul className="mt-1 list-disc pl-5">{passport.accessibility.map((item) => <li key={item}>{item}</li>)}</ul></div>
    </div>
  </details>
}

export function BlockPassportsPanel({ apiUrl }: { apiUrl: string }) {
  const [state, setState] = useState<State>({ status: "loading" })
  useEffect(() => {
    let active = true
    void requestJson<Registry>(apiUrl, "/admin/block-passports")
      .then((registry) => { if (active) setState({ status: "ready", registry }) })
      .catch((caught: unknown) => {
        if (!active) return
        if (caught instanceof AdminApiError && caught.status === 401) { window.location.replace("/login"); return }
        setState({ status: "error", message: caught instanceof Error ? caught.message : "Реестр недоступен" })
      })
    return () => { active = false }
  }, [apiUrl])

  return <Card id="block-passports" aria-label="Черновые паспорта блоков"><CardHeader><div className="flex flex-wrap items-center gap-2"><CardTitle>Паспорта блоков</CardTitle><Badge variant="secondary">Только черновики</Badge></div><CardDescription>Текущие управляемые и программные блоки. Состав полей отражает прототип; страницы, область контента и варианты дизайна требуют утверждения владельцем. Здесь нет редактирования или перевода в Approved.</CardDescription></CardHeader><CardContent>
    {state.status === "loading" ? <p role="status" className="text-sm text-muted-foreground">Загружаем реестр…</p> : null}
    {state.status === "error" ? <Alert variant="destructive"><AlertTitle>Не удалось загрузить паспорта</AlertTitle><AlertDescription>{state.message}</AlertDescription></Alert> : null}
    {state.status === "ready" ? <div className="space-y-5"><p className="text-sm text-muted-foreground">Жизненный цикл: {state.registry.lifecycle.join(" → ")}. Текущий статус всех паспортов: DRAFT; утверждение и последующие переходы здесь недоступны.</p>{(["MANAGED", "PROGRAMMATIC"] as const).map((kind) => <section key={kind} className="space-y-3"><h3 className="font-heading text-lg font-semibold">{kind === "MANAGED" ? "Управляемые блоки шаблонов" : "Программные блоки"}</h3><div className="grid gap-3">{state.registry.passports.filter((passport) => passport.kind === kind).map((passport) => <PassportDetails key={passport.id} passport={passport} />)}</div></section>)}</div> : null}
  </CardContent></Card>
}
