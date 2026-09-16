import { sourcePresentation } from "../lib/status-presentation.mjs"

export function SourceLabel({ value }: { value: unknown }) {
  const presentation = sourcePresentation(value)
  return <span className="inline-flex max-w-full flex-col gap-1">
    <span>{presentation.label}</span>
    {presentation.code ? <details className="max-w-full text-xs text-muted-foreground">
      <summary className="cursor-pointer">Техническая информация</summary>
      <code className="break-all">{presentation.code}</code>
    </details> : null}
  </span>
}
