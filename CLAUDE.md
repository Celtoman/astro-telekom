# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Платформа партнерских сайтов провайдеров — монорепозиторий локального прототипа (Дом.ру / Казань): статическая витрина, API, PostgreSQL-модель, импорт городов и тарифов, прием заявок. Текущий статус — **локальный прототип, не готовый к production**, см. [docs/current-state.md](docs/current-state.md).

---

## Команды разработки

```bash
# Инфраструктура и первый запуск
docker compose up -d postgres redis
pnpm install --frozen-lockfile
pnpm db:generate                          # Prisma client -> apps/api/generated
pnpm --filter @provider/database migrate:deploy
pnpm --filter @provider/database seed     # требует непустые ADMIN_EMAIL/ADMIN_PASSWORD в .env

# Разработка (в отдельных терминалах)
pnpm dev:api                              # NestJS API — http://localhost:3000
pnpm dev:web                              # Astro web — http://localhost:4321
pnpm --filter @provider/admin dev         # http://localhost:3001
pnpm dev:worker                           # BullMQ worker

# Проверка перед коммитом — один gate-скрипт
pnpm check                                # lint -> db:validate -> ALLOW_DEMO_DATA=true build -> test, тот же порядок, что в CI
# по отдельности:
pnpm lint                                 # tsc --noEmit (api), astro check (web/admin), node --check (worker)
pnpm db:validate
ALLOW_DEMO_DATA=true pnpm build           # без API apps/web build падает намеренно — см. «Известные особенности» ниже
pnpm test                                 # node --test tests/*.test.cjs tests/*.test.mjs
pnpm test:build                           # пересобрать apps/api, затем pnpm test — после правок в apps/api/src
```

`apps/crm` удален после переноса заявок в `/leads`; `admin` входит в общий Astro check.

**Baseline тестов: 165/165.** `pnpm check` и `pnpm test` должны завершаться без падений; известного допустимого красного baseline больше нет. Отдельные suites проверяют глобальные DaData suggest/clean и межгородскую проверку адреса с source-контекстом страницы, официальный Tarifnik address/delivery contract, полный регионально однозначный справочник профилей Дом.ру, безопасную retry-политику, строгие public DTO/rate limit/honeypot, policy-driven PII purge, cookie-сессию и CORS admin, infrastructure/release readiness и migration dependency Compose, Docker dependency-layer caching, filtered runtime images и Compose health policy, Node 24 runtime GitHub Actions, экраны тарифов, городов, заявок и редиректов, отсутствие выведенного из эксплуатации CRM-workspace, границу worker-only routes, безопасный XLSX-парсер и канонический справочник 207 городов, public catalog и multi-city static routes, production origin и post-build SEO gate, full-snapshot импорт тарифов, одношаговый runtime 301 и hit tracking, slug redirects/conflicts, одноразовый fallback-доступ, persistent rebuild-flow/worker, Coolify polling/retry и реальные Astro build-policy/final HTML. CI (`.github/workflows/ci.yml`) запускает `pnpm check` на каждый push/PR в `master`.

## Архитектура

Монорепозиторий pnpm (`pnpm-workspace.yaml`): `apps/web` / `apps/admin` — Astro 7, static output; `apps/api` — NestJS 12 + Fastify 5; `services/worker` — Node.js + BullMQ; `prisma/` + `packages/database` — Prisma 7 + PostgreSQL 18; `deploy/` — Caddy + Docker Compose.

Только `apps/api` пишет в PostgreSQL — admin, web и worker обращаются к данным исключительно через HTTP API. Production Compose применяет Prisma migrations отдельным one-shot сервисом до старта API; readiness API требует доступных PostgreSQL и Redis. `apps/web` собирается в **static output**: каталог опубликованных городов, страниц, тарифов и редиректов читается из API во время `astro build`; контентные URL становятся static paths, а редиректы — Caddy routes к runtime API resolver с HTTP 301 и hit tracking. Сейчас опубликована только Казань. Рантайм-изменения в БД не видны опубликованному сайту без внешней пересборки. `site-rebuilds` хранится в PostgreSQL, выполняется worker с retry и считается завершенной только после финального ответа deployment provider.

Полная карта модулей — [docs/architecture.md](docs/architecture.md). Точный статус по каждому направлению (реализовано / частично / demo) — [docs/current-state.md](docs/current-state.md). Переменные окружения по назначению и обязательная подготовка к деплою — [docs/deployment.md](docs/deployment.md).

## Версионирование и релизы

Единая версия на весь монорепозиторий (не по пакетам) — `package.json`, поле `version`. Автоматизировано через [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) на основе Conventional Commits (`feat:`/`fix:`/`docs:`/`chore:` и т.д. — вся история коммитов уже в этом формате, не отступать от него).

- **Релиз запускается вручную**, когда решили зафиксировать версию: `pnpm release` (bump версии в `package.json`, обновление `CHANGELOG.md`, commit и git tag `vX.Y.Z` — всё прямо в `master`, без промежуточной ветки или PR), затем `git push --follow-tags`. Перед этим можно проверить, что будет сделано, без изменения файлов: `pnpm release:dry-run`.
- **Не автоматически на каждый push** — соответствует общему правилу проекта не выполнять значимые действия без явного подтверждения; здесь подтверждение — это осознанный запуск `pnpm release`, а не merge PR.
- **Изначально стоял `release-please`** (PR-based) — заменён в тот же день (8 сентября 2026) по требованию «всегда только одна ветка»: PR-механизм release-please структурно требует отдельной ветки на весь срок жизни PR. `commit-and-tag-version` коммитит и тегает напрямую в текущую ветку — веток не создаёт вообще.
- **Пока версия ниже `1.0.0` — все релизы patch-bump** (`0.1.0 → 0.1.1 → ...`), `feat`/`fix` не различаются в номере версии. Это жёстко зашитое поведение инструмента (`commit-and-tag-version/lib/lifecycles/bump.js`: `semver.lt(currentVersion, '1.0.0') → preMajor = true`), простого флага для отключения нет; осознанно принято как есть, а не обойдено.
- `.github/workflows/release.yml` создаёт GitHub Release при push git-тега (`v*`) — этому шагу ветка тоже не нужна.
- Пакеты `private: true`, публикации в npm нет и не будет.

## Известные особенности этого проекта

- **`ALLOW_DEMO_DATA=true`** — единственный официальный способ собрать `apps/web` без живого API. Без флага и без API `astro build` падает намеренно с объяснением причины (`apps/web/src/data/site.ts`, `loadSiteData()`). Это осознанное поведение (TD-03 закрыт 2026-09-07) — не возвращать тихий fallback на демо-данные.
- **Тесты зависят от собранного API**: `tests/*.test.cjs` импортируют `apps/api/dist/*.js`, а не `src/*.ts`. После любой правки в `apps/api/src` — обязательно `pnpm --filter @provider/api run build` перед `node --test`, иначе тесты либо не увидят изменений, либо массово упадут на устаревшем `dist`.
- **Один генератор Prisma-клиента** — `prisma/schema.prisma` → `apps/api/generated`, это единственный source of truth. Дублирующий `packages/database/generated` уже был найден и удален как stale-артефакт (2026-09-07, см. `docs/research/2026-09-07-workaround-audit.md`, W-04) — если он появится снова, это ошибка конфигурации, а не второй валидный клиент.
- **Docker всегда `--frozen-lockfile`** — все четыре `Dockerfile` сначала копируют root/workspace manifests, lockfile и `scripts/pnpm-install-retry.sh`, устанавливают только нужные workspace-зависимости через общий BuildKit cache mount, затем копируют исходники. В production Docker install дополнительно используется `--trust-lockfile` и bounded retry в том же заполненном store: deploy строится только из проверенного `master`, а CI/local install без этого флага сохраняют полный supply-chain verification. API migration target переиспользует build dependencies; не переносить `COPY . .` выше install и не откатывать на `--no-frozen-lockfile`. При расхождении manifest/lockfile чинить lockfile через `pnpm install`.
- Секреты только в `.env` (не коммитить). `.env.example` — актуальный список переменных; таблица по назначению — [docs/deployment.md](docs/deployment.md).
- `apps/api/src/*.ts` — единственный источник кода API; рядом никогда не должно быть tracked `*.js`-дублей (уже устранялись как stale-артефакт, W-03).

## Дизайн-система (жёсткие правила)

### `apps/admin`

Референс дизайна и готовых UI-паттернов — [github.com/arhamkhnz/next-shadcn-admin-dashboard](https://github.com/arhamkhnz/next-shadcn-admin-dashboard) (живой пример — [next-shadcn-admin-dashboard.vercel.app/dashboard/default](https://next-shadcn-admin-dashboard.vercel.app/dashboard/default)). Целевой стек: Astro как static-оболочка и маршрутизация, React-root для интерактивной страницы или крупного раздела, Tailwind и shadcn/ui. Данные читаются и изменяются через HTTP API во время работы; Next.js-специфичный код не переносится как есть.

Если в референсе есть подходящий блок, его переносят и адаптируют. Если блока нет, экран собирают из совместимых shadcn/ui-примитивов в стиле референса. Новый компонент допустим только при документированном отсутствии подходящего паттерна и не должен создавать параллельную дизайн-систему на ad-hoc CSS. Legacy demo `index.astro` удален: текущие `/`, `/login`, `/tariffs`, `/cities`, `/leads` и `/lead-access/` — React-root на Tailwind/shadcn с HttpOnly-cookie аутентификацией и честными состояниями. Полный DoD-чек и детали — [docs/admin-design-system.md](docs/admin-design-system.md).

### `apps/web`

Публичная витрина `apps/web` визуально и по UX ориентируется на официальный сайт [dom.ru](https://dom.ru) — но это референс структуры/тона/визуального языка, **не код** (сайт не open-source) и **не источник контента для копирования** (`apps/web` — сайт партнёра/дилера, не сам Дом.ру; copyright-ограничения обязательны). При конфликте с [docs/decisions.md](docs/decisions.md) — приоритет у decisions.md. Полный DoD-чек — [docs/web-design-system.md](docs/web-design-system.md).

## Документация проекта

Живые документы — обновлять релевантный при любом значимом изменении кода/поведения, в том же коммите:

| Документ | Что содержит |
| --- | --- |
| [README.md](README.md) | Обзор проекта, локальный запуск, состав репозитория — первое, что видит новый читатель |
| [docs/current-state.md](docs/current-state.md) | Что реально работает, что demo, что не реализовано |
| [docs/admin-design-system.md](docs/admin-design-system.md) | Обязательный источник дизайна/компонентов для `apps/admin` — next-shadcn-admin-dashboard |
| [docs/web-design-system.md](docs/web-design-system.md) | Обязательный визуальный/UX-референс для `apps/web` — официальный dom.ru |
| [docs/architecture.md](docs/architecture.md) | Приложения, потоки данных, границы модулей |
| [docs/technology-baseline.md](docs/technology-baseline.md) | Версии, инфраструктура, правила сборки |
| [docs/api-contracts.md](docs/api-contracts.md) | Реализованные HTTP-маршруты и их ограничения |
| [docs/data-model.md](docs/data-model.md) | Prisma-схема и её отличие от продуктового замысла |
| [docs/deployment.md](docs/deployment.md) | Локальный/production контур, переменные, обязательные проверки |
| [docs/worker.md](docs/worker.md) | Очереди, producer/consumer, поведение без Redis, graceful shutdown |
| [docs/task-management.md](docs/task-management.md) | Как ведутся проблемы/задачи в GitHub Issues — обязательно перед работой с TD/issues |
| [docs/product-findings.md](docs/product-findings.md) | Входящий реестр продуктовых, UX/UI и дизайн-находок для отдельного обсуждения |
| [docs/technical-debt.md](docs/technical-debt.md) | Индекс приоритизированного долга (P0–P3), полный текст — в issues |
| [docs/TEST_COVERAGE.md](docs/TEST_COVERAGE.md) | Что именно проверяет каждый файл в `tests/` — живой документ |
| [docs/decisions.md](docs/decisions.md) | Согласованный продуктовый замысел — не подтверждает наличие в коде |
| [docs/plans/2026-09-07-platform-stabilization-and-mvp.md](docs/plans/2026-09-07-platform-stabilization-and-mvp.md) | Исполнимый план задач до MVP |
| [docs/research/](docs/research/) | Точечные read-only аудиты (переходные костыли, возможности стека) |

Не откладывать doc-update «на потом», если код уже изменён.

Минимум проверки перед завершением задачи:
1. актуален ли [README.md](README.md);
2. актуален ли профильный документ из таблицы выше по затронутой области;
3. нет ли расхождения между фактическим кодом и описанным в документации поведением — не только в правленном абзаце, но и в остальном тексте того же файла.

---

## Правила работы агента

### Язык коммуникации

- Всегда общайся с пользователем только на русском языке.
- Все сообщения в чате, планы, отчёты, пояснения и итоговые сводки — только на русском.
- Код, конфигурация, имена переменных, файлов, команды и системные логи остаются на английском; пояснения к ним — на русском.

### Обязательный порядок работы

- Никогда не начинай сразу с внесения изменений.
- Сначала изучи задачу, найди проблему или зону изменений, только после этого переходи к предложению решения.

### Что нужно делать до внесения изменений

Сначала опиши:
1. какую проблему нашёл;
2. в чём причина проблемы или какие есть гипотезы;
3. какой план действий предлагаешь;
4. какие есть варианты решения, если их несколько;
5. почему выбранный вариант предпочтительнее.

Всегда обосновывай предлагаемые изменения: зачем они нужны, что исправляют, какие риски снижают. Если задача крупная — разбивай на этапы, согласовывай поэтапно.

### Разрешение на применение изменений

- Перед внесением изменений обязательно получи явное подтверждение от пользователя.
- Разрешением считаются только однозначные сообщения: «Применяй», «Ок», «Давай», «Да».
- Без подтверждения — только анализ, план и варианты. Не редактируй файлы, не выдавай незавершённую работу за факт.
- Если в процессе план нужно существенно изменить — остановись, опиши новую ситуацию, снова запроси подтверждение.

### Управление задачами (GitHub Issues)

Репозиторий: `Celtoman/astro-telekom`. Issue open/closed — единственный механический источник правды «решено / не решено». Полное описание системы (типы записей, labels, milestone, шаблоны, sub-issues, команды `gh`) — [docs/task-management.md](docs/task-management.md), обязательно к прочтению перед любой работой с проблемами/задачами. Ниже — только сжатые обязательные правила.

- **Любая найденная проблема фиксируется сразу**, не откладывается на потом: `gh issue create --repo Celtoman/astro-telekom --title "..." --label "P0|P1|P2|P3" --label "tech-debt"` (или через шаблон `.github/ISSUE_TEMPLATE/tech-debt.yml`). Не держать находки только в памяти разговора или только в тексте ответа пользователю.
- При действующем явном поручении владельца **любая продуктовая, UX/UI или дизайн-находка либо идея улучшения фиксируется сразу** в [docs/product-findings.md](docs/product-findings.md). Без такого поручения сначала сообщить находку и получить разрешение на изменение файла. Не реализовать находку внутри текущей задачи без отдельного обсуждения и согласования.
- **Полный текст проблемы живёт только в issue**, не дублируется в `docs/technical-debt.md` — там только индекс (ID, ссылка, статус, одна строка сути). Дублирование текста — то, из-за чего документы расходились раньше; не повторять эту ошибку.
- Спланированная работа — отдельный issue с label `task`, чек-листом шагов и milestone «MVP: безопасный Казань-релиз» (если входит в MVP); закрываемые проблемы привязываются как sub-issues (`gh api .../sub_issues`), не только текстовой ссылкой — точные команды в `docs/task-management.md`.
- **Исправление проблемы закрывает issue в том же коммите** через `Closes #N` в теле коммита, либо issue закрывается вручную с комментарием, объясняющим почему. Нельзя коммитить исправление и оставлять issue формально открытым без причины.
- Если проблема решена лишь частично — не закрывать issue «за компанию»; выделить оставшуюся часть в отдельный issue со ссылкой на родительский (как сделано для TD-03/[issue #4](https://github.com/Celtoman/astro-telekom/issues/4)).
- Перед завершением задачи, которая касалась известной проблемы — проверить, не осталась ли ссылка на неё висеть открытой без причины.

### Управление зависимостями

- При установке/обновлении/удалении pnpm-пакетов всегда коммитить `pnpm-lock.yaml` вместе с `package.json` соответствующего workspace в одном коммите.
- Все Dockerfile используют `pnpm install --frozen-lockfile` — расхождение manifest/lockfile ломает Docker-билд.
- Перед коммитом проверять, что `pnpm-lock.yaml` и изменённые `package.json` добавлены в `git add`.
- После любого изменения зависимостей — запускать `pnpm audit --audit-level=high`. Baseline на 2026-09-09: 6 известных уязвимостей (3 moderate, 3 high), все транзитивные через Prisma CLI/Studio (`lodash`, `deepmerge-ts`, `mysql2` — последний вообще не используется, проект работает только с PostgreSQL через `@prisma/adapter-pg`) и не блокируют коммит. Прямая уязвимая зависимость `xlsx@0.18.5` удалена в TD-21. Новую уязвимость сверх этого baseline, особенно в прямых зависимостях — не игнорировать, разобраться перед коммитом.

### Тестирование и проверки перед коммитом

Обязательный порядок: `pnpm lint` → `pnpm db:validate` → `ALLOW_DEMO_DATA=true pnpm build` → пересобрать API (`pnpm --filter @provider/api run build`) → `node --test tests/*.test.cjs tests/*.test.mjs`.

- Коммит нельзя создавать, если любая обязательная проверка или тест падает.
- Если тесты/сборка упали из-за внесённых изменений — сначала исправить, потом коммитить.
- При добавлении новой функциональности — добавить соответствующие тесты в `tests/`.
- При изменении Prisma-схемы (`prisma/schema.prisma`) — прогнать `pnpm db:generate` и `pnpm db:validate`, проверить, что `apps/api/generated` остался единственным клиентом, и что тесты, читающие/пишущие изменённые модели, не сломались.
- При изменении публичных интерфейсов (HTTP-маршруты в `apps/api/src/*.controller.ts`, экспортируемые функции/типы сервисов) — обновить тесты, которые их проверяют, а не оставлять их проверяющими старое поведение.
- При изменении Prisma test-double/мока в тестах — сверить, что все поля и методы мока соответствуют актуальному пути выполнения через `PrismaService`; не ограничиваться первым вызовом, который виден в тесте.
- **Живой документ покрытия**: [docs/TEST_COVERAGE.md](docs/TEST_COVERAGE.md) фиксирует, что именно проверяет каждый файл в `tests/`. Обновлять его в том же коммите, что и любое добавление/удаление/существенное изменение теста — не оставлять устаревшим.

### Проверка результата

После внесения изменений обязательно сообщи:
1. что именно изменено и в каких файлах;
2. почему эти изменения были внесены;
3. какие проверки/тесты запущены и каков их результат;
4. есть ли нерешённые проблемы или непроверенные места.

Не скрывать проблемы и не выдавать задачу за завершённую, если что-то не собирается или падает.

### Дальнейшие действия после проверки

1. Убедиться, что всё работает самостоятельно (команды выше).
2. Сообщить пользователю результат и дать возможность проверить со своей стороны, не останавливая дальнейшую работу без явной просьбы о паузе.
3. После успешных обязательных проверок самостоятельно создать Conventional Commit и перейти к следующей задаче; отдельного подтверждения на каждый commit не ждать.
4. Push выполнять только после явного разрешения пользователя.

Если пользователь явно запросил режим review-before-commit для конкретной задачи, остановиться перед commit. В остальных случаях уведомление о результате не является блокирующим ожиданием.

### Стиль работы

- Не отвечать расплывчато — писать структурно, подробно и по существу.
- Для каждой правки объяснять смысл изменения, а не только сам факт.
- Если есть несколько решений — показывать плюсы, минусы и последствия каждого.
- Явные допущения вместо молчаливых выборов: если задача неоднозначна — озвучить варианты и спросить.
