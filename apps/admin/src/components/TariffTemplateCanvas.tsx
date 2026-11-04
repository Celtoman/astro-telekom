import { useEffect, useState } from "react"
import { requestJson } from "../lib/admin-api.mjs"
import type { TariffView } from "../../../web/src/data/tariff-view"

type Selection = { router: "NONE" | "INSTALLMENT" | "BUYOUT"; tvbox: "NONE" | "INSTALLMENT" | "BUYOUT"; services: string[] }
type Quote = {
  choices: { equipment: Array<{ code: "router" | "tvbox"; title: string; options: Array<{ code: "INSTALLMENT" | "BUYOUT"; title: string; monthlyAmount: number; oneTimeAmount: number }> }>; services: Array<{ code: string; title: string; monthlyAmount: number }> }
  charges: { monthly: Array<{ code: string; title: string; amount: number }>; oneTime: Array<{ code: string; title: string; amount: number | null }> }
  totals: { monthly: number; oneTime: number | null; knownOneTime: number }
}
type Related = Array<{ slug: string; name: string; speed?: string; price?: string }>

const money = (amount: number) => `${new Intl.NumberFormat("ru-RU").format(amount)} ₽`
const initialSelection: Selection = { router: "NONE", tvbox: "NONE", services: [] }

function PreviewConfigurator({ apiUrl, siteId, citySlug, tariffSlug, version, marked }: {
  apiUrl: string; siteId: string; citySlug: string; tariffSlug: string; version: "working" | "published"; marked: boolean
}) {
  const [selection, setSelection] = useState<Selection>(initialSelection)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true); setError(null); setQuote(null)
    void requestJson<Quote>(apiUrl, `/admin/sites/${encodeURIComponent(siteId)}/tariff-template/quote`, {
      method: "POST", body: { citySlug, tariffSlug, version, selection },
    }).then((result) => { if (active) setQuote(result) })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : "Расчёт недоступен") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [apiUrl, citySlug, selection, siteId, tariffSlug, version])

  return <section data-tariff-block="configurator" data-diagnostic-marked={marked} className={`rounded-3xl border bg-white p-5 sm:p-8 ${marked ? "outline outline-4 outline-red-500" : ""}`}>
    <h2 className="text-2xl font-semibold">Соберите свой тариф</h2>
    <p className="mt-2 text-sm text-slate-600">Дополнительные опции не выбраны по умолчанию. Расчёт выполняет тот же серверный калькулятор, что и публичная страница.</p>
    {loading ? <p role="status" className="mt-4">Рассчитываем стоимость…</p> : null}
    {error ? <p role="alert" className="mt-4 text-red-700">{error}</p> : null}
    {quote?.choices.equipment.map((item) => <label key={item.code} className="mt-5 block text-sm font-medium">{item.title}
      <select className="mt-2 w-full rounded-lg border bg-white p-2" value={selection[item.code]} onChange={(event) => setSelection((current) => ({ ...current, [item.code]: event.target.value as Selection[typeof item.code] }))}>
        <option value="NONE">У меня своё / не нужно</option>
        {item.options.map((option) => <option key={option.code} value={option.code}>{option.title} — {option.monthlyAmount ? `${money(option.monthlyAmount)}/мес.` : money(option.oneTimeAmount)}</option>)}
      </select>
    </label>)}
    {quote?.choices.services.map((item) => <label key={item.code} className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={selection.services.includes(item.code)} onChange={(event) => setSelection((current) => ({ ...current, services: event.target.checked ? [...current.services, item.code] : current.services.filter((code) => code !== item.code) }))} />{item.title} — {money(item.monthlyAmount)}/мес.</label>)}
    {quote && !loading ? <div aria-live="polite" className="mt-6 grid gap-4 sm:grid-cols-2">
      <div><h3 className="font-semibold">Ежемесячно</h3><ul className="mt-2 space-y-1 text-sm">{quote.charges.monthly.map((charge) => <li key={charge.code}>{charge.title}: {money(charge.amount)}</li>)}</ul><strong className="mt-2 block text-xl">{money(quote.totals.monthly)}/мес.</strong></div>
      <div><h3 className="font-semibold">Разово</h3><ul className="mt-2 space-y-1 text-sm">{quote.charges.oneTime.map((charge) => <li key={charge.code}>{charge.title}: {charge.amount === null ? "уточняется" : money(charge.amount)}</li>)}</ul><strong className="mt-2 block text-xl">{quote.totals.oneTime === null ? `Известная часть: ${money(quote.totals.knownOneTime)}` : money(quote.totals.oneTime)}</strong></div>
    </div> : null}
    <p className="mt-5 text-xs text-slate-500">Расчёт предварительный. Заявка в предпросмотре не отправляется.</p>
  </section>
}

export function TariffTemplateCanvas({ apiUrl, siteId, city, tariff, related, version, compact, markedBlocks }: {
  apiUrl: string; siteId: string; city: { slug: string; name: string; nameIn: string }; tariff: TariffView; related: Related; version: "working" | "published"; compact: boolean; markedBlocks: Set<string>
}) {
  const columns = compact ? "grid-cols-1" : "grid-cols-[minmax(0,1.4fr)_minmax(250px,.6fr)]"
  return <article className="min-h-[600px] space-y-10 bg-[#f6f7f9] pb-10 text-slate-900" data-tariff-template-preview data-marked-blocks={[...markedBlocks].join(" ")}>
    <header className="flex flex-wrap items-center justify-between gap-3 bg-[#18202a] px-5 py-4 text-white"><strong>Дом.ру · {city.name}</strong><span className="text-xs">Защищённый предпросмотр · {version === "working" ? "рабочие данные" : "опубликованные данные"}</span></header>
    <div className="space-y-8 px-4 sm:px-6">
      <p className="text-xs text-slate-500">Главная / {city.name} / {tariff.name}</p>
      <section data-tariff-block="hero" className={`grid gap-4 ${columns}`}>
        <div className="rounded-3xl bg-[#eaf7ff] p-6 sm:p-10"><span className="text-xs font-bold uppercase tracking-wide text-[#c91f5c]">{tariff.service}</span>{tariff.badge ? <span className="ml-2 rounded-full bg-pink-100 px-2 py-1 text-xs">{tariff.badge}</span> : null}<h1 className="mt-4 text-4xl font-bold leading-tight">{tariff.name}</h1>{tariff.subtitle ? <p className="mt-3 text-slate-600">{tariff.subtitle}</p> : null}<dl className={`mt-6 grid gap-2 ${compact ? "grid-cols-1" : "grid-cols-3"}`}>{tariff.baseComponents.map((component) => <div key={component.code} className="rounded-xl bg-white/80 p-3"><dt className="text-xs text-slate-500">{component.title}</dt><dd className="font-semibold">{component.value}</dd></div>)}<div className="rounded-xl bg-white/80 p-3"><dt className="text-xs text-slate-500">Доступность</dt><dd className="font-semibold">{tariff.availability ? "Проверяется по адресу" : "Тариф в архиве"}</dd></div></dl></div>
        <aside className="rounded-3xl border bg-white p-6 sm:p-8">{tariff.promoText ? <span className="rounded-full bg-pink-100 px-3 py-1 text-xs font-semibold text-pink-800">{tariff.promoText}</span> : null}{tariff.pricing.standardLabel ? <del className="mt-5 block text-slate-500">{tariff.pricing.standardLabel}</del> : null}<strong className="mt-3 block text-4xl">{tariff.pricing.currentLabel}</strong>{tariff.connection ? <p className="mt-2 text-sm">{tariff.connection}</p> : null}<span className="mt-6 block rounded-lg bg-slate-200 px-4 py-3 text-center text-sm text-slate-600">Проверить адрес · недоступно в preview</span><small className="mt-3 block text-slate-500">Окончательные условия подтвердит оператор.</small></aside>
      </section>
      {tariff.description ? <section data-tariff-block="description" className={`grid gap-5 ${compact ? "grid-cols-1" : "grid-cols-[.7fr_1.3fr]"}`}><h2 className="text-2xl font-semibold">Что входит</h2><p className="whitespace-pre-line text-slate-700">{tariff.description}</p></section> : null}
      {tariff.cinemas.length ? <section data-tariff-block="cinemas"><h2 className="text-2xl font-semibold">Подписки в тарифе</h2><div className="mt-4 flex flex-wrap gap-2">{tariff.cinemas.map((item) => <span key={item.code} className="rounded-full border bg-white px-4 py-2 font-semibold">{item.title}</span>)}</div></section> : null}
      {tariff.equipment.length ? <section data-tariff-block="equipment"><h2 className="text-2xl font-semibold">Варианты для подключения</h2><div className={`mt-4 grid gap-3 ${compact ? "grid-cols-1" : "grid-cols-2"}`}>{tariff.equipment.map((item) => <div key={item.code} className="rounded-2xl border bg-white p-5"><h3 className="font-semibold">{item.title}</h3><ul className="mt-3 space-y-2 text-sm">{item.options.map((option) => <li key={option.kind}>{option.label}: {option.amountLabel}{option.months ? ` на ${option.months} мес.` : ""}</li>)}<li>{item.alternative}</li></ul></div>)}</div></section> : null}
      {tariff.game || tariff.services.length ? <section data-tariff-block="services"><h2 className="text-2xl font-semibold">Сервисы и игры</h2><div className={`mt-4 grid gap-3 ${compact ? "grid-cols-1" : "grid-cols-2"}`}>{tariff.game ? <div className="rounded-2xl border bg-white p-5"><h3 className="font-semibold">{tariff.game.title}</h3><p className="text-sm">{tariff.game.statusLabel}</p></div> : null}{tariff.services.map((item) => <div key={item.code} className="rounded-2xl border bg-white p-5"><h3 className="font-semibold">{item.title}</h3><p className="text-sm">{item.statusLabel}</p>{item.monthlyPriceLabel ? <strong className="text-sm">{item.monthlyPriceLabel}</strong> : null}</div>)}</div></section> : null}
      {tariff.pricing.currentAmount !== null ? <PreviewConfigurator key={`${city.slug}:${tariff.slug}:${version}`} apiUrl={apiUrl} siteId={siteId} citySlug={city.slug} tariffSlug={tariff.slug} version={version} marked={markedBlocks.has("configurator")} /> : null}
      <section data-tariff-block="address" className="rounded-3xl bg-[#eaf7ff] p-6"><h2 className="text-2xl font-semibold">Доступен ли тариф по вашему адресу</h2><p className="mt-2 text-sm">Проверка адреса и отправка заявки в предпросмотре отключены.</p><span className="mt-4 block w-fit rounded-lg bg-slate-200 px-4 py-2 text-sm text-slate-600">Проверить адрес · отключено</span></section>
      {related.length ? <section data-tariff-block="related"><h2 className="text-2xl font-semibold">Похожие тарифы в {city.nameIn}</h2><div className={`mt-4 grid gap-3 ${compact ? "grid-cols-1" : "grid-cols-3"}`}>{related.map((item) => <div key={item.slug} className="rounded-2xl border bg-white p-5"><h3 className="font-semibold">{item.name}</h3><p className="text-sm">{item.speed}</p><strong>{item.price}</strong><p className="mt-3 text-xs text-slate-500">Переход отключён</p></div>)}</div></section> : null}
      <section data-tariff-block="faq"><h2 className="text-2xl font-semibold">О тарифе и подключении</h2><details className="mt-4 rounded-xl border bg-white p-4"><summary>Как узнать, доступен ли тариф по моему адресу?</summary><p className="mt-3 text-sm">Укажите точный адрес на публичной странице. Здесь проверка отключена.</p></details><details className="mt-2 rounded-xl border bg-white p-4"><summary>Какая стоимость будет после заявки?</summary><p className="mt-3 text-sm">Итоговую стоимость и условия подтвердит оператор.</p></details></section>
    </div>
  </article>
}
