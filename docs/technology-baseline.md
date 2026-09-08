# Технологическая база

Последняя сверка с `package.json`, `pnpm-lock.yaml`, Dockerfiles, Compose и GitHub Actions: 8 сентября 2026 года.

## Зафиксированные версии

| Технология | Версия в проекте | Использование |
| --- | --- | --- |
| Node.js | 22.23.2 в Dockerfiles и локальной проверке | API, worker, Astro build, Prisma CLI. |
| pnpm | 11.19.0 | package manager, указан в root `packageManager`. |
| TypeScript | 6.0.3 | API и web; API не повышается до TypeScript 7, пока Nest CLI требует Compiler API. |
| Astro | 7.3.1 | Static web, admin и CRM. |
| React | 19.2.8 | Интерактивные страницы admin как React-roots внутри Astro. |
| Tailwind CSS | 4.3.3 | Стили shadcn/ui в admin. |
| Vite | 8 через Astro | Сборка Astro-приложений. |
| NestJS | 12.0.1 | HTTP API. |
| Fastify | 5.12.3 через adapter NestJS 12 и корневой `overrides` в `pnpm-workspace.yaml` | HTTP transport API, body limit 35 MB. |
| PostgreSQL | 18.6-alpine | Основное persistent store. |
| Prisma | 7.10.0 | Схема, миграции и `@prisma/adapter-pg`. |
| pg | 8.23.0 | Pool для Prisma PostgreSQL driver adapter. |
| Redis | 8.10.1-alpine | Backend очередей. |
| BullMQ | 6.3.4 | Очереди доставки лидов и пересборки сайта; import listener пока без producer. |
| ioredis | 6.0.0 | Redis connections для API и worker. |
| xlsx | 0.18.5 | Разбор первого листа XLS/XLSX в API. |
| Tabler Icons Webfont | 3.46.0 | Пиктограммы admin и CRM. |
| Caddy | 2.11.4-alpine | Reverse proxy и static file server. |

Диапазоны с `^` в manifests разрешаются lockfile при локальной установке. Production Dockerfiles применяют `pnpm install --frozen-lockfile` вместе с root `.dockerignore`, исключающим `node_modules`, `.git` и build-артефакты из build context.

## Принципы использования стека

### Astro

Все три Astro-приложения имеют `output: 'static'`. Public web использует `PUBLIC_SITE_URL` как `site`, выводит title, description, canonical и базовый JSON-LD `WebPage` в исходный HTML. JavaScript оставлен для формы адреса, хранения списка просмотренных страниц, подавления номера для действующего абонента и событий Метрики.

Static mode означает, что API-данные читаются только при `astro build`. Для этого прототипа допустима локальная витрина с fallback, но production не должен собираться из fallback-данных.

### NestJS и Fastify

API имеет глобальный prefix `/api/v1`, включенный CORS из `CORS_ORIGINS` или `PUBLIC_SITE_URL`, и Fastify body limit 35 MB для импорта. Он не использует глобальный `ValidationPipe`; body-интерфейсы TypeScript не становятся runtime-валидацией. Для production DTO validation и rate limiting обязательны.

### Prisma и PostgreSQL

Datasource URL описан в `prisma.config.ts`, клиент генерируется в `apps/api/generated`. `PrismaService` использует `PrismaPg` поверх `pg.Pool`. В репозитории десять последовательных миграций; последняя добавляет persistent rebuild-job со статусом, ревизиями, попытками и результатом deployment provider.

### Redis и BullMQ

API создает `lead-deliveries` и `site-rebuilds` при наличии `REDIS_URL`. Без Redis lead delivery использует process-local fallback, а rebuild остается в PostgreSQL как `PENDING` и восстанавливается при следующем запуске API с Redis. Worker всегда подключается к Redis; production требует Redis и отдельный worker.

### Docker и Caddy

`docker-compose.yml` поднимает только PostgreSQL и Redis для разработки. `docker-compose.prod.yml` описывает PostgreSQL, Redis, API, worker, web, admin, CRM и Caddy. Caddy направляет четыре домена на соответствующие контейнеры; отдельный `static.Caddyfile` обслуживает собранные Astro файлы и кэширует assets.

Контейнерная схема конфигурационно валидна (`docker compose -f docker-compose.prod.yml config --no-interpolate`), но не была поднята с реальными доменами, секретами и интеграциями. Это не production certification.

## Неподключенные или ограниченные возможности

| Возможность | Текущее решение |
| --- | --- |
| Astro SSR, route caching, CDN adapter | Не используются. |
| React UI layer | Используется в новых admin routes; legacy admin index, web и CRM пока остаются Astro pages с inline browser JavaScript. |
| Schema.org-спецификация Product/FAQ/Organization | Не реализована; выводится только `WebPage`. |
| Queue для import | Worker слушает `tariff-imports`, но API не публикует jobs: validate/apply выполняются напрямую. |
| Monitoring, tracing, error tracker | Не подключены. |
| CI/CD | `.github/workflows/ci.yml` запускает `pnpm check` на push и pull request в `master`. Автоматического deployment-пайплайна нет; `.github/workflows/release.yml` только создаёт GitHub Release после push тега `v*`. |

Переходить на другие major-версии или включать экспериментальные возможности Astro/Nest/Prisma можно только с отдельной проверкой compatibility, migration plan и rollback.
