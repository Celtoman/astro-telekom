# Архитектура платформы

## Статус архитектуры

В репозитории реализован прототип статической витрины Дом.ру с защищенным внешним test-контуром в Coolify. Архитектура разделяет public web, admin, backoffice API и worker. Публичная маршрутизация строит static paths из отдельного Release 1 route inventory: корень, пять site-global страниц, HOME каждого опубликованного города и detail каждого опубликованного тарифа такого города. Канонический импорт переводит весь входящий каталог городов в `PUBLISHED` и создает новым городам единую композицию HOME.

## Стек и приложения

| Зона | Реализация | Назначение |
| --- | --- | --- |
| `apps/web` | Astro 7, static output | SEO HTML и sitemap index с раздельными картами pages/cities/tariffs строятся из Release 1 inventory и снимка управляемых исключений; build генерирует Caddy routes только для редиректов с target внутри того же inventory. Все city HOME используют один блочный renderer и встроенную адресную форму; отдельного fallback-шаблона нет. `/goroda-obsluzhivaniya` серверно выводит все ссылки, группирует города по региону и добавляет прогрессивный client-side поиск. Дизайн/UX-референс — официальный dom.ru, визуально, не кодом — [docs/web-design-system.md](web-design-system.md). |
| `apps/admin` | Astro 7 static output + React 19 + Tailwind 4 + shadcn/ui | `/login`, защищенный shell `/`, `/preview`, каталоги `/tariffs` и `/cities`, отдельные `/tariffs/import` и `/cities/import`, длинная форма `/tariffs/edit`, `/leads`, `/redirects`, `/audit`, `/trash` и `/lead-access/` реализованы как React-root с runtime API-запросами. Sidebar поддерживает вложенные рабочие сценарии «Каталог»/«Импорт». Личный preview визуализирует текущий рабочий Release 1 catalog в sandboxed desktop/tablet/mobile iframe без snapshot или deployment. Общий publication control на ручных экранах тарифов, городов и редиректов показывает рабочую/опубликованную ревизии и запускает точный снимок отдельно от сохранения. Legacy demo удален; заявки доступны как реальный master-detail журнал, редиректы — как CRUD со статистикой переходов, история CMS — как read-only server-paginated master-detail, а корзина — как сгруппированное восстановление архивных сущностей в рабочий `DRAFT`. Целевой референс паттернов — next-shadcn-admin-dashboard-aria; текущие Radix-примитивы еще требуют миграции [#97](https://github.com/Celtoman/astro-telekom/issues/97), см. [docs/admin-design-system.md](admin-design-system.md). |
| `apps/api` | NestJS 12 + Fastify | HTTP API, авторизация, ORM, импорт, лиды, интеграционные адаптеры и publication workflow: рабочие ревизии, снимки каталога и выбор последней успешной публикации. |
| `services/worker` | Node.js + BullMQ | Обработка доставок лидов, обычных оповещений, пересборок сайта и ежедневной PII retention; также слушает пока не используемую import-очередь. |
| `prisma` / `packages/database` | Prisma 7 + PostgreSQL | `prisma/` хранит единственные schema и migrations; `packages/database` только делегирует Prisma CLI-команды. Bootstrap seed принадлежит `apps/api/src/seed.ts`, а единственный client output генерируется в `apps/api/generated`. |
| `deploy` | Caddy + Docker Compose | Образы, reverse proxy, TLS и persistent volumes. |

## Контуры и потоки

Production Compose запускает one-shot `migrate` из API image после PostgreSQL healthcheck. `api` стартует только после успешного `prisma migrate deploy` и готового Redis; его `/health/ready` проверяет обе зависимости, а `/health/live` — только процесс. Seed остается отдельной операторской операцией, поскольку создает или обновляет продуктовые данные и администратора.

Целевой внешний deployment provider — Coolify с Git-based `docker-compose.coolify.yml` из GitHub. Первый rehearsal использует `tv-internet-dom.ru` и `admin.tv-internet-dom.ru` без дополнительного stage-контура; Coolify edge применяет один password middleware к обоим human-facing сервисам. API не получает внешний hostname: внутренние Caddy в web/admin проксируют same-origin `/api/*` в `api:3000`, поэтому Basic Auth не ломает browser fetch. Прямой `docker-compose.prod.yml` с внешним Caddy и портами 80/443 остается только локальной production-like конфигурацией.

В Coolify images собираются без сетевой зависимости от API. После запуска PostgreSQL/Redis и миграций healthy API разрешает явный `bootstrap-seed` (`RUN_BOOTSTRAP_SEED=true` только на первом deploy), затем one-shot `web-publish` выполняет реальный Astro build и post-build SEO gate из защищенного внутреннего build-каталога. Если rebuild связан со `SitePublication`, каталог берется из неизменяемого processing snapshot; любая следующая ручная правка после старта сборки его уже не меняет. Проверенный `dist` копируется в release-каталог persistent volume и атомарно назначается текущей публикацией; web server стартует только после успешного publisher.

Автоматический rebuild поддерживает отдельный Coolify adapter: deploy API сначала возвращает `deployment_uuid`, worker сохраняет его через internal progress endpoint и опрашивает deployment до `finished`/failure с bounded timeout. Очередь раздельно хранит requested/processing/published publication IDs; только финальный `finished` переводит processing snapshot в `SUCCEEDED` и продвигает `Site.publishedRevision`. Финальная ошибка помечает только этот snapshot и сохраняет предыдущий публичный каталог. Legacy synchronous webhook сохранен как отдельный provider mode. Механика #57 подтверждена реальным Coolify polling rehearsal до `finished` на точном deployment commit.

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
  -> GET working preview catalog -> sandboxed personal desktop/tablet/mobile render

Ручное изменение города/страницы/блока/тарифа/редиректа в API
  -> рабочая ревизия + before/after audit в PostgreSQL
  -> публикация сразу или по расписанию ожидаемой ревизии -> неизменяемый SitePublication
  -> минутный maintenance scheduler передает наступивший snapshot в обычную очередь
  -> PostgreSQL SiteRebuild -> Redis/BullMQ -> worker
  -> internal start/progress/result API -> webhook или Coolify start/poll -> финальный результат deployment

PII retention scheduler в worker
  -> worker-only API -> serializable bounded delete в PostgreSQL
  -> cascade history/activity/delivery/tokens + orphan AddressCheck cleanup
```

Публичные формы сначала сохраняют `AddressCheck`, затем показывают поле телефона только при подтвержденной доступности Дом.ру. DaData ищет адрес глобально: IPLocate дает только мягкий КЛАДР-приоритет в HttpOnly-cookie, а город страницы остается source-контекстом, не ограничивая географию подключения. `POST /leads` атомарно сохраняет заявку и outbox, сразу возвращает обычное подтверждение и ставит sales-заявку в `lead-decisions`. Фоновый worker последовательно проверяет снимок причины/комментария, телефон через DaData Phone (`qc=0`), договор Дом.ру по профилю фактического города/региона из встроенного справочника и затем разрешает `lead-deliveries` только при явном `contacts: []`. Действующий абонент, ошибочная/неопределенная проверка телефона или договора и нецелевой coverage доставку блокируют. Минутный reconciler восстанавливает незавершенные решения из PostgreSQL. Browser с высокоэнтропийным `submissionKey` кратко опрашивает отдельный endpoint, чтобы после фонового решения включить некритичную 30-дневную персонализацию для действующего абонента; server-side routing этой browser-отметке не доверяет.

В build-time `apps/web` вызывает `GET /public/sites/:siteSlug/cities` через server-only `SITE_DATA_API_URL` (с совместимым fallback на `PUBLIC_API_URL`). API возвращает `globalPages`, регион каждого города, контент опубликованных городов, тарифы, authoritative `routes` и `sitemap.excludedPaths`. Чистая policy-функция запрещает отсутствие/избыток общих страниц, неверный slug, дубли и коллизии; API требует ровно одну HOME с пустым slug и канонической последовательностью из семи блоков у каждого опубликованного города. Web повторно сверяет route/block contract, проверяет каждое исключение против inventory и строит `/sitemap.xml` как индекс `sitemap-pages.xml`, `sitemap-cities.xml`, `sitemap-tariffs.xml`. Группа определяется типом route, а исключение не удаляет HTML и не меняет robots/canonical. Опубликованные service pages остаются данными без detail URL Release 1. Отдельный `PUBLIC_API_URL` встраивается в `data-*` browser-форм. `redirects.caddy` получает только правила с target из inventory; runtime resolver использует тот же последний успешный publication snapshot перед HTTP 301 и hit tracking. Все HTML paths кроме `/` нормализуются без завершающего слэша. `PUBLIC_SITE_SLUG` по умолчанию `domru-site`; Казань остается городом, а не частью идентичности сайта. Любое изменение данных становится видимым только после успешной пересборки соответствующего снимка.

Телефоны подключения и техподдержки являются глобальными типизированными значениями `Site`. Раздел `/variables` изменяет только рабочую ревизию; publication snapshot фиксирует номера вместе с каталогом, а header, формы и result UI читают опубликованное значение. City телефонных копий больше не хранит. Публикация и initial build без обоих валидных номеров блокируются.

`variable-registry.ts` задает закрытый список системных кодов, тип, один источник, нужный контекст и операторское описание; `catalog-variables.ts` разрешает только редакционные текстовые поля после сборки рабочего каталога и до сохранения `SitePublication`. Глобальные Page получают Site/Provider, городские Page — также City, а Tariff — дополнительно собственный Tariff. Рабочий preview использует тот же путь; публичный каталог и Astro читают уже разрешенный неизменяемый снимок. Неизвестные коды, скобочная ошибка и подстановка в URL/служебные поля блокируют формирование каталога, а известное пустое или отсутствующий контекст дают пустую строку и предупреждение с путем к полю. Защищенный read-only каталог V2 сравнивает рабочие и опубликованные значения в выбранном городе/тарифе. Рабочие usage читаются также из черновых и скрытых строк; опубликованные usage и source evidence сохраняются в новых снимках. Публичный DTO удаляет эти операторские метаданные и исходные шаблоны. Исторический снимок без usage evidence остается явно неизвестным, до новой публикации его не пересчитывают из текущих строк.

## API-модули и их ответственность

SEO-поток: `SeoTemplate` хранит по одному Title/Description/index-state для восьми типов маршрута Release 1. API разрешает шаблоны по конкретным URL при построении рабочего каталога, блокирует пустые/неразрешённые значения и фиксирует `seoByPath` в неизменяемом publication snapshot. Astro читает его для новой публикации; старые JSON Page/Tariff остаются fallback только для исторических снимков. `NOINDEX` автоматически исключает URL из sitemap того же снимка, сохраняя HTML. Ручное sitemap-исключение само по себе не меняет robots.

| Модуль | Реальная ответственность |
| --- | --- |
| `auth` и `AdminTokenGuard` | Создание 12-часовой сессии, browser login/me/logout через HttpOnly cookie и совместимый Bearer для технических клиентов. `x-admin-token` — машинный credential; `/internal/*` принимает только его. |
| `cities`, `regions`, `providers`, `sites`, `pages`, `blocks` | CRUD главных CMS-сущностей; `Page` бывает city-scoped или одним из пяти site-global типов, scope и global slug защищены API и БД. Городская HOME имеет пустой slug, уникальна по `cityId` независимо от статуса и обязана иметь каноническую композицию. Ручные изменения sites/regions/cities/pages/blocks создают рабочие ревизии и audit без автоматической публикации; перенос региона между сайтами запрещен. Изменение общего Provider создает отдельную site revision для каждого его сайта и одну глобальную последовательность entity revision. Создание Provider до появления Site остается конфигурационной записью без public site scope. |
| `sitemap` | Собирает рабочую диагностику routes, раздельные XML-preview и последнее состояние генерации; атомарно заменяет нормализованный набор объясненных исключений с optimistic revision check. Корень, draft/archive и неизвестные маршруты исключать нельзя. Изменение создает рабочую ревизию, а публикация выполняется отдельно. |
| `tariff-import`, `city-import` | Валидация XLSX, сохранение отчета, transactional apply и guarded undo. Оба импорта сохраняют attributed versioned change set и агрегатную рабочую ревизию сайта без автоматической публикации. Удаленный slug-based tariff import одного города больше не обходит versioned full-snapshot contract. Tariff undo восстанавливает бизнес-снимок и временно отсоединенные lead links. City undo сверяет точные снимки городов, созданных регионов/HOME/блоков, более поздние ревизии и runtime-зависимости новых городов, затем удаляет только сохраненные новые записи и восстанавливает прежние города. Обе отмены выполняются только при неизменном затронутом состоянии и создают новую рабочую ревизию `UNDO`; новый город при apply атомарно получает HOME с семью блоками из общего factory. |
| `address-suggestions`, `dadata`, `address-checks`, `coverage` | Серверные глобальные DaData IPLocate/suggest/clean: IP используется один раз для мягкого boost и не сохраняется, жесткого ограничения городом формы нет; официальный Tarifnik `address/check` получает фактический адрес пользователя, словарь провайдеров нормализуется, проверенный snapshot сохраняется без публикации raw response. |
| `leads`, `domru-contract`, `domru-profile-catalog`, `lead-delivery`, `lead-notification-outbox`, `notifications`, `lead-access` | Сохранение лида, дедупликация, выбор регионально однозначного профиля Дом.ру, fail-closed routing, строгая проверка действующего договора и только затем официальный `appeal/create`, retry только временных ошибок, queue failure tracking, email fallback и одноразовый доступ из fallback-письма. Обычное оповещение атомарно получает persistent outbox, startup recovery, bounded retry, idempotency header и отдельный admin retry. Worker повторно проверяет наличие целевого провайдера и persisted `NOT_FOUND`; delivery retry доступен только для recoverable delivery/queue states или старого orphan `PENDING`, но не для ручных/отрицательных routing-исходов. |
| `pii-retention` | Worker-only bounded hard-delete лидов и связанных payloads старше согласованных 180 дней; fail-safe без валидной настройки. |
| `crm-leads` | Список, карточка, смена статуса, повторная постановка доставки и отзыв fallback-доступа. |
| `rebuild-queue` | Persistent rebuild/outbox, дедупликация по сайту, BullMQ producer, start/progress/result API, сохранение provider deployment UUID и фиксация только финального результата deployment. |
| `redirects` | Admin CRUD с архивированием, проверкой конфликтов/петель/цепочек, рабочими ревизиями без автоматической публикации, public resolver HTTP 301 и атомарным `hitCount`/`lastHitAt`. |
| `audit-events` | Read-only журнал одного сайта: bounded cursor-list с фильтрами и легким DTO, отдельная detail-загрузка field-level before/after, actor и site context. |
| `trash` | Bounded read-only агрегация архивных City/Page/Tariff/Redirect/PageBlock одного сайта; восстановление выполняют профильные versioned mutators, а блок использует guarded soft-delete/restore родительской Page. |

## Границы модулей

`apps/api` — единственный слой, который пишет доменные данные. Admin, worker и web не обращаются к PostgreSQL напрямую. `CoverageService`, `DomruContractService`, `LeadDeliveryService` и `NotificationsService` выступают адаптерами внешних интеграций; их URLs и ключи задаются окружением. Префикс `/crm/leads` сохранен только в HTTP-контракте API; отдельного CRM-приложения или домена больше нет.

`LeadDeliveryService`, `LeadNotificationOutboxService` и `RebuildQueueService` создают доменные очереди в API; worker владеет maintenance scheduler и вызывает защищенные внутренние endpoints. Только API пишет в PostgreSQL. Для обычного оповещения worker передает номер попытки и revision, а API отправляет сообщение и сохраняет outcome; для расписания каждую минуту просит API атомарно захватить наступившие snapshots и поставить их в существующий rebuild; для rebuild worker отдельно вызывает deployment provider и возвращает его success/error в API; для retention повторяет bounded batches до полного результата. `tariff-imports` остается listener без producer и не участвует в текущем import-flow.

## Модель публикации

Перед фиксацией нового или повторного снимка API в одной serializable-транзакции сохраняет `SitePublicationValidation`: точный исходный source snapshot, версию приложения, автора, рабочую ревизию, проверенные URL, адресные blocking/warning issues и итог. Блокирующий результат не создает `SitePublication` и не запускает rebuild; прежний public snapshot остается активным. Успешная публикация ссылается на свой отчет через `validationId`. Админка показывает последний отчет и позволяет скачать полный JSON; история доступна в защищенном API. Первый bootstrap проходит ту же проверку. Исторические публикации до миграции `0050` остаются без ссылки на отчет.

1. Сущности `Site`, `City`, `Page`, `Tariff` имеют статус `DRAFT`, `PUBLISHED` или `ARCHIVED`.
2. Public API возвращает опубликованные данные, но отдельно применяет release policy к URL.
3. Astro получает authoritative inventory и выпускает `N + T + 6` indexable HTML для `N` опубликованных городов и `T` опубликованных тарифов этих городов плюс общую 404. Страница тарифа создаётся только из route с `kind = CITY_TARIFF_DETAIL`; service pages остаются вне Release 1.
4. Ручные изменения cities/pages/blocks/tariffs/redirects и full-snapshot импорт тарифов сохраняют рабочую ревизию и before/after audit в одной транзакции; явные publication endpoints проверяют ожидаемый номер и фиксируют неизменяемый полный снимок для немедленного либо отложенного запуска.
5. `SCHEDULED` snapshot хранит точный `scheduledFor`; его можно отменить до запуска. Минутный worker reconciler передает наступившую версию в обычную очередь, а более старую версию не выпускает поверх более новой активной или опубликованной.
6. `SiteRebuild` получает ID именно этого снимка и ставит BullMQ job; изменения одного сайта дедуплицируются, но запрошенный и обрабатываемый snapshots не подменяют друг друга.
7. Worker получает попытку через internal API, вызывает deployment provider и сохраняет результат через API; только явный `{ status: "SUCCEEDED" }` обновляет `publishedRevision`.

Статус rebuild доступен через admin API. Отдельный компактный publication state API возвращает рабочую/опубликованную ревизии, последний snapshot, активное расписание и rebuild; общий UI-блок использует его на ручных экранах тарифов, городов и редиректов и после применения/отмены обоих XLSX-импортов. Он запускает публикацию точной рабочей ревизии сразу либо планирует неизменяемый snapshot на выбранное время и позволяет отменить его до передачи в rebuild. Защищенный preview API в serializable-транзакции строит текущий рабочий catalog без записи snapshot, а admin отрисовывает его локально в sandbox по каждому маршруту inventory. Coolify provider, production rebuild и расписание точного snapshot подтверждены датированными внешними проверками в `current-state.md`; постоянного browser E2E для preview и расписания нет. Guarded undo реализован для новых change set тарифного и городского импортов; корзина объединяет status-архивы и мягко удаленные PageBlock.

## Что не является частью текущей реализации

- Одновременная эксплуатационная публикация нескольких сайтов: route policy поддерживает любое число опубликованных городов одного выбранного сайта, но импорт пока односайтовый. Общие страницы одного сайта включены в датированный live inventory из `current-state.md`.
- SSR и runtime data fetching на публичных SEO-страницах.
- Полная CMS с глубоким наследованием блоков и восстановлением произвольной версии; immutable revisions, личный preview рабочей версии, audit, расписание точного snapshot, общий read-only журнал и корзина уже есть.
- Универсальный undo остальных массовых операций и аналитический контур; для двух XLSX-импортов реализован guarded undo, а для ручного удаления — архив и восстановление в новую рабочую ревизию.
- Сертифицированный production-контур с реальным трафиком: внешний защищенный test deployment и sandbox/test-контракты уже подтверждены, но legal и эксплуатационные блокеры Release 1 остаются.

Детальный статус находится в [current-state.md](current-state.md). Стабилизационный план прототипа сохранен в [плане от 7 сентября](plans/2026-09-07-platform-stabilization-and-mvp.md), целевая модель — в [product-contract.md](product-contract.md), а переход к ней — в [плане от 21 сентября](plans/2026-09-21-target-platform-implementation-plan.md).
