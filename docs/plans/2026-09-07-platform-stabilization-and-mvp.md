# Platform Stabilization and MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Довести локальный прототип до проверяемого первого MVP для одного сайта Дом.ру в Казани без публикации демо-данных, недостоверных статусов и незащищенных ссылок.

**Architecture:** Сначала стабилизируется release gate и надежный контур данных. Затем единый outbox на BullMQ делает доставку лидов и пересборку наблюдаемыми. Публичный Astro-сайт получает build-time контракт, который блокирует production-сборку при недоступных данных, после чего расширяется от фиксированной Казани к опубликованным городам и страницам.

**Tech Stack:** pnpm 11, Node.js 22, TypeScript, Astro 7 static output, NestJS 12/Fastify, PostgreSQL 18, Prisma 7, Redis 8, BullMQ 6, Caddy, Docker Compose.

---

## Порядок и критерии остановки

Не переходить к публикации лидов, тарифов или городов, пока не закрыты TD-01, TD-02, TD-05, TD-06 и TD-10. TD-03 закрыт 7 сентября 2026 (см. Task 3 ниже). Каждая задача завершается тестом, документацией и проверкой реального результата, а не только компиляцией.

### Task 1: Сделать проверяемый release gate

**Files:**

- Modify: `package.json`
- Modify: `apps/admin/package.json`
- Modify: `apps/crm/package.json`
- Modify: `tests/lead-check.test.cjs`
- Create: `.github/workflows/ci.yml` или выбранный CI-файл
- Modify: `README.md`

**Step 1: Исправить failing lead tests**

Расширить Prisma mock методом `lead.findMany` и добавить сценарии телефонного и адресного дубликата.

**Step 2: Запустить тест до и после исправления**

Run: `node --test tests/*.test.cjs tests/*.test.mjs`

Expected: до исправления 2 failed; после исправления 36 passed.

**Step 3: Добавить единые scripts**

Добавить root `test`, `check` и `test:build` с явно определенным порядком `lint`, `db:validate`, `build`, `test`. Добавить `astro check` для admin и CRM.

**Step 4: Зафиксировать CI**

Запускать `pnpm install --frozen-lockfile` и новый `pnpm check` в чистом окружении.

**Step 5: Commit**

`git add package.json apps/admin/package.json apps/crm/package.json tests README.md .github && git commit -m "test: establish release gate"`

### Task 2: Устранить небезопасную fallback-ссылку

**Files:**

- Modify: `apps/api/src/notifications.service.ts`
- Create: `apps/api/src/lead-access.controller.ts`
- Modify: `apps/api/src/module.ts`
- Modify: `apps/crm/src/pages/index.astro`
- Create: `tests/lead-access.test.cjs`
- Modify: `docs/api-contracts.md`

**Step 1: Выбрать контракт доступа**

Подтвердить один вариант: одноразовый server-side токен в БД или HMAC с обязательной server-side verification. Нельзя считать query signature авторизацией только на стороне Astro.

**Step 2: Написать failing tests**

Проверить valid, expired, altered, revoked token и отсутствие доступа к чужому лиду.

**Step 3: Реализовать verified endpoint**

Endpoint возвращает минимальную карточку заявки только после проверки срока и подписи; CRM открывает карточку по проверенному результату.

**Step 4: Убрать или заменить старую ссылку**

Письмо содержит только рабочий URL, а UI читает и валидирует его состояние.

**Step 5: Commit**

`git add apps tests docs && git commit -m "fix: secure lead fallback access"`

### Task 3: Сделать публикацию статического сайта отказоустойчивой

**Статус Step 1: сделано 7 сентября 2026**, под именем `ALLOW_DEMO_DATA` вместо изначально запланированного `PUBLIC_DEMO_MODE` (решение принято в моменте реализации, остальные документы и README уже используют это имя — переименовывать без функциональной причины не стали). Пустой каталог отдельно не проверяется — пустой ответ API не считается ошибкой и не блокирует build; это не покрыто исходной формулировкой Step 1 и осталось открытым наравне со Step 2–3.

**Files:**

- Modify: `apps/web/src/data/kazan.ts` — сделано
- Modify: `apps/web/astro.config.mjs` — не требовалось для Step 1
- Modify: `apps/web/Dockerfile` — не требовалось для Step 1 (`ALLOW_DEMO_DATA` передается как обычная env, ARG/ENV не нужны)
- Modify: `docker-compose.prod.yml` — не сделано, см. Step 2-4 ниже
- Create: `tests/web-build-data.test.mjs` — не создан
- Modify: `docs/deployment.md` — не потребовалось для Step 1

**Step 1: Разделить demo и production data policy — сделано**

Демо-данные разрешаются только при явно заданном `ALLOW_DEMO_DATA=true`. В production отсутствие API или ошибочный ответ завершают build ошибкой (проверено реальной сборкой в обоих режимах). Открыто: явно невалидный URL до самого fetch и пустой (но валидный) ответ каталога пока не считаются ошибкой.

**Step 2: Покрыть policy тестами**

Проверить success с API, blocked build без API в production и явный demo mode.

**Step 3: Добавить final HTML smoke-test**

После `astro build` проверить canonical, robots, sitemap, root URL, отсутствие `localhost`, H1 и цену/статус тарифа.

**Step 4: Commit**

`git add apps/web docker-compose.prod.yml tests docs && git commit -m "fix: block production builds with demo data"`

### Task 4: Ввести устойчивую очередь пересборки

**Files:**

- Modify: `apps/api/src/rebuild-queue.service.ts`
- Modify: `services/worker/src/index.mjs`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/0009_rebuild_jobs/migration.sql`
- Create: `tests/rebuild-jobs.test.cjs`
- Modify: `docs/worker.md`

**Step 1: Согласовать контракт job**

Определить deduplication key, список затронутых маршрутов, попытки, backoff, статус и способ получения результата deployment provider.

**Step 2: Написать failing tests**

Проверить deduplication изменений одного маршрута, retry, error и отсутствие публикации при failed job.

**Step 3: Реализовать outbox/job**

API записывает и ставит задачу; worker вызывает deployment webhook, сохраняет результат и повторяет transient failures.

**Step 4: Показать статус в API**

Добавить read endpoint для админки и не помечать публикацию завершенной до результата job.

**Step 5: Commit**

`git add apps services prisma tests docs && git commit -m "feat: track static site rebuilds"`

### Task 5: Утвердить и реализовать семантику полного тарифного импорта

**Files:**

- Modify: `docs/decisions.md`
- Modify: `apps/api/src/tariff-import.service.ts`
- Modify: `apps/api/src/admin-tariffs.controller.ts`
- Modify: `tests/tariff-import.test.cjs`
- Modify: `docs/api-contracts.md`

**Step 1: Подтвердить product rule**

Отдельно утвердить: новый файл является полным снимком или частичным обновлением; нужна ли поштучная приемка `acceptedKeys`; что делать с отсутствующим опубликованным тарифом и его URL.

**Step 2: Написать failing tests для выбранного правила**

Минимум: тариф исчез из полного файла, rollback при ошибке, slug change, redirect conflict, warning acceptance.

**Step 3: Реализовать atomic diff/apply**

В одной транзакции применить строки и выбранное правило удаления/архивации; поставить все затронутые маршруты в rebuild queue.

**Step 4: Commit**

`git add apps tests docs && git commit -m "feat: apply tariff snapshot semantics"`

### Task 6: Перевести админку и CRM с demo на реальные данные

**Files:**

- Modify: `apps/admin/src/pages/index.astro`
- Modify: `apps/crm/src/pages/index.astro`
- Modify: `apps/api/src/auth.controller.ts`
- Create: `tests/admin-ui-contract.test.mjs`
- Modify: `docs/current-state.md`

**Step 1: Убрать недостоверные статические KPI и списки**

Пока endpoint отсутствует, показывать пустое состояние и пояснение, а не значения 498 городов, 5 084 тарифов или 1 248 заявок.

**Step 2: Добавить login/logout flow**

Сессия должна иметь ограниченный срок, logout и понятную ошибку роли. Решение о cookie/token модели фиксируется до реализации.

**Step 3: Реализовать один end-to-end вертикальный экран**

Приоритет: список тарифов -> import report -> apply -> rebuild status. Затем города и CRM.

**Step 4: Проверить роль и XSS-safe rendering**

Тесты проверяют, что Editor не видит системные действия, TARIFF_MANAGER не меняет пользователей, а API-данные экранируются в DOM.

**Step 5: Commit**

`git add apps tests docs && git commit -m "feat: connect admin workflows to live data"`

### Task 7: Расширить публичную витрину от Казани к опубликованным городам

**Files:**

- Modify: `apps/web/src/pages/index.astro`
- Create: `apps/web/src/pages/[citySlug]/index.astro`
- Create: `apps/web/src/pages/[citySlug]/[pageSlug]/index.astro`
- Modify: `apps/web/src/pages/sitemap.xml.ts`
- Modify: `apps/api/src/cities.controller.ts`
- Create: `tests/public-routes.test.mjs`

**Step 1: Согласовать canonical URL contract**

Определить, какие page types получают самостоятельные адреса, как строится тарифный путь и как редиректы участвуют в output.

**Step 2: Написать route tests**

Проверить published/draft city, page, tariff, city switch, missing entity, canonical, sitemap и отсутствие смешения города.

**Step 3: Реализовать static paths из опубликованных данных**

Строить URL из API без hardcoded `kazan`; вывести root и все опубликованные страницы в sitemap.

**Step 4: Commit**

`git add apps tests docs && git commit -m "feat: generate published city routes"`

### Task 8: Закрыть legal/security и production readiness

**Files:**

- Modify: `apps/api/src/main.ts`
- Create: request DTO files in `apps/api/src/`
- Modify: `prisma/schema.prisma`
- Modify: `docker-compose.prod.yml`
- Modify: all `Dockerfile`
- Modify: `docs/deployment.md`
- Create: `docs/security-and-data-retention.md`

**Step 1: Провести external decisions**

Нужны подтвержденные договоры внешних API, согласованный retention PII/telemetry, legal basis для передачи, лимиты и SLA.

**Step 2: Внедрить технические ограничения**

Добавить DTO validation, rate limit, anti-abuse, PII access policy, migration job, DB-aware readiness и frozen installs.

**Step 3: Выполнить production rehearsal**

Поднять чистый VPS-like Compose environment, применить миграции, seed, проверить TLS/domains, raw HTML, rebuild, lead delivery sandbox и restore backup.

**Step 4: Commit**

`git add apps prisma deploy docker-compose.prod.yml Dockerfile docs tests && git commit -m "chore: harden production readiness"`

## Приемка MVP

MVP готов только когда чистый production-like контур проходит `pnpm check`, миграции, build без demo fallback, raw HTML audit, endpoint health с БД, импорт полного тарифного снимка, наблюдаемую пересборку, проверку адреса, безопасную обработку заявки и sandbox-доставку. Отдельно должны быть утверждены реальный контракт Tarifnik и правила работы с персональными данными.
