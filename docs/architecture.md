# Архитектура платформы сайтов провайдера

## Зафиксированный стек

- Публичный сайт: Astro + TypeScript.
- API: NestJS + Fastify.
- Админка и CRM: отдельные Astro-приложения с HTML-интерфейсом и клиентским JavaScript для API-действий.
- Хранилище данных: PostgreSQL + Prisma.
- Фоновые задачи: Redis + BullMQ.
- Развертывание: Docker Compose на VPS.
- Reverse proxy и TLS: Caddy.

## Приложения

```text
apps/
  web/       Astro: публичные страницы и SEO
  admin/     Astro: города, страницы, блоки, тарифы, импорт
  crm/       Astro: заявки и статусы операторов

apps/api/    NestJS: единый API и бизнес-правила

services/
  worker/    BullMQ: импорт, email, пересборка страниц

packages/
  database/  Prisma schema, миграции, seed
```

## Домены

```text
site.ru/                 публичный сайт
site.ru/kazan/           город
admin.site.ru/           админка
crm.site.ru/             CRM
api.site.ru/             API
```

Админка и CRM используют единый API и единую базу. Дублировать тарифы или заявки между приложениями нельзя.

## HTML-first правило

Все SEO-значимые элементы должны попадать в исходный HTML: H1, тексты, тарифы, ссылки, breadcrumbs, canonical, title, description и JSON-LD. JavaScript используется только для проверки адреса, форм, масок, фильтров и других интерактивных элементов.

По умолчанию страницы Astro пререндерятся статически. Изменение города, страницы или тарифа ставит задачу пересборки затронутых маршрутов. Динамический SSR разрешается только для маршрутов, которым действительно нужны данные на запросе.

## Основные модули API

- providers
- sites
- regions
- cities
- pages
- page-blocks
- tariffs
- tariff-imports
- address-checks
- leads
- crm-status-history
- seo
- аналитика: при заданном `PUBLIC_YANDEX_METRIKA_ID` включаются клики по телефону и отправка формы заявки;
- users-and-roles
- settings

## Границы первого релиза

Первый вертикальный срез запускается для Дом.ру в Казани и включает главную города, интернет, интернет + ТВ, телевидение, страницу тарифа, проверку адреса, FAQ и обработку заявок.
