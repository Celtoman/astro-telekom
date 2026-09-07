# Развертывание и эксплуатационный контур

Этот документ описывает текущую Compose-конфигурацию. Production deployment не выполнялся и не верифицировался; инструкция не является подтверждением готового боевого контура.

## Контуры

| Контур | Команда | Состав |
| --- | --- | --- |
| Локальная инфраструктура | `docker compose up -d postgres redis` | Только PostgreSQL и Redis с опубликованными портами 5432/6379. |
| Локальные приложения | pnpm-команды из README | API, web, admin, CRM, worker в процессах хоста. |
| Production-like | `docker compose -f docker-compose.prod.yml up -d --build` | PostgreSQL, Redis, API, worker, web, admin, CRM, Caddy. |

## Обязательная подготовка

1. Скопировать `.env.example` в `.env` и заменить все placeholders секретов и доменов.
2. Задать `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `DATABASE_URL` с host `postgres` для контейнерного API.
3. Задать `PUBLIC_DOMAIN`, `ADMIN_DOMAIN`, `CRM_DOMAIN`, `API_DOMAIN`. Во время image build из них формируются public API и canonical URLs.
4. Задать случайные непустые `ADMIN_API_TOKEN`, `LEAD_LINK_SECRET`, `SUBSCRIBER_COOKIE_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
5. До включения заявок подтвердить и задать coverage, contract, Tarifnik и email variables. Пустое значение не означает безопасно работающую интеграцию.
6. Убедиться, что DNS всех четырех доменов указывает на сервер и порты 80/443 доступны Caddy.

## Порядок первого запуска

```powershell
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy --config /app/prisma.config.ts
docker compose -f docker-compose.prod.yml exec api node --experimental-strip-types /app/prisma/seed.ts
```

После seed проверить пользовательский login и public city data. В текущем Compose миграции и seed не запускаются автоматически. API health endpoint проверяет только HTTP process, а не доступность PostgreSQL или актуальность schema; нельзя считать `healthy` доказательством готовности данных.

## Требуемые проверки до публикации

| Проверка | Как подтвердить |
| --- | --- |
| Сборка | `pnpm build` в чистом окружении или успешный docker build. |
| Схема | `pnpm db:validate`, затем `prisma migrate deploy` в целевой БД. |
| Health | HTTP `GET https://<API_DOMAIN>/api/v1/health`; дополнительно ручной DB-read endpoint после его реализации. |
| Публичный HTML | Открыть raw HTML `/`, `/kazan/`, service page, tariff page, robots и sitemap; проверить canonical без localhost. |
| Интеграции | Sandbox или согласованный test contract coverage, contract check, Tarifnik и fallback email. |
| Rebuild | Изменить тестовую сущность, дождаться deployment и проверить HTML после rebuild. Сейчас этот шаг не имеет persistent status. |
| Backup/restore | Проверить резервную копию PostgreSQL и восстановление на отдельной БД. |

## Переменные окружения по назначению

| Группа | Переменные |
| --- | --- |
| База и Redis | `DATABASE_URL`, `POSTGRES_*`, `REDIS_URL` |
| Public build | `PUBLIC_SITE_URL`, `PUBLIC_API_URL`, `PUBLIC_SUPPORT_PHONE`, `PUBLIC_YANDEX_METRIKA_ID` |
| Domains/CORS | `PUBLIC_DOMAIN`, `ADMIN_DOMAIN`, `CRM_DOMAIN`, `API_DOMAIN`, `CORS_ORIGINS`, `ADMIN_URL`, `CRM_URL` |
| Auth/secrets | `ADMIN_API_TOKEN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `LEAD_LINK_SECRET`, `SUBSCRIBER_COOKIE_SECRET` |
| Coverage/contract | `DOMRU_COVERAGE_API_URL`, `DOMRU_COVERAGE_API_KEY`, `DOMRU_CONTRACT_API_URL`, `DOMRU_CONTRACT_API_KEY` |
| Lead delivery | `TARIFNIK_API_URL`, `TARIFNIK_API_KEY`, `LEADS_EMAIL`, `RESEND_API_KEY` or `LEADS_EMAIL_WEBHOOK_URL`, `LEADS_EMAIL_FROM` |
| Publishing | `REBUILD_WEBHOOK_URL`, `ENV_FILE` |

## Известные эксплуатационные ограничения

- Dockerfiles применяют `pnpm install --no-frozen-lockfile`; dependency resolution может отличаться от lockfile.
- Caddy reverse proxy не добавляет security headers из `static.Caddyfile`; он используется только внутри static image.
- Нет мониторинга, alerting, лог-агрегации или автоматической backup policy.
- Static web не получает изменения из БД без внешней пересборки.
- Fallback email link еще не открывает защищенную карточку: см. TD-02.

Полный список рисков и работа по закрытию — в [technical-debt.md](technical-debt.md).
