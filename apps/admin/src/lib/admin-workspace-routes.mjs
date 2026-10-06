export const workspaceRoutes = {
  "/": { screen: "overview", active: "overview" },
  "/tariffs": { screen: "tariffs", active: "tariffs" },
  "/tariffs/edit": { screen: "tariffs-edit", active: "tariffs" },
  "/tariffs/import": { screen: "tariffs-import", active: "tariffs-import" },
  "/cities": { screen: "cities", active: "cities" },
  "/cities/import": { screen: "cities-import", active: "cities-import" },
  "/leads": { screen: "leads", active: "leads" },
  "/redirects": { screen: "redirects", active: "redirects" },
  "/variables": { screen: "variables", active: "variables" },
  "/publication": { screen: "publication", active: "publication" },
  "/preview": { screen: "preview", active: "preview" },
  "/templates": { screen: "templates", active: "templates" },
  "/templates/home": { screen: "home-screens", active: "templates" },
  "/seo/templates": { screen: "seo-templates", active: "seo-templates" },
  "/seo/sitemap": { screen: "seo-sitemap", active: "seo-sitemap" },
  "/audit": { screen: "audit", active: "audit" },
  "/trash": { screen: "trash", active: "trash" },
}
export function workspaceRoute(path) {
  return workspaceRoutes[path.split("?")[0].replace(/\/$/, "") || "/"] ?? workspaceRoutes["/"]
}
