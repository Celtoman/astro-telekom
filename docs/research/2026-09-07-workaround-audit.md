# Аудит переходных решений и legacy-остатков

Дата: 7 сентября 2026 года. Режим: read-only. Цель — отделить поддерживаемые решения текущего стека от временных обходов, появившихся при переходе на Node 22, pnpm 11, Astro 7/Vite 8, Nest 12/Fastify 5, Prisma 7 и BullMQ 6.

## Вывод

В исполняемом server runtime нет подтвержденного «костыля ради новых версий»: Prisma 7 driver adapter и настройка BullMQ соответствуют текущим рекомендациям. Найдены четыре устранимых legacy/prototype-остатка и две зоны, которые нельзя удалять без воспроизводимого теста. Самые важные: тихая публикация demo-данных Astro, нестрогая Docker-установка и два конкурирующих набора сгенерированного/скомпилированного кода.

Проверено локально: `node v22.23.2`, `pnpm 11.19.0`, `pnpm install --frozen-lockfile --ignore-scripts` завершается успешно. Следовательно, `--no-frozen-lockfile` в Dockerfiles не требуется для текущего lockfile.

## Классификация

| ID | Класс | Доказательство | Вердикт |
| --- | --- | --- | --- |
| W-01 | Устранимый legacy/prototype workaround | Существовавший на дату аудита `apps/web/src/data/kazan.ts::loadKazanData` ловил любую ошибку API и возвращал встроенную Казань и два demo-тарифа; файл позднее заменен новой data-layer. | Убрать из production-контура: failure build должен быть явным; demo сохранить только за отдельным флагом. |
| W-02 | Устранимый build workaround | Все Dockerfiles делают `COPY . .` и `pnpm install --no-frozen-lockfile`; `.dockerignore` отсутствует. | Перейти на lockfile-only слой и `--frozen-lockfile`; не копировать host `node_modules`, `.git`, artifacts. |
| W-03 | Устранимый legacy-артефакт | В `apps/api/src` лежат 10 tracked скомпилированных `.js` рядом с актуальными `.ts`; `main.js` не содержит текущие Fastify body limit и CORS. | Удалить из source tree после подтверждения, что scripts используют только `src/*.ts` и `dist/*.js`. |
| W-04 | Устранимый устаревший generated client | `packages/database/generated` содержит 21 tracked файл; его embedded schema не знает `CityImportStatus` и `DELIVERY_ERROR_EMAIL_FAILED`, а canonical schema генерирует в `apps/api/generated`. | Удалить устаревший output и исключить generated artifacts из VCS либо выбрать единый generated-client package. |
| W-05 | Обоснованная адаптация текущей версии | Prisma 7 требует driver adapter; `PrismaService` создает один `pg.Pool`, передает его в `PrismaPg`, делает `$connect`, `$disconnect`, `pool.end`. | Оставить. Добавить shutdown signal handling, но не менять сам подход. |
| W-06 | Обоснованная адаптация текущей версии | Worker создает `IORedis(..., { maxRetriesPerRequest: null })`. BullMQ прямо требует это для Worker. | Оставить для worker connections. Не переносить это бездумно на HTTP producer queue. |
| W-07 | Недостаточно доказательств | Vite optimizer полностью отключает discovery и принудительно alias-ит `aria-query`/`axobject-query`. Нет issue, комментария или теста, объясняющего исходный дефект. | Пока оставить: удалить только после чистого dev regression test. |
| W-08 | Неполная, но не legacy-совместимость | Prisma и Queue имеют destroy hooks, однако bootstrap не вызывает `app.enableShutdownHooks()`, а worker не закрывает Redis/Worker на SIGTERM. | Добавить graceful shutdown; это исправление жизненного цикла, а не откат версии. |

## Подтвержденные устранимые остатки

### W-01 — fallback для локального прототипа может стать опубликованным контентом

**Доказательство на дату аудита.** Удаленный позднее `apps/web/src/data/kazan.ts:17-53` содержал зашитый город и тарифы, использовал 2-секундный timeout и в `catch` всегда возвращал эти данные. При этом [`apps/web/astro.config.mjs`](../../apps/web/astro.config.mjs) задает `output: 'static'`: результат fetch фиксируется в HTML при build, а не обновляется во время запроса пользователя.

Это не требование Astro и не совместимость с Vite. Это полезный UX-режим раннего прототипа, но небезопасный fallback для коммерческой публикации. Astro документирует static replacement `PUBLIC_` variables при build и SSG data loading через build-time routes/loaders: [Astro environment variables](https://docs.astro.build/en/guides/environment-variables/), [Astro static paths](https://docs.astro.build/en/guides/routing/#static-ssg-mode).

**Безопасная замена.** В production при недоступном API, пустом ответе или localhost `PUBLIC_API_URL` завершать build ошибкой с URL и причиной. В development разрешить fixture только через явный флаг, например `ALLOW_DEMO_DATA=true`; не делать catch «на все» режимом по умолчанию.

**Проверка перед merge.**

1. Production build с доступным API генерирует HTML с фактическими данными.
2. Production build с `PUBLIC_API_URL` на несуществующем адресе завершается non-zero и не создает publishable `dist`.
3. Локальный demo-режим включается только explicit flag; без него build не маскирует ошибку.

### W-02 — Docker ослабляет единственный источник зависимостей

**Доказательство.** [`apps/api/Dockerfile:5-8`](../../apps/api/Dockerfile), [`apps/web/Dockerfile:12-14`](../../apps/web/Dockerfile), а также Dockerfiles admin, CRM и worker копируют весь контекст и применяют `pnpm install --no-frozen-lockfile`. В root нет `.dockerignore`. При этом root [`package.json`](../../package.json) закрепляет `pnpm@11.19.0`, в репозитории есть `pnpm-lock.yaml`, а cold install с `--frozen-lockfile` подтвержден текущей проверкой.

Это не нужно для Node 22 или pnpm 11. `--no-frozen-lockfile` скрывает рассинхронизацию manifest/lockfile и разрешает образу отличаться от проверенного дерева. Полный build context также переносит локальные `node_modules` и `.git`; Docker рекомендует исключать их и сначала копировать manifest/lockfile, чтобы cache и входы сборки были детерминированными. [pnpm install](https://pnpm.io/cli/install), [Docker build context](https://docs.docker.com/build/concepts/context/), [Docker cache optimization](https://docs.docker.com/build/cache/optimize/).

**Безопасная замена.** Добавить `.dockerignore`; копировать root/package manifests и lockfile отдельным слоем; использовать `pnpm install --frozen-lockfile`; затем копировать source. Переход должен быть одинаковым во всех пяти Dockerfiles.

**Проверка перед merge.** Собрать все пять images с чистым BuildKit context; проверить, что изменение произвольного `.md` или локального `node_modules` не инвалидирует install layer; убедиться, что умышленный рассинхрон `package.json`/lockfile прерывает build.

### W-03 — stale JavaScript рядом с TypeScript source

**Доказательство на дату аудита.** Git отслеживал 10 файлов `apps/api/src/*.js`; canonical runtime собирался из TypeScript: [`apps/api/package.json`](../../apps/api/package.json) запускает `nest build`, а production CMD — `node dist/main.js` ([`apps/api/Dockerfile`](../../apps/api/Dockerfile)). Удаленный позднее `apps/api/src/main.js` отставал от [`main.ts`](../../apps/api/src/main.ts): в старом JS не было Fastify body limit и CORS.

Это не runtime-совместимость для Node 22: current package scripts его не запускают. Два варианта source создают ложный ориентир, а случайный `node apps/api/src/main.js` запускает другое приложение. Это уже зафиксировано как TD-19 в [`docs/technical-debt.md:43-44`](../technical-debt.md).

**Безопасная замена.** Оставить TypeScript в `src`, generated Prisma client в единственном определенном пути и `dist` как единственный JS output; удалить tracked source JS и добавить правило, предотвращающее его возврат.

**Проверка перед merge.** `rg` не находит tracked `apps/api/src/*.js`; `pnpm --filter @provider/api build` создает `dist`; API smoke получает CORS header и отклоняет body больше configured limit.

### W-04 — второй Prisma generated client от старой schema

**Доказательство на дату аудита.** Canonical [`prisma/schema.prisma`](../../prisma/schema.prisma) генерирует в `apps/api/generated`, и API/seed импортируют именно этот путь. Одновременно Git хранил 21 файл в удаленном позднее `packages/database/generated`; embedded schema генерировала в себя и отставала от canonical schema: не содержала `CityImportStatus`, `CityImportRun` и `DELIVERY_ERROR_EMAIL_FAILED`. Поиск репозитория не находил runtime imports из `packages/database/generated`.

Это недвусмысленный stale artifact, а не Prisma 7 compatibility layer. Prisma 7 действительно требует adapter при конструировании клиента, но не требует двух generated outputs. [Prisma v7 driver adapters](https://www.prisma.io/docs/orm/overview/databases/database-drivers), [Prisma generate](https://www.prisma.io/docs/orm/prisma-schema/overview/generators).

**Безопасная замена.** Либо сделать `@provider/database` настоящим единственным package, экспортирующим client, либо удалить его stale generated output и оставшиеся ссылки. Не хранить два client ABI для одной database schema.

**Проверка перед merge.** `pnpm db:generate`, `pnpm db:validate`, seed и API build проходят с одним output; git diff после generation либо пуст, либо содержит только выбранный canonical generated output.

## Обоснованные решения, которые нельзя «чистить»

### W-05 — PrismaPg + pg.Pool

[`apps/api/src/prisma.service.ts:7-23`](../../apps/api/src/prisma.service.ts) — корректный один injectable `PrismaClient`: `pg.Pool` передается в `new PrismaPg(pool)`, затем закрываются и Prisma, и pool. Это соответствует Prisma 7: adapter обязателен при создании Prisma Client с PostgreSQL, а их NestJS пример также подключается в `onModuleInit`. [Prisma v7 migration](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7), [Prisma + NestJS example](https://www.prisma.io/blog/nestjs-prisma-rest-api-7D056s1BmOL0).

Не заменять это на старый URL-only PrismaClient или global singleton. Нужен только W-08 graceful shutdown и, при production load testing, явные `connectionTimeoutMillis`/`idleTimeoutMillis` для adapter pool: [Prisma connection pool](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool).

### W-06 — `maxRetriesPerRequest: null` для BullMQ Worker

[`services/worker/src/index.mjs:4-8`](../../services/worker/src/index.mjs) создает shared worker connection с `maxRetriesPerRequest: null`. Это требование BullMQ для workers: библиотека объясняет, что worker должен пережидать недоступность Redis и требует null для manually-created ioredis connection. [BullMQ connections](https://docs.bullmq.io/guide/connections), [persistent connections](https://docs.bullmq.io/bull/patterns/persistent-connections).

Это корректно и не связано с устаревшей версией Node. Для HTTP-facing `Queue` в [`apps/api/src/lead-delivery.service.ts:17-20`](../../apps/api/src/lead-delivery.service.ts) стратегия требует отдельного решения: документация BullMQ рекомендует bounded/default retries, чтобы запрос пользователя не ждал Redis бесконечно. Не менять worker setting как «костыль».

### `pnpm.overrides.fastify`

[`pnpm-workspace.yaml:5-6`](../../pnpm-workspace.yaml) принудительно фиксирует `fastify: 5.12.3`. `pnpm why fastify --recursive` показывает ровно одну установленную версию, поставляемую `@nestjs/platform-fastify@12.0.1`. Это узкий и понятный patch pin после обновления, не legacy shim. Оставить, пока он фиксирует нужный patch; документировать причину и удалять override только вместе с проверенным обновлением Nest adapter.

## Недостаточно доказательств для удаления

### W-07 — Vite optimizer и aliases

[`apps/web/astro.config.mjs:13-24`](../../apps/web/astro.config.mjs) отключает Vite dependency discovery и manually alias-ит `aria-query`/`axobject-query` к root `node_modules`; в admin/CRM выключен discovery без aliases. Astro позволяет передавать Vite configuration, но это должно быть реакцией на конкретную incompatibility, а не обычной настройкой static site. [Astro Vite config](https://docs.astro.build/en/reference/configuration-reference/#vite), [Vite dep optimization](https://vite.dev/config/dep-optimization-options).

В коде нет React/Vue islands и нет комментария/issue, связывающего настройку с воспроизводимой ошибкой. Но отсутствие воспроизведения не доказывает ее ненужность: workaround мог обходить Windows/pnpm hoisting issue.

**Validation, не изменение:** в чистом checkout с пустым Vite cache последовательно временно убрать только (a) aliases/exclude и (b) затем `noDiscovery`; запустить `pnpm dev:web`, открыть `/`, `/kazan/`, `/kazan/internet/`, dynamic tariff route и выполнить `pnpm --filter @provider/web build`. Зафиксировать ошибку или green result. До этого aliases не удалять.

## W-08 — жизненный цикл корректного кода неполон

[`PrismaService`](../../apps/api/src/prisma.service.ts) и [`LeadDeliveryService`](../../apps/api/src/lead-delivery.service.ts) правильно реализуют `OnModuleDestroy`, но [`apps/api/src/main.ts:5-22`](../../apps/api/src/main.ts) не вызывает `app.enableShutdownHooks()`. Nest явно требует это для вызова lifecycle hooks при SIGTERM/SIGINT. Worker создает три `Worker` и Redis connection, но [`services/worker/src/index.mjs:18-59`](../../services/worker/src/index.mjs) не обрабатывает signal и не вызывает `worker.close()`/`connection.quit()`.

Это не workaround. Это недостающая часть поддерживаемого lifecycle, из-за которой обновленные компоненты не получают шанса освободить connections при container stop. [Nest lifecycle events](https://docs.nestjs.com/fundamentals/lifecycle-events), [BullMQ graceful shutdown](https://docs.bullmq.io/guide/workers/graceful-shutdown).

**Validation.** После реализации поднять Compose, отправить SIGTERM API и worker, подтвердить завершение hooks, отсутствие новых jobs после stop и повторный start без оставшихся connection errors.

## Предлагаемый порядок исправления

1. W-01 и W-02: убрать production fallback и сделать Docker build reproducible. Это прямо влияет на достоверность публикации и поставки.
2. W-03 и W-04: удалить/унифицировать stale source and generated artifacts. Изменения механические после build/seed verification.
3. W-08: graceful shutdown/readiness; затем контейнерный integration test.
4. W-07: только исследование с чистым dev run; удалять Vite settings лишь при подтвержденной ненужности.

Не следует по результатам этого аудита откатывать Prisma adapter, BullMQ worker retry setting, Nest/Fastify или сам static Astro: они не являются искусственными решениями старого стека.

## Статус после исправлений (7 сентября 2026)

Все находки этого аудита перепроверены напрямую по коду и, где применимо, исправлены в ту же дату.

| ID | Статус | Что сделано и чем подтверждено |
| --- | --- | --- |
| W-01 | Исправлено | `apps/web/src/data/kazan.ts`: `loadKazanData()` больше не глотает ошибку молча. Без `ALLOW_DEMO_DATA=true` ошибка API пробрасывается и `astro build` падает с ненулевым кодом и текстом причины; с флагом — предупреждение в лог и текущий demo-fallback. Проверено обоими путями реальной сборкой (`pnpm --filter @provider/web build` с недоступным `PUBLIC_API_URL`, с флагом и без). |
| W-02 | Исправлено | Во всех пяти `Dockerfile` `--no-frozen-lockfile` заменен на `--frozen-lockfile`; добавлен root `.dockerignore` (`node_modules`, `.git`, `dist`, `.astro`, `.pnpm-store` и т.д.). Подтверждено: `pnpm install --frozen-lockfile --ignore-scripts` на текущем lockfile проходит без ошибок. Полная сборка Docker-образов не проверена в эту дату — локальный Docker daemon был недоступен; рекомендуется прогнать `docker build` для всех пяти сервисов при следующем изменении lockfile. |
| W-03 | Исправлено | Все 10 tracked `apps/api/src/*.js` удалены (`git rm`). Подтверждено: node tests в `tests/*.test.cjs` импортируют исключительно `apps/api/dist/*.js`; `pnpm --filter @provider/api run build` и `tsc --noEmit` проходят чисто после удаления. |
| W-04 | Исправлено | `packages/database/generated/` (21 файл, устаревшая схема) удален целиком. Canonical клиент остается в `apps/api/generated`. Подтверждено: `pnpm db:generate` и `pnpm db:validate` проходят, grep по репозиторию не находит импортов удаленного пути. |
| W-05, W-06, `pnpm.overrides.fastify` | Без изменений | Повторная проверка подтверждает вывод аудита: это осознанные адаптации текущих версий, а не костыли. Не трогать. |
| W-07 | Исправлено (после воспроизводимой проверки) | На реальной Windows-машине с чистым Vite/Astro кэшем `noDiscovery`/`exclude`/`alias` в `apps/web`, `apps/admin`, `apps/crm` сняты. `pnpm dev:web/admin/crm` (явно на `127.0.0.1`, чтобы исключить сетевые артефакты dual-stack localhost) отдают 200 на все проверенные маршруты (`/`, `/kazan/`, `/kazan/internet/`, динамический tariff-маршрут, admin/crm `/`), без ошибок resolution в логе. Полная сборка (`pnpm -r build`) тоже чище без workaround: пропало предупреждение Vite `Cannot optimize dependency: astro > axobject-query, present in client 'optimizeDeps.include'`, которое воспроизводимо появлялось именно из-за старого `exclude`. Конфигурация упрощена до `output`/`site`/`devToolbar` без `vite.optimizeDeps`. |
| W-08 | Исправлено (код), не проверено под живой нагрузкой | `apps/api/src/main.ts` вызывает `app.enableShutdownHooks()` перед `listen()`. `services/worker/src/index.mjs` добавлен обработчик `SIGINT`/`SIGTERM`, закрывающий все три `Worker` и вызывающий `connection.quit()` перед `process.exit(0)`. `tsc --noEmit` и `node --check` проходят. Живая проверка через реальный SIGTERM с поднятыми PostgreSQL/Redis не выполнена в эту дату — Docker daemon был недоступен; выполнить при следующем доступном Docker-окружении. |

### Дополнительная находка вне исходного аудита

При проверке компилировались ли типы `apps/api/src/auth.service.ts` содержал `(this.prisma as any).session.create(...)` и `(this.prisma as any).session.findUnique(...)`, хотя модель `Session` полноценно типизирована в актуальном сгенерированном клиенте (`apps/api/generated`). Это тот же класс проблемы, что и W-04 — оставшийся мусор от рассинхронизированного клиента, не осознанное решение. `as any` убраны, клиент перегенерирован, `tsc --noEmit` компилируется чисто без них.

Другие найденные `as any` в `apps/api/src` (`public-leads.controller.ts:150,156`, `admin-cities.controller.ts:33,38,52`, `admin-token.guard.ts:36`) — не связаны с обновлением версий: это касты для Prisma JSON-полей и для расширения Fastify `request` кастомным полем `user`, распространенный TypeScript-паттерн, требующий DTO/module augmentation для устранения. Оставлены как есть — это отдельная задача по типобезопасности (соседствует с P1 "Глобальная runtime-валидация DTO" в `docs/research/2026-09-07-stack-capability-audit.md`), а не костыль переходного периода.

### Что осталось непроверенным вживую

Docker daemon был недоступен в момент исправлений, поэтому не выполнены: полная сборка всех пяти production-образов с `--frozen-lockfile` и новым `.dockerignore`, и живая проверка graceful shutdown (`docker compose up` + SIGTERM API/worker с реальными PostgreSQL/Redis). Код обеих зон (W-02, W-08) проверен статически (типы, `pnpm install --frozen-lockfile` на lockfile, компиляция) и соответствует официальным паттернам Nest/BullMQ/Docker, но не подтвержден end-to-end. Следующий шаг — прогнать `docker compose -f docker-compose.prod.yml build` и ручной SIGTERM-тест при доступном Docker.
