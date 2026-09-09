# Технологическая база

Последняя сверка с `package.json`, `pnpm-lock.yaml`, Dockerfiles, Compose и GitHub Actions: 9 сентября 2026 года.

## Зафиксированные версии

| Технология | Версия в проекте | Использование |
| --- | --- | --- |
| Node.js | 22.23.2 в Dockerfiles и локальной проверке | API, worker, Astro build, Prisma CLI. |
| pnpm | 11.19.0 | package manager, указан в root `packageManager`. |
| TypeScript | 6.0.3 | API и web; API не повышается до TypeScript 7, пока Nest CLI требует Compiler API. |
| Astro | 7.3.1 | Static web и admin. |
| React | 19.2.8 | Интерактивные страницы admin как React-roots внутри Astro. |
| Tailwind CSS | 4.3.3 | Стили shadcn/ui в admin. |
| Vite | 8 через Astro | Сборка Astro-приложений. |
| NestJS | 12.0.1 | HTTP API. |
| Fastify | 5.12.3 через adapter NestJS 12 и корневой `overrides` в `pnpm-workspace.yaml` | HTTP transport API, body limit 35 MB. |
| @fastify/rate-limit | 11.2.0 | Redis-backed IP rate limiting login, public writes и остальных routes. |
| class-validator / class-transformer | 0.15.1 / 0.5.1 | Runtime DTO validation и transform в NestJS. |
| PostgreSQL | 18.6-alpine | Основное persistent store. |
| Prisma | 7.10.0 | Схема, миграции и `@prisma/adapter-pg`. |
| pg | 8.23.0 | Pool для Prisma PostgreSQL driver adapter. |
| Redis | 8.10.1-alpine | Backend очередей. |
| BullMQ | 6.3.4 | Очереди доставки лидов и пересборки сайта; import listener пока без producer. |
| ioredis | 6.0.0 | Redis connections для API и worker. |
| read-excel-file | 9.3.4 | Безопасный разбор первого листа XLSX в API; лимиты 25 МБ, 10 000 строк и 256 столбцов. |
| Tabler Icons Webfont | 3.46.0 | Пиктограммы admin. |
| Caddy | 2.11.4-alpine | Reverse proxy и static file server. |

Диапазоны с `^` в manifests разрешаются lockfile при локальной установке. Production Dockerfiles применяют `pnpm install --frozen-lockfile` вместе с root `.dockerignore`, исключающим `node_modules`, `.git` и build-артефакты из build context.

## Принципы использования стека

### Astro

Оба Astro-приложения имеют `output: 'static'`. Public web использует проверенный `PUBLIC_SITE_URL` как `site`, `PUBLIC_SITE_SLUG` — для выбора сайта, server-only `SITE_DATA_API_URL` — для чтения build-time каталога и нормализованный `PUBLIC_API_URL` — для browser-форм; если отдельный build-time URL не задан, сохраняется совместимый fallback на публичный. Production принимает только чистый HTTPS site origin и внешний HTTPS browser API с path `/api/v1`; loopback разрешен лишь при явном `ALLOW_DEMO_DATA=true`. Dynamic static paths строятся только для опубликованных городов, страниц и тарифов. Title, description, canonical от `Astro.site` и базовый JSON-LD `WebPage` выводятся в исходный HTML; служебная 404 получает `noindex` без canonical. JavaScript оставлен для формы адреса, хранения списка просмотренных страниц, подавления номера для действующего абонента и событий Метрики.

Static mode означает, что контентные API-данные и список опубликованных redirect source paths читаются при `astro build`. Контент становится HTML, а redirects — валидируемым `redirects.caddy`, который container image переносит из публичного `/srv` в `/etc/caddy`; совпавший runtime-запрос обращается к API только для проверки правила, учета перехода и HTTP 301. Затем обязательный Node verifier проверяет соответствие sitemap и indexable `*/index.html`, отклоняет неизвестный плоский HTML и проверяет raw metadata/H1, robots без глобального запрета индексации, loopback-утечки, production origin и 404. Для этого прототипа допустима локальная витрина с fallback только при явном demo-флаге; production не собирается из fallback-данных или с локальным origin.

### NestJS и Fastify

API имеет глобальный prefix `/api/v1`, включенный CORS из `CORS_ORIGINS` или `PUBLIC_SITE_URL`, Fastify body limit 35 MB для импорта, глобальный строгий `ValidationPipe` и `@fastify/rate-limit`. Class-based DTO сейчас покрывают наиболее атакуемые login/public write endpoints; admin CRUD с interface-body продолжает собственную ручную валидацию и должен мигрировать отдельно. При `REDIS_URL` лимиты разделяются между экземплярами API через Redis и fail closed при ошибке backend; без Redis локальная разработка использует in-memory store. Production Compose включает доверие proxy headers только для API за Caddy.

### Prisma и PostgreSQL

Datasource URL описан в `prisma.config.ts`, клиент генерируется в `apps/api/generated`. `PrismaService` использует `PrismaPg` поверх `pg.Pool`. Seed также принадлежит API (`apps/api/src/seed.ts`), а database package сохраняет совместимую команду-делегат. В runtime image seed запускается как `/app/dist/seed.js`, поэтому использует тот же generated client и зависимости, что API. В репозитории 12 последовательных миграций; `0011_single_admin_access` удаляет ролевую модель админки, а `0012_pii_retention_indexes` добавляет индексы для bounded retention queries.

### Redis и BullMQ

API создает `lead-deliveries` и `site-rebuilds` при наличии `REDIS_URL`. Worker также владеет очередью `maintenance`: при валидном `PII_RETENTION_DAYS` BullMQ Job Scheduler ежедневно ставит worker-only PII purge, который через API удаляет bounded batches. Без Redis lead delivery использует process-local fallback, а rebuild остается в PostgreSQL как `PENDING` и восстанавливается при следующем запуске API с Redis; retention scheduler без worker/Redis не выполняется. Production требует Redis и отдельный worker.

### Docker и Caddy

`docker-compose.yml` поднимает только PostgreSQL и Redis для разработки. Прямой `docker-compose.prod.yml` описывает PostgreSQL, Redis, one-shot Prisma migrate, API, worker, web, admin и внешний Caddy. Целевой `docker-compose.coolify.yml` отдает edge routing/TLS Coolify, не публикует host ports и оставляет API внутри stack network; web/admin Caddy проксируют same-origin `/api/*`. Coolify runtime-цепочка `migrate → api → bootstrap-seed → web-publish → web` собирает static output после готовности каталога, а Basic Auth middleware навешивается на оба публичных сервиса. Все Compose-файлы монтируют PostgreSQL 18 volume в `/var/lib/postgresql` — корневой layout, обязательный для major-specific data directory PG18.

Обе контейнерные схемы конфигурационно валидны через `docker compose ... config --no-interpolate`; Caddy-конфигурации проходят `caddy validate`. Coolify-вариант локально покрыт тестом порядка, same-origin API и отсутствия открытого Basic Auth credential, но еще не поднят с реальными DNS, TLS, volume и secrets. Поэтому #55/#56 остаются открытыми до живого rehearsal; это не production certification.

## Неподключенные или ограниченные возможности

| Возможность | Текущее решение |
| --- | --- |
| Astro SSR, route caching, CDN adapter | Не используются. |
| React UI layer | Используется в admin login, защищенном shell, тарифах, городах, заявках, редиректах и fallback route; public web остается Astro pages с точечной клиентской интерактивностью. |
| Schema.org-спецификация Product/FAQ/Organization | Не реализована; выводится только `WebPage`. |
| Queue для import | Worker слушает `tariff-imports`, но API не публикует jobs: validate/apply выполняются напрямую. |
| Monitoring, tracing, error tracker | Не подключены. |
| CI/CD | `.github/workflows/ci.yml` запускает `pnpm check` на push и pull request в `master`; JavaScript actions используют Node 24 majors (`actions/checkout@v7`, `actions/setup-node@v7`, `pnpm/action-setup@v6`). Автоматического deployment-пайплайна нет; `.github/workflows/release.yml` только создаёт GitHub Release после push тега `v*`. |

Переходить на другие major-версии или включать экспериментальные возможности Astro/Nest/Prisma можно только с отдельной проверкой compatibility, migration plan и rollback.
