# Платформа сайтов провайдера

Платформа для партнерских сайтов провайдеров с городами, страницами, тарифами, проверкой адреса, заявками, админкой и CRM.

Текущий первый вертикальный срез: **Дом.ру, Казань**.

## Стек

- Astro — публичный HTML-first сайт;
- NestJS + Fastify — API;
- PostgreSQL + Prisma — данные и миграции;
- Redis + BullMQ — фоновые задачи;
- Astro-админка и Astro-CRM — интерфейсы первого прототипа; при наличии API-токена они подхватывают реальные города, тарифы и заявки, без него показывают демо-данные;
- Docker Compose + Caddy — production-развертывание.

## Структура

```text
apps/web       публичный сайт
apps/admin     города, страницы и тарифы
apps/crm       заявки и статусы операторов
apps/api       API и бизнес-правила
services/worker импорт и пересборка
packages/database Prisma-пакет
prisma/        схема, миграции и seed
docs/          архитектура, API и deployment
```

## Быстрый запуск инфраструктуры

```bash
copy .env.example .env
docker compose up -d postgres redis
```

Затем применить миграции и seed:

```bash
pnpm install
pnpm --filter @provider/database generate
pnpm --filter @provider/database migrate:deploy
pnpm --filter @provider/database seed
```

Для seed-администратора задаются `ADMIN_EMAIL` и `ADMIN_PASSWORD` в `.env`.

Для Метрики задайте числовой `PUBLIC_YANDEX_METRIKA_ID` во время сборки публичного сайта. В шаблон автоматически попадут цели `phone_click` и `lead_form_submit`.

Админка и журнал заявок используют `PUBLIC_API_URL` (по умолчанию `http://localhost:3000/api/v1`). Токен можно ввести через профиль в интерфейсе; он сохраняется только в `sessionStorage` текущей вкладки. Для XLS/XLSX-импорта тарифов задайте `PUBLIC_PROVIDER_ID` или укажите `providerId` в диалоге загрузки. Для импорта городов задайте `PUBLIC_SITE_ID` или укажите `siteId`: новые города появятся с набором типовых страниц в черновиках.

Для контура заявок настройте `DOMRU_CONTRACT_API_URL` и `DOMRU_CONTRACT_API_KEY`, а для основной передачи — `TARIFNIK_API_URL` и `TARIFNIK_API_KEY`. `LEADS_EMAIL` и один из транспортов `RESEND_API_KEY` или `LEADS_EMAIL_WEBHOOK_URL` обязательны для резервной отправки после трех ошибок API. Секреты `LEAD_LINK_SECRET` и `SUBSCRIBER_COOKIE_SECRET` не добавляются в репозиторий.

## Запуск приложений

```bash
pnpm --filter @provider/api run build
pnpm --filter @provider/web dev
pnpm --filter @provider/admin dev
pnpm --filter @provider/crm dev
pnpm --filter @provider/worker start
```

Production-сборка описана в [docs/deployment.md](docs/deployment.md), а полный список API — в [docs/api-contracts.md](docs/api-contracts.md).

Согласованные продуктовые решения и открытые вопросы ведутся в [docs/decisions.md](docs/decisions.md).

Актуальные версии и правила применения возможностей Astro, NestJS и Prisma — в [docs/technology-baseline.md](docs/technology-baseline.md).

## Исследование примеров

- [Индекс исследования](docs/research/README.md)
- [Разбор сайтов](docs/research/sites.md)
- [Блоки и перелинковка](docs/research/blocks-and-linking.md)
- [Реестр источников](docs/research/sources.csv)

