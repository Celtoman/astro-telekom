import type { LucideIcon } from "lucide-react"
import { Braces, Building2, ChevronRight, Eye, FileClock, FileSearch, FileUp, Home, Inbox, List, Map, PackageOpen, Route, Trash2 } from "lucide-react"
import { cn } from "cn"
import { Button as AriaButton, Disclosure, DisclosurePanel, Header, Heading, Link as AriaLink, Menu, MenuItem, MenuSection, MenuTrigger, Popover, Tooltip, TooltipTrigger } from "react-aria-components"
import {
  adminNavigation,
  isNavigationItemActive,
  type AdminNavigationIcon,
  type AdminNavigationItem,
  type AdminSection,
} from "../lib/admin-navigation.mjs"
import { Button, buttonVariants } from "./ui/button"

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
  const link = collapsed ? (
    <AriaLink className={cn(buttonVariants({ variant: isActive ? "secondary" : "ghost" }), "w-full justify-center px-0")} href={item.href} aria-current={isActive ? "page" : undefined} onPress={onNavigate}>
      <Icon data-icon="inline-start" />
      <span className="sr-only">{item.label}</span>
    </AriaLink>
  ) : (
    <Button className="w-full justify-start" variant={isActive ? "secondary" : "ghost"} asChild>
      <a href={item.href} aria-current={isActive ? "page" : undefined} onClick={onNavigate}>
        <Icon data-icon="inline-start" />
        <span>{item.label}</span>
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
    <Disclosure isExpanded={open} onExpandedChange={onOpenChange}>
      <Heading>
        <AriaButton slot="trigger" className={cn(buttonVariants({ variant: isActive ? "secondary" : "ghost" }), "w-full justify-start")} aria-label={`${open ? "Свернуть" : "Развернуть"} раздел «${item.label}»`}>
          <Icon data-icon="inline-start" />
          <span>{item.label}</span>
          <ChevronRight className={cn("ml-auto transition-transform duration-200", open && "rotate-90")} aria-hidden="true" />
        </AriaButton>
      </Heading>
      <DisclosurePanel>
        <div className="ml-4 flex flex-col gap-1 border-l pl-3">
          {item.children?.map((child) => <NavigationLink key={child.id} item={child} active={active} collapsed={false} onNavigate={onNavigate} />)}
        </div>
      </DisclosurePanel>
    </Disclosure>
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
    <NavigationTooltip label={item.label}>
      <MenuTrigger>
        <AriaButton className={cn(buttonVariants({ variant: isActive ? "secondary" : "ghost" }), "w-full px-0")} aria-label={`Открыть раздел «${item.label}»`}>
          <Icon />
        </AriaButton>
        <Popover placement="right top" offset={8} className="min-w-44 rounded-lg border bg-background p-1 text-foreground shadow-md">
          <Menu aria-label={item.label} className="outline-none">
            <MenuSection>
              <Header className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{item.label}</Header>
              {item.children?.map((child) => {
                const ChildIcon = navigationIcons[child.icon]
                const childActive = child.id === active
                return (
                  <MenuItem key={child.id} href={child.href} aria-current={childActive ? "page" : undefined} onAction={onNavigate} className={cn("flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[focused]:bg-muted", childActive && "bg-secondary text-secondary-foreground")}>
                    <ChildIcon aria-hidden="true" />
                    <span>{child.label}</span>
                  </MenuItem>
                )
              })}
            </MenuSection>
          </Menu>
        </Popover>
      </MenuTrigger>
    </NavigationTooltip>
  )
}

function NavigationTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <TooltipTrigger delay={250}>
      {children}
      <Tooltip placement="right" offset={8} className="rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-sm">
        {label}
      </Tooltip>
    </TooltipTrigger>
  )
}
