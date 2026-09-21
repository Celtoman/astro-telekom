# Target Platform Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Привести прототип `astro-telekom` к утвержденному [целевому продуктовому контракту](../product-contract.md), сохранив работающий Release 1 route inventory, snapshot-публикацию и безопасную доставку заявок.

**Architecture:** Изменения выполняются вертикальными срезами поверх существующей модели `workingRevision → SitePublication → SiteRebuild`. Сначала устраняются противоречия источников данных, затем завершается публичный путь тарифа и заявки, после этого строятся переменные, шаблоны и SEO. Старые JSON-поля и compatibility bridge удаляются только после проверенной миграции потребителей.

**Tech Stack:** Astro 7, React, Tailwind/shadcn, NestJS 12, Fastify 5, Prisma 7, PostgreSQL 18, BullMQ/Redis, Node test runner, Docker/Coolify.

---

## Правила исполнения

- Одна задача ниже — один самостоятельный проверяемый срез и отдельный Conventional Commit.
- Перед каждым срезом проверить текущие open Issues и создать/обновить task issue по `docs/task-management.md`.
- Любое изменение `apps/api/src` требует `pnpm --filter @provider/api run build` до тестов.
- Любое изменение Prisma требует миграцию, `pnpm db:generate` и `pnpm db:validate`.
- Любое изменение тестов требует синхронизации `docs/TEST_COVERAGE.md`.
- В каждом срезе обновлять `docs/current-state.md` только фактическим результатом, не будущим планом.
- Не менять генератор в `D:\01 vibecode\Tarifs`; это отдельная задача.
- После каждого среза выполнить минимум `pnpm lint`, `pnpm db:validate`, `ALLOW_DEMO_DATA=true pnpm build`, API build и `pnpm test`.

## Фаза A. Канон и источники данных

### Task 1: Синхронизировать GitHub-задачи с каноном

**Files:**

- Read: `docs/product-contract.md`
- Read: `docs/research/2026-09-21-target-product-implementation-gap-audit.md`
- Modify: существующие GitHub Issues #154–#162
- Create: task issues для отсутствующих вертикальных срезов только после сверки дублей

**Step 1: Проверить живое состояние задач**

Run:

```powershell
gh issue list --repo Celtoman/astro-telekom --state open --label task --limit 100
gh issue list --repo Celtoman/astro-telekom --state open --label tech-debt --limit 100
```

Expected: список является исходной точкой; номера из этого плана не придумываются заранее.

**Step 2: Закрыть отмененную задачу HTML-письма**

Закрыть #155 комментарием со ссылкой на `LEAD-007`: формат писем оставлен без изменений владельцем. Не создавать коммит кода ради закрытия отмененной задачи.

**Step 3: Обновить исследования, которые уже завершены решениями**

- #156 превратить из повторного общего исследования в реализацию утвержденной фоновой цепочки либо закрыть как завершенное исследование и создать отдельные implementation tasks.
- #159 закрыть как завершенное продуктовое исследование после переноса результата в `docs/product-contract.md`; реализацию каталога оформить отдельно.

**Step 4: Уточнить действующие implementation tasks**

- #154 — привести к `LEAD-001–LEAD-006`;
- #157 — расширить до трехрезультатной модалки либо создать зависимую задачу;
- #158 — оставить первым срезом глобальных значений сайта;
- #160 — привести колонки и readiness к `CITY-003–CITY-023`;
- #161 и #162 — сохранить без расширения scope.

**Step 5: Создать недостающие task issues**

Минимальные отдельные задачи:

1. канонический тарифный контракт и полный импорт;
2. программный шаблон тарифа и конфигуратор;
3. трехрезультатная модалка проверки адреса;
4. фоновая проверка телефона и decision pipeline;
5. каталог подстановок;
6. шаблоны страниц и паспорта блоков;
7. SEO-шаблоны;
8. publication validation report.

**Step 6: Проверить native sub-issues и milestone**

Только реальные Release 1 blockers получают milestone. Связи с technical debt оформляются нативными sub-issues.

### Task 2: Перевести идентичность сайта на «Дом.ру»

**Files:**

- Modify: `prisma/schema.prisma` только если миграции недостаточно
- Create: `prisma/migrations/<timestamp>_rename_domru_site/migration.sql`
- Modify: `prisma/seed.ts`
- Modify: `apps/api/src/public-leads.controller.ts`
- Modify: `apps/web/src/data/site.ts`
- Modify: `apps/admin/src/**`
- Modify: `.env.example`, `docker-compose*.yml`, `docs/deployment.md`
- Test: `tests/public-city-catalog.test.cjs`
- Test: `tests/web-build-data.test.mjs`

**Step 1: Написать failing regression tests**

Проверить, что:

- новый runtime использует только `domru-site`;
- видимое имя равно «Дом.ру»;
- Казань остается только городом;
- legacy slug допускается только внутри миграционной фазы и отсутствует после cleanup.

**Step 2: Выполнить точный inventory старой идентичности**

Run:

```powershell
rg -n "domru-kazan|Дом\.ру Казань" . --glob "!docs/research/**"
```

**Step 3: Добавить миграцию и узкий bridge**

Bridge должен читать старый slug только во время одного согласованного rollout. Все новые snapshot и rebuild используют `domru-site`.

**Step 4: Проверить test-контур и удалить bridge**

Cleanup входит в ту же task issue #162. Не оставлять постоянный alias.

**Step 5: Run full gate and commit**

```powershell
pnpm check
git commit -m "feat(platform): adopt global Dom.ru site identity Closes #162"
```

### Task 3: Добавить глобальные значения сайта и убрать городские телефоны

Статус 2026-09-21: реализовано локально; полный gate и commit фиксируются после проверки всего репозитория. Внешнее применение `0035` и новая публикация выполняются отдельным deployment-этапом.

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_site_contact_values/migration.sql`
- Create: `apps/api/src/admin-site-values.controller.ts`
- Create: `apps/api/src/site-values.service.ts`
- Modify: `apps/api/src/public-catalog.service.ts`
- Create: `apps/admin/src/pages/variables.astro`
- Create: `apps/admin/src/components/VariablesApp.tsx`
- Modify: `apps/admin/src/components/AdminNavigation.tsx`
- Modify: `apps/admin/src/components/CitiesApp.tsx`
- Modify: `apps/web/src/**`
- Test: `tests/site-values.test.cjs`
- Modify: `docs/api-contracts.md`, `docs/data-model.md`, `docs/TEST_COVERAGE.md`

**Step 1: Написать failing tests модели и API**

Tests должны требовать:

- два типизированных значения `connectionPhone` и `supportPhone` уровня Site;
- нормализацию в `7XXXXXXXXXX`;
- stale-write protection;
- `ContentRevision` и `AuditEvent`;
- отсутствие автоматической публикации;
- публикационный gate при пустом номере;
- отсутствие телефонов в City после миграции.

**Step 2: Реализовать schema и migration report**

Миграция сравнивает номера всех городов. При конфликте она не выбирает значение молча: deployment останавливается до явного решения данных.

**Step 3: Реализовать admin API и первый экран `/variables`**

Экран показывает только два значения сайта и preview кликабельного номера. Свободного создания ключей пока нет.

**Step 4: Перевести все public consumers**

Headers, forms, result modals и legal contacts читают опубликованные значения Site.

**Step 5: Удалить City phone fields и compatibility code**

Это обязательная часть того же среза, не будущий долг.

**Step 6: Run full gate and commit**

```powershell
pnpm check
git commit -m "feat(settings): centralize site phone values Closes #158"
```

### Task 4: Привести городскую модель и каталог к контракту

Статус 2026-09-21: реализовано локально; внешний rollout миграции `0036`, новая публикация и live smoke остаются отдельным deployment-этапом.

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_city_contract/migration.sql`
- Modify: `apps/api/src/admin-cities.controller.ts`
- Modify: `apps/api/src/city-import.service.ts`
- Create: `apps/api/src/city-readiness.service.ts`
- Modify: `apps/admin/src/components/CitiesApp.tsx`
- Test: `tests/city-admin.test.cjs`
- Test: `tests/city-import.test.cjs`
- Modify: `docs/data-model.md`, `docs/api-contracts.md`, `docs/TEST_COVERAGE.md`

**Step 1: Написать failing domain tests**

Проверить:

- Region содержит только name/slug;
- City не содержит phone/SEO/content JSON;
- office state различает `HAS_OFFICE` и `NO_OFFICE`;
- при офисе обязательны address и hours;
- readiness перечисляет конкретные отсутствующие данные;
- публикация требует готовый город, корректный slug, собираемый шаблон и хотя бы один опубликованный тариф;
- отсутствующий subscriber profile требует отдельного подтверждения.

**Step 2: Реализовать list DTO без N+1**

DTO включает публичный URL, readiness, число опубликованных тарифов, профиль, неопубликованные изменения и последнюю публикацию.

**Step 3: Реализовать server query**

Поиск: name, slug, legacy URL. Фильтры и сортировка — строго по `product-contract.md`. Cursor pagination обязательна.

**Step 4: Перестроить UI в overlay-drawer**

Добавить focus trap, Escape, возврат фокуса, dirty warning и сохранение контекста таблицы.

**Step 5: Добавить ручное создание через тот же drawer**

Create и XLSX используют одну readiness-валидацию.

**Step 6: Run full gate and commit**

```powershell
pnpm check
git commit -m "feat(cities): implement canonical city readiness and catalog Closes #160"
```

## Фаза B. Тарифный домен и публичная страница

### Task 5: Перевести платформенный импортер на канонический тарифный контракт

**Dependencies:** Отдельная задача генератора должна выдать проверенный 37-колоночный файл, но код импортера разрабатывается по `docs/product-contract.md`, а не по промежуточному output.

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_canonical_tariff_contract/migration.sql`
- Modify: `apps/api/src/tariff-import.service.ts`
- Modify: `apps/api/src/tariff.dto.ts`
- Modify: `apps/api/src/admin-tariffs.controller.ts`
- Modify: `apps/admin/src/components/TariffsApp.tsx`
- Modify: `apps/admin/src/components/TariffEditorApp.tsx`
- Test: `tests/tariff-import.test.cjs`
- Test: `tests/tariff-slug.test.cjs`
- Modify: `docs/data-model.md`, `docs/api-contracts.md`, `docs/TEST_COVERAGE.md`

**Step 1: Зафиксировать 37 headers в failing contract test**

Тест должен сравнивать точный список и порядок колонок из `docs/product-contract.md`/source coverage audit. `show_on_site`, `external_id`, `equip_router`, `equip_tv_box`, `srv_gaming_name`, `is_gaming_tarif` запрещены.

**Step 2: Написать failing identity tests**

Проверить бизнес-ключ `cityId + normalized(name) + serviceType`, не включающий slug, цену или скорость. Переименование создает новый тариф; дубль ключа в одном файле блокирует весь snapshot.

**Step 3: Написать failing value-contract tests**

Покрыть:

- integer-only numeric fields;
- `blank ≠ 0`;
- installment pair normalization;
- `priceStandard`/`pricePromo`;
- `0/1/-1 → UNAVAILABLE/OPTIONAL/INCLUDED`;
- `game_code` и `online_cinemas` allowlist;
- `post_title === nazvanie_tarifa`;
- HTML-to-plain-text description behavior;
- exact `connection_cost` without rounding.

**Step 4: Добавить archive provenance**

Отсутствующий тариф получает `archiveReason=ABSENT_FROM_IMPORT`, `archivedAt`, `archivedByImportRunId`. Safe purge сначала проверяет заявки и историю.

**Step 5: Разделить availability и publication state**

Бизнес-состояния только Active/Archived. Рабочая/опубликованная версия выводится отдельно через Site revision.

**Step 6: Удалить Tariff.seo после миграции consumers**

До готовности SEO templates поле можно перестать писать и читать, но физическое удаление выполнить в Task 11 после миграции.

**Step 7: Run full gate and real-file rehearsal**

```powershell
pnpm check
```

Дополнительно проверить реальный канонический XLSX: preview не пишет данные, apply атомарен, повторный apply идемпотентен, архивирование объяснимо.

**Step 8: Commit**

```powershell
git commit -m "feat(tariffs): adopt canonical tariff import contract"
```

### Task 6: Реализовать канонический редактор и таблицу тарифов

**Files:**

- Modify: `apps/api/src/admin-tariffs.controller.ts`
- Modify: `apps/admin/src/components/TariffsApp.tsx`
- Modify: `apps/admin/src/components/TariffEditorApp.tsx`
- Test: `tests/admin-api-contract.test.cjs`
- Test: `tests/admin-ui.test.mjs`

**Step 1: Написать failing list DTO tests**

Колонки: тариф, город, тип, standard/promo price, ключевая характеристика, availability, source, updatedAt, publication state, actions.

**Step 2: Добавить server filters**

Поиск по name/slug/internal ID; фильтры по городу, региону, типу, availability, source, promotion, archive reason и unpublished changes.

**Step 3: Довести quick card и long edit page**

Группы формы соответствуют закрытому attribute registry. Служебные ID только для чтения. Ручная форма вызывает тот же validator, что импорт.

**Step 4: Добавить безопасную очистку архивных тарифов**

Массовое действие показывает число записей, заблокированные связи и требует подтверждения.

**Step 5: Run full gate and commit**

```powershell
pnpm check
git commit -m "feat(admin): complete tariff catalog and editor"
```

### Task 7: Реализовать программный шаблон тарифа и конфигуратор

**Files:**

- Create: `apps/web/src/lib/tariff-configuration.ts`
- Modify: `apps/web/src/components/TariffDetail.astro`
- Create: `apps/web/src/components/TariffConfigurator.tsx`
- Modify: `apps/web/src/components/AddressForm.astro`
- Modify: `apps/api/src/public.dto.ts`
- Modify: `prisma/schema.prisma`
- Test: `tests/tariff-configuration.test.mjs`
- Test: `tests/web-build-data.test.mjs`
- Test: `tests/public-input-security.test.cjs`

**Step 1: Написать чистые calculator tests**

Проверить:

- base monthly = promo или standard;
- included component добавляет 0;
- selected installment добавляет monthly;
- buyout и connection cost добавляются в one-time total;
- unknown price остается `null`, а не 0;
- недопустимая комбинация отклоняется сервером.

**Step 2: Написать scenario rendering tests**

Интернет, Интернет+ТВ, game_code, equipment, services и minimal tariff. Порядок потенциальных блоков фиксирован; отсутствующие блоки не оставляют пустых оболочек.

**Step 3: Реализовать интерактивный React island**

По умолчанию выбраны только базовый тариф и included components. ONT остается информационным, не автоматической покупкой.

**Step 4: Добавить immutable configuration snapshot в Lead**

Хранить IDs/codes, показанные названия, цены на момент отправки, monthly total и one-time total.

**Step 5: Добавить карточку программного шаблона в admin**

Показывать схему блоков, deployment version, выбор города/тарифа, working/published preview и переход к данным тарифа. Код не показывать.

**Step 6: Run full gate and commit**

```powershell
pnpm check
git commit -m "feat(web): add typed tariff configurator"
```

## Фаза C. Формы и заявки

### Task 8: Реализовать единый трехрезультатный modal flow

**Files:**

- Refactor: `apps/web/src/components/AddressForm.astro`
- Create: `apps/web/src/components/AddressCheckModal.tsx`
- Create: `apps/web/src/lib/address-check-state.ts`
- Modify: `apps/api/src/address-checks.controller.ts`
- Modify: `apps/api/src/coverage.service.ts`
- Test: `tests/address-form.test.mjs`
- Test: `tests/address-checks.test.cjs`
- Modify: `docs/web-design-system.md`, `docs/TEST_COVERAGE.md`

**Step 1: Написать state-machine tests**

Состояния: empty → typing → selected → checking → Dom.ru / alternatives / none / technical error. Ручной ввод после selected возвращает typing.

**Step 2: Зафиксировать typed public result DTO**

DTO не раскрывает внутренние provider payloads и однозначно разделяет три бизнес-результата и technical error.

**Step 3: Реализовать собственную модалку**

- Dom.ru: адрес в тексте, tariff/config summary, phone, submit;
- alternatives: provider list, одна кнопка Tarifnik.ru, change address;
- none: support phone, change address;
- error: retry и change address.

**Step 4: Реализовать телефонный UX**

Поддержать `+7`, `8`, десять цифр, форматирование, blur-validation, final validation, loading, success и retry без очистки.

**Step 5: Проверить accessibility**

Dialog focus trap, Escape, focus return, live regions, keyboard suggestion list, no browser contact autocomplete.

**Step 6: Run full gate and commit**

```powershell
pnpm check
git commit -m "feat(forms): implement three-result address modal flow Closes #157"
```

### Task 9: Перевести заявки на durable background decision pipeline

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_lead_decision_pipeline/migration.sql`
- Create: `apps/api/src/lead-decision.service.ts`
- Create: `apps/api/src/lead-reason.registry.ts`
- Create: `apps/api/src/lead-comment-analysis.ts`
- Create: `apps/api/src/dadata-phone.service.ts`
- Create: `apps/api/src/lead-phone-check.controller.ts`
- Modify: `apps/api/src/public-leads.controller.ts`
- Modify: `services/worker/src/index.mjs`
- Modify: `apps/admin/src/components/LeadsApp.tsx`
- Test: `tests/lead-decision.test.cjs`
- Test: `tests/dadata-phone.test.cjs`
- Test: `tests/lead-deduplication.test.cjs`
- Test: `tests/lead-worker.test.mjs`

**Step 1: Написать failing save-first test**

Public request должен завершаться после durable save/outbox enqueue и не ждать DaData Phone, contract check или Tarifnik delivery.

**Step 2: Добавить reason snapshot**

Сохранять immutable `reasonCode` и `reasonLabel`. Unknown code → 400; absent optional reason → skip.

**Step 3: Добавить DaData Phone evidence**

Snapshot: normalized input, qc, normalized result, attemptedAt, attemptNumber, technical outcome. Полный response не хранить.

**Step 4: Реализовать retry/cache contract**

Только technical failures: сразу, +5m, +30m. Определенный qc кешируется 24h. `qc != 0` финален. Forced bypass запрещен.

**Step 5: Реализовать последовательную decision state machine**

`reason → phone → subscriber → decision → delivery`. Каждый шаг требует завершенный предыдущий state и пишет audit evidence.

**Step 6: Реализовать comment analyzer**

Версионируемые категории, phrase boundaries, negation cases и regression corpus. Результат только warning/manual review.

**Step 7: Исправить deduplication**

Phone 24h — основной ключ. Address-only match допустим только с apartment/premise и полным совпадением.

**Step 8: Расширить admin evidence**

Показать reason snapshot, phone qc/attempts, comment fragments/version, decision steps и разрешенные manual retries без bypass.

**Step 9: Run full gate and commit**

```powershell
pnpm check
git commit -m "feat(leads): add durable background decision pipeline"
```

### Task 10: Завершить сессионную атрибуцию заявки

**Files:**

- Modify: `prisma/schema.prisma`
- Modify: `apps/api/src/public.dto.ts`
- Modify: `apps/api/src/public-leads.controller.ts`
- Modify: `apps/web/src/components/AddressForm.astro`
- Modify: `apps/admin/src/components/LeadsApp.tsx`
- Test: `tests/public-input-security.test.cjs`
- Test: `tests/pii-retention.test.cjs`

**Step 1: Написать limit/spoofing tests**

IP/UA принимаются только из server request. UTM allowlist и максимум 50 unique paths имеют bounds. Произвольные query keys и fragments не сохраняются.

**Step 2: Реализовать first/last touch session collector**

Не использовать fingerprint и persistent cross-session ID.

**Step 3: Сохранить server IP/full UA/device type**

Proxy trust берется только из существующей проверенной конфигурации. IP/UA не влияют на decision state.

**Step 4: Проверить retention cascade**

Весь контекст удаляется вместе с Lead по 180-day policy.

**Step 5: Run full gate and commit**

```powershell
pnpm check
git commit -m "feat(leads): persist bounded session attribution Closes #154"
```

## Фаза D. Переменные, шаблоны и SEO

### Task 11: Реализовать каталог подстановок

**Files:**

- Create: `apps/api/src/variables/variable-registry.ts`
- Create: `apps/api/src/variables/variable-parser.ts`
- Create: `apps/api/src/variables/variable-resolver.ts`
- Create: `apps/api/src/variables/admin-variables.controller.ts`
- Modify: `apps/admin/src/components/VariablesApp.tsx`
- Test: `tests/variables.test.cjs`
- Test: `tests/variable-publication.test.cjs`
- Modify: `docs/api-contracts.md`, `docs/TEST_COVERAGE.md`

**Step 1: Написать parser tests**

Только `{[A-Z0-9_]+}`; регистр значим; unknown code — structural error; nested variables и HTML output запрещены.

**Step 2: Написать context tests**

City variables требуют city, tariff variables — city+tariff. Known missing/wrong-context → empty string + warning. URL/system fields не обрабатываются.

**Step 3: Реализовать typed registry**

Первая версия: Site phones, provider name, city forms, tariff name/speed/price/channels и YEAR. Каждый entry содержит type, source, contexts, fields и formatter.

**Step 4: Реализовать usage index**

Показывать working/published uses и переход к editor. Использованный код нельзя переименовать; deprecation требует нового кода и migration.

**Step 5: Подключить preview/publication validation**

Preview показывает working/published value и warning. Publication блокирует unknown code и missing required site setting.

**Step 6: Run full gate and commit**

```powershell
pnpm check
git commit -m "feat(cms): add typed variable catalog"
```

### Task 12: Ввести шаблоны страниц и исполнимые паспорта блоков

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_page_templates/migration.sql`
- Create: `apps/api/src/page-template.service.ts`
- Create: `apps/api/src/block-passports.ts`
- Create: `apps/api/src/admin-page-templates.controller.ts`
- Create: `apps/admin/src/pages/templates.astro`
- Create: `apps/admin/src/components/PageTemplatesApp.tsx`
- Modify: `apps/api/src/public-catalog.service.ts`
- Modify: `apps/web/src/components/BlockRenderer.astro`
- Test: `tests/page-templates.test.cjs`
- Test: `tests/block-passports.test.cjs`
- Test: `tests/web-build-data.test.mjs`

**Step 1: Зафиксировать draft passports текущих семи блоков**

Паспорт в коде содержит id/version/status/scope/allowedPages/schema/validation/emptyBehavior/previewScenarios/accessibility. Документация владельца остается human-readable source.

**Step 2: Написать migration tests**

Существующие 207 HOME должны ссылаться на один city-home template без создания 207 editable copies. Migration не меняет public output.

**Step 3: Реализовать template model**

Хранить working/published composition, template-local content и references на global content. Local city/tariff override не поддерживать.

**Step 4: Реализовать два admin modes**

Content editor и отдельный structure editor с impact preview/confirmation.

**Step 5: Добавить программный тарифный шаблон как read-only entry**

Источник схемы синхронизируется с кодом, не редактируется отдельно.

**Step 6: Перевести public catalog и удалить legacy page copies**

Удалять `City.content`, `Page.content` и per-city HOME blocks только после доказанной эквивалентности snapshot и rollback rehearsal.

**Step 7: Run full gate and commit**

```powershell
pnpm check
git commit -m "feat(cms): introduce page templates and block passports"
```

### Task 13: Реализовать SEO-шаблоны и Open Graph

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_seo_templates/migration.sql`
- Create: `apps/api/src/seo-template.service.ts`
- Create: `apps/api/src/admin-seo-templates.controller.ts`
- Create: `apps/admin/src/pages/seo/templates.astro`
- Create: `apps/admin/src/components/SeoTemplatesApp.tsx`
- Modify: `apps/web/src/layouts/**`
- Modify: `apps/api/src/sitemap.service.ts`
- Test: `tests/seo-templates.test.cjs`
- Test: `tests/web-build-data.test.mjs`

**Step 1: Написать template validation tests**

Title/Description required; unknown placeholder blocks; length/duplicate warns; noindex excludes sitemap; follow remains fixed.

**Step 2: Добавить OG fallback tests**

Missing OG title/description/image uses ordinary SEO/site image without duplicating sources.

**Step 3: Реализовать impact preview для noindex**

Показывать exact affected URL count и требовать separate confirmation.

**Step 4: Мигрировать consumers и удалить local SEO JSON**

Удалить `City.seo`, `Page.seo`, `Tariff.seo` только после сравнения generated metadata до/после на полном route inventory.

**Step 5: Run full gate and commit**

```powershell
pnpm check
git commit -m "feat(seo): add typed page SEO templates"
```

### Task 14: Расширить publication validation report

**Files:**

- Modify: `prisma/schema.prisma`
- Modify: `apps/api/src/publication-workflow.service.ts`
- Create: `apps/api/src/publication-validation.service.ts`
- Modify: `apps/admin/src/components/PreviewApp.tsx`
- Modify: admin publication UI
- Test: `tests/publication-validation.test.cjs`
- Test: `tests/web-build-data.test.mjs`

**Step 1: Написать severity tests**

Blockers: required core, unknown code/status, render/calculation error, unresolved placeholder, URL conflict. Warnings: optional missing data and uncovered scenario.

**Step 2: Реализовать representative scenario selector**

Internet, Internet+TV, gaming, equipment, extra services, minimal. Missing scenario → warning, no fake tariff.

**Step 3: Сохранить report snapshot**

App version, author, timestamps, checked URL count, issues, outcome и связи с publication/rebuild.

**Step 4: Показать report рядом с preview**

Ошибки привязаны к URL, template, block и field, если применимо.

**Step 5: Добавить глобальный shell indicator**

Переиспользовать publication state API, bounded polling и русские состояния из #161.

**Step 6: Run full gate and commit**

```powershell
pnpm check
git commit -m "feat(publication): persist full validation reports Closes #161"
```

## Фаза E. Финальная миграция и приемка

### Task 15: Удалить переходные источники и доказать эквивалентность

**Files:**

- Modify: `prisma/schema.prisma`
- Create: cleanup migration(s)
- Modify: `apps/api/src/content-resolution.ts`
- Modify: `docs/current-state.md`, `docs/data-model.md`, `docs/architecture.md`, `docs/api-contracts.md`
- Test: full `tests/`

**Step 1: Inventory transitional fields**

Минимум: Region phone/content, City phone/seo/content, Page content/seo where replaced by templates, Tariff seo, legacy site slug, old tariff import aliases.

**Step 2: Сделать migration rehearsal на копии production-like DB**

Сравнить route inventory, public catalog, SEO output, телефоны, city readiness, tariff counts и active lead references.

**Step 3: Удалить compatibility code в том же release task**

Нельзя оставить второй источник правды «временно навсегда».

**Step 4: Run full gate**

```powershell
pnpm lint
pnpm db:validate
$env:ALLOW_DEMO_DATA='true'; pnpm build
pnpm --filter @provider/api run build
node --test tests/*.test.cjs tests/*.test.mjs
```

Expected: все команды успешны, `docs/TEST_COVERAGE.md` соответствует реальному набору тестов.

**Step 5: Exact-SHA test deployment**

Проверить защищенный test-контур, route inventory, sitemap, preview, три результата формы, заявку с конфигурацией и фоновые evidence states.

**Step 6: Commit and handoff**

```powershell
git commit -m "refactor(platform): remove legacy content and import sources"
```

Production rollout и push выполняются только по отдельному разрешению владельца.

## Критерий завершения программы

Программа завершена, когда:

1. каждый источник данных соответствует `product-contract.md`;
2. в Prisma и runtime нет параллельных legacy-источников;
3. preview и publication gate проверяют те же contracts, что public build;
4. городская и тарифная страницы формируются без индивидуальных page copies;
5. трехрезультатная форма и фоновая заявочная цепочка доказаны тестами;
6. переменные, шаблоны и SEO используют типизированные схемы;
7. полный gate, migration rehearsal и exact-SHA test deployment успешны;
8. `current-state.md`, профильные документы и GitHub Issues отражают фактический результат.
