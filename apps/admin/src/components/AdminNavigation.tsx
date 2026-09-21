import type { LucideIcon } from "lucide-react"
import { Braces, Building2, ChevronRight, Eye, FileClock, FileSearch, FileUp, Home, Inbox, List, Map, PackageOpen, Route, Trash2 } from "lucide-react"
import { cn } from "cn"
import { Collapsible, DropdownMenu, Tooltip } from "radix-ui"
import {
  adminNavigation,
  isNavigationItemActive,
  type AdminNavigationIcon,
  type AdminNavigationItem,
  type AdminSection,
} from "../lib/admin-navigation.mjs"
import { Button } from "./ui/button"

const navigationIcons: Record<AdminNavigationIcon, LucideIcon> = {
  home: Home,
  preview: Eye,
  tariffs: PackageOpen,
  cities: Building2,
  catalog: List,
  import: FileUp,
  leads: Inbox,
  redirects: Route,
  variables: Braces,
  seo: FileSearch,
  sitemap: Map,
  audit: FileClock,
  trash: Trash2,
}

interface AdminNavigationProps {
  active: AdminSection
  collapsed?: boolean
  expandedGroups: ReadonlySet<string>
  onGroupOpenChange: (id: string, open: boolean) => void
  onNavigate?: () => void
}

export function AdminNavigation({ active, collapsed = false, expandedGroups, onGroupOpenChange, onNavigate }: AdminNavigationProps) {
  return (
    <Tooltip.Provider delayDuration={250}>
      <nav className="flex flex-col gap-1" aria-label="Разделы админки">
        {adminNavigation.map((item) => item.children?.length
          ? <NavigationGroup
              key={item.id}
              item={item}
              active={active}
              collapsed={collapsed}
              open={expandedGroups.has(item.id)}
              onOpenChange={(open) => onGroupOpenChange(item.id, open)}
              onNavigate={onNavigate}
            />
          : <NavigationLink key={item.id} item={item} active={active} collapsed={collapsed} onNavigate={onNavigate} />)}
      </nav>
    </Tooltip.Provider>
  )
}

function NavigationLink({ item, active, collapsed, onNavigate }: {
  item: AdminNavigationItem
  active: AdminSection
  collapsed: boolean
  onNavigate?: () => void
}) {
  const Icon = navigationIcons[item.icon]
  const isActive = item.id === active
  const link = (
    <Button className={cn("w-full justify-start", collapsed && "justify-center px-0")} variant={isActive ? "secondary" : "ghost"} asChild>
      <a href={item.href} aria-current={isActive ? "page" : undefined} onClick={onNavigate}>
        <Icon data-icon="inline-start" />
        <span className={cn(collapsed && "sr-only")}>{item.label}</span>
      </a>
    </Button>
  )

  if (!collapsed) return link
  return <NavigationTooltip label={item.label}>{link}</NavigationTooltip>
}

function NavigationGroup({ item, active, collapsed, open, onOpenChange, onNavigate }: {
  item: AdminNavigationItem
  active: AdminSection
  collapsed: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onNavigate?: () => void
}) {
  if (collapsed) return <CollapsedNavigationGroup item={item} active={active} onNavigate={onNavigate} />

  const Icon = navigationIcons[item.icon]
  const isActive = isNavigationItemActive(item, active)
  return (
    <Collapsible.Root open={open} onOpenChange={onOpenChange}>
      <Collapsible.Trigger asChild>
        <Button className="w-full justify-start" variant={isActive ? "secondary" : "ghost"} aria-label={`${open ? "Свернуть" : "Развернуть"} раздел «${item.label}»`}>
          <Icon data-icon="inline-start" />
          <span>{item.label}</span>
          <ChevronRight className={cn("ml-auto transition-transform duration-200", open && "rotate-90")} aria-hidden="true" />
        </Button>
      </Collapsible.Trigger>
      <Collapsible.Content>
        <div className="ml-4 flex flex-col gap-1 border-l pl-3">
          {item.children?.map((child) => <NavigationLink key={child.id} item={child} active={active} collapsed={false} onNavigate={onNavigate} />)}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}

function CollapsedNavigationGroup({ item, active, onNavigate }: {
  item: AdminNavigationItem
  active: AdminSection
  onNavigate?: () => void
}) {
  const Icon = navigationIcons[item.icon]
  const isActive = isNavigationItemActive(item, active)
  return (
    <DropdownMenu.Root>
      <NavigationTooltip label={item.label}>
        <DropdownMenu.Trigger asChild>
          <Button className="w-full px-0" variant={isActive ? "secondary" : "ghost"} aria-label={`Открыть раздел «${item.label}»`}>
            <Icon />
          </Button>
        </DropdownMenu.Trigger>
      </NavigationTooltip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content side="right" align="start" sideOffset={8} className="min-w-44 rounded-lg border bg-background p-1 text-foreground shadow-md">
          <DropdownMenu.Label className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{item.label}</DropdownMenu.Label>
          {item.children?.map((child) => {
            const ChildIcon = navigationIcons[child.icon]
            const childActive = child.id === active
            return (
              <DropdownMenu.Item key={child.id} asChild>
                <a href={child.href} aria-current={childActive ? "page" : undefined} onClick={onNavigate} className={cn("flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none focus:bg-muted", childActive && "bg-secondary text-secondary-foreground")}>
                  <ChildIcon aria-hidden="true" />
                  <span>{child.label}</span>
                </a>
              </DropdownMenu.Item>
            )
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function NavigationTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side="right" sideOffset={8} className="rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-sm">
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
