# Развертывание и эксплуатационный контур

Этот документ описывает текущую Compose-конфигурацию. Production deployment не выполнялся и не верифицировался; инструкция не является подтверждением готового боевого контура.

Отдельный CRM-frontend удален 9 сентября 2026 года после переноса журнала заявок в `/leads` `apps/admin`. API routes пока сохраняют префикс `/crm/leads` как внутреннее имя контракта; отдельного домена или сервиса для них нет.

## Контуры

| Контур | Команда | Состав |
| --- | --- | --- |
| Локальная инфраструктура | `docker compose up -d postgres redis` | Только PostgreSQL и Redis с опубликованными портами 5432/6379. |
| Локальные приложения | pnpm-команды из README | API, web, admin, worker в процессах хоста. |
| Production-like | `docker compose -f docker-compose.prod.yml up -d --build` | PostgreSQL, Redis, one-shot Prisma migrate, API, worker, web, admin, Caddy. |

PostgreSQL 18 хранит major-specific data directory внутри volume, смонтированного в `/var/lib/postgresql`. Не возвращать старый mount `/var/lib/postgresql/data`: официальный PG18 image отказывается запускаться с таким layout.

## Обязательная подготовка

1. Скопировать `.env.example` в `.env` и заменить все placeholders секретов и доменов.
2. Задать `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `DATABASE_URL` с host `postgres` для контейнерного API.
3. Задать `PUBLIC_DOMAIN`, `ADMIN_DOMAIN`, `API_DOMAIN`. Во время image build из них формируются public API и canonical URLs.
4. Задать случайные непустые `ADMIN_API_TOKEN`, `SUBSCRIBER_COOKIE_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
5. До включения заявок подтвердить и задать coverage, contract, Tarifnik и email variables. Пустое значение не означает безопасно работающую интеграцию.
6. Убедиться, что DNS всех трех доменов указывает на сервер и порты 80/443 доступны Caddy.

## Порядок первого запуска

```powershell
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec api node /app/dist/seed.js
```

Compose запускает `migrate` после готовности PostgreSQL; `api` не стартует, пока `prisma migrate deploy` не завершится успешно. Seed выполняется отдельно и только при первоначальной подготовке или осознанном обновлении базовых данных — автоматический seed на каждом деплое недопустим. После seed проверить пользовательский login и public city data. Browser login использует credentialed CORS и HttpOnly cookie: `ADMIN_URL` должен входить в `CORS_ORIGINS`; API явно разрешает browser-методы `GET`, `HEAD`, `POST`, `PATCH`, `DELETE`, `OPTIONS`; в `NODE_ENV=production` cookie имеет `Secure` и требует HTTPS.

Для первоначальной загрузки географии после запуска API выполнить `pnpm cities:import`, проверить счетчики validation report и затем `pnpm cities:import -- --apply`. Команда пишет только через административный API и приводит статусы к инварианту: Казань `PUBLISHED`, остальные города `DRAFT`. Исходник и детали находятся в [data/imports/README.md](../data/imports/README.md).

## Требуемые проверки до публикации

| Проверка | Как подтвердить |
| --- | --- |
| Сборка | `pnpm build` в чистом окружении или успешный docker build. |
| Схема | `pnpm db:validate`, затем `prisma migrate deploy` в целевой БД. |
| Health | `/api/v1/health/live` возвращает process liveness; `/api/v1/health/ready` и совместимый `/api/v1/health` возвращают 200 только при доступных PostgreSQL и Redis, иначе 503. |
| Публичный HTML | Открыть raw HTML `/`, текущий опубликованный `/{city-slug}/`, service page, tariff page, robots и sitemap; проверить canonical без localhost и отсутствие draft-городов. |
| Интеграции | Sandbox или согласованный test contract coverage, contract check, Tarifnik и fallback email. |
| Rebuild | Изменить тестовую сущность, проверить переход `PENDING/QUEUED -> RUNNING -> SUCCEEDED` через `/admin/rebuilds`, затем проверить HTML и совпадение `publishedRevision === requestedRevision`. |
| Backup/restore | Проверить резервную копию PostgreSQL и восстановление на отдельной БД. |

## Переменные окружения по назначению

| Группа | Переменные |
| --- | --- |
| База и Redis | `DATABASE_URL`, `POSTGRES_*`, `REDIS_URL` |
| Public build | `PUBLIC_SITE_URL`, `PUBLIC_SITE_SLUG`, `PUBLIC_API_URL`, `PUBLIC_SUPPORT_PHONE`, `PUBLIC_YANDEX_METRIKA_ID` |
| Domains/CORS | `PUBLIC_DOMAIN`, `ADMIN_DOMAIN`, `API_DOMAIN`, `CORS_ORIGINS`, `ADMIN_URL` |
| Auth/secrets | `ADMIN_API_TOKEN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SUBSCRIBER_COOKIE_SECRET` |
| Coverage/contract | `DOMRU_COVERAGE_API_URL`, `DOMRU_COVERAGE_API_KEY`, `DOMRU_CONTRACT_API_URL`, `DOMRU_CONTRACT_API_KEY` |
| Lead delivery | `TARIFNIK_API_URL`, `TARIFNIK_API_KEY`, `LEADS_EMAIL`, `RESEND_API_KEY` or `LEADS_EMAIL_WEBHOOK_URL`, `LEADS_EMAIL_FROM` |
| Publishing | `REBUILD_WEBHOOK_URL`, `ENV_FILE` |

## Известные эксплуатационные ограничения

- Caddy reverse proxy не добавляет security headers из `static.Caddyfile`; он используется только внутри static image.
- Нет мониторинга, alerting, лог-агрегации или автоматической backup policy.
- Static web не получает изменения из БД без внешней пересборки.
- Rebuild требует одновременно PostgreSQL, Redis, worker, API и provider, который возвращает финальный `{ "status": "SUCCEEDED" }`; наличие одной лишь webhook-точки не доказывает публикацию.
- Для применения persistent rebuild-job нужна миграция `0010_site_rebuild_jobs`.
- Fallback email link требует примененной миграции `0009_lead_access_tokens`; ссылка одноразовая, действует 24 часа и проверяется API. Raw token передается во fragment и не попадает в HTTP request к static admin.

Полный список рисков и работа по закрытию — в [technical-debt.md](technical-debt.md).
