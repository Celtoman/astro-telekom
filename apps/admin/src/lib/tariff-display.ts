export interface PublicationRecommendation {
  label: string
  tone: "success" | "warning" | "neutral"
}

export function sourcePublicationRecommendation(attributes: Record<string, unknown> | null): PublicationRecommendation {
  const value = attributes?.show_on_site
  if (value === true) return { label: "Рекомендуется показывать", tone: "success" }
  if (value === false) return { label: "Рекомендуется не показывать", tone: "warning" }
  return { label: "Не указана", tone: "neutral" }
}

export function tariffConnectionLabel(value: string | number | null): string {
  if (value === null || String(value).trim() === "") return "Не указано"
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0) return "Не указано"
  if (amount === 0) return "Бесплатно"
  return `${amount.toLocaleString("ru-RU").replace(/[\u00a0\u202f]/g, " ")} ₽`
}
