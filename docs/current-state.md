# Текущее состояние проекта

Дата среза: 10 сентября 2026 года. Источник этого документа — исходный код, Prisma-схема, Docker-конфигурация и результаты локальных проверок на текущей ветке `master`. Он описывает фактическое состояние, а не только согласованный продуктовый замысел из [реестра решений](decisions.md).

## Краткий вывод

Репозиторий содержит работоспособный локальный каркас платформы, но не production-систему. Полностью реализованы базовая инфраструктура, схема данных, API основных сущностей, двухэтапный импорт городов и тарифов, прием заявок и механика их доставки. Публичный сайт умеет строить опубликованные города из API, но при текущих статусах фактически выводит только Казань; админка работает с реальными тарифами, городами и заявками. Отдельный CRM-frontend удален после переноса его функций в `/leads`.

## Статус по направлениям

| Направление | Статус | Что есть сейчас | Граница или условие |
| --- | --- | --- | --- |
| Monorepo и локальная инфраструктура | Реализовано | pnpm workspace, Docker Compose, PostgreSQL 18, Redis 8; отдельный Git-based Coolify Compose без захвата host 80/443, с runtime web publisher, runtime-only Coolify API token и Basic Auth middleware; one-shot services исключены из health, долгоживущие сервисы имеют проверки; Docker dependency stages используют workspace filters, общий BuildKit pnpm-store cache, bounded network retry и production-only trusted frozen lockfile; publication symlink заменяется без следования ссылке на каталог | Production-подобный локальный Compose подтвердил migrations, seed, публикацию, healthy API/worker/web/admin/PostgreSQL/Redis и нулевые рестарты; cold/warm сборки заняли 343,15/81,85 с. Два последовательных live deployment коммита `1eeb609` завершились за 146/85 с; после второго ресурс остался `running:healthy`, а 30/30 контрольных запросов к web/API/admin вернули 200. |
| Данные и миграции | Реализовано | Prisma-схема, 13 версионированных миграций, production Compose one-shot `migrate` до старта API, проверенный идемпотентный seed; `0013_lead_provider_outcomes` применена локально; загружены 207 городов и канонический snapshot из 3 859 тарифов | Новая миграция должна быть применена production one-shot сервисом при следующем deploy; seed остается явной одноразовой операторской операцией; нет истории изменений тарифа, корзины, версий контента и журнала действий. |
| API и доступ | Частично реализовано | NestJS/Fastify, DB/Redis-aware readiness, process-only liveness и защищенный configuration gate внешних интеграций, строгая глобальная DTO-валидация для login и публичных write-routes, Redis-backed rate limit, 12-часовая HttpOnly-cookie сессия для browser login/me/logout, совместимый Bearer, единый уровень доступа администратора; `/internal/*` изолирован сервисным `x-admin-token` | Admin CRUD еще частично валидирует тела вручную; нет session renewal и аудита действий; configuration gate не доказывает внешний SLA/договор. |
| Города и страницы | Частично реализовано | CRUD API, admin `/cities` со списком 207 городов, поиском, XLSX-preview/apply, историей и rebuild status; warnings требуют подтверждения, новый город и шесть его страниц создаются в `DRAFT` | В опубликованном состоянии остается только Казань; нет публикационного workflow, расписания, шаблонов и массовых операций. Импорт пока разрешен только для односайтовой конфигурации. |
| Тарифы | Частично реализовано | CRUD, XLSX preview и атомарный full-snapshot apply, удаление отсутствующих строк, подтверждение warnings, проверка уникальности URL, сохранение полного описания и TV-счетчиков, ключ идентичности, SEO JSON и redirect при ручной смене URL с выпрямлением прежней цепочки | Нет истории/rollback и редактора полной модели. |
| Публичная витрина | Частично реализовано | Astro static paths из опубликованных `City`/`Page`/`Tariff`, динамическая городская навигация, FAQ, карточки тарифов, robots и sitemap; обычная форма заявки на страницах услуг/тарифов принимает адрес и телефон и показывает только короткое подтверждение; отдельная видимая проверка запрашивает телефон только после найденного Дом.ру, показывает альтернативы со ссылкой на Tarifnik либо телефон поддержки; все адресные поля используют серверные DaData-подсказки; honeypot сохранен | В текущей БД опубликована только Казань; HTML и redirect matchers читаются только во время сборки. Нет постоянного browser E2E — ветки flow проверяются API-тестами и контрактом итогового HTML. |
| Проверка адреса | Реализовано | Серверные DaData `suggest/clean`, сверка нормализованных города и региона с опубликованным городом формы, официальный Tarifnik `address/check`, словарь провайдеров, отдельные `hasAnyProvider`/`hasTargetProvider`, HTTP 404 как однозначный пустой список и сохранение проверенного snapshot в `AddressCheck`; живыми probes подтверждены Дом.ру, только альтернативный провайдер и отсутствие провайдеров | Адрес другого города отклоняется до Tarifnik и БД. HTTP/сеть/невалидная структура дают `ERROR`; отсутствие конфигурации или подтвержденной DaData-подсказки дает `MANUAL_CHECK`. |
| Заявки | Частично реализовано | Сохранение контекста, дубликаты, обязательный fail-closed routing по persisted coverage snapshot, проверка договора при любом непустом списке провайдеров, полный справочник Дом.ру из 551 уникального регионально однозначного профиля и 37 fallback, отдельные причины непередачи, официальный DTO `appeal/create`, строгая проверка `created`/`created_duplicate` и `appeal_id`, retry только временных сбоев, журнал попыток, admin `/leads` и одноразовая fallback-ссылка; sandbox-прогон с `utm_campaign=test` вернул `created_duplicate`, тестовый абонент Набережных Челнов подтвердил непустой `contacts`, синтетическое письмо Resend принято HTTP 200 и получено владельцем | Прямой lead без `addressCheckId` сохраняется только для ручной проверки и никогда не доставляется автоматически. Срок хранения 180 дней согласован; юридическое основание обработки еще не утверждено; серверной пагинации журнала нет. |
| Фоновые задачи | Частично реализовано | API ставит `lead-deliveries` и persistent `site-rebuilds`; worker регистрирует ежедневный `maintenance` scheduler для 180-дневного PII purge; rebuild имеет дедупликацию по сайту, 3 попытки, backoff и статусы в PostgreSQL; Coolify adapter сохраняет deployment UUID, опрашивает финал и возобновляет незавершенный deployment после retry; production application содержит runtime-only Coolify API token и UUID ресурса без публикации их значений; реальный polling rehearsal завершился статусом `finished`; Resend test-письмо принято | У `tariff-imports` нет producer; backup/restore rehearsal и обработка HTTP-ошибки обычного Resend-уведомления [#86](https://github.com/Celtoman/astro-telekom/issues/86) остаются до реального приема заявок. |
| Админка | Частично реализовано | React/Tailwind/shadcn; отдельный login, общий cookie-aware API client, проверка сессии перед shell, logout, `/lead-access/`, рабочие `/tariffs`, `/cities`, `/leads` и `/redirects`. Экран редиректов создает, редактирует, архивирует/восстанавливает правила и показывает hit count/last hit. Недостоверный legacy dashboard и browser service-token удалены; browser CORS поддерживает все используемые mutation methods | Tariff list пока ограничивает отрисовку первыми 100 совпадениями, а leads list загружает весь набор без серверной пагинации. Управление публикацией городов не реализовано; предложения редиректов из 404 еще отсутствуют. |
| SEO и аналитика | Частично реализовано | HTML-first генерация, title/description/canonical/JSON-LD, robots, sitemap из всех опубликованных городов/страниц/тарифов с корневым URL; production build требует чистый HTTPS `PUBLIC_SITE_URL` и внешний HTTPS `PUBLIC_API_URL` с path `/api/v1`; обязательный post-build gate сверяет sitemap, robots, raw HTML и `noindex` 404; события Метрики | Нет Schema.org-профиля сущностей, управления sitemap из админки и реальной аналитики. |
| Тестирование | Частично реализовано | `pnpm lint`, `pnpm db:validate`, `pnpm build`, `pnpm test`; 161/161 node tests проходят; admin входит в Astro check; DaData, оба Tarifnik-контракта, полный справочник профилей Дом.ру, сопоставление адреса городу, безопасная классификация retry, API input security, PII retention, infrastructure/release readiness, Docker/Coolify, public catalog/multi-city/redirect/SEO build-policy, imports и отсутствие CRM-workspace проверяются артефактами | Нет постоянного browser/E2E-покрытия. |

## Реализованный путь данных

```text
Администратор или XLSX
  -> NestJS API -> PostgreSQL через Prisma
  -> persistent SiteRebuild -> Redis/BullMQ -> worker
  -> internal start/result API + deployment provider

Публичная Astro-сборка
  -> GET /public/sites/{PUBLIC_SITE_SLUG}/cities во время build
  -> статический HTML для опубликованных City/Page/Tariff

Посетитель
  -> POST /address-suggestions -> DaData suggest
  -> POST /address-checks -> DaData clean -> проверка города -> Tarifnik address/check -> AddressCheck
  -> POST /leads -> routing + профиль Дом.ру по данным DaData + contract check -> Lead
  -> только найденный Дом.ру + NOT_FOUND -> очередь lead-deliveries -> Tarifnik или email fallback
```

Это фактический реализованный путь. Обычная форма выполняет проверку под капотом; наличие хотя бы одного провайдера запускает проверку действующего абонента независимо от наличия Дом.ру. Очередь доставки разрешается только при найденном Дом.ру и подтвержденном `NOT_FOUND`. Видимая проверка создает лид с телефоном лишь после обнаружения Дом.ру и отдельного второго шага формы.

Главное следствие статической архитектуры: изменение данных в PostgreSQL не меняет уже опубликованный HTML само по себе. API сохраняет rebuild-job до ответа CRUD, worker выполняет его с retry, а статус `SUCCEEDED` появляется только после явного финального ответа deployment provider. Для Coolify реализована цепочка `start → сохранить deployment_uuid → bounded polling → final status`; `queued`/`in_progress` и timeout не публикуют ревизию, а retry продолжает сохраненный deployment. Механика [#57](https://github.com/Celtoman/astro-telekom/issues/57) подтверждена реальным polling rehearsal и закрыта.

## Реализованные публичные маршруты

Публичный фронтенд генерирует маршруты из опубликованного каталога:

- `/`;
- `/{city-slug}/` для опубликованного города;
- `/{city-slug}/{page-slug}/` для опубликованной не-HOME страницы;
- `/{city-slug}/{tariff-slug}/` для опубликованного тарифа;
- `/robots.txt` и `/sitemap.xml`.

`loadSiteData()` обращается к public catalog API в build-time с таймаутом 5 секунд, отбрасывает draft/archive и проверяет slug/коллизии URL до генерации. Если API недоступен, сборка по умолчанию падает с ненулевым кодом и явной причиной. До prerender production build требует `PUBLIC_SITE_URL` как чистый HTTPS origin и `PUBLIC_API_URL` как внешний HTTPS URL с path `/api/v1`; нормализованное значение browser API встраивается в форму. После prerender verifier сравнивает весь indexable `*/index.html` с sitemap, отклоняет неизвестные плоские HTML-файлы и проверяет canonical, title, description, единственный H1, robots без глобального `Disallow`, отсутствие loopback-ссылок и `noindex` без canonical у 404. Демо-Казань и loopback URL возвращаются только при явном `ALLOW_DEMO_DATA=true` — это осознанный локальный UX-режим, а не fallback для production-публикации.

Прямой Production Compose принимает отдельный `SITE_DATA_API_URL`, но не оркестрирует первый bootstrap: API нужен уже на стадии Docker build, раньше runtime `depends_on`. Целевой `docker-compose.coolify.yml` устраняет цикл: API и явный initial seed выполняются до runtime Astro publisher, а web стартует только после успешной публикации. Локальная production-подобная проверка полного stack подтвердила ту же последовательность, успешные one-shot контейнеры и устойчивые healthchecks с нулевым restart count. На live Coolify v4.3.18 два последовательных deployment одного commit завершились штатно; второй занял 85 секунд, использовал 54 кешированных шага и не содержал install retry, network timeout или build error. После контрольной выдержки resource сохранил `running:healthy`.

Внешний test deployment работает в Coolify из GitHub на `tv-internet-dom.ru` и `admin.tv-internet-dom.ru` без дополнительного stage-контура. Схема не публикует API напрямую: оба сайта проксируют `/api/*` same-origin, а Compose Basic Auth закрывает все их маршруты. Финальный live smoke подтвердил `401` без credentials, `200` с ними на web/admin и API health routes, защитный `X-Robots-Tag` и `302` с `www` на основной host.

## Зависимости от окружения

| Переменные | Поведение без них |
| --- | --- |
| Любая из `DADATA_TOKEN`, `DADATA_SECRET`, `DADATA_SUGGEST_API_URL`, `DADATA_CLEAN_API_URL` | Подсказки или нормализация адреса недоступны; проверка не получает разрешающий coverage snapshot. |
| Любая из `TARIFNIK_ADDRESS_CHECK_API_URL`, `TARIFNIK_API_KEY`, `TARIFNIK_TARGET_PROVIDER_ID` | Проверка адреса сохраняется как `MANUAL_CHECK`; автоматическая доставка запрещена. |
| `DOMRU_CONTRACT_API_URL` либо отсутствие подходящего профиля в `apps/api/src/assets/domru-city-profiles.csv` | Новая заявка получает `MANUAL_CHECK_API`; доставка в Tarifnik не запускается. Городские public-параметры не являются секретами окружения. |
| Любая из `TARIFNIK_API_URL`, `TARIFNIK_API_KEY`, `TARIFNIK_UTM_CAMPAIGN` | Pending-заявка остается не переданной; автоматический вызов CRM не выполняется. |
| `LEADS_EMAIL` и `RESEND_API_KEY` либо `LEADS_EMAIL_WEBHOOK_URL` | Обычное уведомление может тихо не уйти; email fallback завершится ошибкой. |
| Полная конфигурация выбранного `REBUILD_PROVIDER` | Rebuild-job повторяется и завершается `FAILED`; опубликованная ревизия не изменяется. Для `webhook` нужен `REBUILD_WEBHOOK_URL`, для `coolify` — API URL/token/resource UUID. |
| `REDIS_URL` | Rebuild сохраняется как `PENDING`, но не выполняется до следующего запуска API с Redis. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Seed не создаст пользователя для входа. |

## Результаты проверок

На этом срезе выполнены:

| Команда | Результат |
| --- | --- |
| `pnpm lint` | Успешно: TypeScript API, Astro web/admin и syntax check worker. |
| `pnpm db:validate` | Успешно: Prisma schema валидна. |
| `pnpm build` | Успешно с `ALLOW_DEMO_DATA=true` для локального demo или с API и корректным HTTPS `PUBLIC_SITE_URL` для production: API, web, admin и worker собираются; web post-build SEO gate проходит. Без явного demo-флага локальный/пустой origin и недоступный API блокируют сборку. |
| `pnpm test` | 161/161 успешно, включая DaData suggest/clean, официальный Tarifnik address/delivery contract, полный каталог профилей Дом.ру, проверку города адреса, safe retry classification, public DTO, rate-limit policy, honeypot, PII purge, infrastructure/release readiness, Docker/Coolify, cookie-auth/admin UI, imports, redirects, rebuild flow, production origin и обязательный SEO verifier реальной Astro-сборки. |
| Заполненный PostgreSQL 18 | `migrate:deploy` применил все 13 миграций, включая `0013_lead_provider_outcomes`; seed идемпотентен; city import создал 206 и обновил 1 город, создал 1236 страниц. Tariff import `cmtt6xtjt00000steq81olqx4` применил 3 859/3 859 строк, удалил 2 demo-тарифа и сохранил 3 345 описаний и 2 396 пар TV-счетчиков. Итог: 207 городов и 3 859 тарифов; у Казани 22 тарифа, опубликована только Казань, публичный Алейск возвращает 404. |
| GitHub Actions CI | `.github/workflows/ci.yml` запускает `pnpm check` на каждый push и pull request в `master`; допустимого красного baseline нет. |
| Readiness API | Собранный API против локальных PostgreSQL/Redis: `/health`, `/health/live`, `/health/ready` вернули HTTP 200; dependency checks — `up`. |
| Release configuration | Все обязательные группы локального `ReleaseReadinessService` заполнены: DaData, coverage, общий contract endpoint, Tarifnik, Resend, Coolify rebuild и согласованные 180 дней `PII_RETENTION_DAYS`. `RESEND_API_KEY` добавлен отдельной production runtime/literal/shown-once переменной Coolify без вывода значения; синтетическое письмо с настроенными sender/recipient принято Resend HTTP 200 и получено владельцем. Runtime-readiness будет перепроверен после deployment текущей версии; юридическое основание обработки остается отдельным решением. |
| PII retention runtime | На отдельной временной БД с 12 миграциями worker-only endpoint без token вернул 401; с policy удалил старый лид, каскадные delivery/activity/history, осиротевший AddressCheck и истекший token, сохранив и отвязав свежий duplicate. В отдельной пустой Redis DB BullMQ зарегистрировал `pii-retention-daily` с UTC cron; временные DB после проверки удалены. |
| Migration container | Production API image собран с `--frozen-lockfile`; one-shot `migrate` успешно выполнил `prisma migrate deploy` из контейнера против PostgreSQL и подтвердил 12/12 примененных миграций. |
| `docker compose -f docker-compose.prod.yml config --no-interpolate` | YAML читается; `migrate -> api -> worker` dependency chain и `/health/ready` присутствуют. Это не полный production rehearsal. |

Все подтвержденные проблемы, их влияние и рекомендуемый порядок исправления перечислены в [техническом долге](technical-debt.md). Последовательность исполнения — в [плане реализации](plans/2026-09-07-platform-stabilization-and-mvp.md).
