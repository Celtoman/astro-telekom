# Текущее состояние проекта

Дата среза: 9 сентября 2026 года. Источник этого документа — исходный код, Prisma-схема, Docker-конфигурация и результаты локальных проверок на текущей ветке `master`. Он описывает фактическое состояние, а не только согласованный продуктовый замысел из [реестра решений](decisions.md).

## Краткий вывод

Репозиторий содержит работоспособный локальный каркас платформы, но не production-систему. Полностью реализованы базовая инфраструктура, схема данных, API основных сущностей, двухэтапный импорт городов и тарифов, прием заявок и механика их доставки. Публичный сайт умеет строить опубликованные города из API, но при текущих статусах фактически выводит только Казань; админка работает с реальными тарифами, городами и заявками. Отдельный CRM-frontend удален после переноса его функций в `/leads`.

## Статус по направлениям

| Направление | Статус | Что есть сейчас | Граница или условие |
| --- | --- | --- | --- |
| Monorepo и локальная инфраструктура | Реализовано | pnpm workspace, Docker Compose, PostgreSQL 18, Redis 8 | Production-развертывание не выполнялось и не подтверждалось. |
| Данные и миграции | Реализовано | Prisma-схема, 11 миграций, production Compose one-shot `migrate` до старта API, проверенный идемпотентный seed; локально загружены 207 городов и канонический snapshot из 3 859 тарифов | Seed остается явной одноразовой операторской операцией; нет истории изменений тарифа, корзины, версий контента и журнала действий. |
| API и доступ | Частично реализовано | NestJS/Fastify, DB/Redis-aware readiness, process-only liveness и защищенный configuration gate внешних интеграций, строгая глобальная DTO-валидация для login и публичных write-routes, Redis-backed rate limit, 12-часовая HttpOnly-cookie сессия для browser login/me/logout, совместимый Bearer, единый уровень доступа администратора; `/internal/*` изолирован сервисным `x-admin-token` | Admin CRUD еще частично валидирует тела вручную; нет session renewal и аудита действий; configuration gate не доказывает внешний SLA/договор. |
| Города и страницы | Частично реализовано | CRUD API, admin `/cities` со списком 207 городов, поиском, XLS-preview/apply, историей и rebuild status; warnings требуют подтверждения, новый город и шесть его страниц создаются в `DRAFT` | В опубликованном состоянии остается только Казань; нет публикационного workflow, расписания, шаблонов и массовых операций. Импорт пока разрешен только для односайтовой конфигурации. |
| Тарифы | Частично реализовано | CRUD, XLS/XLSX preview и атомарный full-snapshot apply, удаление отсутствующих строк, подтверждение warnings, проверка уникальности URL, сохранение полного описания и TV-счетчиков, ключ идентичности, SEO JSON и redirect при ручной смене URL | Нет истории/rollback и редактора полной модели; redirects еще не обслуживаются публичным routing и не имеют отдельного CRUD UI. |
| Публичная витрина | Частично реализовано | Astro static paths из опубликованных `City`/`Page`/`Tariff`, динамическая городская навигация, FAQ, форма адреса со скрытым honeypot, карточки тарифов, robots и sitemap; root перечисляет опубликованные города | В текущей БД опубликована только Казань; данные читаются только во время сборки. При недоступном API или конфликте public URL сборка явно падает — демо-данные допустимы только с явным `ALLOW_DEMO_DATA=true`. Redirect runtime еще не реализован. |
| Проверка адреса | Реализовано с зависимостью от окружения | API сохраняет проверку и различает AVAILABLE, UNAVAILABLE, AMBIGUOUS, MANUAL_CHECK, ERROR | Без настроенного внешнего API возвращается ручная проверка; реальный контракт не проверен. |
| Заявки | Частично реализовано | Сохранение контекста, дубликаты, проверка договора, попытки доставки, API endpoints, admin `/leads` со списком, поиском, фильтром, карточкой и сменой статуса, серверно проверяемая одноразовая fallback-ссылка | Внешние контракты не проверены; нет политики хранения PII и серверной пагинации журнала. |
| Фоновые задачи | Частично реализовано | API ставит `lead-deliveries` и persistent `site-rebuilds`; rebuild имеет дедупликацию по сайту, 3 попытки, backoff и статусы в PostgreSQL | У `tariff-imports` нет producer; live deployment provider не настроен и не проверен. |
| Админка | Частично реализовано | React/Tailwind/shadcn; отдельный login, общий cookie-aware API client, проверка сессии перед shell, logout, `/lead-access/`, рабочие `/tariffs`, `/cities` и `/leads`. Недостоверный legacy dashboard и browser service-token удалены; browser CORS поддерживает все используемые mutation methods | Tariff list пока ограничивает отрисовку первыми 100 совпадениями, а leads list загружает весь набор без серверной пагинации. Управление публикацией городов не реализовано. |
| SEO и аналитика | Частично реализовано | HTML-first генерация, title/description/canonical/JSON-LD, robots, sitemap из всех опубликованных городов/страниц/тарифов с корневым URL, build-time smoke готового HTML, события Метрики | `PUBLIC_SITE_URL` пока не обязателен на уровне build, нет Schema.org-профиля сущностей и реальной аналитики. |
| Тестирование | Частично реализовано | `pnpm lint`, `pnpm db:validate`, `pnpm build`, `pnpm test`; 102/102 node tests проходят; admin входит в Astro check; API input security, infrastructure/release readiness, migration dependency, public catalog/multi-city build-policy, полный справочник городов и отсутствие выведенного из эксплуатации CRM-workspace проверяются артефактами | Нет постоянного browser/E2E-покрытия. |

## Реализованный путь данных

```text
Администратор или XLS
  -> NestJS API -> PostgreSQL через Prisma
  -> persistent SiteRebuild -> Redis/BullMQ -> worker
  -> internal start/result API + deployment provider

Публичная Astro-сборка
  -> GET /public/sites/{PUBLIC_SITE_SLUG}/cities во время build
  -> статический HTML для опубликованных City/Page/Tariff

Посетитель
  -> POST /address-checks -> AddressCheck
  -> POST /leads -> Lead -> очередь lead-deliveries -> Tarifnik или email fallback
```

Главное следствие статической архитектуры: изменение данных в PostgreSQL не меняет уже опубликованный HTML само по себе. API теперь сохраняет rebuild-job до ответа CRUD, worker выполняет его с retry, а статус `SUCCEEDED` появляется только после явного финального ответа deployment provider. Сам provider и live production-процесс пока не настроены и не проверены.

## Реализованные публичные маршруты

Публичный фронтенд генерирует маршруты из опубликованного каталога:

- `/`;
- `/{city-slug}/` для опубликованного города;
- `/{city-slug}/{page-slug}/` для опубликованной не-HOME страницы;
- `/{city-slug}/{tariff-slug}/` для опубликованного тарифа;
- `/robots.txt` и `/sitemap.xml`.

`loadSiteData()` обращается к public catalog API в build-time с таймаутом 5 секунд, отбрасывает draft/archive и проверяет slug/коллизии URL до генерации. Если API недоступен, сборка по умолчанию падает с ненулевым кодом и явной причиной. Демо-Казань с двумя тарифами и текстом «Цена уточняется» возвращается только при явном `ALLOW_DEMO_DATA=true` — это осознанный локальный UX-режим, а не молчаливый fallback для production-публикации.

## Зависимости от окружения

| Переменные | Поведение без них |
| --- | --- |
| `DOMRU_COVERAGE_API_URL`, `DOMRU_COVERAGE_API_KEY` | Проверка адреса сохраняется как `MANUAL_CHECK`. |
| `DOMRU_CONTRACT_API_URL` | Новая заявка получает `MANUAL_CHECK_API`; доставка в Tarifnik не запускается. |
| `TARIFNIK_API_KEY` | Pending-заявка остается не переданной; попытка логируется только в server log. |
| `LEADS_EMAIL` и `RESEND_API_KEY` либо `LEADS_EMAIL_WEBHOOK_URL` | Обычное уведомление может тихо не уйти; email fallback завершится ошибкой. |
| `REBUILD_WEBHOOK_URL` | Rebuild-job повторяется и завершается `FAILED`; опубликованная ревизия не изменяется. |
| `REDIS_URL` | Rebuild сохраняется как `PENDING`, но не выполняется до следующего запуска API с Redis. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Seed не создаст пользователя для входа. |

## Результаты проверок

На этом срезе выполнены:

| Команда | Результат |
| --- | --- |
| `pnpm lint` | Успешно: TypeScript API, Astro web/admin и syntax check worker. |
| `pnpm db:validate` | Успешно: Prisma schema валидна. |
| `pnpm build` | Успешно с `ALLOW_DEMO_DATA=true` (или поднятым API): API, web, admin и worker собираются. Без флага и без API `apps/web` build осознанно падает — см. TD-03. |
| `pnpm test` | 102/102 успешно, включая строгие public DTO, rate-limit policy, honeypot и production proxy boundary, infrastructure/release readiness и migration dependency Compose, cookie-auth и browser CORS admin, экраны тарифов, городов и заявок, отсутствие CRM-workspace, public catalog и multi-city paths, worker-only boundary, канонический XLSX на 207 городов, атомарный full-snapshot импорт тарифов, slug redirects/conflicts, rebuild flow, одноразовый fallback-доступ и четыре сценария реальной Astro-сборки. |
| Заполненный PostgreSQL 18 | `migrate:deploy` применил 11 миграций; seed идемпотентен; city import создал 206 и обновил 1 город, создал 1236 страниц. Tariff import `cmtt6xtjt00000steq81olqx4` применил 3 859/3 859 строк, удалил 2 demo-тарифа и сохранил 3 345 описаний и 2 396 пар TV-счетчиков. Итог: 207 городов и 3 859 тарифов; у Казани 22 тарифа, опубликована только Казань, публичный Алейск возвращает 404. |
| GitHub Actions CI | `.github/workflows/ci.yml` запускает `pnpm check` на каждый push и pull request в `master`; допустимого красного baseline нет. |
| Readiness API | Собранный API против локальных PostgreSQL/Redis: `/health`, `/health/live`, `/health/ready` вернули HTTP 200; dependency checks — `up`. |
| Release configuration | `/admin/readiness`: без credentials HTTP 401; с сервисным токеном текущий локальный контур возвращает `blocked` и только имена отсутствующих integrations. |
| Migration container | Production API image собран с `--frozen-lockfile`; one-shot `migrate` успешно выполнил `prisma migrate deploy` из контейнера против PostgreSQL и подтвердил 11/11 примененных миграций. |
| `docker compose -f docker-compose.prod.yml config --no-interpolate` | YAML читается; `migrate -> api -> worker` dependency chain и `/health/ready` присутствуют. Это не полный production rehearsal. |

Все подтвержденные проблемы, их влияние и рекомендуемый порядок исправления перечислены в [техническом долге](technical-debt.md). Последовательность исполнения — в [плане реализации](plans/2026-09-07-platform-stabilization-and-mvp.md).
