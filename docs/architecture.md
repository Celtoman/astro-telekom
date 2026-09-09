# Архитектура платформы

## Статус архитектуры

В репозитории реализован локальный прототип статической витрины Дом.ру. Архитектура разделяет public web, admin, backoffice API и worker. Публичная маршрутизация строит static paths из опубликованных `City`, `Page` и `Tariff`; в текущей базе опубликована только Казань, поэтому реальный output пока остается одногородским.

## Стек и приложения

| Зона | Реализация | Назначение |
| --- | --- | --- |
| `apps/web` | Astro 7, static output | SEO HTML и sitemap из опубликованных городов, страниц и тарифов; build генерирует Caddy routes опубликованных редиректов. Форма проверки адреса получает site/city/page context из static route. Дизайн/UX-референс — официальный dom.ru, визуально, не кодом — [docs/web-design-system.md](web-design-system.md). |
| `apps/admin` | Astro 7 static output + React 19 + Tailwind 4 + shadcn/ui | `/login`, защищенный shell `/`, рабочие `/tariffs`, `/cities`, `/leads`, `/redirects` и `/lead-access/` реализованы как React-root с runtime API-запросами. Legacy demo удален; заявки доступны как реальный master-detail журнал, редиректы — как CRUD со статистикой переходов. Референс паттернов — next-shadcn-admin-dashboard, см. [docs/admin-design-system.md](admin-design-system.md). |
| `apps/api` | NestJS 12 + Fastify | HTTP API, авторизация, ORM, импорт, лиды, интеграционные адаптеры. |
| `services/worker` | Node.js + BullMQ | Обработка доставок лидов, пересборок сайта и ежедневной PII retention; также слушает пока не используемую import-очередь. |
| `prisma` / `packages/database` | Prisma 7 + PostgreSQL | Схема, миграции, seed и сгенерированный клиент. |
| `deploy` | Caddy + Docker Compose | Образы, reverse proxy, TLS и persistent volumes. |

## Контуры и потоки

Production Compose запускает one-shot `migrate` из API image после PostgreSQL healthcheck. `api` стартует только после успешного `prisma migrate deploy` и готового Redis; его `/health/ready` проверяет обе зависимости, а `/health/live` — только процесс. Seed остается отдельной операторской операцией, поскольку создает или обновляет продуктовые данные и администратора.

Целевой внешний deployment provider — Coolify с Git-based Docker Compose из GitHub. Первый rehearsal использует `tv-internet-dom.ru` без дополнительного stage-контура; human-facing web/admin routes должны быть закрыты password middleware на Coolify edge. Текущая схема внешнего Caddy и портов 80/443 пока является локальной production-like конфигурацией, а не готовой Coolify-топологией ([#56](https://github.com/Celtoman/astro-telekom/issues/56)).

Готовность инфраструктуры не смешивается с готовностью бизнеса: защищенный `/admin/readiness` отдельно проверяет наличие конфигурации coverage, contract, Tarifnik, fallback email, deployment provider и валидного PII retention period. Он возвращает только статусы и имена пропущенных переменных; реальная доступность, договорный статус интеграций и legal basis подтверждаются sandbox/rehearsal, а не наличием строки в environment.

```text
Браузер публичного сайта
  -> Caddy -> static web
  -> api.domain/api/v1/address-checks, /leads -> API -> PostgreSQL
                                              -> Redis/BullMQ -> worker -> Tarifnik/email

Старый публичный URL
  -> build-generated Caddy matcher -> public redirect resolver API
  -> atomic hitCount/lastHitAt -> HTTP 301 на опубликованный target

Браузер admin
  -> Caddy -> static admin
  -> HttpOnly admin cookie -> API -> PostgreSQL

Изменение контента в API
  -> PostgreSQL SiteRebuild -> Redis/BullMQ -> worker
  -> internal start/result API + REBUILD_WEBHOOK_URL -> финальный результат deployment

PII retention scheduler в worker
  -> worker-only API -> serializable bounded delete в PostgreSQL
  -> cascade history/activity/delivery/tokens + orphan AddressCheck cleanup
```

В build-time `apps/web` вызывает `GET /public/sites/:siteSlug/cities` через server-only `SITE_DATA_API_URL` (с совместимым fallback на `PUBLIC_API_URL`), валидирует уникальность каждого публичного пути, отсутствие redirect-цепочек и существование каждой цели. Отдельный `PUBLIC_API_URL` встраивается в browser-формы и не обязан совпадать с внутренним источником каталога. Web генерирует HTML только для опубликованного каталога и `redirects.caddy` только для опубликованных редиректов; при сборке container image этот файл переносится из document root в `/etc/caddy`. `PUBLIC_SITE_SLUG` выбирает сайт, по умолчанию `domru-kazan`. В runtime статические страницы не читают PostgreSQL; только совпавший старый URL проксируется внутренним Caddy в API для актуальной проверки статуса, HTTP 301 и атомарного учета перехода. Изменение каталога или правила требует успешной пересборки.

## API-модули и их ответственность

| Модуль | Реальная ответственность |
| --- | --- |
| `auth` и `AdminTokenGuard` | Создание 12-часовой сессии, browser login/me/logout через HttpOnly cookie и совместимый Bearer для технических клиентов. `x-admin-token` — машинный credential; `/internal/*` принимает только его. |
| `cities`, `regions`, `providers`, `sites`, `pages`, `blocks` | CRUD главных CMS-сущностей; блоки имеют отдельную строгую валидацию, остальные admin bodies частично проверяются вручную. |
| `tariff-import`, `city-import` | Валидация XLSX, сохранение отчета, transactional apply. |
| `address-checks`, `coverage` | Сохранение проверки адреса и адаптер внешнего coverage API. |
| `leads`, `domru-contract`, `lead-delivery`, `notifications`, `lead-access` | Сохранение лида, дедупликация, проверка договора, API/email delivery и одноразовый доступ из fallback-письма. |
| `pii-retention` | Worker-only bounded hard-delete просроченных лидов и связанных payloads; fail-safe без явно заданного срока. |
| `crm-leads` | Список, карточка, смена статуса, повторная постановка доставки и отзыв fallback-доступа. |
| `rebuild-queue` | Persistent rebuild/outbox, дедупликация по сайту, BullMQ producer, start/result API и фиксация финального результата deployment. |
| `redirects` | Admin CRUD с архивированием, проверкой конфликтов/петель/цепочек, public resolver HTTP 301 и атомарным `hitCount`/`lastHitAt`; каждое изменение ставит rebuild сайта. |

## Границы модулей

`apps/api` — единственный слой, который пишет доменные данные. Admin, worker и web не обращаются к PostgreSQL напрямую. `CoverageService`, `DomruContractService`, `LeadDeliveryService` и `NotificationsService` выступают адаптерами внешних интеграций; их URLs и ключи задаются окружением. Префикс `/crm/leads` сохранен только в HTTP-контракте API; отдельного CRM-приложения или домена больше нет.

`LeadDeliveryService` и `RebuildQueueService` создают доменные очереди в API; worker владеет maintenance scheduler и вызывает защищенные внутренние endpoints. Только API пишет в PostgreSQL. Для rebuild worker отдельно вызывает deployment provider и возвращает его success/error в API; для retention повторяет bounded batches до полного результата. `tariff-imports` остается listener без producer и не участвует в текущем import-flow.

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
- Аудит действий, общая корзина и аналитический контур; для редиректов отдельно реализовано мягкое архивирование и счетчики переходов.
- Подтвержденный production deployment и реальные внешние API-контракты.

Детальный статус находится в [current-state.md](current-state.md), а шаги развития — в [плане реализации](plans/2026-09-07-platform-stabilization-and-mvp.md).
