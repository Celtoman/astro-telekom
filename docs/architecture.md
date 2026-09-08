# Архитектура платформы

## Статус архитектуры

В репозитории реализован локальный прототип статической витрины Дом.ру для Казани. Архитектура уже разделяет public web, backoffice API, CRM и worker, но публичная маршрутизация не использует универсальную модель `Site` и `City`. Поэтому схема ниже отражает реальный код и одновременно обозначает границу будущего расширения.

## Стек и приложения

| Зона | Реализация | Назначение |
| --- | --- | --- |
| `apps/web` | Astro 7, static output | SEO HTML, фиксированные маршруты Казани, форма проверки адреса. Дизайн/UX-референс — официальный dom.ru, визуально, не кодом — [docs/web-design-system.md](web-design-system.md). |
| `apps/admin` | Astro 7 static output + React 19 + Tailwind 4 + shadcn/ui | Admin UI: `/lead-access/` реализован как React-root с runtime API-запросом; импорт подключен к API, остальные части legacy `index.astro` частично demo. Референс паттернов — next-shadcn-admin-dashboard, см. [docs/admin-design-system.md](admin-design-system.md). |
| `apps/crm` | Astro 7, static output | Просмотр лидов и смена операторского статуса через API. **Временный прототип** — решение от 7 сентября 2026 ([docs/decisions.md](decisions.md), раздел 6): функциональность переносится в раздел «Заявки» `apps/admin`, отдельного приложения в целевой архитектуре не будет. Миграция не начата, `apps/crm` продолжает работать как есть. |
| `apps/api` | NestJS 12 + Fastify | HTTP API, авторизация, ORM, импорт, лиды, интеграционные адаптеры. |
| `services/worker` | Node.js + BullMQ | Обработка доставок лидов и пересборок сайта; также слушает пока не используемую import-очередь. |
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
  -> PostgreSQL SiteRebuild -> Redis/BullMQ -> worker
  -> internal start/result API + REBUILD_WEBHOOK_URL -> финальный результат deployment
```

В build-time `apps/web` вызывает `GET /public/sites/domru-kazan/cities/kazan` и генерирует HTML. В runtime публичная статическая витрина не читает PostgreSQL и не может сама увидеть изменения в API.

## API-модули и их ответственность

| Модуль | Реальная ответственность |
| --- | --- |
| `auth` и `AdminTokenGuard` | Создание 12-часовой Bearer-сессии для единого уровня доступа администратора; совместимый сервисный `x-admin-token` используется как машинный credential. |
| `cities`, `regions`, `providers`, `sites`, `pages`, `blocks` | CRUD главных CMS-сущностей; строгая валидация есть только у блоков. |
| `tariff-import`, `city-import` | Валидация XLS/XLSX, сохранение отчета, transactional apply. |
| `address-checks`, `coverage` | Сохранение проверки адреса и адаптер внешнего coverage API. |
| `leads`, `domru-contract`, `lead-delivery`, `notifications`, `lead-access` | Сохранение лида, дедупликация, проверка договора, API/email delivery и одноразовый доступ из fallback-письма. |
| `crm-leads` | Список, карточка, смена статуса, повторная постановка доставки и отзыв fallback-доступа. |
| `rebuild-queue` | Persistent rebuild/outbox, дедупликация по сайту, BullMQ producer, start/result API и фиксация финального результата deployment. |

## Границы модулей

`apps/api` — единственный слой, который пишет доменные данные. Admin, CRM, worker и web не обращаются к PostgreSQL напрямую. `CoverageService`, `DomruContractService`, `LeadDeliveryService` и `NotificationsService` выступают адаптерами внешних интеграций; их URLs и ключи задаются окружением.

`LeadDeliveryService` и `RebuildQueueService` создают очереди в API, а worker вызывает защищенные внутренние endpoints. Только API пишет в PostgreSQL. Для rebuild worker отдельно вызывает deployment provider и возвращает его success/error в API; `tariff-imports` остается listener без producer и не участвует в текущем import-flow.

## Модель публикации

1. Сущности `Site`, `City`, `Page`, `Tariff` имеют статус `DRAFT`, `PUBLISHED` или `ARCHIVED`.
2. Public API возвращает только опубликованные город, страницы и тарифы.
3. Astro получает этот срез во время сборки и выпускает static HTML.
4. CRUD API сохраняет/обновляет `SiteRebuild` и ставит BullMQ job; изменения одного сайта дедуплицируются, но счетчик ревизий не дает потерять изменение во время активной сборки.
5. Worker получает попытку через internal API, вызывает deployment provider и сохраняет результат через API; только явный `{ status: "SUCCEEDED" }` обновляет `publishedRevision`.

Статус доступен через admin API, но UI статуса появится в вертикальном admin-flow отдельной задачей. Нет preview, schedule, content-version snapshot или rollback. Конкретный deployment provider и production rebuild еще требуют live-интеграционной проверки.

## Что не является частью текущей реализации

- Мультигородской и многосайтовый public routing.
- SSR и runtime data fetching на публичных SEO-страницах.
- Полная CMS с наследованием блоков, версиями и preview.
- Аудит действий, корзина, редиректы и аналитический контур.
- Подтвержденный production deployment и реальные внешние API-контракты.

Детальный статус находится в [current-state.md](current-state.md), а шаги развития — в [плане реализации](plans/2026-09-07-platform-stabilization-and-mvp.md).
