export interface PublicationRecommendation {
  label: string
  className: string
}

export function sourcePublicationRecommendation(attributes: Record<string, unknown> | null): PublicationRecommendation {
  const value = attributes?.show_on_site
  if (value === true) return { label: "Рекомендуется показывать", className: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" }
  if (value === false) return { label: "Рекомендуется не показывать", className: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200" }
  return { label: "Не указана", className: "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300" }
}

export function tariffConnectionLabel(value: string | number | null): string {
  if (value === null || String(value).trim() === "") return "Не указано"
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0) return "Не указано"
  if (amount === 0) return "Бесплатно"
  return `${amount.toLocaleString("ru-RU").replace(/[\u00a0\u202f]/g, " ")} ₽`
}
