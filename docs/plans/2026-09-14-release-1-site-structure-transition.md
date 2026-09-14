# Переход на каноническую структуру Release 1 — план реализации

> Выполнять задачи последовательно. После каждого изменения сначала получать красный целевой тест, затем минимально менять production-код и возвращать весь gate в зеленое состояние.

**Цель:** публиковать ровно канонический набор Release 1: `/`, `/{location}` для каждого опубликованного города, четыре общие страницы, и корректную 404; страницы следующих релизов не должны появляться в output, ссылках, sitemap или redirects.

**Архитектура:** `Page` получает site-global scope, API становится authoritative источником release-aware route inventory, а Astro строит output только из этого inventory. Статус тарифа остается статусом предложения и больше не означает автоматическое наличие tariff detail URL.

**Стек:** Prisma 7/PostgreSQL 18, NestJS 12/Fastify 5, Astro 7 static output, Node test runner, pnpm.

**Исходный аудит:** [2026-09-14-release-1-site-structure-gap-audit.md](../research/2026-09-14-release-1-site-structure-gap-audit.md)

**Главная задача:** [#136](https://github.com/Celtoman/astro-telekom/issues/136)

**Проблемы:** [#133](https://github.com/Celtoman/astro-telekom/issues/133), [#134](https://github.com/Celtoman/astro-telekom/issues/134), [#135](https://github.com/Celtoman/astro-telekom/issues/135)

**Статус 14 сентября 2026:** задачи 1–6 и синхронизация локальной документации реализованы; production-like fixture подтверждает exact output. Для задачи 7 добавлены канонический read-only SQL-аудит и runbook; их синтаксис, все 23 migration, custom dump и восстановление с совпадающими totals проверены на отдельной PostgreSQL 18. Внешнее применение и закрытие #136 остаются незавершенными до backup/pre-audit фактической БД, публикации утвержденных legal-текстов и exact-SHA deployment smoke. Bootstrap намеренно оставляет четыре global pages в `DRAFT`, поэтому неподготовленный production publisher завершается до переключения активного release.

---

## Предварительные ограничения

- Не менять и не удалять существующие тарифы: они нужны на городских страницах как предложения.
- Не публиковать service/tariff detail только потому, что запись имеет `PUBLISHED`.
- Не создавать общие страницы hardcoded-файлами в обход API/CMS.
- Не менять production-данные до backup и read-only inventory.
- Не включать страницы со значением «позже» без отдельного решения владельца.
- Контентные вопросы PF-015 не блокируют модель и route contract, но блокируют итоговую готовность к реальному трафику.

## Задача 1. Закрепить новый контракт красными тестами

**Файлы:**

- Изменить: `tests/web-build-data.test.mjs`
- Изменить: `tests/public-city-catalog.test.cjs`
- Изменить: `tests/redirects.test.cjs`
- Изменить: `tests/city-import.test.cjs`
- Изменить: `docs/TEST_COVERAGE.md`

**Шаги:**

1. В fixture web build оставить два опубликованных города, опубликованные тарифы и legacy service pages.
2. Изменить expected output на exact список: root, два city home, четыре global pages и 404; service/tariff detail должны отсутствовать.
3. Проверить exact sitemap без будущих URL.
4. Добавить ожидание, что public catalog возвращает `routes` и отдельные site-global pages.
5. Добавить redirect cases: target из Release 1 разрешен, опубликованный tariff detail вне Release 1 отклонен.
6. Изменить city import expectation: новый город создает только city-home bootstrap, существующие публикационные статусы не меняются.
7. Запустить только затронутые тесты и подтвердить ожидаемое падение:

```powershell
pnpm --filter @provider/api run build
node --test tests/web-build-data.test.mjs tests/public-city-catalog.test.cjs tests/redirects.test.cjs tests/city-import.test.cjs
```

## Задача 2. Добавить site-global область `Page`

**Файлы:**

- Изменить: `prisma/schema.prisma`
- Создать: `prisma/migrations/<timestamp>_add_site_global_pages/migration.sql`
- Изменить: `apps/api/src/admin-pages.controller.ts`
- Изменить: `apps/api/src/cities.controller.ts` либо выделенный public catalog service
- Изменить: `tests/public-city-catalog.test.cjs`
- Добавить/изменить: тесты admin page validation
- Изменить: `docs/data-model.md`
- Изменить: `docs/api-contracts.md`

**Шаги:**

1. Добавить типы `COVERAGE`, `CITIES`, `PRIVACY`, `PERSONAL_DATA_CONSENT`.
2. Сделать `Page.cityId`/relation nullable и ввести явную scope-валидацию: эти четыре типа только site-global; city types только city-scoped.
3. Добавить partial unique index PostgreSQL для `(siteId, slug)` при `cityId IS NULL`; сохранить уникальность `(cityId, slug)` городских страниц.
4. Обновить admin create/update так, чтобы неверные сочетания отклонялись до Prisma.
5. Вернуть global pages отдельным полем public catalog, не смешивая их с массивом города.
6. Сгенерировать client и проверить схему:

```powershell
pnpm db:generate
pnpm db:validate
pnpm --filter @provider/api run build
node --test tests/public-city-catalog.test.cjs
```

## Задача 3. Создать обязательные global pages без фиктивного города

**Файлы:**

- Изменить: `apps/api/src/seed.ts`
- Создать: data migration или идемпотентный bootstrap для четырех страниц
- Изменить/добавить: тест bootstrap/migration
- Изменить: `.env.example` только если появляется новая обязательная конфигурация
- Изменить: `docs/deployment.md`

**Шаги:**

1. Добавить четыре записи с точными slug из `docs/site-structure.md`.
2. Не подставлять неподтвержденный legal-текст. Создать legal pages в `DRAFT` и сохранить намеренный production build blocker до получения и публикации утвержденных текстов владельца.
3. Сделать операцию идемпотентной и не перезаписывать вручную отредактированный контент.
4. Проверить повторный запуск на fixture DB.

## Задача 4. Исправить bootstrap и импорт городов

**Файлы:**

- Изменить: `apps/api/src/city-import.service.ts`
- Изменить: `scripts/import-cities.mjs`
- Изменить: `data/imports/README.md`
- Изменить: `tests/city-import.test.cjs`
- Изменить: `README.md`

**Шаги:**

1. Удалить post-apply цикл, который меняет статусы всех городов относительно `CITY_IMPORT_PUBLISHED_SLUG`.
2. Сохранить правило: вновь созданный город и его city-home bootstrap — `DRAFT`.
3. Не создавать legacy `INTERNET`, `INTERNET_TV`, `TV`, `ADDRESS_CHECK`, `FAQ` автоматически.
4. Нормализовать служебный HOME slug; публичный URL все равно строить только из `City.slug`.
5. Проверить импорт с двумя ранее опубликованными городами: оба статуса сохраняются.
6. Закрыть #135 только после полного green suite.

## Задача 5. Ввести authoritative release route inventory в API

**Файлы:**

- Создать: `apps/api/src/public-route-policy.ts`
- Изменить: `apps/api/src/cities.controller.ts`
- Изменить: `apps/api/src/redirect.service.ts`
- Изменить: `apps/api/src/admin-redirects.controller.ts` при необходимости
- Изменить: `tests/public-city-catalog.test.cjs`
- Изменить: `tests/redirects.test.cjs`
- Изменить: `docs/api-contracts.md`
- Изменить: `docs/architecture.md`

**Контракт inventory:**

- `/` всегда один;
- четыре exact global paths берутся из опубликованных обязательных global pages;
- `/{city.slug}` создается для каждого `City.status = PUBLISHED`;
- никакая другая Page/Tariff не получает route в Release 1;
- отсутствие любой обязательной global page, дубли или конфликт slug дают явную ошибку сборочного контракта;
- redirect target должен входить в тот же inventory.

**Шаги:**

1. Реализовать чистую функцию построения inventory и покрыть unit cases.
2. Добавить inventory в public catalog response.
3. Перевести `effectiveRedirects` и runtime resolver на эту функцию/ее эквивалентный service.
4. Убедиться, что published tariff остается в данных города для карточек, но не в routes.
5. Закрыть API-тесты из задачи 1.

## Задача 6. Перевести Astro на новый inventory

**Файлы:**

- Изменить: `apps/web/src/data/site.ts`
- Изменить: `apps/web/src/pages/index.astro`
- Изменить: `apps/web/src/pages/[city]/index.astro`
- Изменить или удалить из Release 1 generation: `apps/web/src/pages/[city]/[slug].astro`
- Создать: route rendering для site-global pages
- Изменить: `apps/web/src/pages/sitemap.xml.ts`
- Изменить: `apps/web/src/layouts/BaseLayout.astro`
- Изменить: `apps/web/src/components/BlockRenderer.astro`
- Изменить: `tests/web-build-data.test.mjs`

**Шаги:**

1. Расширить `SiteCatalog` global pages и route inventory.
2. Генерировать `[city]/index` только для inventory city routes.
3. Генерировать четыре общие страницы из global `Page`, сохраняя общий renderer/SEO contract.
4. Не генерировать `[city]/[slug]` для Release 1.
5. Убрать/заменить links на service и tariff detail. До решения PF-015 использовать только подтвержденное назначение; не придумывать CTA.
6. Формировать sitemap строго из inventory.
7. Проверить, что 404 остается `noindex`, без canonical, и неизвестный URL получает 404.
8. Закрыть exact web build test из задачи 1.

## Задача 7. Мигрировать данные безопасно

**Файлы:**

- Создать: read-only inventory script/test либо документированную SQL-проверку
- Создать: идемпотентную data migration для scope/global pages/legacy city pages
- Изменить: `docs/deployment.md`
- Изменить: `docs/current-state.md` после фактического применения

**Шаги:**

1. Перед записью получить backup и exact counts: сайты, города по статусам, pages по type/status, тарифы, лиды, redirects.
2. Проверить коллизии четырех global slug со slug городов и redirect sources.
3. Создать global pages и сохранить существующие городские Page/Tariff/Lead relations.
4. Не удалять legacy pages: снять их route eligibility через policy; дальнейшая архивация — отдельное осознанное действие.
5. После миграции повторить counts и проверить referential integrity.
6. Выполнить production-like build против мигрированной БД до deployment.

## Задача 8. Синхронизировать документацию и выполнить release gate

**Файлы:**

- Изменить: `README.md`
- Изменить: `AGENTS.md`
- Изменить: `docs/current-state.md`
- Изменить: `docs/architecture.md`
- Изменить: `docs/technology-baseline.md`
- Изменить: `docs/api-contracts.md`
- Изменить: `docs/data-model.md`
- Изменить: `docs/deployment.md`
- Изменить: `docs/release-plan.md`
- Изменить: `docs/TEST_COVERAGE.md`

**Шаги:**

1. Разделить во всех документах текущий факт, Release 1 и будущую полную структуру.
2. Удалить инструкции, утверждающие invariant «опубликована только Казань».
3. Зафиксировать формулу `N + 5`, global page scope и route inventory API.
4. Запустить обязательные проверки в заданном порядке:

```powershell
pnpm lint
pnpm db:validate
$env:ALLOW_DEMO_DATA='true'; pnpm build; Remove-Item Env:ALLOW_DEMO_DATA
pnpm --filter @provider/api run build
node --test tests/*.test.cjs tests/*.test.mjs
```

5. Выполнить production-like build без `ALLOW_DEMO_DATA` по live API.
6. Сверить:

```text
HTML routes = published cities + 5
sitemap routes = те же indexable routes
future routes = 0
redirect targets outside inventory = 0
404 = noindex + HTTP 404
```

7. Закрыть #133, #134 и #135 только соответствующими коммитами `Closes #...`; закрыть #136 после полного production-like доказательства.

## Критерий завершения всего перехода

Работа завершена, только если exact output соответствует `docs/site-structure.md`, данные нескольких опубликованных городов не сбрасываются импортом, четыре общие страницы управляются через одну модель, redirects не указывают за пределы output, полный `pnpm check` зеленый и production-like проверка выполнена на фактическом каталоге.
