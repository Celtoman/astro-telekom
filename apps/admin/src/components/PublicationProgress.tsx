import { useEffect, useState } from "react"
import { Check, Circle, CircleAlert, LoaderCircle } from "lucide-react"
import { ProgressBar, Label } from "react-aria-components"
import { describePublicationProgress, type PublicationState } from "../lib/publication-display.mjs"

// Domain steps compose the reference Card/React Aria progress pattern; no parallel UI primitives.
export function PublicationProgress({ state, unavailable = false }: { state: PublicationState; unavailable?: boolean }) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    setTick(0)
    const at = Date.now()
    const timer = window.setInterval(() => setTick(Math.floor((Date.now() - at) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [state])
  const view = describePublicationProgress(state, tick)
  if (!view) return state.latestPublication?.status === "RUNNING" || state.latestPublication?.status === "PENDING"
    ? <p className="text-sm text-muted-foreground" role="status">Ожидаем данные о ходе публикации. Состояние обновляется автоматически.</p> : null
  return <section aria-label="Ход публикации" className="space-y-4 rounded-lg border p-4">
    <div className="flex flex-wrap justify-between gap-2">
      <p className="text-sm font-medium" role="status" aria-live="polite">{unavailable ? "Состояние временно недоступно" : view.stageLabel}</p>
      <p className="text-sm tabular-nums text-muted-foreground">{view.active ? "Прошло" : "Длительность"}: {view.elapsedLabel}</p>
    </div>
    <ol className="grid gap-3" aria-label="Этапы публикации">
      {view.steps.map(step => {
        const Icon = step.status === "complete" ? Check : step.status === "failed" ? CircleAlert : step.status === "active" ? LoaderCircle : Circle
        return <li key={step.stage} aria-current={step.status === "active" ? "step" : undefined} className={`flex items-center gap-2 text-sm ${step.status === "pending" ? "text-muted-foreground" : step.status === "failed" ? "text-destructive" : "text-foreground"}`}>
          <Icon aria-hidden="true" className={`size-4 shrink-0 ${step.status === "active" && !unavailable ? "animate-spin motion-reduce:animate-none" : ""}`} />
          <span>{step.label}<span className="sr-only">: {step.status === "complete" ? "завершён" : step.status === "pending" ? "ожидает" : step.status === "failed" ? "ошибка" : "выполняется"}</span></span>
        </li>
      })}
    </ol>
    {view.counterLabel && !unavailable ? <ProgressBar value={view.completedPages!} maxValue={view.totalPages!} className="space-y-2">
      <Label className="text-sm text-muted-foreground">{view.counterLabel}</Label>
      <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${100 * view.completedPages! / view.totalPages!}%` }} /></div>
    </ProgressBar> : null}
    <p className="text-sm text-muted-foreground">{unavailable ? "Не удалось обновить данные. Проверка продолжится автоматически." : view.remainingLabel}</p>
  </section>
}
