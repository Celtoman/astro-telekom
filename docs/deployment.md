# Production deployment

1. Установить Docker Engine и Compose на VPS.
2. Скопировать `.env.example` в `.env` и заменить все пароли, токены и домены.
3. Указать домены публичного сайта, админки, CRM и API.
   `PUBLIC_API_URL` для статических приложений будет собран как `https://<API_DOMAIN>/api/v1`; для локальной проверки можно явно передать `ENV_FILE=.env.example`.
4. В production `DATABASE_URL` должен использовать имя compose-сервиса `postgres`, например `postgresql://provider:password@postgres:5432/provider_platform`.
5. Запустить:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

6. Применить миграции и seed из контейнера API или отдельного одноразового Prisma-контейнера:

```bash
docker compose -f docker-compose.prod.yml exec api \
  npx prisma migrate deploy --config /app/prisma.config.ts

docker compose -f docker-compose.prod.yml exec api \
  node --experimental-strip-types /app/prisma/seed.ts
```

До запуска seed нужно убедиться, что `DATABASE_URL` внутри API указывает на сервис `postgres`, а не на `localhost`.

Production-сервисы:

- `web` — статический HTML публичного сайта;
- `admin` — админка;
- `crm` — CRM операторов;
- `api` — NestJS API;
- `worker` — фоновые очереди;
- `postgres` — данные;
- `redis` — очереди;
- `caddy` — HTTPS и маршрутизация доменов.
