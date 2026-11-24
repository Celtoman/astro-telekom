export const workspaceRoutes = {
  "/news/categories": { screen: "news-categories", active: "news-categories", title: "Категории новостей · Дом.ру Платформа" },
  "/pages/news": { screen: "editorial-pages", active: "pages-news", title: "Страница новостей · Дом.ру Платформа" },
  "/pages/not-found": { screen: "editorial-pages", active: "pages-not-found", title: "Страница 404 · Дом.ру Платформа" },
  "/news": { screen: "news", active: "news", title: "Новости · Дом.ру Платформа" },
  "/news/new": { screen: "news-editor", active: "news", title: "Новая новость · Дом.ру Платформа" },
  "/news/edit": { screen: "news-editor", active: "news", title: "Редактор новости · Дом.ру Платформа" },
  "/templates/official-site": { screen: "official-site", active: "templates", title: "Официальный сайт · Админка" },
  "/templates/faq": { screen: "faq", active: "templates", title: "Вопросы и ответы · Админка" },
  "/templates/routers": { screen: "routers", active: "templates", title: "Роутеры · Админка" },
  "/templates/speed-test": { screen: "speed-test", active: "templates", title: "Проверка скорости интернета · Админка" },
  "/templates/support": { screen: "support", active: "templates", title: "Техническая поддержка · Админка" },
  "/templates/account": { screen: "account", active: "templates", title: "Личный кабинет · Админка" },
  "/": { screen: "overview", active: "overview", title: "Дом.ру · Администрирование" },
  "/tariffs": { screen: "tariffs", active: "tariffs", title: "Тарифы · Дом.ру Платформа" },
  "/tariffs/edit": { screen: "tariffs-edit", active: "tariffs", title: "Редактирование тарифа · Дом.ру Платформа" },
  "/tariffs/import": { screen: "tariffs-import", active: "tariffs-import", title: "Импорт тарифов · Дом.ру Платформа" },
  "/cities": { screen: "cities", active: "cities", title: "Города · Дом.ру Платформа" },
  "/cities/import": { screen: "cities-import", active: "cities-import", title: "Импорт городов · Дом.ру Платформа" },
  "/leads": { screen: "leads", active: "leads", title: "Заявки · Дом.ру Платформа" },
  "/redirects": { screen: "redirects", active: "redirects", title: "Редиректы · Дом.ру Платформа" },
  "/variables": { screen: "variables", active: "variables", title: "Переменные · Дом.ру Платформа" },
  "/publication": { screen: "publication", active: "publication", title: "Публикация сайта · Дом.ру Платформа" },
  "/preview": { screen: "preview", active: "preview", title: "Предпросмотр · Дом.ру Платформа" },
  "/templates": { screen: "templates", active: "templates", title: "Шаблоны страниц · Дом.ру Платформа" },
  "/templates/passports": { screen: "block-passports", active: "block-passports", title: "Паспорта блоков · Админка" },
  "/templates/tariffs": { screen: "tariff-collection", active: "templates", title: "Тарифы города · Админка" },
  "/templates/tariff": { screen: "tariff-template", active: "templates", title: "Проверка шаблона тарифа · Админка" },
  "/templates/home": { screen: "home-screens", active: "templates", title: "Главная сайта и города · Админка" },
  "/seo/templates": { screen: "seo-templates", active: "seo-templates", title: "SEO-шаблоны · Дом.ру Платформа" },
  "/seo/sitemap": { screen: "seo-sitemap", active: "seo-sitemap", title: "Sitemap · Дом.ру Платформа" },
  "/audit": { screen: "audit", active: "audit", title: "История изменений · Дом.ру Платформа" },
  "/trash": { screen: "trash", active: "trash", title: "Корзина · Дом.ру Платформа" },
}
const pathname = path => path.split(/[?#]/, 1)[0].replace(/\/$/, "") || "/"

export function isWorkspacePath(path) {
  const route = pathname(path)
  return route !== "/preview" && Object.hasOwn(workspaceRoutes, route)
}

export function workspaceRoute(path) {
  const route = pathname(path)
  return Object.hasOwn(workspaceRoutes, route) ? workspaceRoutes[route] : workspaceRoutes["/"]
}
