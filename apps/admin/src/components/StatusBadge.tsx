import { statusPresentation, type StatusKind } from "../lib/status-presentation.mjs"
import { Badge } from "./ui/badge"

interface StatusBadgeProps {
  kind: StatusKind
  value: unknown
  showDescription?: boolean
}

export function StatusBadge({ kind, value, showDescription = false }: StatusBadgeProps) {
  const presentation = statusPresentation(kind, value)

  return <span className="inline-flex max-w-full flex-col items-start gap-1">
    <Badge variant={presentation.tone} title={presentation.description} aria-label={`${presentation.label}. ${presentation.description}`}>
      {presentation.label}
    </Badge>
    {showDescription ? <span className="text-xs text-muted-foreground">{presentation.description}</span> : null}
    {!presentation.known && presentation.code ? <details className="max-w-full text-xs text-muted-foreground">
      <summary className="cursor-pointer">Техническая информация</summary>
      <code className="break-all">{presentation.code}</code>
    </details> : null}
  </span>
}
