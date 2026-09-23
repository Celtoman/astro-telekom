export type AdminSection = "overview" | "preview" | "tariffs" | "tariffs-import" | "cities" | "cities-import" | "leads" | "redirects" | "variables" | "seo-templates" | "seo-sitemap" | "audit" | "trash"
export type AdminNavigationIcon = "home" | "preview" | "tariffs" | "cities" | "catalog" | "import" | "leads" | "redirects" | "variables" | "seo" | "sitemap" | "audit" | "trash"

export interface AdminNavigationItem {
  id: AdminSection | "tariffs" | "cities" | "seo"
  label: string
  href: string
  icon: AdminNavigationIcon
  children?: AdminNavigationItem[]
}

export interface SidebarShortcutEvent {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
  targetTag?: string
  contentEditable?: boolean
}

export const ADMIN_SIDEBAR_STORAGE_KEY: "admin:sidebar-expanded"
export const ADMIN_GROUPS_STORAGE_KEY: "admin:navigation-groups"
export const adminNavigation: AdminNavigationItem[]
export function activeNavigationGroup(items: AdminNavigationItem[], active: AdminSection): string | null
export function isNavigationItemActive(item: AdminNavigationItem, active: AdminSection): boolean
export function shouldToggleSidebar(event: SidebarShortcutEvent): boolean
export function readStoredSidebarExpanded(value: string | null): boolean | null
export function readStoredGroups(value: string | null, allowedGroups: string[]): string[]
