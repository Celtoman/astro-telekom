# Архитектура платформы

## Статус архитектуры

В репозитории реализован прототип статической витрины Дом.ру с защищенным внешним test-контуром в Coolify. Архитектура разделяет public web, admin, backoffice API и worker. Публичная маршрутизация строит static paths из отдельного Release 1 route inventory: корень, четыре site-global страницы и HOME каждого опубликованного города. Статусы content records и принадлежность URL текущему релизу намеренно разделены.

## Стек и приложения

| Зона | Реализация | Назначение |
| --- | --- | --- |
| `apps/web` | Astro 7, static output | SEO HTML и sitemap строго из Release 1 inventory; build генерирует Caddy routes только для редиректов с target внутри того же inventory. Переиспользуемая адресная форма встроена в HOME каждого города, а карточки предложений ведут к ней без detail URL. Дизайн/UX-референс — официальный dom.ru, визуально, не кодом — [docs/web-design-system.md](web-design-system.md). |
| `apps/admin` | Astro 7 static output + React 19 + Tailwind 4 + shadcn/ui | `/login`, защищенный shell `/`, каталоги `/tariffs` и `/cities`, отдельные `/tariffs/import` и `/cities/import`, длинная форма `/tariffs/edit`, `/leads`, `/redirects` и `/lead-access/` реализованы как React-root с runtime API-запросами. Sidebar поддерживает вложенные рабочие сценарии «Каталог»/«Импорт». Legacy demo удален; заявки доступны как реальный master-detail журнал, редиректы — как CRUD со статистикой переходов. Целевой референс паттернов — next-shadcn-admin-dashboard-aria; текущие Radix-примитивы еще требуют миграции [#97](https://github.com/Celtoman/astro-telekom/issues/97), см. [docs/admin-design-system.md](admin-design-system.md). |
| `apps/api` | NestJS 12 + Fastify | HTTP API, авторизация, ORM, импорт, лиды, интеграционные адаптеры. |
| `services/worker` | Node.js + BullMQ | Обработка доставок лидов, обычных оповещений, пересборок сайта и ежедневной PII retention; также слушает пока не используемую import-очередь. |
| `prisma` / `packages/database` | Prisma 7 + PostgreSQL | `prisma/` хранит единственные schema и migrations; `packages/database` только делегирует Prisma CLI-команды. Bootstrap seed принадлежит `apps/api/src/seed.ts`, а единственный client output генерируется в `apps/api/generated`. |
| `deploy` | Caddy + Docker Compose | Образы, reverse proxy, TLS и persistent volumes. |

## Контуры и потоки

Production Compose запускает one-shot `migrate` из API image после PostgreSQL healthcheck. `api` стартует только после успешного `prisma migrate deploy` и готового Redis; его `/health/ready` проверяет обе зависимости, а `/health/live` — только процесс. Seed остается отдельной операторской операцией, поскольку создает или обновляет продуктовые данные и администратора.

Целевой внешний deployment provider — Coolify с Git-based `docker-compose.coolify.yml` из GitHub. Первый rehearsal использует `tv-internet-dom.ru` и `admin.tv-internet-dom.ru` без дополнительного stage-контура; Coolify edge применяет один password middleware к обоим human-facing сервисам. API не получает внешний hostname: внутренние Caddy в web/admin проксируют same-origin `/api/*` в `api:3000`, поэтому Basic Auth не ломает browser fetch. Прямой `docker-compose.prod.yml` с внешним Caddy и портами 80/443 остается только локальной production-like конфигурацией.

В Coolify images собираются без сетевой зависимости от API. После запуска PostgreSQL/Redis и миграций healthy API разрешает явный `bootstrap-seed` (`RUN_BOOTSTRAP_SEED=true` только на первом deploy), затем one-shot `web-publish` выполняет реальный Astro build и post-build SEO gate из внутреннего каталога. Проверенный `dist` копируется в release-каталог persistent volume и атомарно назначается текущей публикацией; web server стартует только после успешного publisher.

Автоматический rebuild поддерживает отдельный Coolify adapter: deploy API сначала возвращает `deployment_uuid`, worker сохраняет его через internal progress endpoint и опрашивает deployment до `finished`/failure с bounded timeout. `queued`/`in_progress` не публикуют ревизию; BullMQ retry продолжает сохраненный deployment вместо повторного запуска. Legacy synchronous webhook сохранен как отдельный provider mode. Механика #57 подтверждена реальным Coolify polling rehearsal до `finished` на точном deployment commit.

Готовность инфраструктуры не смешивается с готовностью бизнеса: защищенный `/admin/readiness` отдельно проверяет наличие конфигурации coverage, contract, Tarifnik, fallback email, deployment provider и валидного PII retention period. Он возвращает только статусы и имена пропущенных переменных; реальная доступность, договорный статус интеграций и legal basis подтверждаются sandbox/rehearsal, а не наличием строки в environment.

```text
Браузер публичного сайта
  -> Caddy -> static web
  -> /api/v1/address-suggestions -> API -> DaData IPLocate (один раз/24 ч) -> DaData suggest с locations_boost
  -> /api/v1/address-checks -> API -> DaData clean -> Tarifnik address/check -> PostgreSQL
  -> /api/v1/leads -> API -> routing/контракт Дом.ру -> PostgreSQL
                    -> persistent LeadNotification -> Redis/BullMQ -> worker -> Resend/webhook
                    -> только разрешенный лид -> Redis/BullMQ -> worker -> Tarifnik/email
                    -> ошибка producer -> QUEUE attempt + DELIVERY_QUEUE_ERROR -> безопасный admin retry

Старый публичный URL
  -> build-generated Caddy matcher -> public redirect resolver API
  -> atomic hitCount/lastHitAt -> HTTP 301 на опубликованный target

Браузер admin
  -> Caddy -> static admin
  -> HttpOnly admin cookie -> API -> PostgreSQL

Изменение контента в API
  -> PostgreSQL SiteRebuild -> Redis/BullMQ -> worker
  -> internal start/progress/result API -> webhook или Coolify start/poll -> финальный результат deployment

PII retention scheduler в worker
  -> worker-only API -> serializable bounded delete в PostgreSQL
  -> cascade history/activity/delivery/tokens + orphan AddressCheck cleanup
```

Публичные формы имеют два реализованных flow. Обычная заявка принимает адрес и телефон сразу, под капотом получает и сохраняет результат Tarifnik `address/check`, а посетителю отвечает только коротким подтверждением. DaData ищет адрес глобально: при первом вводе IPLocate дает только мягкий КЛАДР-приоритет, который на 24 часа кешируется в HttpOnly-cookie; ошибка геолокации использует пару «регион + город страницы», но ни один boost не ограничивает фактическую географию заявки. Город опубликованной страницы сохраняется как source-контекст. Если найден хотя бы один провайдер, выполняется проверка действующего абонента через API Дом.ру независимо от наличия Дом.ру в списке; городской профиль выбирается по фактическим данным DaData из встроенного справочника 551 уникального профиля и 37 региональных fallback. `lead-deliveries` разрешается только при одновременном выполнении двух условий: Tarifnik подтвердил Дом.ру, а Dom.ru вернул валидный ответ с явным `contacts: []`. Действующий абонент, отсутствие Дом.ру, отсутствие провайдеров и любой неоднозначный или ошибочный ответ доставку блокируют. Видимая проверка сначала создает только `AddressCheck`: телефон запрашивается лишь при найденном Дом.ру, альтернативы ведут на `tarifnik.ru`, а пустой список показывает телефон технической поддержки. Все адресные поля выбирают подсказку DaData, а credentials остаются в API. После подтверждения действующего абонента API возвращает только UI-флаг; browser на 30 дней заменяет номера подключения на отдельный номер техподдержки, а server-side routing не читает и не доверяет этой browser-отметке.

В build-time `apps/web` вызывает `GET /public/sites/:siteSlug/cities` через server-only `SITE_DATA_API_URL` (с совместимым fallback на `PUBLIC_API_URL`). API возвращает `globalPages`, контент опубликованных городов и authoritative `routes`: `/`, четыре точных global path и `/{city.slug}` каждого `PUBLISHED` города. Чистая policy-функция запрещает отсутствие/избыток общих страниц, неверный slug, дубли и коллизии; web повторно сверяет контракт и строит sitemap только из него. Опубликованные service pages и тарифы передаются как данные для HOME, но URL не получают. Отдельный `PUBLIC_API_URL` встраивается в `data-*` browser-форм. `redirects.caddy` получает только правила с target из inventory; runtime resolver строит ту же policy по живой БД перед HTTP 301 и hit tracking. Все HTML paths кроме `/` нормализуются без завершающего слэша. `PUBLIC_SITE_SLUG` по умолчанию `domru-kazan`; любое изменение данных требует успешной пересборки.

## API-модули и их ответственность

| Модуль | Реальная ответственность |
| --- | --- |
| `auth` и `AdminTokenGuard` | Создание 12-часовой сессии, browser login/me/logout через HttpOnly cookie и совместимый Bearer для технических клиентов. `x-admin-token` — машинный credential; `/internal/*` принимает только его. |
| `cities`, `regions`, `providers`, `sites`, `pages`, `blocks` | CRUD главных CMS-сущностей; `Page` бывает city-scoped или одним из четырех site-global типов, scope и global slug защищены API и БД; блоки имеют отдельную строгую валидацию. |
| `tariff-import`, `city-import` | Валидация XLSX, сохранение отчета, transactional apply. |
| `address-suggestions`, `dadata`, `address-checks`, `coverage` | Серверные глобальные DaData IPLocate/suggest/clean: IP используется один раз для мягкого boost и не сохраняется, жесткого ограничения городом формы нет; официальный Tarifnik `address/check` получает фактический адрес пользователя, словарь провайдеров нормализуется, проверенный snapshot сохраняется без публикации raw response. |
| `leads`, `domru-contract`, `domru-profile-catalog`, `lead-delivery`, `lead-notification-outbox`, `notifications`, `lead-access` | Сохранение лида, дедупликация, выбор регионально однозначного профиля Дом.ру, fail-closed routing, строгая проверка действующего договора и только затем официальный `appeal/create`, retry только временных ошибок, queue failure tracking, email fallback и одноразовый доступ из fallback-письма. Обычное оповещение атомарно получает persistent outbox, startup recovery, bounded retry, idempotency header и отдельный admin retry. Worker повторно проверяет наличие целевого провайдера и persisted `NOT_FOUND`; delivery retry доступен только для recoverable delivery/queue states или старого orphan `PENDING`, но не для ручных/отрицательных routing-исходов. |
| `pii-retention` | Worker-only bounded hard-delete лидов и связанных payloads старше согласованных 180 дней; fail-safe без валидной настройки. |
| `crm-leads` | Список, карточка, смена статуса, повторная постановка доставки и отзыв fallback-доступа. |
| `rebuild-queue` | Persistent rebuild/outbox, дедупликация по сайту, BullMQ producer, start/progress/result API, сохранение provider deployment UUID и фиксация только финального результата deployment. |
| `redirects` | Admin CRUD с архивированием, проверкой конфликтов/петель/цепочек, public resolver HTTP 301 и атомарным `hitCount`/`lastHitAt`; каждое изменение ставит rebuild сайта. |

## Границы модулей

`apps/api` — единственный слой, который пишет доменные данные. Admin, worker и web не обращаются к PostgreSQL напрямую. `CoverageService`, `DomruContractService`, `LeadDeliveryService` и `NotificationsService` выступают адаптерами внешних интеграций; их URLs и ключи задаются окружением. Префикс `/crm/leads` сохранен только в HTTP-контракте API; отдельного CRM-приложения или домена больше нет.

`LeadDeliveryService`, `LeadNotificationOutboxService` и `RebuildQueueService` создают доменные очереди в API; worker владеет maintenance scheduler и вызывает защищенные внутренние endpoints. Только API пишет в PostgreSQL. Для обычного оповещения worker передает номер попытки и revision, а API отправляет сообщение и сохраняет outcome; для rebuild worker отдельно вызывает deployment provider и возвращает его success/error в API; для retention повторяет bounded batches до полного результата. `tariff-imports` остается listener без producer и не участвует в текущем import-flow.

## Модель публикации

1. Сущности `Site`, `City`, `Page`, `Tariff` имеют статус `DRAFT`, `PUBLISHED` или `ARCHIVED`.
2. Public API возвращает опубликованные данные, но отдельно применяет release policy к URL.
3. Astro получает authoritative inventory и выпускает `N + 5` indexable HTML для `N` опубликованных городов плюс общую 404.
4. CRUD API сохраняет/обновляет `SiteRebuild` и ставит BullMQ job; изменения одного сайта дедуплицируются, но счетчик ревизий не дает потерять изменение во время активной сборки.
5. Worker получает попытку через internal API, вызывает deployment provider и сохраняет результат через API; только явный `{ status: "SUCCEEDED" }` обновляет `publishedRevision`.

Статус доступен через admin API и показан в рабочих потоках импорта тарифов и городов. Coolify provider и production rebuild подтверждены live polling rehearsal до финального `finished`. Нет полноценного content preview, schedule, content-version snapshot или rollback.

## Что не является частью текущей реализации

- Одновременная эксплуатационная публикация нескольких сайтов: route policy поддерживает любое число опубликованных городов одного выбранного сайта, но импорт пока односайтовый, а production-доказательство новых global pages еще не выполнено.
- SSR и runtime data fetching на публичных SEO-страницах.
- Полная CMS с наследованием блоков, версиями и preview.
- Аудит действий, общая корзина и аналитический контур; для редиректов отдельно реализовано мягкое архивирование и счетчики переходов.
- Сертифицированный production-контур с реальным трафиком: внешний защищенный test deployment и sandbox/test-контракты уже подтверждены, но legal и эксплуатационные блокеры Release 1 остаются.

Детальный статус находится в [current-state.md](current-state.md), а шаги развития — в [плане реализации](plans/2026-09-07-platform-stabilization-and-mvp.md).
