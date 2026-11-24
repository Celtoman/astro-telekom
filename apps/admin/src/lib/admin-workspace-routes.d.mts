import type { AdminSection } from "./admin-navigation.mjs"
type Screen = "routers" | "official-site" | "faq" | "speed-test" | "support" | "news-categories" | "editorial-pages" | "news" | "news-editor" | "account" | "overview" | "tariffs" | "tariffs-edit" | "tariffs-import" | "cities" | "cities-import" | "leads" | "redirects" | "variables" | "publication" | "preview" | "templates" | "home-screens" | "block-passports" | "tariff-collection" | "tariff-template" | "seo-templates" | "seo-sitemap" | "audit" | "trash"
export const workspaceRoutes: Record<string, { screen: Screen; active: AdminSection; title: string }>
export function workspaceRoute(path: string): { screen: Screen; active: AdminSection; title: string }
export function isWorkspacePath(path: string): boolean
