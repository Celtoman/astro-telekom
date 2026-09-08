# Архитектура платформы

## Статус архитектуры

В репозитории реализован локальный прототип статической витрины Дом.ру для Казани. Архитектура уже разделяет public web, backoffice API, CRM и worker, но публичная маршрутизация не использует универсальную модель `Site` и `City`. Поэтому схема ниже отражает реальный код и одновременно обозначает границу будущего расширения.

## Стек и приложения

| Зона | Реализация | Назначение |
| --- | --- | --- |
| `apps/web` | Astro 7, static output | SEO HTML, фиксированные маршруты Казани, форма проверки адреса. Дизайн/UX-референс — официальный dom.ru, визуально, не кодом — [docs/web-design-system.md](web-design-system.md). |
| `apps/admin` | Astro 7, static output | Admin UI: реальные загрузки списка и XLS-import, остальное частично demo UI. Целевой стек — Astro как оболочка и маршрутизация, React-root для интерактивных экранов, Tailwind и shadcn/ui; референс паттернов — next-shadcn-admin-dashboard, см. [docs/admin-design-system.md](admin-design-system.md). Ни React, ни Tailwind ещё не подключены. |
| `apps/crm` | Astro 7, static output | Просмотр лидов и смена операторского статуса через API. **Временный прототип** — решение от 7 сентября 2026 ([docs/decisions.md](decisions.md), раздел 6): функциональность переносится в раздел «Заявки» `apps/admin`, отдельного приложения в целевой архитектуре не будет. Миграция не начата, `apps/crm` продолжает работать как есть. |
| `apps/api` | NestJS 12 + Fastify | HTTP API, авторизация, ORM, импорт, лиды, интеграционные адаптеры. |
| `services/worker` | Node.js + BullMQ | Обработка доставок лидов; также слушает пока не используемые import/rebuild очереди. |
| `prisma` / `packages/database` | Prisma 7 + PostgreSQL | Схема, миграции, seed и сгенерированный клиент. |
| `deploy` | Caddy + Docker Compose | Образы, reverse proxy, TLS и persistent volumes. |

## Контуры и потоки

```text
Браузер публичного сайта
  -> Caddy -> static web
  -> api.domain/api/v1/address-checks, /leads -> API -> PostgreSQL
                                              -> Redis/BullMQ -> worker -> Tarifnik/email

Браузер admin или CRM
  -> Caddy -> static admin/crm
  -> Bearer token or x-admin-token -> API -> PostgreSQL

Изменение контента в API
  -> прямой POST REBUILD_WEBHOOK_URL
  -> внешний deployment должен пересобрать static web
```

В build-time `apps/web` вызывает `GET /public/sites/domru-kazan/cities/kazan` и генерирует HTML. В runtime публичная статическая витрина не читает PostgreSQL и не может сама увидеть изменения в API.

## API-модули и их ответственность

| Модуль | Реальная ответственность |
| --- | --- |
| `auth` и `AdminTokenGuard` | Создание 12-часовой Bearer-сессии, проверка роли, совместимый сервисный `x-admin-token`. |
| `cities`, `regions`, `providers`, `sites`, `pages`, `blocks` | CRUD главных CMS-сущностей; строгая валидация есть только у блоков. |
| `tariff-import`, `city-import` | Валидация XLS/XLSX, сохранение отчета, transactional apply. |
| `address-checks`, `coverage` | Сохранение проверки адреса и адаптер внешнего coverage API. |
| `leads`, `domru-contract`, `lead-delivery`, `notifications` | Сохранение лида, дедупликация, проверка договора, API/email delivery. |
| `crm-leads` | Список, карточка, смена статуса и повторная постановка доставки. |
| `rebuild-queue` | Прямой best-effort webhook, а не очередь в текущей реализации. |

## Границы модулей

`apps/api` — единственный слой, который пишет доменные данные. Admin, CRM, worker и web не обращаются к PostgreSQL напрямую. `CoverageService`, `DomruContractService`, `LeadDeliveryService` и `NotificationsService` выступают адаптерами внешних интеграций; их URLs и ключи задаются окружением.

Практическое ограничение: `LeadDeliveryService` сам создает очередь `lead-deliveries`, а worker вызывает внутренний API endpoint. Это уже отделяет retry от браузерного запроса, но rebuild и import не используют аналогичный устойчивый путь.

## Модель публикации

1. Сущности `Site`, `City`, `Page`, `Tariff` имеют статус `DRAFT`, `PUBLISHED` или `ARCHIVED`.
2. Public API возвращает только опубликованные город, страницы и тарифы.
3. Astro получает этот срез во время сборки и выпускает static HTML.
4. CRUD API пытается вызвать `REBUILD_WEBHOOK_URL` после изменения данных.

Пункт 4 не дает гарантии публикации: webhook не хранится в БД, не повторяется и не возвращает статус в UI. Нет preview, schedule, версии, rollback или доказательства успешной пересборки. Это ключевой архитектурный долг TD-05.

## Что не является частью текущей реализации

- Мультигородской и многосайтовый public routing.
- SSR и runtime data fetching на публичных SEO-страницах.
- Полная CMS с наследованием блоков, версиями и preview.
- Аудит действий, корзина, редиректы и аналитический контур.
- Подтвержденный production deployment и реальные внешние API-контракты.

Детальный статус находится в [current-state.md](current-state.md), а шаги развития — в [плане реализации](plans/2026-09-07-platform-stabilization-and-mvp.md).
