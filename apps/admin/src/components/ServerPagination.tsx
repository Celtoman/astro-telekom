import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "./ui/button"

interface ServerPaginationProps {
  page: number
  pageSize: number
  itemCount: number
  total: number
  hasNextPage: boolean
  busy?: boolean
  onPageSizeChange: (pageSize: number) => void
  onPrevious: () => void
  onNext: () => void
}

export function ServerPagination({
  page,
  pageSize,
  itemCount,
  total,
  hasNextPage,
  busy = false,
  onPageSizeChange,
  onPrevious,
  onNext,
}: ServerPaginationProps) {
  return (
    <nav className="flex flex-col gap-3 border-t pt-4 text-sm sm:flex-row sm:items-center sm:justify-between" aria-label="Пагинация таблицы">
      <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
        <span>Показано {itemCount.toLocaleString("ru-RU")} из {total.toLocaleString("ru-RU")}</span>
        <label className="flex items-center gap-2">
          <span>Строк на странице</span>
          <select
            className="h-8 rounded-md border border-input bg-transparent px-2 text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            value={pageSize}
            disabled={busy}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {[10, 25, 50, 100].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <span>Страница {page}</span>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Предыдущая страница" disabled={busy || page <= 1} onClick={onPrevious}>
          <ChevronLeft />
        </Button>
        <Button variant="outline" size="icon" aria-label="Следующая страница" disabled={busy || !hasNextPage} onClick={onNext}>
          <ChevronRight />
        </Button>
      </div>
    </nav>
  )
}
