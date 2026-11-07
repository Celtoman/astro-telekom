# Платформа партнёрских сайтов провайдеров

Монорепозиторий партнёрского сайта Дом.ру: статическая витрина, API, административный интерфейс, импорт городов и тарифов, приём и фоновая обработка заявок.

Статус — **прототип с защищённым внешним test-контуром**. Решение о готовности к реальному трафику принимает владелец. Проверенная реализация и ограничения описаны в [current-state.md](docs/current-state.md); доказательства конкретных выпусков — в [индексе исследований](docs/research/README.md).

## Состав репозитория

| Каталог | Назначение |
| --- | --- |
| `apps/web` | Статическая витрина Astro из опубликованного снимка и его точного состава маршрутов |
| `apps/admin` | Astro + React/Tailwind/shadcn/React Aria; каталоги, редакторы, заявки, preview и управление публикацией |
| `apps/api` | NestJS + Fastify; данные, контракты, авторизация, импорты, заявки и публикации |
| `services/worker` | BullMQ: обработка заявок, доставка, оповещения, пересборки и обслуживание |
| `prisma`, `packages/database` | Единственные схема/миграции Prisma и команды работы с ними; клиент генерируется в `apps/api/generated` |
| `data/imports`, `deploy`, `tests`, `docs` | Источники импорта, инфраструктура, проверки и документация |

Работа с PostgreSQL сосредоточена в API. Web, admin и worker используют HTTP API. Контент становится видимым после ручной публикации; выпуск кода и публикация данных — разные операции. Подробности — в [архитектуре](docs/architecture.md) и [контракте публикации](docs/publication.md).

## Локальный запуск

Проверяемый runtime — Node.js **22.23.2**, менеджер пакетов — pnpm **11.19.0**. Нужны Docker с Compose и доступный в `PATH` pnpm. Версии закреплены в manifests, Dockerfile и CI; пояснения — в [технологической базе](docs/technology-baseline.md).

Из корня репозитория создайте локальную конфигурацию, если её ещё нет:

```powershell
Copy-Item .env.example .env
```

Заполните `ADMIN_EMAIL` и `ADMIN_PASSWORD`, замените шаблонные `ADMIN_API_TOKEN` и `SUBSCRIBER_COOKIE_SECRET`. Проверьте `DATABASE_URL`, `REDIS_URL` и локальные origins. Настройки внешних интеграций описаны в [deployment.md](docs/deployment.md); запуск интерфейса сам по себе не подтверждает их доступность.

API, worker и импорт CLI читают переменные процесса. Для PowerShell загрузите корневой `.env` **в каждом терминале**, из которого запускаете команды проекта:

```powershell
$projectEnv = node -e "console.log(JSON.stringify(require('node:util').parseEnv(require('node:fs').readFileSync('.env','utf8'))))" | ConvertFrom-Json
$projectEnv.PSObject.Properties | ForEach-Object {
  [Environment]::SetEnvironmentVariable($_.Name, [string]$_.Value, 'Process')
}
```

Затем подготовьте локальную инфраструктуру и данные:

```powershell
docker compose up -d postgres redis
pnpm install --frozen-lockfile
pnpm db:generate
pnpm --filter @provider/database migrate:deploy
pnpm --filter @provider/database seed
```

Seed требует credentials до записи, создаёт отсутствующие начальные данные и сохраняет существующий контент и пароль администратора. Тарифные примеры остаются без выдуманных цен в DRAFT. Seed не создаёт публикацию или rebuild; действующий внешний контур не следует переинициализировать вместо миграций и штатного импорта.

Запускайте приложения в отдельных терминалах из корня, после загрузки окружения:

| Команда | Адрес или роль |
| --- | --- |
| `pnpm dev:api` | API: `http://localhost:3000/api/v1` |
| `pnpm dev:web` | Витрина: `http://localhost:4321`; script явно включает demo mode |
| `pnpm --filter @provider/admin dev` | Админка: `http://localhost:3001` |
| `pnpm dev:worker` | Фоновые задачи, без отдельного HTTP-порта |

В терминале worker перед запуском задайте полный API prefix; API и worker должны использовать одинаковый `ADMIN_API_TOKEN`:

```powershell
$env:API_URL = 'http://localhost:3000/api/v1'
pnpm dev:worker
```

Полный справочник и тарифы загружаются штатными импортами после запуска API. Источники и правила применения — в [data/imports/README.md](data/imports/README.md). Сохранение импорта меняет рабочую версию, а не уже опубликованный сайт.

## Проверки перед коммитом и push

| Команда | Назначение |
| --- | --- |
| `pnpm check` | Полный gate: lint → Prisma validate → demo build → tests; тот же порядок в CI |
| `pnpm lint` | Общий lint/typecheck; во время работы выбираются профильные workspace-проверки |
| `pnpm db:validate` | Проверка Prisma-схемы |
| `pnpm run build:ci` | Сборка с явным `ALLOW_DEMO_DATA=true` |
| `pnpm test:build` | Пересборка API перед тестами, которые импортируют `apps/api/dist` |
| `git diff --check` | Whitespace-проверка; для документации также проверяются ссылки и фактические утверждения |

Обычный `pnpm build` требует действующего API и корректного production origin. Тихого fallback на demo нет. Точный состав тестов — в [TEST_COVERAGE.md](docs/TEST_COVERAGE.md), выбор проверок и правила commit/push — в [AGENTS.md](AGENTS.md). Исторический зелёный прогон не заменяет проверку изменённого кода.

## Документация

| Нужно узнать | Источник |
| --- | --- |
| Что реализовано и какие ограничения остаются | [Текущее состояние](docs/current-state.md) |
| Границы релиза и порядок работы | [План релизов](docs/release-plan.md) |
| Где ведутся задачи и их статусы | [Task management](docs/task-management.md), [GitHub Issues](https://github.com/Celtoman/astro-telekom/issues) |
| Целевой продукт, решения и URL | [Продуктовый контракт](docs/product-contract.md), [решения](docs/decisions.md), [структура сайта](docs/site-structure.md) |
| Датированная сверка оставшихся страниц | [#348 и список страниц](docs/plans/2026-10-16-missing-pages-analysis-plan.md); задачи по страницам задаёт владелец отдельно |
| Модули, HTTP и данные | [Архитектура](docs/architecture.md), [API](docs/api-contracts.md), [модель данных](docs/data-model.md) |
| Окружение и эксплуатация | [Deployment и процедура Coolify MCP](docs/deployment.md), [публикация](docs/publication.md), [worker](docs/worker.md) |
| Дизайн и Figma | [Admin](docs/admin-design-system.md), [public web](docs/web-design-system.md), [регламент Figma](docs/figma-design-rules.md), [паспорта](docs/block-passports.md) |
| Проверки, находки и исторические доказательства | [Покрытие тестами](docs/TEST_COVERAGE.md), [product findings](docs/product-findings.md), [индекс долга](docs/technical-debt.md), [исследования](docs/research/README.md) |

## Безопасность и данные

Секретные значения и реальные данные заявок не добавляются в Git. `.env.example` содержит шаблон конфигурации, `.env` — локальные значения, внешний контур получает окружение из Coolify. Правила доступа, readiness и подготовки внешнего контура приведены в [deployment.md](docs/deployment.md).

## Версионирование

Единая версия ведётся в корневом `package.json`. `pnpm release:dry-run` показывает предполагаемые изменения; `pnpm release` вручную создаёт version/changelog commit и тег в `master`. Push, выпуск кода и допуск трафика выполняются по правилам [AGENTS.md](AGENTS.md) и [плана релизов](docs/release-plan.md).
