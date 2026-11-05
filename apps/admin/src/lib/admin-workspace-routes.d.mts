import type { AdminSection } from "./admin-navigation.mjs"
type Screen = "account" | "overview" | "tariffs" | "tariffs-edit" | "tariffs-import" | "cities" | "cities-import" | "leads" | "redirects" | "variables" | "publication" | "preview" | "templates" | "home-screens" | "block-passports" | "tariff-collection" | "tariff-template" | "seo-templates" | "seo-sitemap" | "audit" | "trash"
export const workspaceRoutes: Record<string, { screen: Screen; active: AdminSection }>
export function workspaceRoute(path: string): { screen: Screen; active: AdminSection }
