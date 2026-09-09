# Платформа партнерских сайтов провайдеров

Монорепозиторий локального прототипа платформы для партнерских сайтов интернет-провайдеров. В коде реализован первый вертикальный срез для Дом.ру и Казани: статическая публичная витрина, API, PostgreSQL-модель, импорт городов и тарифов, одношаговые HTTP 301, прием заявок, журнал заявок и фоновые задачи.

Текущий статус на 9 сентября 2026 года: **локальный прототип, не готовый к production**. Это не готовая мультигородская CMS и не развернутый сайт. Точная граница между работающими возможностями, демонстрационными интерфейсами и планом находится в [состоянии проекта](docs/current-state.md).

## Документация

- [Текущее состояние и границы](docs/current-state.md) — что доказано кодом, что зависит от окружения и что еще не реализовано.
- [Архитектура](docs/architecture.md) — приложения, потоки данных и границы модулей.
- [Технологическая база](docs/technology-baseline.md) — версии, инфраструктура и правила сборки.
- [API-контракты](docs/api-contracts.md) — реализованные HTTP-маршруты и их ограничения.
- [Модель данных](docs/data-model.md) — Prisma-схема и отличие модели от продуктового замысла.
- [Развертывание](docs/deployment.md) — локальный и production-контуры, обязательные переменные и проверки.
- [Фоновые задачи](docs/worker.md) — реальные очереди, их производители и обработчики.
- [Технический долг](docs/technical-debt.md) — подтвержденные проблемы, риски и порядок устранения.
- [План реализации](docs/plans/2026-09-07-platform-stabilization-and-mvp.md) — последовательность стабилизации и развития.
- [Реестр решений](docs/decisions.md) — согласованный продуктовый замысел; не подтверждает наличие функции в коде.
- [Исследование примеров](docs/research/README.md) — исторические наблюдения для проектирования структуры сайта.

## Состав репозитория

```text
apps/web        Статический Astro-сайт из опубликованных городов; сейчас опубликована только Казань
apps/admin      Static Astro + React/Tailwind/shadcn: login-shell, тарифы, города, заявки, редиректы и fallback-доступ
apps/api        NestJS + Fastify API и бизнес-правила
services/worker BullMQ workers для импорта, пересборки, доставки заявок и PII retention
packages/database Prisma package и сгенерированный клиент
prisma/         Схема, миграции и seed
data/imports/    Канонические исходные файлы для штатного импорта
deploy/         Конфигурация Caddy
docs/           Документация и план развития
tests/          Локальные модульные и контрактные проверки
```

## Локальный запуск

Нужны Node.js 22+, Corepack, Docker Engine с Compose и pnpm 11.19.0.

```powershell
Copy-Item .env.example .env
docker compose up -d postgres redis
pnpm install --frozen-lockfile
pnpm db:generate
pnpm --filter @provider/database migrate:deploy
pnpm --filter @provider/database seed
```

Затем запускайте приложения в отдельных терминалах:

```powershell
pnpm dev:api
pnpm dev:web
pnpm --filter @provider/admin dev
pnpm dev:worker
```

Seed создаст опубликованные `domru-kazan` и `kazan`, шесть базовых страниц и два демонстрационных тарифа без цен. Для входа в API seed требует непустые `ADMIN_EMAIL` и `ADMIN_PASSWORD` в `.env`.

После запуска API полный справочник из 207 городов можно сначала проверить, а затем применить через административный HTTP API:

```powershell
pnpm cities:import
pnpm cities:import -- --apply
```

Команда использует [data/imports/cities.xlsx](data/imports/cities.xlsx), оставляет опубликованной только Казань, а остальные города и их страницы — черновиками. Нужен тот же `ADMIN_API_TOKEN`, с которым запущен API; подробности — в [описании источника](data/imports/README.md).

## Проверка рабочего дерева

```powershell
pnpm check
```

Один скрипт, который делает `lint` → `db:validate` → `ALLOW_DEMO_DATA=true build` → `test` в этом порядке — тот же, что использует CI (`.github/workflows/ci.yml` на каждый push/PR в `master`). По отдельности:

```powershell
pnpm lint
pnpm db:validate
$env:ALLOW_DEMO_DATA = "true"; pnpm build
pnpm test
```

`apps/web` получает build-time каталог опубликованных городов, страниц, тарифов и редиректов из API через server-only `SITE_DATA_API_URL`; при его отсутствии для обратной совместимости используется `PUBLIC_API_URL`, который отдельно встраивается в browser-формы. Для контента web создаёт static paths, а для опубликованных редиректов — проверенный фрагмент Caddy, который проксирует старый путь в API и возвращает HTTP 301 с учетом перехода. В текущей базе опубликована только Казань, поэтому остальные 206 городов не попадают ни в output, ни в sitemap. Production build требует `PUBLIC_SITE_URL` в виде чистого HTTPS origin, а `PUBLIC_API_URL` — в виде внешнего HTTPS base URL с точным path `/api/v1`; пустые, HTTP, credentialed, query/hash и loopback-значения блокируют сборку. После `astro build` обязательный pre-publication SEO gate сверяет sitemap с готовыми `*/index.html`, отклоняет неизвестные плоские HTML-файлы, проверяет canonical, title, description, H1, robots без глобального запрета индексации, loopback-утечки и неиндексируемую 404. Если API недоступен, публичные URL конфликтуют или редирект образует цепочку, сборка также осознанно падает. `ALLOW_DEMO_DATA=true` явно разрешает демонстрационные данные и loopback URL только для разработки и локальной проверки без поднятого API.

Прямой `docker-compose.prod.yml` принимает `SITE_DATA_API_URL` отдельно от browser API и требует уже доступный источник каталога на стадии image build. Для целевого Coolify-контура это ограничение снято отдельным `docker-compose.coolify.yml`: images собираются без обращения к каталогу, затем runtime-цепочка `migrate → api → bootstrap-seed → web-publish → web` создает проверенную static-публикацию из внутреннего API. API использует отдельные кешируемые dependency stages: облегченный production runtime и migration image с Prisma CLI; migration target переиспользует уже установленный build dependency tree, а `api` и `bootstrap-seed` разделяют один runtime image без повторного build target. Все Docker install stages используют общий BuildKit pnpm-store cache, повторяют transiently failed install с уже заполненным store и доверяют frozen lockfile только внутри production image build; обычный CI install продолжает независимо проверять supply-chain policy. Publisher устанавливает только зависимости `apps/web`, admin — только `apps/admin`, worker — только свои production-зависимости, поэтому повторный export не переносит весь monorepo `node_modules`. Завершенные one-shot services явно исключены из Coolify health-оценки, а API, worker, web и admin имеют собственные healthchecks. Live-проверка стабильности и времени deployment отслеживается в #62, #63 и #65.

Целевой внешний test-контур развертывается из GitHub через Coolify на `tv-internet-dom.ru`, без дополнительного `stage`-контура. `web` (`tv-internet-dom.ru`) и `admin` (`admin.tv-internet-dom.ru`) публикуются через Coolify proxy с одним Basic Auth middleware; API остается внутренним и доступен браузеру через same-origin `/api/*`. Для Compose bcrypt verifier хранится в Coolify как `Literal`, доступный на Buildtime и Runtime, а `Escape special characters in labels` выключен: иначе `$` экранируется до `$${...}` либо переменная отсутствует во время `docker compose build`. Админка намеренно вынесена на поддомен: скрытый путь на основном домене не дает SEO- или security-преимущества, а admin Caddy дополнительно выставляет `X-Robots-Tag: noindex, nofollow, noarchive`.

Для автоматических пересборок worker поддерживает два явных provider-режима. Legacy `webhook` по-прежнему требует синхронный финальный `SUCCEEDED`; целевой `coolify` запускает resource через API, сохраняет `deployment_uuid` в `SiteRebuild`, ограниченно опрашивает статус и публикует ревизию только после `finished`. `queued`/`in_progress`, timeout и повтор worker не создают ложный success; незавершенный deployment возобновляется по сохраненному UUID. Реализация #57 проверена локально, но остается открытой до rehearsal с реальным Coolify token/resource.

В production Compose отдельный one-shot сервис `migrate` применяет Prisma migrations после готовности PostgreSQL и до старта API. `/api/v1/health/live` проверяет процесс, а `/api/v1/health/ready` и совместимый `/api/v1/health` требуют доступных PostgreSQL и Redis. В Coolify worker отдельно проверяет Redis, а web/admin — ответ своего локального Caddy. Seed остается явным одноразовым шагом: его нельзя безопасно выполнять при каждом деплое.

Защищенный `GET /api/v1/admin/readiness` показывает, какие coverage/contract/Tarifnik/email/rebuild integrations и PII retention policy сконфигурированы, и остается `blocked`, пока обязательные переменные пусты. Endpoint никогда не возвращает их значения и не заменяет проверку реальных договоров, legal decision или sandbox-вызовы.

Публичные write-routes и login проходят строгую DTO-валидацию; лишние поля и заполненный скрытый honeypot отклоняются. Redis-backed rate limiting разделяет login, публичные формы и остальные маршруты; в production Compose доверие proxy headers включено только у API за Caddy. Worker ежедневно запускает bounded hard-delete просроченных лидов и связанных payloads через worker-only API, но только при явно заданном валидном `PII_RETENTION_DAYS`. Сам срок код не выбирает: legal decision остается блокером production.

На дату документации release gate зеленый: `pnpm test` выполняет 134 теста без падений. Актуальный состав сценариев, включая API input security, PII retention, infrastructure/release readiness, migration dependency, Docker dependency-layer caching, filtered runtime images и Compose health policy, Node 24 runtime GitHub Actions, экраны тарифов, городов, заявок и редиректов в админке, browser CORS, отсутствие выведенного из эксплуатации CRM-workspace, канонический справочник, full-snapshot импорт, одношаговые 301, Coolify polling/retry, production origin и pre-publication SEO gate public web, перечислен в [docs/TEST_COVERAGE.md](docs/TEST_COVERAGE.md).

## Версионирование

Единая версия на весь монорепозиторий, автоматизирована через [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) на основе Conventional Commits. Релиз запускается вручную командой `pnpm release` (`pnpm release:dry-run` — предпросмотр без изменений) прямо в `master`, без веток и PR; тег и GitHub Release создаются после `git push --follow-tags`. Подробности — [CLAUDE.md](CLAUDE.md), раздел «Версионирование и релизы».

## Безопасность и данные

Не добавляйте `.env`, токены внешних API, пароли или реальные данные заявок в Git. В новом окружении интеграции покрытия, проверки договора, Tarifnik и email отключены, пока для них не заданы обязательные переменные. При таком состоянии заявки сохраняются в ручной проверке и не должны считаться переданными в кол-центр.
