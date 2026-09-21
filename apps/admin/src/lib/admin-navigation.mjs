export const ADMIN_SIDEBAR_STORAGE_KEY = "admin:sidebar-expanded"
export const ADMIN_GROUPS_STORAGE_KEY = "admin:navigation-groups"

export const adminNavigation = [
  { id: "overview", label: "Обзор", href: "/", icon: "home" },
  { id: "preview", label: "Предпросмотр", href: "/preview", icon: "preview" },
  {
    id: "tariffs",
    label: "Тарифы",
    href: "/tariffs",
    icon: "tariffs",
    children: [
      { id: "tariffs", label: "Каталог", href: "/tariffs", icon: "catalog" },
      { id: "tariffs-import", label: "Импорт", href: "/tariffs/import", icon: "import" },
    ],
  },
  {
    id: "cities",
    label: "Города",
    href: "/cities",
    icon: "cities",
    children: [
      { id: "cities", label: "Каталог", href: "/cities", icon: "catalog" },
      { id: "cities-import", label: "Импорт", href: "/cities/import", icon: "import" },
    ],
  },
  { id: "leads", label: "Заявки", href: "/leads", icon: "leads" },
  { id: "redirects", label: "Редиректы", href: "/redirects", icon: "redirects" },
  { id: "variables", label: "Переменные", href: "/variables", icon: "variables" },
  {
    id: "seo",
    label: "SEO",
    href: "/seo/sitemap",
    icon: "seo",
    children: [
      { id: "seo-sitemap", label: "Sitemap", href: "/seo/sitemap", icon: "sitemap" },
    ],
  },
  { id: "audit", label: "История изменений", href: "/audit", icon: "audit" },
  { id: "trash", label: "Корзина", href: "/trash", icon: "trash" },
]

export function activeNavigationGroup(items, active) {
  return items.find((item) => item.children?.some((child) => child.id === active))?.id ?? null
}

export function isNavigationItemActive(item, active) {
  return item.id === active || Boolean(item.children?.some((child) => child.id === active))
}

export function shouldToggleSidebar(event) {
  const targetTag = typeof event.targetTag === "string" ? event.targetTag.toUpperCase() : ""
  const editableTarget = event.contentEditable === true || ["INPUT", "TEXTAREA", "SELECT"].includes(targetTag)
  return !editableTarget
    && !event.altKey
    && !event.shiftKey
    && (event.ctrlKey || event.metaKey)
    && String(event.key).toLocaleLowerCase("en-US") === "b"
}

export function readStoredSidebarExpanded(value) {
  if (value === "true") return true
  if (value === "false") return false
  return null
}

export function readStoredGroups(value, allowedGroups) {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    const allowed = new Set(allowedGroups)
    return [...new Set(parsed.filter((item) => typeof item === "string" && allowed.has(item)))]
  } catch {
    return []
  }
}
