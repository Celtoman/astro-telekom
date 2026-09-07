# Аудит возможностей технологического стека

Дата проверки: 2026-09-07. Область: Astro 7 / Vite 8, NestJS 12 / Fastify 5, Prisma 7 / PostgreSQL 18, Redis 8 / BullMQ 6, Docker Compose и Caddy 2. Это read-only аудит исходников, lockfile и production Compose-конфигурации; он не является подтверждением работающего production-развертывания.

## Короткий вывод

Базовый выбор технологий используется осмысленно: все три Astro-приложения статические, публичный сайт генерирует SEO-маршруты и вызывает API только из браузера для интерактивных операций, а Nest API действительно запускается на Fastify, имеет глобальный префикс, CORS allow-list, авторизационный guard и жизненный цикл Prisma.

Не нужно добавлять SSR, Astro adapter, Content Layer или Fastify-схемы просто ради «использования возможностей». Для нынешней статической витрины SSR намеренно вне области. До production важнее включить отсутствующие прикладные возможности API: единообразную runtime-валидацию входящих данных, security headers, защиту публичных маршрутов от перебора/спама, структурированные request-логи, readiness и корректное завершение процесса.

## Версии и фактическая конфигурация

| Компонент | Зафиксированная версия | Подтвержденное применение | Доказательство |
|---|---:|---|---|
| Astro | 7.3.1 | `web`, `admin`, `crm`; во всех `output: 'static'` | `apps/web/package.json`, `apps/admin/package.json`, `apps/crm/package.json`; конфиги ниже |
| Vite | 8.2.2 (транзитивно через Astro, lockfile) | Настройки dependency optimizer в каждом Astro app | `apps/web/astro.config.mjs:13-25`, `apps/admin/astro.config.mjs:6`, `apps/crm/astro.config.mjs:6`, `pnpm-lock.yaml` |
| NestJS | 12.0.1 | модульный HTTP API | `apps/api/package.json:11-13`, `apps/api/src/module.ts` |
| Fastify | 5.12.3 | HTTP adapter Nest; версия закреплена workspace override | `apps/api/src/main.ts:6-9`, `pnpm-workspace.yaml:5-6` |

## Astro 7 и Vite 8

### Используется правильно

| Возможность | Статус | Доказательство и вывод |
|---|---|---|
| Статическая генерация | Подтверждено и подходит текущей витрине | Все конфиги задают `output: 'static'`: `apps/web/astro.config.mjs:7-9`, `apps/admin/astro.config.mjs:3-6`, `apps/crm/astro.config.mjs:3-6`. Astro по умолчанию пререндерит страницы, маршруты и endpoints во время build; для преимущественно неизменяемых страниц это рекомендуемый стартовый режим. [Astro: on-demand rendering](https://docs.astro.build/en/guides/on-demand-rendering/) |
| Статические динамические тарифные маршруты | Подтверждено | `apps/web/src/pages/kazan/[slug].astro:10-13` использует `getStaticPaths()`. Это корректный Astro-механизм генерации известного набора URL на build. |
| Генерация `robots.txt` и `sitemap.xml` | Подтверждено | Endpoint-файлы `apps/web/src/pages/robots.txt.ts:1-6` и `apps/web/src/pages/sitemap.xml.ts:1-18` производят статические ответы во время build. |
| Public env-переменные | Подтверждено; требуются rebuild при изменении | `PUBLIC_SITE_URL` и `PUBLIC_API_URL` используются в `apps/web/astro.config.mjs:9` и `apps/web/src/data/kazan.ts:42`; Compose передает `PUBLIC_*` как build args (`docker-compose.prod.yml:57-68`). Astro разрешает отдавать клиенту только переменные с `PUBLIC_`; это не место для секретов. В static output изменение таких значений означает новую сборку/развертывание. [Astro: environment variables](https://docs.astro.build/en/guides/environment-variables/) |
| Статический Caddy-сервер и cache headers | Подтверждено | `deploy/static.Caddyfile:3-11` включает gzip/zstd, `nosniff`, Referrer-Policy и immutable cache для assets. Это согласуется со static output. |
| Устранение конкретной Vite-resolve проблемы | Подтверждено, не удалять без регрессии | В web заданы aliases и исключения `aria-query`, `axobject-query`, `cssesc` (`apps/web/astro.config.mjs:13-24`). Это похоже на узкий workaround, а не на общую настройку производительности; требуется воспроизводимый dev-тест перед упрощением. |

### Применимо, но пока отсутствует или требует решения

| Возможность | Статус | Почему / рекомендация |
|---|---|---|
| Управляемая публикация актуальных данных в static HTML | P1: нужен процесс | Во время build `loadKazanData()` пытается получить город, тарифы и страницы из API, но при ошибке молча подставляет статичный fallback (`apps/web/src/data/kazan.ts:41-54`). Страницы и sitemap используют этот загрузчик. Значит, изменение CMS/Prisma не станет HTML до успешного rebuild; недоступность API при build способна выпустить fallback-данные. Зафиксировать release-contract: API доступен для build **или** данные сначала экспортируются в versioned artifact; build должен падать для production при неожиданном fallback, а публикация — запускать rebuild. Это не аргумент в пользу SSR. |
| Проверка `optimizeDeps` в dev | P2: исследовать перед изменением | В трех приложениях `noDiscovery: true`, а `include` пуст. По Vite это выключает автоматическое обнаружение; оптимизируются только явно перечисленные зависимости. Это допустимо как workaround, но при новом CJS-зависимом клиентском коде может потребоваться `include`. Сначала запустить чистый dev-сеанс и сохранить воспроизводимый кейс; не менять наугад. [Vite: dependency optimization options](https://vite.dev/config/dep-optimization-options), [Vite: dependency pre-bundling](https://vite.dev/guide/dep-pre-bundling.html) |
| Наблюдаемая ошибка загрузки build-данных | P2: добавить при реализации процесса публикации | Сейчас catch скрывает URL/статус/причину (`apps/web/src/data/kazan.ts:43-53`). В production build нужен понятный отказ или хотя бы структурированный отчёт: какие URL сгенерированы fallback-данными. |

### Сознательно вне области сейчас

| Возможность | Решение | Основание |
|---|---|---|
| Astro SSR / on-demand routes / Node adapter | Не добавлять сейчас | Для request-time HTML Astro требует adapter и `prerender = false` либо `output: 'server'`. Текущий Caddy отдает уже собранный static output, а пользовательские операции идут в отдельный Nest API. Добавлять второй Node server имеет смысл только при персонализированном HTML, cookie-dependent pages, server islands или server endpoints Astro. [Astro: on-demand rendering](https://docs.astro.build/en/guides/on-demand-rendering/), [Astro: deployment](https://docs.astro.build/en/guides/deploy/) |
| Astro Content Layer | Не применять к live CMS данным | Content collections полезны для versioned Markdown/данных репозитория с типизацией на build, но не заменяют Prisma/CMS для меняющихся городов, тарифов и блоков. Рассматривать только для действительно repository-managed контента. [Astro: content collections](https://docs.astro.build/en/guides/content-collections/) |
| Client framework islands | Не требуется по найденному коду | У приложений нет React/Vue/Svelte-интеграций; интерактивность реализована небольшими inline scripts. Это соответствует island-less static UI; вводить framework без UX-задачи не нужно. |

## NestJS 12 и Fastify 5

### Используется правильно

| Возможность | Статус | Доказательство и вывод |
|---|---|---|
| Fastify adapter | Подтверждено | `NestFactory.create<NestFastifyApplication>(..., new FastifyAdapter(...))` в `apps/api/src/main.ts:6-9`; лимит 35 MiB согласован с Base64 XLSX импортами. Nest поддерживает этот adapter как штатный путь для Fastify. [Nest: performance / Fastify](https://docs.nestjs.com/techniques/performance) |
| Версия Fastify закреплена | Подтверждено | `pnpm-workspace.yaml:5-6` принудительно фиксирует Fastify 5.12.3, а lockfile разрешает именно ее. Это защищает от случайного несовместимого транзитивного обновления. |
| Версионированный префикс API | Подтверждено | `app.setGlobalPrefix('api/v1')` в `apps/api/src/main.ts:11`; это упрощает дальнейшую эволюцию контрактов. |
| CORS allow-list | Подтверждено | `apps/api/src/main.ts:12-18` разбирает явный список origins и включает credentials. Через Nest/Fastify используется `@fastify/cors` из lockfile. Для браузерных admin/CRM и публичной формы это правильная основа; список следует заполнять production-origin'ами. [Nest: CORS](https://docs.nestjs.com/security/cors), [Fastify CORS](https://github.com/fastify/fastify-cors) |
| Аутентификация и role guard | Подтверждено | `AdminTokenGuard` проверяет сервисный токен либо Bearer session и роли (`apps/api/src/admin-token.guard.ts:14-38`); защищенные контроллеры применяют `@UseGuards`. Это не заменяет request validation и audit-логи. |
| Освобождение Prisma ресурсов | Подтверждено частично | `PrismaService` реализует `OnModuleInit` и `OnModuleDestroy`, подключает и закрывает Prisma/pg pool (`apps/api/src/prisma.service.ts:7-23`). |
| Liveness endpoint и Compose healthcheck | Подтверждено | `/api/v1/health` возвращает liveness (`apps/api/src/health.controller.ts:3-8`), а Compose его опрашивает (`docker-compose.prod.yml:39-43`). |

### Применимо и отсутствует: приоритетный backlog

| Приоритет | Возможность | Риск и доказательство | Безопасный следующий шаг |
|---|---|---|---|
| P1 | Глобальная runtime-валидация DTO | В контроллерах тела описаны TypeScript interfaces и ручные проверки, например `apps/api/src/public-leads.controller.ts:18-39,50+` и `apps/api/src/auth.controller.ts:8-11`; interface исчезает во время выполнения. В `apps/api/package.json:10-32` нет прямых `class-validator`/`class-transformer`, и `main.ts` не добавляет `ValidationPipe`. | В отдельной задаче ввести DTO для публичных и admin входов; включить глобальный `ValidationPipe` с `transform`, `whitelist`, `forbidNonWhitelisted` и согласованными ошибками. Сначала написать contract-тесты для текущих допустимых payload. [Nest: validation](https://docs.nestjs.com/techniques/validation) |
| P1 | Headers / CSP | В production `deploy/Caddyfile:1-15` только reverse_proxy. Headers есть лишь во внутреннем static Caddyfile, а не на edge proxy; API и HTML могут не получить единый набор security headers. В dependency list отсутствует `@fastify/helmet`. | Выбрать один владелец политики: edge Caddy либо `@fastify/helmet` с регистрацией именно Fastify plugin. Сначала собрать CSP inventory (Yandex Metrika и inline scripts), затем включить report-only/тесты. [Nest: Helmet](https://docs.nestjs.com/security/helmet), [Fastify Helmet](https://github.com/fastify/fastify-helmet) |
| P1 | Rate limit на public endpoints | Публичны как минимум `/leads`, `/address-checks`, `/auth/login`; в API нет rate-limit dependency/registration. Fastify явно оставляет rate limiting прикладным плагинам. Caddy стоит перед API (`deploy/Caddyfile:13-15`), поэтому до лимитов по IP необходимо определить доверенную цепочку proxy и тестовые ожидаемые `X-Forwarded-*`. | Сформировать policy по route/actor, затем подключить совместимый `@fastify/rate-limit` или `@nestjs/throttler`; не вводить общий лимит вслепую, чтобы не повредить импорты и операторов. [Fastify security policy](https://github.com/fastify/fastify/blob/main/SECURITY.md), [Fastify rate limit](https://github.com/fastify/fastify-rate-limit), [Fastify `trustProxy`](https://fastify.dev/docs/latest/Reference/Server/) |
| P1 | Readiness (частично закрыто 7 сентября 2026: graceful shutdown) | Текущий health ответ не проверяет PostgreSQL/Redis, хотя Compose считает его health (`apps/api/src/health.controller.ts:3-8`, `docker-compose.prod.yml:39-43`). Graceful shutdown добавлен: `main.ts` теперь вызывает `app.enableShutdownHooks()`, что задействует существующий Prisma destroy hook на SIGTERM/SIGINT — подтверждено `tsc --noEmit`, live-проверка под реальной нагрузкой не выполнена (Docker daemon был недоступен). Readiness (разделение liveness/readiness, проверка DB/Redis) остается нереализованной. | Разделить liveness и readiness; readiness проверяет DB и обязательный Redis/BullMQ. Nest Terminus дает стандартный механизм health indicators; его включение — отдельная имплементационная задача. [Nest: Terminus](https://docs.nestjs.com/recipes/terminus), [Nest: lifecycle events](https://docs.nestjs.com/fundamentals/lifecycle-events) |
| P2 | Структурированные request logs с redaction | Используются лишь локальные Nest `Logger` в сервисах; `main.ts` не задает Fastify/Nest JSON logger, request id или redaction. Fastify использует Pino и поддерживает logger configuration. | Утвердить поля и redaction policy (телефон, email, Bearer, `x-admin-token`, payload лидов), затем включить JSON logs и correlation/request id. [Fastify logging](https://fastify.dev/docs/latest/Reference/Logging/), [Nest logger](https://docs.nestjs.com/techniques/logger) |
| P2 | Явные request/response schemas для API-контрактов | Fastify умеет компилировать JSON Schema для request validation и response serialization; response schema также снижает риск случайно отдать лишние поля. Nest controller layer сейчас такой механизм не использует. | После DTO/contract-тестов решить единый источник схем: Nest DTO + OpenAPI или JSON Schema/type provider. Не дублировать обе модели без автоматической генерации. [Fastify validation and serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/) |
| P3 | OpenAPI как контракт для admin/CRM | Возможность применима, но в текущем scope не найдены `@nestjs/swagger` и опубликованная спецификация. | Добавлять после стабилизации DTO и ошибок; затем использовать спецификацию для клиентских типов и contract checks. Не приоритетнее P1. [Nest: OpenAPI introduction](https://docs.nestjs.com/openapi/introduction) |

## Prisma 7, PostgreSQL 18 и миграции

### Используется правильно

| Возможность | Статус | Доказательство и вывод |
|---|---|---|
| Один управляемый PrismaClient с PostgreSQL driver adapter | Подтверждено | `PrismaService` создает `pg.Pool`, передает его в `PrismaPg` и в единственном Nest provider открывает/закрывает Prisma и pool (`apps/api/src/prisma.service.ts:7-23`). Это соответствует модели Prisma 7 с driver adapter; не нужно создавать клиент на каждый запрос. [Prisma: PostgreSQL adapter connection pool](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool) |
| Схема и история миграций в репозитории | Подтверждено | `prisma/schema.prisma`, восемь последовательных SQL-миграций и `prisma.config.ts` задают схему, datasource и путь миграций. `pnpm db:validate` проходит. |
| Транзакции для критической записи доставки | Подтверждено | При успешной доставке `LeadDeliveryService` создает attempt и меняет статус лида внутри `prisma.$transaction` (`apps/api/src/lead-delivery.service.ts:86-91`). |

### Применимо, но отсутствует или требует решения

| Приоритет | Возможность | Риск и доказательство | Безопасный следующий шаг |
|---|---|---|---|
| P1 | Явный production-механизм миграций | API Dockerfile генерирует Prisma Client и собирает API, но не запускает `prisma migrate deploy`; в Compose нет отдельного migration job. Значит, поставка новой схемы зависит от внешней, незафиксированной операции. | Добавить идемпотентный deploy-step до запуска API и проверить на чистой и уже мигрированной БД. `migrate deploy` применяет существующие migration-файлы и предназначен для production, не заменяет проверку drift или backfill. [Prisma: production and testing environments](https://www.prisma.io/docs/orm/prisma-migrate/workflows/development-and-production) |
| P2 | Явные лимиты и таймауты `pg.Pool` | `new Pool({ connectionString })` использует драйверные defaults (`apps/api/src/prisma.service.ts:10`). Для одного прототипа это нормально, но для ограниченной production PostgreSQL нужно согласовать лимит соединений и таймауты с числом API replicas. | Сначала определить deployment capacity и лимиты PostgreSQL; затем задать и нагрузочно проверить `max`, acquire/connection и idle timeouts. Prisma отдельно документирует connection-pool настройки для `PrismaPg`. [Prisma: PostgreSQL adapter connection pool](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool) |
| P2 | Наблюдаемость запросов и миграций | В клиенте не настроены query/error logs, а в Compose нет metrics/exporter. Это не дефект для локального прототипа, но не дает диагностировать медленные запросы и исчерпание соединений. | Сначала утвердить redaction и retention policy для PII; затем добавить структурированные error/slow-query signals и внешнее наблюдение БД. |

## Redis 8 и BullMQ 6

### Используется правильно

| Возможность | Статус | Доказательство и вывод |
|---|---|---|
| Отдельный Redis-backed путь доставки лидов | Подтверждено | При `REDIS_URL` API создает `lead-deliveries` с `ioredis` и worker обрабатывает его отдельно от HTTP процесса (`apps/api/src/lead-delivery.service.ts:16-34`, `services/worker/src/index.mjs:41-53`). |
| Защита от дублей и ограниченное хранение job history | Подтверждено | `jobId` построен из лида и номера попытки, у jobs есть `removeOnComplete`/`removeOnFail: 100`; внешняя доставка использует idempotency key (`apps/api/src/lead-delivery.service.ts:35-45,60-79`). Это разумная прикладная идемпотентность. |
| Явная конкуррентность worker | Подтверждено | Worker задает `concurrency: 2`, `1` и `4` для imports, rebuild и delivery (`services/worker/src/index.mjs:18-53`). |

### Применимо, но отсутствует или требует решения

| Приоритет | Возможность | Риск и доказательство | Безопасный следующий шаг |
|---|---|---|---|
| P1 | Graceful shutdown worker — закрыто 7 сентября 2026 | `services/worker/src/index.mjs` теперь перехватывает `SIGINT`/`SIGTERM`, вызывает `worker.close()` на всех трех workers и `connection.quit()` перед выходом. `node --check` проходит; live-проверка `docker compose stop worker` с активной задачей не выполнена (Docker daemon был недоступен в момент правки). | Выполнить `docker compose stop worker` с активной задачей при следующем доступном Docker-окружении и подтвердить отсутствие stalled jobs. [BullMQ: going to production](https://docs.bullmq.io/guide/going-to-production) |
| P2 | QueueEvents и операционные метрики | Есть локальные `completed`/`failed` handlers каждого worker, но нет `QueueEvents`, хранения агрегатов или alerting. Нельзя доказать backlog, failures и latency между instances. | Добавить наблюдение после выбора monitoring backend; `QueueEvents` подходит для глобальных событий очереди. [BullMQ: workers](https://docs.bullmq.io/guide/workers) |
| P2 | Очереди import/rebuild как единый надежный путь | Worker слушает `tariff-imports` и `site-rebuilds`, но API не публикует jobs в них: rebuild по-прежнему прямой best-effort webhook (`apps/api/src/rebuild-queue.service.ts:5-14`). | После определения publish workflow выбрать один producer path и retry/backoff policy; не держать неиспользуемые очереди как видимость надежности. |

## Docker Compose и Caddy 2

### Используется правильно

| Возможность | Статус | Доказательство и вывод |
|---|---|---|
| Разделение production-контейнеров и persistent volumes | Подтверждено | Compose отделяет PostgreSQL, Redis, API, worker, три static apps и Caddy; named volumes заданы для stateful services (`docker-compose.prod.yml`). |
| Healthchecks и управляемый restart для core services | Подтверждено частично | PostgreSQL, Redis и API имеют healthchecks; API/worker ожидают health PostgreSQL/Redis, а сервисы используют `restart: unless-stopped`. Это хорошая база, но не полная readiness-модель. |
| Версионные image tags | Подтверждено | `node:22.23.2-alpine`, `postgres:18.6-alpine`, `redis:8.10.1-alpine`, `caddy:2.11.4-alpine` закреплены в Dockerfiles/Compose. |
| Static delivery | Подтверждено | `static.Caddyfile` включает gzip/zstd, immutable cache для assets, `nosniff`, Referrer-Policy и file server (`deploy/static.Caddyfile:1-13`). |

### Применимо, но отсутствует или требует решения

| Приоритет | Возможность | Риск и доказательство | Безопасный следующий шаг |
|---|---|---|---|
| P1 | Проверка готовности API для edge proxy | Edge `deploy/Caddyfile` направляет API в `api:3000`, но не настраивает active health checks; Caddy зависит от API только с условием service started (`docker-compose.prod.yml:88-111`). | После readiness endpoint добавить Caddy `health_uri` и протестировать поведение при недоступной БД/Redis. [Caddy: reverse_proxy health checks](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) |
| P2 | Контейнерное hardening и secrets | Секреты передаются через env file, финальные Node images не задают non-root user, а Compose не задает read-only filesystem, capability drop или resource limits. Эти настройки требуют проверки writable paths и способа доставки секретов. | Отдельно определить threat model и runtime; затем перенести чувствительные значения в Docker secrets/внешний secret store и вводить hardening по сервису. [Docker Compose services reference](https://docs.docker.com/reference/compose-file/services/) |
| P2 | Immutable image digests | Версионный tag удобен, но tag может быть переопубликован. Digest криптографически закрепляет точный образ. | В production lock policy указывать `image: name:version@sha256:...`, а обновления digest выпускать отдельным reviewable change. [Docker: image digests](https://docs.docker.com/dhi/core-concepts/digests/) |
| P2 | Access logs и метрики edge | В Caddyfile нет явного `log` и metrics configuration; диагностика реального HTTP трафика и backend failures внешне не доказана. | Выбрать место хранения/PII-redaction, затем включить структурированные access logs; metrics endpoint не публиковать наружу без network policy. [Caddy: metrics](https://caddyserver.com/docs/metrics) |

## Порядок реализации

1. **P1, сначала contracts:** инвентаризировать public/admin payloads, зафиксировать допустимые/недопустимые запросы тестами, затем внедрить DTO + global ValidationPipe.
2. **P1, edge/API security:** определить владельца headers и CSP, задокументировать trusted proxy; только после этого добавить Helmet и route-specific rate limits.
3. **P1, эксплуатация:** graceful shutdown API/worker сделан 7 сентября 2026 (код проверен статически, live SIGTERM-тест в Compose еще предстоит). Открыто: readiness DB/Redis, миграционный deploy-step.
4. **P2:** JSON request logs/redaction/correlation id, далее response schemas и OpenAPI.
5. **P2, static delivery:** сделано 7 сентября 2026 — production build `apps/web` теперь падает при недоступном API, демо-данные только за `ALLOW_DEMO_DATA=true`; trigger rebuild после публикации данных остается открытым (TD-05).
6. **P2:** выбрать мониторинг очередей/БД/edge, затем добавить QueueEvents, Caddy logs/metrics, image digests и контейнерное hardening.
7. **P3:** повторно проверить Vite optimizer workaround на чистом dev-сеансе; не менять `noDiscovery` без воспроизводимого выигрыша или дефекта.

## Методика и границы уверенности

- Версии и пути подтверждены текущими `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` и исходниками; production URL и реальные edge headers не запрашивались.
- Возможности фреймворков сверены через Context7 с официальными источниками Astro, NestJS и Fastify; ссылки в таблицах ведут на первичную документацию или официальные репозитории.
- «Отсутствует» означает «не найдено в просмотренных runtime-конфигурациях и прямых зависимостях», а не доказательство отсутствия на внешней платформе. В частности, внешние WAF/CDN правила и Docker runtime-настройки этим аудитом не проверялись.
