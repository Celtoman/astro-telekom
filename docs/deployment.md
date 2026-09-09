# Развертывание и эксплуатационный контур

Этот документ описывает текущую Compose-конфигурацию и согласованный целевой контур Coolify. Первые внешние deployment attempts подтвердили image build, persistent PostgreSQL и применение migrations, но полный rehearsal пока не завершен; инструкция не является подтверждением готового боевого контура. Повторный запуск выполняется из GitHub через Coolify на купленном тестовом домене `tv-internet-dom.ru`, без дополнительного `stage`-контура.

Подробная пошаговая настройка интерфейса, DNS, GitHub App, переменных, Basic Auth, smoke tests и отката сверена с актуальным Coolify v4.3.18 и вынесена в [исследование первого развертывания](research/2026-09-09-coolify-deployment.md).

Отдельный CRM-frontend удален 9 сентября 2026 года после переноса журнала заявок в `/leads` `apps/admin`. API routes пока сохраняют префикс `/crm/leads` как внутреннее имя контракта; отдельного домена или сервиса для них нет.

## Контуры

| Контур | Команда | Состав |
| --- | --- | --- |
| Локальная инфраструктура | `docker compose up -d postgres redis` | Только PostgreSQL и Redis с опубликованными портами 5432/6379. |
| Локальные приложения | pnpm-команды из README | API, web, admin, worker в процессах хоста. |
| Production-like, текущая локальная проверка | `docker compose -f docker-compose.prod.yml up -d --build` | Повторное развертывание при уже доступном `SITE_DATA_API_URL`: PostgreSQL, Redis, one-shot Prisma migrate, API, worker, web, admin, внешний Caddy. |
| Coolify test, целевой внешний контур | Git-based Docker Compose resource из GitHub, файл `docker-compose.coolify.yml` | `tv-internet-dom.ru` и `admin.tv-internet-dom.ru` без дополнительного stage-контура; API внутренний, web/admin routes закрыты общим Basic Auth middleware. Image build и migrations проверены внешними попытками; исправленный API runtime image подтвержден локальным Docker smoke, полный domain/password rehearsal еще не завершен — [#55](https://github.com/Celtoman/astro-telekom/issues/55), [#56](https://github.com/Celtoman/astro-telekom/issues/56). |

PostgreSQL 18 хранит major-specific data directory внутри volume, смонтированного в `/var/lib/postgresql`. Не возвращать старый mount `/var/lib/postgresql/data`: официальный PG18 image отказывается запускаться с таким layout.

## Обязательная подготовка

1. Скопировать `.env.example` в `.env` и заменить все placeholders секретов и доменов.
2. Задать `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `DATABASE_URL` с host `postgres` для контейнерного API.
3. Для direct Compose задать `PUBLIC_DOMAIN`, `ADMIN_DOMAIN`, `API_DOMAIN` и `SITE_DATA_API_URL`, доступный из Docker builder. Для Coolify задать `PUBLIC_DOMAIN=tv-internet-dom.ru`, `ADMIN_DOMAIN=admin.tv-internet-dom.ru`; `SITE_DATA_API_URL=http://api:3000/api/v1` и browser API URLs формируются самим Compose. API не получает внешний домен.
4. Задать случайные непустые `ADMIN_API_TOKEN`, `SUBSCRIBER_COOKIE_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
5. Проверить rate-limit policy: `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_LOGIN_MAX`, `RATE_LIMIT_PUBLIC_WRITE_MAX`, `RATE_LIMIT_DEFAULT_MAX`. Production Compose принудительно задает API `TRUST_PROXY=true`, потому что API не публикует порт и получает внешний трафик только от Caddy; при прямой публикации API доверие proxy headers нужно пересмотреть.
6. Юридически утвердить срок хранения сырых заявок и задать его целым числом дней в `PII_RETENTION_DAYS` (1–3650). Код не содержит придуманного default; без policy scheduler отключен и readiness заблокирован. При необходимости настроить размер batch и UTC cron отдельно.
7. До включения заявок подтвердить договоры и задать coverage, contract, Tarifnik, email и rebuild variables. Проверить защищенный `/api/v1/admin/readiness`: `status` должен быть `configured`. Это подтверждает только наличие конфигурации — затем обязательны sandbox-вызовы и согласованные legal/SLA decisions.
8. Направить DNS A/AAAA для `tv-internet-dom.ru` и `admin.tv-internet-dom.ru` на Coolify-сервер; 80/443 должны быть доступны Coolify edge proxy.
9. Сгенерировать bcrypt credential строкой `htpasswd -nbB <username> <password>` и сохранить результат только в Coolify как `TEST_BASIC_AUTH_USERS`. Поле отметить `Literal` **и** включить `Escape special characters in labels`, чтобы символы `$` хэша не интерполировались. Открытый пароль и готовый credential не коммитить.
10. Явно задать `RUN_BOOTSTRAP_SEED=true` для первого запуска; после успешного seed и публикации изменить на `false` до следующего deploy.

## Настройка Coolify

1. Создать Git-based application из приватного GitHub-репозитория через GitHub App или Deploy Key.
2. Выбрать build pack `Docker Compose`, base directory `/`, Compose location `/docker-compose.coolify.yml`; Raw Compose не включать.
3. В карточке сервиса `web` назначить домен `https://tv-internet-dom.ru`, в `admin` — `https://admin.tv-internet-dom.ru`. Оба контейнера слушают внутренний порт 80, поэтому в актуальном Coolify суффикс порта не нужен.
4. Заполнить обязательные environment values. `TEST_BASIC_AUTH_USERS` хранить как runtime literal; пароль не является build variable. Для первого deploy включить `RUN_BOOTSTRAP_SEED=true`.
5. Для пересборок задать `REBUILD_PROVIDER=coolify` и `COOLIFY_API_URL=https://<coolify-host>/api/v1`. `COOLIFY_API_TOKEN` добавить вручную в Normal view как runtime-only secret: Runtime и Literal включить, Build и Multiline выключить; worker получает его из создаваемого Coolify runtime `.env`, а Compose не интерполирует token на build/parse. `COOLIFY_RESOURCE_UUID` не генерировать вручную: это предопределенная application variable Coolify, значение нужно только сверить с UUID созданного Compose resource. Интервал/таймаут по умолчанию — 5 секунд/15 минут.
6. Отключить `Inject Build Args to Dockerfile`, чтобы Coolify не добавлял environment variables и secrets как Docker `ARG`. Затем запустить выбранный commit вручную. GitHub Auto Deploy включать только после первого успешного rehearsal. `REBUILD_WEBHOOK_URL` в Coolify-режиме оставить пустым: worker использует API start/status, а не webhook.
7. Проверить TLS и Basic Auth на `/`, `/robots.txt`, `/sitemap.xml`, `/kazan/`, `/api/v1/health/live`, а также на всех admin routes. Без credentials каждый внешний URL должен возвращать `401`; после входа формы и admin API должны обращаться к same-origin `/api/v1` без второго HTTP-auth prompt. Ответы `admin.tv-internet-dom.ru` дополнительно должны содержать `X-Robots-Tag: noindex, nofollow, noarchive`.
8. После успеха установить `RUN_BOOTSTRAP_SEED=false` и выполнить повторный deploy: seed должен быть пропущен, а web publisher обязан снова собрать каталог из текущей БД. Затем изменить тестовую сущность и проверить `deployment_uuid`, переход к `SUCCEEDED` только после Coolify `finished` и соответствие опубликованной ревизии.

## Порядок первого запуска

Direct Compose по-прежнему рассчитан на повторное развертывание с уже доступным `SITE_DATA_API_URL`:

```powershell
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec api node /app/dist/seed.js
```

Coolify Compose не вызывает API во время image build. После готовности PostgreSQL/Redis он последовательно применяет migrations, запускает API, выполняет `bootstrap-seed` согласно явному `RUN_BOOTSTRAP_SEED`, затем запускает one-shot `web-publish`. Publisher обращается к `http://api:3000/api/v1`, выполняет Astro build вместе с post-build SEO gate, копирует только успешный `dist` в новый release-каталог persistent volume и атомарно переключает symlink `current`. Caddy `web` стартует лишь после успешного publisher. Таким образом первый deploy не требует ранее опубликованного API, а повторный deploy собирается из текущей БД. Все one-shot services имеют `restart: "no"`; Coolify v4.3.18 автоматически исключает такие завершенные контейнеры из общей health-оценки.

Во всех четырех Dockerfile dependency layer строится до копирования исходников: сначала root/workspace manifests и `pnpm-lock.yaml`, затем `pnpm install --frozen-lockfile`, затем `COPY . .`. Поэтому обычная правка кода или документации повторно использует install layer; изменение manifest/lockfile намеренно заставляет пересобрать зависимости. API runtime image обязан сохранять `apps/api/node_modules` рядом с `apps/api/dist`: при hoisted pnpm workspace часть зависимостей является symlink в root `.pnpm`, и копирования только root `node_modules` недостаточно. Этот layout проверяется тестом и изолированным Docker smoke с реальными PostgreSQL/Redis.

Seed не становится автоматической операцией каждого deploy: Coolify не начнет работу, пока оператор явно не выберет `true` или `false`; после первого запуска значение должно быть `false`. После seed проверить пользовательский login и public city data. Web и admin в Coolify встраивают соответственно `https://tv-internet-dom.ru/api/v1` и `https://admin.tv-internet-dom.ru/api/v1`; их Caddy проксирует `/api/*` во внутренний `api:3000`. Поэтому браузеру не нужен отдельный API origin, а Basic Auth Coolify закрывает и страницы, и browser API тем же credential. Админка остается на отдельном поддомене: путь вида `/adm-page` не является защитой и смешал бы ее static fallback/cookies с публичной витриной; admin Caddy добавляет defense-in-depth заголовок `X-Robots-Tag`. Production cookie остается `Secure` и требует HTTPS.

Для первоначальной загрузки географии после запуска API выполнить `pnpm cities:import`, проверить счетчики validation report и затем `pnpm cities:import -- --apply`. Команда пишет только через административный API и приводит статусы к инварианту: Казань `PUBLISHED`, остальные города `DRAFT`. Исходник и детали находятся в [data/imports/README.md](../data/imports/README.md).

## Требуемые проверки до публикации

| Проверка | Как подтвердить |
| --- | --- |
| Сборка | `pnpm build` в чистом окружении; `docker compose -f docker-compose.coolify.yml config --no-interpolate`; успешный Coolify deploy. У `apps/web` успех означает также автоматический post-build SEO gate по готовому `dist`. |
| Схема | `pnpm db:validate`, затем `prisma migrate deploy` в целевой БД. |
| Health | `/api/v1/health/live` возвращает process liveness; `/api/v1/health/ready` и совместимый `/api/v1/health` возвращают 200 только при доступных PostgreSQL и Redis, иначе 503. |
| Input security | Неизвестное поле public DTO и заполненный honeypot возвращают 400; превышение login/public write limit возвращает 429. Проверить, что разные внешние IP за Caddy получают независимые лимиты. |
| PII retention | На изолированной копии БД создать старый и свежий test lead, вызвать `/internal/pii-retention` service token, проверить cascade удаления старого, сохранность свежего и счетчики job; затем проверить ежедневный scheduler и failed/completed logs worker. |
| Публичный HTML | Build автоматически сверяет sitemap со всеми indexable `*/index.html`, отклоняет неизвестные плоские HTML-файлы, проверяет canonical, title, description, H1, корректный robots без глобального запрета индексации, отсутствие loopback-ссылок и `noindex` 404. После деплоя выборочно открыть raw HTML `/`, текущий `/{city-slug}/`, service/tariff page, robots и sitemap, чтобы подтвердить доставку именно проверенного артефакта. |
| Redirect runtime | Создать опубликованный redirect на существующий target, дождаться успешного rebuild, проверить точный старый URL: один HTTP 301, относительный `Location`, отсутствие второго hop и рост `hitCount`/`lastHitAt`; архивированный redirect после rebuild должен вернуть обычный static 404. |
| Password boundary | Без Basic Auth credentials `tv-internet-dom.ru/*` и `admin.tv-internet-dom.ru/*`, включая `/api/*`, возвращают 401; после одного входа same-origin forms/API работают. API не имеет отдельного публичного Coolify domain; admin responses содержат `X-Robots-Tag: noindex, nofollow, noarchive`. |
| Интеграции | Sandbox или согласованный test contract coverage, contract check, Tarifnik и fallback email. |
| Rebuild | Изменить тестовую сущность, проверить переход `PENDING/QUEUED -> RUNNING -> SUCCEEDED` через `/admin/rebuilds`, затем проверить HTML и совпадение `publishedRevision === requestedRevision`. |
| Backup/restore | Для текущего Git-based Compose Application настроить `pg_dump` во внешнее/S3-хранилище и проверить восстановление на отдельной БД. Встроенный database-aware backup Coolify доступен Database/Service resources, но пока не Git-based Compose Application. |

## Переменные окружения по назначению

| Группа | Переменные |
| --- | --- |
| База и Redis | `DATABASE_URL`, `POSTGRES_*`, `REDIS_URL` |
| Public build | `PUBLIC_SITE_URL`, `PUBLIC_SITE_SLUG`, server-only `SITE_DATA_API_URL`; последний определяет источник каталога во время Astro build и совместимо откатывается к `PUBLIC_API_URL`, если не задан |
| Public browser/runtime | `PUBLIC_API_URL` — нормализуемый HTTPS base URL с path `/api/v1`; `PUBLIC_SUPPORT_PHONE`, `PUBLIC_YANDEX_METRIKA_ID`; внутренний `API_UPSTREAM` для Caddy web-контейнера задается Compose как `api:3000` |
| Domains/CORS | `PUBLIC_DOMAIN`, `ADMIN_DOMAIN`, `API_DOMAIN` только для direct Compose; `CORS_ORIGINS`, `ADMIN_URL` |
| Coolify bootstrap/access | `RUN_BOOTSTRAP_SEED` (обязательный явный `true`/`false`), `TEST_BASIC_AUTH_USERS` (bcrypt credential, runtime literal) |
| Auth/secrets | `ADMIN_API_TOKEN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SUBSCRIBER_COOKIE_SECRET` |
| Input security | `TRUST_PROXY`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_LOGIN_MAX`, `RATE_LIMIT_PUBLIC_WRITE_MAX`, `RATE_LIMIT_DEFAULT_MAX` |
| PII retention | `PII_RETENTION_DAYS` (обязательное legal decision), `PII_RETENTION_BATCH_SIZE` (default 500), `PII_RETENTION_CRON` (default `0 3 * * *`, UTC) |
| Coverage/contract | `DOMRU_COVERAGE_API_URL`, `DOMRU_COVERAGE_API_KEY`, `DOMRU_CONTRACT_API_URL`, `DOMRU_CONTRACT_API_KEY` |
| Lead delivery | `TARIFNIK_API_URL`, `TARIFNIK_API_KEY`, `LEADS_EMAIL`, `RESEND_API_KEY` or `LEADS_EMAIL_WEBHOOK_URL`, `LEADS_EMAIL_FROM` |
| Publishing | `REBUILD_PROVIDER`; для `webhook` — `REBUILD_WEBHOOK_URL`; для `coolify` — `COOLIFY_API_URL`, `COOLIFY_API_TOKEN`, `COOLIFY_RESOURCE_UUID`, необязательные `COOLIFY_POLL_INTERVAL_MS`/`COOLIFY_DEPLOY_TIMEOUT_MS`; `ENV_FILE` |

Проверка configuration gate из операторского PowerShell (значение токена не выводить в лог):

```powershell
docker compose -f docker-compose.coolify.yml exec api node -e "fetch('http://localhost:3000/api/v1/admin/readiness',{headers:{'x-admin-token':process.env.ADMIN_API_TOKEN}}).then(async r=>{console.log(r.status,await r.text());process.exit(r.ok?0:1)})"
```

`configured` означает только, что обязательные переменные заданы. Endpoint не выполняет внешние запросы, не возвращает значения и не подтверждает корректность ключей, договоров, лимитов или SLA. До sandbox/rehearsal реальный прием лидов не включать.

## Известные эксплуатационные ограничения

- Caddy reverse proxy не добавляет security headers из `static.Caddyfile`; он используется только внутри static image.
- Нет мониторинга, alerting, лог-агрегации или настроенной backup policy. Встроенный database-aware backup Coolify пока не доступен PostgreSQL внутри Git-based Docker Compose Application; до реальных лидов нужен внешний `pg_dump`, S3/off-server storage и restore rehearsal.
- Автоматическое hard-delete PII реализовано, но срок хранения не утвержден и `.env.example` намеренно оставляет `PII_RETENTION_DAYS` пустым; реальный прием заявок до legal decision и isolated rehearsal запрещен.
- Static web не получает изменения из БД без внешней пересборки. Это относится и к набору redirect source paths; уже включенный matcher при каждом обращении проверяет актуальный published-статус записи через API.
- Direct `docker-compose.prod.yml` по-прежнему требует заранее доступный `SITE_DATA_API_URL`; воспроизводимый первый bootstrap реализован только в целевом Coolify Compose.
- Coolify Compose и password middleware пока проверены локально только как конфигурация. До живой проверки DNS/TLS, persistent volume, 401-boundary и повторного deploy [#55](https://github.com/Celtoman/astro-telekom/issues/55)/[#56](https://github.com/Celtoman/astro-telekom/issues/56) не закрываются.
- Coolify adapter реализован и локально покрыт UUID/polling/retry/timeout tests, но еще не вызван против реального control plane; до этого [#57](https://github.com/Celtoman/astro-telekom/issues/57) и автоматическая публикация остаются неподтвержденными.
- Rebuild требует одновременно PostgreSQL, Redis, worker, API и доступный выбранный provider; наличие URL/token без успешного финального rehearsal не доказывает публикацию.
- Для применения persistent rebuild-job нужна миграция `0010_site_rebuild_jobs`.
- Fallback email link требует примененной миграции `0009_lead_access_tokens`; ссылка одноразовая, действует 24 часа и проверяется API. Raw token передается во fragment и не попадает в HTTP request к static admin.
- Retention query требует миграцию `0012_pii_retention_indexes`; она добавляет индексы `Lead.createdAt` и `AddressCheck.createdAt`, не выбирая срок хранения.

Полный список рисков и работа по закрытию — в [technical-debt.md](technical-debt.md).
