# Развертывание и эксплуатационный контур

Этот документ описывает текущую Compose-конфигурацию. Production deployment не выполнялся и не верифицировался; инструкция не является подтверждением готового боевого контура.

Отдельный CRM-frontend удален 9 сентября 2026 года после переноса журнала заявок в `/leads` `apps/admin`. API routes пока сохраняют префикс `/crm/leads` как внутреннее имя контракта; отдельного домена или сервиса для них нет.

## Контуры

| Контур | Команда | Состав |
| --- | --- | --- |
| Локальная инфраструктура | `docker compose up -d postgres redis` | Только PostgreSQL и Redis с опубликованными портами 5432/6379. |
| Локальные приложения | pnpm-команды из README | API, web, admin, worker в процессах хоста. |
| Production-like | `docker compose -f docker-compose.prod.yml up -d --build` | Повторное развертывание при уже доступном `SITE_DATA_API_URL`: PostgreSQL, Redis, one-shot Prisma migrate, API, worker, web, admin, Caddy. Первый bootstrap пока не является one-shot сценарием — [#55](https://github.com/Celtoman/astro-telekom/issues/55). |

PostgreSQL 18 хранит major-specific data directory внутри volume, смонтированного в `/var/lib/postgresql`. Не возвращать старый mount `/var/lib/postgresql/data`: официальный PG18 image отказывается запускаться с таким layout.

## Обязательная подготовка

1. Скопировать `.env.example` в `.env` и заменить все placeholders секретов и доменов.
2. Задать `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `DATABASE_URL` с host `postgres` для контейнерного API.
3. Задать `PUBLIC_DOMAIN`, `ADMIN_DOMAIN`, `API_DOMAIN` и отдельно `SITE_DATA_API_URL`, доступный из Docker builder. Browser API и canonical URL формируются из доменов; web build принимает `PUBLIC_SITE_URL` только как чистый HTTPS origin и блокируется при пустом, HTTP или локальном значении.
4. Задать случайные непустые `ADMIN_API_TOKEN`, `SUBSCRIBER_COOKIE_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
5. Проверить rate-limit policy: `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_LOGIN_MAX`, `RATE_LIMIT_PUBLIC_WRITE_MAX`, `RATE_LIMIT_DEFAULT_MAX`. Production Compose принудительно задает API `TRUST_PROXY=true`, потому что API не публикует порт и получает внешний трафик только от Caddy; при прямой публикации API доверие proxy headers нужно пересмотреть.
6. Юридически утвердить срок хранения сырых заявок и задать его целым числом дней в `PII_RETENTION_DAYS` (1–3650). Код не содержит придуманного default; без policy scheduler отключен и readiness заблокирован. При необходимости настроить размер batch и UTC cron отдельно.
7. До включения заявок подтвердить договоры и задать coverage, contract, Tarifnik, email и rebuild variables. Проверить защищенный `/api/v1/admin/readiness`: `status` должен быть `configured`. Это подтверждает только наличие конфигурации — затем обязательны sandbox-вызовы и согласованные legal/SLA decisions.
8. Убедиться, что DNS всех трех доменов указывает на сервер и порты 80/443 доступны Caddy.

## Порядок первого запуска

Полностью воспроизводимый первый bootstrap пока не реализован: `apps/web` читает каталог во время сборки image, а Compose `depends_on` начинает действовать только после завершения build. Поэтому приведенные ниже команды применимы к повторному развертыванию, когда `SITE_DATA_API_URL` уже доступен и отдает нужную ревизию каталога. Не считать этот порядок подтвержденным сценарием первого запуска; отдельная работа ведется в [#55](https://github.com/Celtoman/astro-telekom/issues/55).

```powershell
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec api node /app/dist/seed.js
```

Compose запускает `migrate` после готовности PostgreSQL; `api` не стартует, пока `prisma migrate deploy` не завершится успешно. Runtime-контейнер `web` ожидает healthy API: его внутренний Caddy обслуживает static files и проксирует только build-generated redirect matchers в `API_UPSTREAM=api:3000`. Это runtime-зависимость и она не обеспечивает API на более ранней стадии сборки web image. Seed выполняется отдельно и только при первоначальной подготовке или осознанном обновлении базовых данных — автоматический seed на каждом деплое недопустим. После seed проверить пользовательский login и public city data. Browser login использует credentialed CORS и HttpOnly cookie: `ADMIN_URL` должен входить в `CORS_ORIGINS`; API явно разрешает browser-методы `GET`, `HEAD`, `POST`, `PATCH`, `DELETE`, `OPTIONS`; в `NODE_ENV=production` cookie имеет `Secure` и требует HTTPS.

Для первоначальной загрузки географии после запуска API выполнить `pnpm cities:import`, проверить счетчики validation report и затем `pnpm cities:import -- --apply`. Команда пишет только через административный API и приводит статусы к инварианту: Казань `PUBLISHED`, остальные города `DRAFT`. Исходник и детали находятся в [data/imports/README.md](../data/imports/README.md).

## Требуемые проверки до публикации

| Проверка | Как подтвердить |
| --- | --- |
| Сборка | `pnpm build` в чистом окружении или успешный docker build. У `apps/web` успех означает также автоматический post-build SEO gate по готовому `dist`. |
| Схема | `pnpm db:validate`, затем `prisma migrate deploy` в целевой БД. |
| Health | `/api/v1/health/live` возвращает process liveness; `/api/v1/health/ready` и совместимый `/api/v1/health` возвращают 200 только при доступных PostgreSQL и Redis, иначе 503. |
| Input security | Неизвестное поле public DTO и заполненный honeypot возвращают 400; превышение login/public write limit возвращает 429. Проверить, что разные внешние IP за Caddy получают независимые лимиты. |
| PII retention | На изолированной копии БД создать старый и свежий test lead, вызвать `/internal/pii-retention` service token, проверить cascade удаления старого, сохранность свежего и счетчики job; затем проверить ежедневный scheduler и failed/completed logs worker. |
| Публичный HTML | Build автоматически сверяет sitemap со всеми indexable `*/index.html`, отклоняет неизвестные плоские HTML-файлы, проверяет canonical, title, description, H1, корректный robots без глобального запрета индексации, отсутствие loopback-ссылок и `noindex` 404. После деплоя выборочно открыть raw HTML `/`, текущий `/{city-slug}/`, service/tariff page, robots и sitemap, чтобы подтвердить доставку именно проверенного артефакта. |
| Redirect runtime | Создать опубликованный redirect на существующий target, дождаться успешного rebuild, проверить точный старый URL: один HTTP 301, относительный `Location`, отсутствие второго hop и рост `hitCount`/`lastHitAt`; архивированный redirect после rebuild должен вернуть обычный static 404. |
| Интеграции | Sandbox или согласованный test contract coverage, contract check, Tarifnik и fallback email. |
| Rebuild | Изменить тестовую сущность, проверить переход `PENDING/QUEUED -> RUNNING -> SUCCEEDED` через `/admin/rebuilds`, затем проверить HTML и совпадение `publishedRevision === requestedRevision`. |
| Backup/restore | Проверить резервную копию PostgreSQL и восстановление на отдельной БД. |

## Переменные окружения по назначению

| Группа | Переменные |
| --- | --- |
| База и Redis | `DATABASE_URL`, `POSTGRES_*`, `REDIS_URL` |
| Public build | `PUBLIC_SITE_URL`, `PUBLIC_SITE_SLUG`, server-only `SITE_DATA_API_URL`; последний определяет источник каталога во время Astro build и совместимо откатывается к `PUBLIC_API_URL`, если не задан |
| Public browser/runtime | `PUBLIC_API_URL`, `PUBLIC_SUPPORT_PHONE`, `PUBLIC_YANDEX_METRIKA_ID`; внутренний `API_UPSTREAM` для Caddy web-контейнера задается Compose как `api:3000` |
| Domains/CORS | `PUBLIC_DOMAIN`, `ADMIN_DOMAIN`, `API_DOMAIN`, `CORS_ORIGINS`, `ADMIN_URL` |
| Auth/secrets | `ADMIN_API_TOKEN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SUBSCRIBER_COOKIE_SECRET` |
| Input security | `TRUST_PROXY`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_LOGIN_MAX`, `RATE_LIMIT_PUBLIC_WRITE_MAX`, `RATE_LIMIT_DEFAULT_MAX` |
| PII retention | `PII_RETENTION_DAYS` (обязательное legal decision), `PII_RETENTION_BATCH_SIZE` (default 500), `PII_RETENTION_CRON` (default `0 3 * * *`, UTC) |
| Coverage/contract | `DOMRU_COVERAGE_API_URL`, `DOMRU_COVERAGE_API_KEY`, `DOMRU_CONTRACT_API_URL`, `DOMRU_CONTRACT_API_KEY` |
| Lead delivery | `TARIFNIK_API_URL`, `TARIFNIK_API_KEY`, `LEADS_EMAIL`, `RESEND_API_KEY` or `LEADS_EMAIL_WEBHOOK_URL`, `LEADS_EMAIL_FROM` |
| Publishing | `REBUILD_WEBHOOK_URL`, `ENV_FILE` |

Проверка configuration gate из операторского PowerShell (значение токена не выводить в лог):

```powershell
Invoke-RestMethod -Uri "https://<API_DOMAIN>/api/v1/admin/readiness" -Headers @{ "x-admin-token" = $env:ADMIN_API_TOKEN }
```

`configured` означает только, что обязательные переменные заданы. Endpoint не выполняет внешние запросы, не возвращает значения и не подтверждает корректность ключей, договоров, лимитов или SLA. До sandbox/rehearsal реальный прием лидов не включать.

## Известные эксплуатационные ограничения

- Caddy reverse proxy не добавляет security headers из `static.Caddyfile`; он используется только внутри static image.
- Нет мониторинга, alerting, лог-агрегации или автоматической backup policy.
- Автоматическое hard-delete PII реализовано, но срок хранения не утвержден и `.env.example` намеренно оставляет `PII_RETENTION_DAYS` пустым; реальный прием заявок до legal decision и isolated rehearsal запрещен.
- Static web не получает изменения из БД без внешней пересборки. Это относится и к набору redirect source paths; уже включенный matcher при каждом обращении проверяет актуальный published-статус записи через API.
- Первый web image build требует заранее доступного `SITE_DATA_API_URL`; текущий Compose не может поднять API до собственной стадии build. До закрытия [#55](https://github.com/Celtoman/astro-telekom/issues/55) one-shot bootstrap не заявляется поддержанным.
- Rebuild требует одновременно PostgreSQL, Redis, worker, API и provider, который возвращает финальный `{ "status": "SUCCEEDED" }`; наличие одной лишь webhook-точки не доказывает публикацию.
- Для применения persistent rebuild-job нужна миграция `0010_site_rebuild_jobs`.
- Fallback email link требует примененной миграции `0009_lead_access_tokens`; ссылка одноразовая, действует 24 часа и проверяется API. Raw token передается во fragment и не попадает в HTTP request к static admin.
- Retention query требует миграцию `0012_pii_retention_indexes`; она добавляет индексы `Lead.createdAt` и `AddressCheck.createdAt`, не выбирая срок хранения.

Полный список рисков и работа по закрытию — в [technical-debt.md](technical-debt.md).
