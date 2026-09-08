# API-контракты текущего прототипа

Базовый prefix: `/api/v1`. Документ описывает маршруты, зарегистрированные в `apps/api/src/module.ts` на 7 сентября 2026 года. Он не обещает endpoints из продукта, если их нет в коде.

## Общие правила

- API работает на NestJS/Fastify и принимает JSON; server body limit — 35 MB.
- Browser CORS использует credentialed requests для `ADMIN_URL` и явно разрешает методы `GET`, `HEAD`, `POST`, `PATCH`, `DELETE`, `OPTIONS`. Не полагаться на default methods Fastify CORS: без явного списка browser preflight блокирует существующие admin mutation routes.
- `POST /auth/login` создает 12-часовую сессию и возвращает только expiry и пользователя; raw token передается браузеру исключительно в `HttpOnly`, `SameSite=Strict` cookie `admin_session`. В PostgreSQL хранится SHA-256 hash.
- Защищенные административные маршруты принимают cookie-сессию или совместимый `Authorization: Bearer <token>`. `x-admin-token`, совпадающий с `ADMIN_API_TOKEN`, предназначен для машинного сценария; `/internal/*` принимает только его и отклоняет пользовательские сессии.
- У пользовательского доступа один уровень — администратор. Любой активный пользователь с действующей сессией имеет одинаковый полный доступ ко всем административным и CRM routes; ролевой модели нет.
- Общий `ValidationPipe` не включен. Контроллеры проверяют часть полей вручную; нельзя считать TypeScript body-interface полноценной runtime-валидацией.

## Public routes

| Method | Route | Реальное поведение |
| --- | --- | --- |
| GET | `/health` | Возвращает `{ status: "ok", service: "api" }`; не проверяет подключение к БД или внешние интеграции. |
| GET | `/public/sites/:siteSlug/cities/:citySlug` | Возвращает опубликованный город, опубликованные страницы/тарифы, visible blocks и shallow inheritance content. |
| POST | `/address-checks` | Проверяет адрес через `CoverageService`, сохраняет `AddressCheck`, возвращает публичный результат без raw provider response. |
| POST | `/leads` | Сохраняет заявку, пытается выявить дубликат, при допустимом адресе проверяет договор и ставит delivery. |
| POST | `/lead-access/:leadId/consume` | Однократно обменивает 43-символьный fallback token на минимальную карточку одной заявки; истекший, измененный, отозванный, повторный или относящийся к другой заявке token возвращает 401. |

Для `address-checks` и `leads` по умолчанию подставляется `siteSlug=domru-kazan`; endpoint публично принимает только published site/city/page/tariff. Этот default — свойство прототипа, не универсальный контракт платформы.

### `POST /address-checks`

Тело: `address` обязателен; опциональны `siteSlug`, `citySlug`, `pageSlug`, `objectType`. Возможные статусы: `AVAILABLE`, `UNAVAILABLE`, `AMBIGUOUS`, `MANUAL_CHECK`, `ERROR`.

Если не заданы обе переменные coverage-интеграции, ответ будет `MANUAL_CHECK`. API не интерпретирует это как `available: false`.

### `POST /leads`

Обязательны `phone` и `citySlug`. Также допускаются slug страницы/тарифа, ссылка на `addressCheckId`, контакты, адрес, service type, UTM, referrer, URL, form name, time on site, device, viewed pages и activity. Браузерные numeric IDs не принимаются: API разрешает только slug.

Контроллер сравнивает телефон или нормализованный адрес с лидами того же сайта за последние 24 часа. Статусы обработки: `PENDING`, `DELIVERED`, `DUPLICATE_SUPPRESSED`, `ACTIVE_SUBSCRIBER_NOT_SENT`, `MANUAL_CHECK`, `ADDRESS_CLARIFICATION`, `MANUAL_CHECK_API`, `DELIVERY_ERROR_EMAIL_SENT`, `DELIVERY_ERROR_EMAIL_FAILED`.

Без `DOMRU_CONTRACT_API_URL` результат проверки договора — `NOT_CONFIGURED`, а лид переводится в `MANUAL_CHECK_API`, поэтому delivery не запускается. Публичный ответ остается нейтральным: `{ id, status, message: "Заявка принята" }`, дополнительно может вернуть subscriber cookie.

## Auth и административные routes

| Method | Route | Назначение |
| --- | --- | --- |
| POST | `/auth/login` | Email/password -> HttpOnly-cookie session; JSON не содержит raw token. |
| GET | `/auth/me` | Проверяет cookie/Bearer-сессию и возвращает `{ user: { id, email } }`. |
| POST | `/auth/logout` | Отзывает текущую persisted-сессию и очищает cookie; вызов идемпотентен. |
| GET/POST/PATCH | `/admin/providers` | Provider records. |
| GET/POST/PATCH | `/admin/sites` | Site records. |
| GET/POST/PATCH | `/admin/users` | Учетные записи администраторов, deactivate/password reset. Поле `role` не поддерживается. |
| GET/POST/PATCH | `/admin/regions` | Region records. |
| GET/POST/PATCH | `/admin/cities` | City records. |
| GET/POST/PATCH | `/admin/pages` | Page records. |
| GET/POST | `/admin/pages/:pageId/blocks` | Просмотр и создание blocks. |
| PATCH/DELETE | `/admin/blocks/:id` | Изменение и удаление blocks. |
| GET/POST/PATCH | `/admin/tariffs` | Tariff records. |
| POST | `/admin/tariffs/import` | Старый программный import массива items. |
| POST | `/admin/tariffs/import/validate` | XLS/XLSX или rows -> сохраненный validation report. |
| POST | `/admin/tariffs/import/apply` | Атомарно применяет полный snapshot по `runId`; при warnings требует `confirmWarnings: true`. |
| GET | `/admin/tariffs/imports`, `/admin/tariffs/imports/:id` | История и полный report import. |
| POST | `/admin/cities/import/validate` | XLS/XLSX или rows -> city import report. |
| POST | `/admin/cities/import/apply` | Применяет run с optional per-row `create`/`update`/`skip`; при warnings требует `confirmWarnings: true`. |
| GET | `/admin/cities/imports`, `/admin/cities/imports/:id` | История и полный report city import. |
| GET | `/admin/rebuilds`, `/admin/rebuilds/:id` | Persistent статус пересборки; список можно фильтровать по `siteId`. |
| POST | `/internal/site-rebuilds/:id/start` | Worker фиксирует начало попытки и получает payload/revision; только сервисный `x-admin-token`. |
| POST | `/internal/site-rebuilds/:id/result` | Worker сохраняет финальный provider result или ошибку попытки; только сервисный `x-admin-token`. |

После успешной мутации content/city/tariff CRUD routes дожидаются сохранения `SiteRebuild` и постановки job, если доступен Redis. Ответ CRUD не означает, что static web уже пересобран: публикация подтверждена только когда `publishedRevision === requestedRevision` и статус равен `SUCCEEDED`.

`SiteRebuild` дедуплицируется по сайту; `affectedPaths` сейчас всегда `["/*"]`, потому что пересобирается весь static artifact. BullMQ делает до трех попыток с exponential backoff 30 секунд. Deployment webhook получает `rebuildId`, `siteId`, `dedupeKey`, `affectedPaths`, `revision` и idempotency header `<rebuildId>:<revision>`; provider обязан дедуплицировать ключ и вернуть финальный JSON `{ "status": "SUCCEEDED", "deploymentId"?: "...", "url"?: "..." }`. HTTP 2xx без финального статуса считается ошибкой.

### Import contracts

Тарифный import читает первый лист и требует колонки `subekt_rf`, `gorod_name`, `gorod_slug`, `tarif_type`, `post_title`, `post_title_lat`, `nazvanie_tarifa`, `skorost_interneta`, `stoimost_tarifa`. Поддерживаются только типы `Интернет` и `Интернет+ТВ`. Отчет валидирует slug, города выбранного provider, дубли business key и уникальность `post_title_lat` внутри города, скорость, цену, статусы `-1/0/1`, booleans `0/1` и необязательные TV-счетчики. `tv_channels_total` и `tv_channels_hd` должны быть неотрицательными целыми, причем HD не может быть больше общего числа каналов. Отчет также возвращает preview diff с количеством создаваемых, обновляемых и удаляемых тарифов.

Полное описание и TV-счетчики сохраняются в preview candidate и затем в `Tariff.attributes` под стабильными ключами `opisanie_tarifa`, `tv_channels_total`, `tv_channels_hd`. Описание очищается от внешних пробелов, счетчики нормализуются в числа, пустые значения не создают JSON-ключ. Это source-specific данные, отдельные top-level поля API для них не вводятся.

Городской import принимает русские и латинские aliases для субъекта, грамматических форм, slug, legacy URL и офиса, включая фактические комбинированные заголовки канонического `data/imports/cities.xlsx`. Apply блокируется при errors, а при warnings требует явного `confirmWarnings: true`. Регионы и города предварительно загружаются в transaction-local maps, одинаковый нормализованный slug объединяет «Республика Татарстан» из seed и «Татарстан» из XLSX. Новый город получает через bulk insert шесть `DRAFT` страниц: home, internet, internet-tv, tv, address-check и faq; полный пакет выполняется с transaction timeout 30 секунд.

Apply трактует файл как полный snapshot провайдера: partial apply через `acceptedKeys` отклоняется, все строки применяются в одной транзакции с timeout 120 секунд для канонического объема, отсутствующие в новом файле тарифы удаляются, а статус import run меняется вместе с данными. После commit пересборка ставится для всех сайтов провайдера, включая сайты только с удалениями. Ручная смена city/slug тарифа атомарно создает redirect со старого URL; занятый опубликованной страницей URL или несовместимый существующий redirect возвращает conflict. Публичное обслуживание записей `Redirect` остается отдельной задачей TD-07.

## CRM и internal routes

| Method | Route | Поведение |
| --- | --- | --- |
| GET | `/crm/leads` | Возвращает полный список заявок с relations, без пагинации. |
| GET | `/crm/leads/:id` | Детальная карточка с адресной проверкой, попытками и activity. |
| PATCH | `/crm/leads/:id/status` | Изменяет операторский status и добавляет history с optimistic concurrency. |
| POST | `/crm/leads/:id/retry-delivery` | Возвращает eligible lead в `PENDING` и ставит первую delivery attempt. |
| POST | `/crm/leads/:id/revoke-fallback-access` | Отзывает все еще активные одноразовые fallback tokens заявки. Защищен CRM guard. |
| POST | `/internal/lead-deliveries/:id` | Worker-only handler очереди. Защищен тем же guard. |

`/crm/leads` сейчас возвращает PII без серверной пагинации и фильтрации. Admin `/leads` использует endpoint только после проверки HttpOnly-cookie сессии и фильтрует полученный список в браузере; для большого объема нужна отдельная серверная пагинация.

## Отсутствующие routes

В коде нет endpoints для redirects, action log, media, analytics, variables, publication schedule, preview, rollback, SEO validation, page templates, tariff history и callback statuses from Tarifnik. Их нельзя считать частью текущего API.
