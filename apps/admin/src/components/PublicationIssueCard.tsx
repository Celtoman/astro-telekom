import type { PublicationIssue } from '../lib/publication-review.mjs'
import { publicationIssuePresentation } from '../lib/publication-issue-presentation.mjs'
import { Badge } from './ui/badge'
import { buttonVariants } from './ui/button'

export function PublicationIssueCard({ issue, siteId }: { issue: PublicationIssue; siteId: string }) {
  const view = publicationIssuePresentation(issue, siteId)
  return <li className="min-w-0 rounded-lg border p-4 text-sm">
    <div className="flex flex-wrap items-center gap-2"><Badge variant={issue.severity === 'BLOCKING' ? 'destructive' : 'secondary'}>{issue.severity === 'BLOCKING' ? 'Ошибка' : 'Предупреждение'}</Badge><h3 className="break-words font-semibold">{view.heading}</h3></div>
    {view.field && <p className="mt-3 font-medium">Поле «{view.field}»</p>}
    <p className="mt-2 break-words">{issue.message}</p>
    <p className="mt-2 text-muted-foreground">{view.action}</p>
    {view.href && <a href={view.href} className={buttonVariants({ variant: 'outline', className: 'mt-3 min-h-11 max-w-full whitespace-normal text-center' })}>{view.field ? 'Перейти к полю' : 'Открыть редактор'}</a>}
    {view.showPath && <p className="mt-3 break-all text-xs text-muted-foreground">{issue.context === 'SERVICE_DATA' ? 'Город' : 'Страница'}: {issue.path}</p>}
    <details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer rounded py-1 focus-visible:outline-2 focus-visible:outline-ring">Технические сведения</summary><p className="mt-2 break-all">Код: {issue.code}{issue.field ? ` · Поле: ${issue.field}` : ''}{issue.block ? ` · Блок: ${issue.block}` : ''}{issue.relatedPath ? ` · Связано с ${issue.relatedPath}` : ''}</p></details>
  </li>
}
