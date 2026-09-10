# Текущее состояние проекта

Дата среза: 10 сентября 2026 года. Источник этого документа — исходный код, Prisma-схема, Docker-конфигурация и результаты локальных проверок на текущей ветке `master`. Он описывает фактическое состояние, а не только согласованный продуктовый замысел из [реестра решений](decisions.md).

## Краткий вывод

Репозиторий содержит работоспособный локальный каркас платформы, но не production-систему. Полностью реализованы базовая инфраструктура, схема данных, API основных сущностей, двухэтапный импорт городов и тарифов, прием заявок и механика их доставки. Публичный сайт умеет строить опубликованные города из API, но при текущих статусах фактически выводит только Казань; админка работает с реальными тарифами, городами и заявками. Отдельный CRM-frontend удален после переноса его функций в `/leads`.

## Статус по направлениям

| Направление | Статус | Что есть сейчас | Граница или условие |
| --- | --- | --- | --- |
| Monorepo и локальная инфраструктура | Реализовано | pnpm workspace, Docker Compose, PostgreSQL 18, Redis 8; отдельный Git-based Coolify Compose без захвата host 80/443, с runtime web publisher, runtime-only Coolify API token и Basic Auth middleware; one-shot services исключены из health, долгоживущие сервисы имеют проверки; Docker dependency stages используют workspace filters, общий BuildKit pnpm-store cache, bounded network retry и production-only trusted frozen lockfile; publication symlink заменяется без следования ссылке на каталог | Production-подобный локальный Compose подтвердил migrations, seed, публикацию, healthy API/worker/web/admin/PostgreSQL/Redis и нулевые рестарты; cold/warm сборки заняли 343,15/81,85 с. Два последовательных live deployment коммита `1eeb609` завершились за 146/85 с; после второго ресурс остался `running:healthy`, а 30/30 контрольных запросов к web/API/admin вернули 200. |
| Данные и миграции | Реализовано | Prisma-схема, 12 миграций, production Compose one-shot `migrate` до старта API, проверенный идемпотентный seed; локально загружены 207 городов и канонический snapshot из 3 859 тарифов | Seed остается явной одноразовой операторской операцией; нет истории изменений тарифа, корзины, версий контента и журнала действий. |
| API и доступ | Частично реализовано | NestJS/Fastify, DB/Redis-aware readiness, process-only liveness и защищенный configuration gate внешних интеграций, строгая глобальная DTO-валидация для login и публичных write-routes, Redis-backed rate limit, 12-часовая HttpOnly-cookie сессия для browser login/me/logout, совместимый Bearer, единый уровень доступа администратора; `/internal/*` изолирован сервисным `x-admin-token` | Admin CRUD еще частично валидирует тела вручную; нет session renewal и аудита действий; configuration gate не доказывает внешний SLA/договор. |
| Города и страницы | Частично реализовано | CRUD API, admin `/cities` со списком 207 городов, поиском, XLSX-preview/apply, историей и rebuild status; warnings требуют подтверждения, новый город и шесть его страниц создаются в `DRAFT` | В опубликованном состоянии остается только Казань; нет публикационного workflow, расписания, шаблонов и массовых операций. Импорт пока разрешен только для односайтовой конфигурации. |
| Тарифы | Частично реализовано | CRUD, XLSX preview и атомарный full-snapshot apply, удаление отсутствующих строк, подтверждение warnings, проверка уникальности URL, сохранение полного описания и TV-счетчиков, ключ идентичности, SEO JSON и redirect при ручной смене URL с выпрямлением прежней цепочки | Нет истории/rollback и редактора полной модели. |
| Публичная витрина | Частично реализовано | Astro static paths из опубликованных `City`/`Page`/`Tariff`, динамическая городская навигация, FAQ, одна комбинированная форма адреса/телефона со скрытым honeypot, карточки тарифов, robots и sitemap; server-only `SITE_DATA_API_URL` отделяет источник build-time каталога от browser `PUBLIC_API_URL`; оба публичных URL проходят production-policy; root перечисляет опубликованные города; build-generated Caddy routes отдают одношаговые HTTP 301 через public API resolver с hit tracking; post-build gate проверяет фактический SEO output | Нет согласованных отдельных типов «обычная заявка» и «видимая проверка подключения», двухэтапного раскрытия телефона, подсказок DaData и корректных исходов с альтернативами/телефоном поддержки. В текущей БД опубликована только Казань; HTML и redirect matchers читаются только во время сборки. |
| Проверка адреса | Частично реализовано | API сохраняет проверку и различает AVAILABLE, UNAVAILABLE, AMBIGUOUS, MANUAL_CHECK, ERROR; живые DaData `suggest/clean` и Tarifnik `address/check` подтверждены безопасными probes 10 сентября 2026 года | Адаптер все еще ожидает обобщенные `available`/`coverage` вместо реального словаря провайдеров Tarifnik, а интеграция DaData в приложениях отсутствует. |
| Заявки | Частично реализовано | Сохранение контекста, дубликаты, проверка договора, отбраковка подтвержденного действующего абонента и явных ошибок API, попытки доставки в CRM Tarifnik, admin `/leads` со списком, поиском, фильтром, карточкой и сменой статуса, серверно проверяемая одноразовая fallback-ссылка; worker-only bounded hard-delete по `PII_RETENTION_DAYS` удаляет просроченный лид со всеми зависимыми payloads и осиротевшие проверки адреса; живой `appeal/create` с `utm_campaign=test` подтвержден 10 сентября 2026 года | `addressCheckId` необязателен и позволяет пропустить обязательную проверку провайдеров; успешный JSON без массива `contacts` ошибочно трактуется как «абонент не найден» вместо ручной проверки. Текущий payload delivery не соответствует официальному DTO Tarifnik, контракт Дом.ру не подтвержден, нет отдельных типов форм, legal retention period не утвержден, серверной пагинации журнала нет. |
| Фоновые задачи | Частично реализовано | API ставит `lead-deliveries` и persistent `site-rebuilds`; worker регистрирует ежедневный `maintenance` scheduler для PII purge при валидной policy; rebuild имеет дедупликацию по сайту, 3 попытки, backoff и статусы в PostgreSQL; Coolify adapter сохраняет deployment UUID, опрашивает финал и возобновляет незавершенный deployment после retry | У `tariff-imports` нет producer; Coolify adapter еще не проверен с реальным resource/token — [#57](https://github.com/Celtoman/astro-telekom/issues/57). |
| Админка | Частично реализовано | React/Tailwind/shadcn; отдельный login, общий cookie-aware API client, проверка сессии перед shell, logout, `/lead-access/`, рабочие `/tariffs`, `/cities`, `/leads` и `/redirects`. Экран редиректов создает, редактирует, архивирует/восстанавливает правила и показывает hit count/last hit. Недостоверный legacy dashboard и browser service-token удалены; browser CORS поддерживает все используемые mutation methods | Tariff list пока ограничивает отрисовку первыми 100 совпадениями, а leads list загружает весь набор без серверной пагинации. Управление публикацией городов не реализовано; предложения редиректов из 404 еще отсутствуют. |
| SEO и аналитика | Частично реализовано | HTML-first генерация, title/description/canonical/JSON-LD, robots, sitemap из всех опубликованных городов/страниц/тарифов с корневым URL; production build требует чистый HTTPS `PUBLIC_SITE_URL` и внешний HTTPS `PUBLIC_API_URL` с path `/api/v1`; обязательный post-build gate сверяет sitemap, robots, raw HTML и `noindex` 404; события Метрики | Нет Schema.org-профиля сущностей, управления sitemap из админки и реальной аналитики. |
| Тестирование | Частично реализовано | `pnpm lint`, `pnpm db:validate`, `pnpm build`, `pnpm test`; 134/134 node tests проходят; admin входит в Astro check; API input security, PII retention, infrastructure/release readiness, migration dependency, Docker dependency-layer caching и filtered runtime images, Coolify polling/retry, Node 24 runtime GitHub Actions, public catalog/multi-city/redirect/SEO build-policy, безопасный XLSX-парсер, полный справочник городов и отсутствие выведенного из эксплуатации CRM-workspace проверяются артефактами | Нет постоянного browser/E2E-покрытия. |

## Реализованный путь данных

```text
Администратор или XLSX
  -> NestJS API -> PostgreSQL через Prisma
  -> persistent SiteRebuild -> Redis/BullMQ -> worker
  -> internal start/result API + deployment provider

Публичная Astro-сборка
  -> GET /public/sites/{PUBLIC_SITE_SLUG}/cities во время build
  -> статический HTML для опубликованных City/Page/Tariff

Посетитель
  -> POST /address-checks -> AddressCheck
  -> POST /leads -> Lead -> очередь lead-deliveries -> Tarifnik или email fallback
```

Это фактический текущий путь, а не полностью реализованный продуктовый сценарий. Согласованная граница требует для обычной формы обязательной проверки провайдеров; наличие хотя бы одного провайдера запускает проверку действующего абонента независимо от наличия Дом.ру. Очередь доставки разрешается только при найденном Дом.ру и подтвержденном `NOT_FOUND`. Видимая проверка подключения должна создавать лид с телефоном лишь после обнаружения Дом.ру и отдельного второго шага формы.

Главное следствие статической архитектуры: изменение данных в PostgreSQL не меняет уже опубликованный HTML само по себе. API сохраняет rebuild-job до ответа CRUD, worker выполняет его с retry, а статус `SUCCEEDED` появляется только после явного финального ответа deployment provider. Для Coolify реализована цепочка `start → сохранить deployment_uuid → bounded polling → final status`; `queued`/`in_progress` и timeout не публикуют ревизию, а retry продолжает сохраненный deployment. До live rehearsal [#57](https://github.com/Celtoman/astro-telekom/issues/57) остается открытой.

## Реализованные публичные маршруты

Публичный фронтенд генерирует маршруты из опубликованного каталога:

- `/`;
- `/{city-slug}/` для опубликованного города;
- `/{city-slug}/{page-slug}/` для опубликованной не-HOME страницы;
- `/{city-slug}/{tariff-slug}/` для опубликованного тарифа;
- `/robots.txt` и `/sitemap.xml`.

`loadSiteData()` обращается к public catalog API в build-time с таймаутом 5 секунд, отбрасывает draft/archive и проверяет slug/коллизии URL до генерации. Если API недоступен, сборка по умолчанию падает с ненулевым кодом и явной причиной. До prerender production build требует `PUBLIC_SITE_URL` как чистый HTTPS origin и `PUBLIC_API_URL` как внешний HTTPS URL с path `/api/v1`; нормализованное значение browser API встраивается в форму. После prerender verifier сравнивает весь indexable `*/index.html` с sitemap, отклоняет неизвестные плоские HTML-файлы и проверяет canonical, title, description, единственный H1, robots без глобального `Disallow`, отсутствие loopback-ссылок и `noindex` без canonical у 404. Демо-Казань и loopback URL возвращаются только при явном `ALLOW_DEMO_DATA=true` — это осознанный локальный UX-режим, а не fallback для production-публикации.

Прямой Production Compose принимает отдельный `SITE_DATA_API_URL`, но не оркестрирует первый bootstrap: API нужен уже на стадии Docker build, раньше runtime `depends_on`. Целевой `docker-compose.coolify.yml` устраняет цикл: API и явный initial seed выполняются до runtime Astro publisher, а web стартует только после успешной публикации. Локальная production-подобная проверка полного stack подтвердила ту же последовательность, успешные one-shot контейнеры и устойчивые healthchecks с нулевым restart count. На live Coolify v4.3.18 два последовательных deployment одного commit завершились штатно; второй занял 85 секунд, использовал 54 кешированных шага и не содержал install retry, network timeout или build error. После контрольной выдержки resource сохранил `running:healthy`.

Внешний test deployment работает в Coolify из GitHub на `tv-internet-dom.ru` и `admin.tv-internet-dom.ru` без дополнительного stage-контура. Схема не публикует API напрямую: оба сайта проксируют `/api/*` same-origin, а Compose Basic Auth закрывает все их маршруты. Финальный live smoke подтвердил `401` без credentials, `200` с ними на web/admin и API health routes, защитный `X-Robots-Tag` и `302` с `www` на основной host.

## Зависимости от окружения

| Переменные | Поведение без них |
| --- | --- |
| `DOMRU_COVERAGE_API_URL`, `DOMRU_COVERAGE_API_KEY` | Проверка адреса сохраняется как `MANUAL_CHECK`. |
| `DOMRU_CONTRACT_API_URL` | Новая заявка получает `MANUAL_CHECK_API`; доставка в Tarifnik не запускается. |
| `TARIFNIK_API_KEY` | Pending-заявка остается не переданной; попытка логируется только в server log. |
| `LEADS_EMAIL` и `RESEND_API_KEY` либо `LEADS_EMAIL_WEBHOOK_URL` | Обычное уведомление может тихо не уйти; email fallback завершится ошибкой. |
| Полная конфигурация выбранного `REBUILD_PROVIDER` | Rebuild-job повторяется и завершается `FAILED`; опубликованная ревизия не изменяется. Для `webhook` нужен `REBUILD_WEBHOOK_URL`, для `coolify` — API URL/token/resource UUID. |
| `REDIS_URL` | Rebuild сохраняется как `PENDING`, но не выполняется до следующего запуска API с Redis. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Seed не создаст пользователя для входа. |

## Результаты проверок

На этом срезе выполнены:

| Команда | Результат |
| --- | --- |
| `pnpm lint` | Успешно: TypeScript API, Astro web/admin и syntax check worker. |
| `pnpm db:validate` | Успешно: Prisma schema валидна. |
| `pnpm build` | Успешно с `ALLOW_DEMO_DATA=true` для локального demo или с API и корректным HTTPS `PUBLIC_SITE_URL` для production: API, web, admin и worker собираются; web post-build SEO gate проходит. Без явного demo-флага локальный/пустой origin и недоступный API блокируют сборку. |
| `pnpm test` | 134/134 успешно, включая строгие public DTO, rate-limit policy, honeypot, policy-driven PII purge и production proxy boundary, infrastructure/release readiness и migration dependency Compose, Docker dependency-layer caching и filtered runtime images, Coolify UUID/polling/retry/timeout, Node 24 runtime GitHub Actions, cookie-auth и browser CORS admin, экраны тарифов, городов, заявок и редиректов, отсутствие CRM-workspace, public catalog и multi-city paths, worker-only boundary, безопасный XLSX-парсер с лимитом размера и канонический файл на 207 городов, атомарный full-snapshot импорт тарифов, redirect CRUD/conflicts/one-hop runtime/hit tracking, rebuild flow, одноразовый fallback-доступ, production origin и обязательный SEO verifier реальной Astro-сборки. |
| Заполненный PostgreSQL 18 | `migrate:deploy` применил 12 миграций; seed идемпотентен; city import создал 206 и обновил 1 город, создал 1236 страниц. Tariff import `cmtt6xtjt00000steq81olqx4` применил 3 859/3 859 строк, удалил 2 demo-тарифа и сохранил 3 345 описаний и 2 396 пар TV-счетчиков. Итог: 207 городов и 3 859 тарифов; у Казани 22 тарифа, опубликована только Казань, публичный Алейск возвращает 404. |
| GitHub Actions CI | `.github/workflows/ci.yml` запускает `pnpm check` на каждый push и pull request в `master`; допустимого красного baseline нет. |
| Readiness API | Собранный API против локальных PostgreSQL/Redis: `/health`, `/health/live`, `/health/ready` вернули HTTP 200; dependency checks — `up`. |
| Release configuration | `/admin/readiness`: без credentials HTTP 401; с сервисным токеном текущий локальный контур возвращает `blocked` и только имена отсутствующих integrations/policy, включая `PII_RETENTION_DAYS`. |
| PII retention runtime | На отдельной временной БД с 12 миграциями worker-only endpoint без token вернул 401; с policy удалил старый лид, каскадные delivery/activity/history, осиротевший AddressCheck и истекший token, сохранив и отвязав свежий duplicate. В отдельной пустой Redis DB BullMQ зарегистрировал `pii-retention-daily` с UTC cron; временные DB после проверки удалены. |
| Migration container | Production API image собран с `--frozen-lockfile`; one-shot `migrate` успешно выполнил `prisma migrate deploy` из контейнера против PostgreSQL и подтвердил 12/12 примененных миграций. |
| `docker compose -f docker-compose.prod.yml config --no-interpolate` | YAML читается; `migrate -> api -> worker` dependency chain и `/health/ready` присутствуют. Это не полный production rehearsal. |

Все подтвержденные проблемы, их влияние и рекомендуемый порядок исправления перечислены в [техническом долге](technical-debt.md). Последовательность исполнения — в [плане реализации](plans/2026-09-07-platform-stabilization-and-mvp.md).
