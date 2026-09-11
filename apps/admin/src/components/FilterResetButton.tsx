import { RotateCcw } from "lucide-react"
import { Button } from "./ui/button"

interface FilterResetButtonProps {
  active: boolean
  onReset: () => void
}

export function FilterResetButton({ active, onReset }: FilterResetButtonProps) {
  return <Button type="button" variant="outline" size="lg" disabled={!active} onClick={onReset}><RotateCcw data-icon="inline-start" aria-hidden="true" />Сбросить фильтры</Button>
}
