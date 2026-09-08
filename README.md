# Платформа партнерских сайтов провайдеров

Монорепозиторий локального прототипа платформы для партнерских сайтов интернет-провайдеров. В коде реализован первый вертикальный срез для Дом.ру и Казани: статическая публичная витрина, API, PostgreSQL-модель, импорт городов и тарифов, прием заявок, журнал заявок и фоновые доставочные задачи.

Текущий статус на 7 сентября 2026 года: **локальный прототип, не готовый к production**. Это не готовая мультигородская CMS и не развернутый сайт. Точная граница между работающими возможностями, демонстрационными интерфейсами и планом находится в [состоянии проекта](docs/current-state.md).

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
apps/web        Статический Astro-сайт, сейчас маршруты Казани
apps/admin      Static Astro + React/Tailwind/shadcn: fallback-доступ реализован, legacy index частично demo
apps/crm        Статический Astro-журнал заявок с подключением к API
apps/api        NestJS + Fastify API и бизнес-правила
services/worker BullMQ workers для импорта, пересборки и доставки заявок
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
pnpm --filter @provider/crm dev
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

`apps/web` собирает публичные страницы Казани из данных, полученных от API во время `astro build`. Если API недоступен, сборка осознанно падает с ненулевым кодом и указанием причины — это защита от публикации недостоверного контента (см. [технический долг](docs/technical-debt.md), TD-03). `ALLOW_DEMO_DATA=true` явно разрешает демонстрационные данные для локальной сборки без поднятого API.

На дату документации release gate зеленый: `pnpm test` выполняет 69 тестов без падений. Отдельно проверяются канонический справочник из 207 городов, сопоставление регионов seed/import, full-snapshot импорт тарифов, дедупликация, одноразовый fallback-доступ и реальные сборки public web: API-данные, блокировка без API, явный demo-mode и готовый HTML/canonical/robots/sitemap.

## Версионирование

Единая версия на весь монорепозиторий, автоматизирована через [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) на основе Conventional Commits. Релиз запускается вручную командой `pnpm release` (`pnpm release:dry-run` — предпросмотр без изменений) прямо в `master`, без веток и PR; тег и GitHub Release создаются после `git push --follow-tags`. Подробности — [CLAUDE.md](CLAUDE.md), раздел «Версионирование и релизы».

## Безопасность и данные

Не добавляйте `.env`, токены внешних API, пароли или реальные данные заявок в Git. В новом окружении интеграции покрытия, проверки договора, Tarifnik и email отключены, пока для них не заданы обязательные переменные. При таком состоянии заявки сохраняются в ручной проверке и не должны считаться переданными в кол-центр.
