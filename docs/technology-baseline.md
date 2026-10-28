# Технологическая база

Последняя сверка с manifests, Dockerfiles, Compose и migrations: 6 октября 2026 года. Доказательства внешних rollout — в [research/README.md](research/README.md); ограничения запуска — в [current-state.md](current-state.md).

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
| NestJS | 12.1.2 (manifest `^12.0.3`, resolved lockfile) | HTTP API. |
| Fastify | 5.12.5 через adapter NestJS 12 и корневой `overrides` в `pnpm-workspace.yaml` | HTTP transport API, body limit 35 MB. |
| @fastify/rate-limit | 11.2.0 | Redis-backed IP rate limiting login, public writes и остальных routes. |
| class-validator / class-transformer | 0.15.1 / 0.5.1 | Runtime DTO validation и transform в NestJS. |
| PostgreSQL | 18.6-alpine | Основное persistent store. |
| Prisma | 7.10.0 | Схема, миграции и `@prisma/adapter-pg`. |
| pg | 8.23.1 (resolved lockfile) | Pool для Prisma PostgreSQL driver adapter. |
| Redis | 8.10.1-alpine | Backend очередей. |
| BullMQ | 6.3.4 | Очереди доставки лидов и пересборки сайта; import listener пока без producer. |
| ioredis | 6.0.0 | Redis connections для API и worker. |
| read-excel-file | 9.3.4 | Безопасный разбор первого листа XLSX в API; лимиты 25 МБ, 10 000 строк и 256 столбцов. |
| Tabler Icons Webfont | 3.46.0 | Пиктограммы admin. |
| Caddy | 2.11.4-alpine | Reverse proxy и static file server. |

Диапазоны с `^` в manifests разрешаются lockfile при локальной установке. Production Dockerfiles применяют `pnpm install --frozen-lockfile --trust-lockfile` через единый bounded retry wrapper вместе с root `.dockerignore`, исключающим `node_modules`, `.git` и build-артефакты из build context. `--trust-lockfile` ограничен Docker-сборкой из прошедшего CI `master`: обычный CI/local install сохраняет полную supply-chain проверку, а production не повторяет сетевой проход по каждой из 1112 lockfile-записей в каждом target. Root/workspace manifests, lockfile и retry-script копируются до install отдельным кешируемым слоем, все install stages разделяют BuildKit cache mount `pnpm-store`, а исходники копируются после: изменение исходника, Caddy или документации не переустанавливает зависимости; transient failure повторяет install в уже заполненном store; изменение любого manifest/lockfile корректно инвалидирует слой. API build/runtime, web, admin и worker фильтруют install по нужным workspace, migration target переиспользует API build dependencies; worker копирует только собственный source tree.

## Принципы использования стека

### Astro

Оба Astro-приложения имеют `output: 'static'`. Public web использует проверенный `PUBLIC_SITE_URL` как `site`, `PUBLIC_SITE_SLUG` — для выбора сайта, server-only `SITE_DATA_API_URL` — для чтения build-time каталога и нормализованный `PUBLIC_API_URL` — для browser-форм; если отдельный build-time URL не задан, сохраняется совместимый fallback на публичный. Production принимает только чистый HTTPS site origin и внешний HTTPS browser API с path `/api/v1`; loopback разрешен лишь при явном `ALLOW_DEMO_DATA=true`. Static paths ограничены Release 1 inventory `N + T + 6`: корень и пять global pages заданы явными Astro routes, `[city]/index` строится для каждого опубликованного города, а `[city]/[slug]` — только для каждого опубликованного тарифа опубликованного города. Service detail и остальные Page не получают URL первого релиза. Title, description, canonical от `Astro.site` и базовый JSON-LD `WebPage` выводятся в исходный HTML; служебная 404 получает `noindex` без canonical. JavaScript оставлен для формы адреса, хранения списка просмотренных страниц, subscriber mode и событий Метрики.

Static mode означает, что контентные API-данные, authoritative `routes`, sitemap exclusions и redirect source paths читаются при `astro build`. Web повторно сверяет точный inventory, формирует sitemap index и отдельные карты pages/cities/tariffs и допускает redirect только к тому же набору URL. Контент становится HTML, а redirects — валидируемым `redirects.caddy`, который container image переносит из публичного `/srv` в `/etc/caddy`; совпавший runtime-запрос обращается к API только для живой проверки правила, учета перехода и HTTP 301. Затем обязательный Node verifier проверяет индекс и дочерние sitemap, каждый заявленный URL, raw metadata/H1 всех публичных HTML, robots, loopback-утечки, production origin и 404. Для прототипа допустим fallback только при явном demo-флаге; production не собирается без пяти опубликованных global pages.

### NestJS и Fastify

API имеет глобальный prefix `/api/v1`, включенный CORS из `CORS_ORIGINS` или `PUBLIC_SITE_URL`, Fastify body limit 35 MB для импорта, глобальный строгий `ValidationPipe` и `@fastify/rate-limit`. Class-based DTO сейчас покрывают наиболее атакуемые login/public write endpoints; admin CRUD с interface-body продолжает собственную ручную валидацию и должен мигрировать отдельно. При `REDIS_URL` лимиты разделяются между экземплярами API через Redis и fail closed при ошибке backend; без Redis локальная разработка использует in-memory store. Production Compose включает доверие proxy headers только для API за Caddy. Глобальные телефоны подключения и техподдержки хранятся в `Site`, изменяются через revision-aware admin API и обязательны для публикации сайта.

### Prisma и PostgreSQL

Datasource URL описан в `prisma.config.ts`, клиент генерируется только в `apps/api/generated`. `PrismaService` использует `PrismaPg` поверх `pg.Pool`. Seed также принадлежит API (`apps/api/src/seed.ts`), а database package сохраняет совместимую команду-делегат. Seed соответствует текущей schema; свежий PostgreSQL 18 rehearsal подтверждает атомарный bootstrap, publication preflight и точную идемпотентность (#240). Локальная seed-команда сначала выполняет штатную API-сборку, затем загружает корневой `.env` через Node `--env-file` и запускает CommonJS `apps/api/dist/seed.js`; production runtime выполняет тот же собранный entrypoint с окружением Compose. В текущем дереве 57 последовательных миграций от `0001_initial` до `0058_home_composition_tariff_collection`; применение предыдущего SEO head `0048` подтверждено через live admin API, а `0049` подтверждена успешным one-shot `migrate` в deployment `k1osuggjvvr9qpx8cyv68lnk`; `0050` проверена на изолированном PostgreSQL 18 и развернута через успешный one-shot `migrate` в Coolify deployment `tuszecyovtkywimzjebxajwo` exact-SHA `71fac3e5cee30906bc4e1171d7244cc6feb4d657`. `0021`–`0026` вводят site-global scope и каркас Release 1, `0027`–`0031` — рабочие ревизии, неизменяемые publication snapshots, before/after audit, безопасный import undo, корзину блоков и расписание публикаций. `0032`–`0036` нормализуют HOME, sitemap exclusions, Site и City, `0037`–`0041` закрепляют business identity тарифа, lifecycle, revision repair, согласие и комплектацию лида, `0042`–`0044` добавляют delivery uncertainty, причину и комментарий, `0045` — nullable phone evidence и статусы фонового решения, `0046` — историю решений и номер активной попытки, `0047` — типизированные SEO-шаблоны с аддитивным backfill, `0048` — nullable OG-поля, `0049` — маркеры неопределенного исхода API-доставки, `0050` — отчёт preflight-публикации, `0051` — nullable снимок атрибуции заявки, `0052`/`0053` — типизированный PageTemplate и fail-closed перенос городских HOME к одному шаблону, `0054` — fail-closed удаление пустых legacy SEO JSON-полей (test-deployment `an9luoln52zeadmoymlwrrle` завершился exact-SHA `9709c6f0c40f5099ca0c05f15774b942c2e0c526`; API после обязательного one-shot `migrate` здоров, прямой SQL-аудит отдельно не проводился), `0055` — действие аудита `PURGE` и FK `Lead.tariffId ON DELETE RESTRICT` для проверенной очистки архивных тарифов (локальный PostgreSQL 18 rehearsal и test-deployment `yyvf3pqlvc1hgfpows9fqs9t` exact-SHA `3611b5f56c280a06056dbd8d5df9eb016bcd6522`; прямой SQL-аудит миграции не проводился). `0056` добавляет редактируемый контент первых экранов, а `0057` удаляет расписание публикаций с сохранением истории; все 58 миграций применены в изолированном PostgreSQL 18 rehearsal, на внешнем exact SHA `d440ec4` one-shot migrate успешно завершился до здорового API, удалённые schedule routes вернули 404; прямой SQL-аудит migrations не проводился. См. [приёмку 6 октября](research/2026-10-06-manual-publication-rollout.md). На live Site уже существовала совместимая publication ревизии 5, поэтому `0039` отработала как no-op без нового audit event; #202 закрыта после CI, rollout и live smoke.

### Redis и BullMQ

API создает `lead-decisions`, `lead-deliveries` и `site-rebuilds` при наличии `REDIS_URL`. Worker владеет очередью `maintenance`: постоянный минутный scheduler восстанавливает незавершённые решения по заявкам через worker-only API; при валидном `PII_RETENTION_DAYS` второй scheduler ежедневно ставит bounded PII purge. Без Redis lead decision/delivery используют process-local fallback, rebuild остаётся в PostgreSQL как `PENDING`. Production требует Redis и отдельный worker. Публикации запускаются только вручную; legacy scheduler удаляется worker при обновлении.

В Coolify API/worker закреплены на `REBUILD_PROVIDER=static` и private controller: CMS строит immutable snapshot и активирует Caddy без redeploy. CODE автоматически проверяет exact finished deployment и сохраняет serving snapshot; progress и recovery описаны в [publication.md](publication.md). Альтернативный rebuild provider выбирается через `REBUILD_PROVIDER`. Режим `webhook` сохраняет прежний синхронный контракт; `coolify` использует HTTPS API token/resource UUID, сохраняет полученный deployment UUID в PostgreSQL и выполняет bounded polling статусов. Повтор BullMQ продолжает уже сохраненный `queued`/`in_progress` deployment, а не запускает второй. Live Coolify API подтвержден polling rehearsal до `finished`; issue [#57](https://github.com/Celtoman/astro-telekom/issues/57) закрыта.

### Docker и Caddy

`docker-compose.yml` поднимает только PostgreSQL и Redis для разработки. Прямой `docker-compose.prod.yml` описывает PostgreSQL, Redis, one-shot Prisma migrate, API, worker, web, admin и внешний Caddy. Целевой `docker-compose.coolify.yml` отдает edge routing/TLS Coolify, не публикует host ports и оставляет API внутри stack network; web/admin Caddy проксируют same-origin `/api/*`. Coolify runtime-цепочка `migrate → api → bootstrap-seed → web` запускает постоянный Node controller/builder и Caddy на прежнем publication volume, а Basic Auth middleware навешивается на оба публичных сервиса. One-shot services явно исключены из Coolify health-оценки; API проверяет DB/Redis readiness, worker — Redis PING, web/admin — локальный Caddy. API/seed разделяют filtered production runtime image, оба migration service используют отдельный target `migration` с Prisma CLI `apps/api/node_modules/prisma/build/index.js`; publication runtime и worker устанавливают workspace-зависимости. Direct migration packaging (#236) проверен через resolved Compose на отдельной PostgreSQL 18: все миграции применяются, повтор не меняет историю. Команда проверки — `node scripts/rehearse-direct-migration.mjs`; она не разворачивает полный direct web stack. Все Compose-файлы монтируют PostgreSQL 18 volume в `/var/lib/postgresql` — корневой layout, обязательный для major-specific data directory PG18.

Обе контейнерные схемы конфигурационно валидны через `docker compose ... config --no-interpolate`; Caddy-конфигурации проходят `caddy validate`. Coolify-вариант локально покрыт тестом порядка, health policy, workspace-filtered images, shared API/seed image, same-origin API, runtime-only API token и отсутствия открытого Basic Auth credential. На Coolify v4.3.18 подтверждены DNS/TLS, volumes, migrations, one-shot lifecycle, `running:healthy` без рестартов и парольная граница web/admin; это test deployment, не production certification.

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

## Первые экраны: миграция 0056

`0056_first_screen_content` добавляет общий HOME с `home.hero` и дополняет существующий CITY_HOME утверждёнными полями. Она сохраняет городской заголовок и описание, остальные блоки, прежние опубликованные снимки; повышает рабочую ревизию сайта один раз и записывает before/after аудит каждого шаблона. Неизвестная композиция HOME или отсутствие единственного городского Hero останавливает транзакцию. Повторное выполнение сохраняет последующие редакционные изменения. Проверка `node scripts/rehearse-first-screen-content.mjs` использует изолированный PostgreSQL 18; результат внешнего применения фиксируется отдельно в #193. После штатного one-shot migrate нужны read-only проверки двух редакторов, их ревизий и preview. Публикация рабочего контента выполняется отдельно.

## Security dependency baseline

На 6 октября после #258 `pnpm audit --json` возвращает ноль advisory entries (раньше 31: 15 high, 15 moderate, 1 low). NestJS/Fastify обновлены в существующих major; lodash, fast-uri, ip-address, brace-expansion, devalue, http-cache-semantics, smol-toml и source-map-js закреплены overrides с ограничением диапазона. Prisma остаётся 7.10.0; mysql2 обновлён только в CLI-графе, deepmerge-ts 8.0.0 — только под `@prisma/config`. Его совместимость с plain-object Prisma config и реальными migrate/generate проверяется отдельно. Регрессии проверяют absolute request target у Nest middleware и циклический граф deepmerge. Собственная классификация rate-limit для absolute target остаётся отдельным открытым [#259](https://github.com/Celtoman/astro-telekom/issues/259). Новые advisory проверяются при каждом изменении зависимостей.

В рабочем дереве на 28 октября находятся 62 миграции до `0062_city_home_composition`. Новая0062 готовит рабочую CITY_HOME из десяти блоков и общий источник фактов/графиков/футера, сохраняя Hero, каталог и immutable publications. Предыдущая0061 ввела независимую полную HOME; её внешняя приёмка датирована16 октября в current-state.md. Применение0062 во внешнем test-контуре по текущей задаче пока не выполнялось.


## CITY_HOME 3: локальная миграция 0062

Миграция `0062_city_home_composition` обновляет рабочий CITY_HOME до десяти фиксированных блоков. Сохраняет ID/контент Hero и каталога, скрытые исторические блоки, чужие providers и immutable SitePublication; добавляет централизованные графики/факты/футер, перенося четыре владельческих факта HOME. Рабочая ревизия повышается один раз. Изолированный PostgreSQL rehearsal проверяет повтор, атомарный rollback и optimistic concurrency. Live seed не запускается. Применение миграции и активация нового снимка в защищённом test-контуре по этой задаче пока не выполнены; локальные проверки не являются внешней приёмкой.

Новая публикация CITY_HOME 3 блокируется при отсутствии опубликованного тарифа у любого опубликованного города. Исторические v2 snapshots сохраняют совместимость кода; route inventory остаётся N + T + 6, новые публичные URL не добавляются. [Полный контракт](plans/2026-10-28-city-home-contract.md).
