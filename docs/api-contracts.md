# API-контракты текущего прототипа

Базовый prefix: `/api/v1`. Документ описывает маршруты, зарегистрированные в `apps/api/src/module.ts` на 9 сентября 2026 года. Он не обещает endpoints из продукта, если их нет в коде.

## Общие правила

- API работает на NestJS/Fastify и принимает JSON; server body limit — 35 MB.
- Browser CORS использует credentialed requests для `ADMIN_URL` и явно разрешает методы `GET`, `HEAD`, `POST`, `PATCH`, `DELETE`, `OPTIONS`. Не полагаться на default methods Fastify CORS: без явного списка browser preflight блокирует существующие admin mutation routes.
- `POST /auth/login` создает 12-часовую сессию и возвращает только expiry и пользователя; raw token передается браузеру исключительно в `HttpOnly`, `SameSite=Strict` cookie `admin_session`. В PostgreSQL хранится SHA-256 hash.
- Защищенные административные маршруты принимают cookie-сессию или совместимый `Authorization: Bearer <token>`. `x-admin-token`, совпадающий с `ADMIN_API_TOKEN`, предназначен для машинного сценария; `/internal/*` принимает только его и отклоняет пользовательские сессии.
- У пользовательского доступа один уровень — администратор. Любой активный пользователь с действующей сессией имеет одинаковый полный доступ ко всем административным routes, включая `/crm/leads`; ролевой модели нет.
- Глобальный `ValidationPipe` преобразует DTO, не допускает лишние поля (`forbidNonWhitelisted`) и не возвращает значения в validation errors. Строгими class-based DTO покрыты login, `address-checks`, `leads` и `lead-access`; часть admin CRUD пока сохраняет ручную валидацию.
- Глобальный Redis-backed rate limiter по IP возвращает `429`: по умолчанию 5 login-запросов, 10 публичных write-запросов одного route и 300 остальных запросов за 60 секунд. Значения настраиваются `RATE_LIMIT_*`; при ошибке Redis limiter не пропускает запрос. Production Compose включает `TRUST_PROXY=true`, поскольку API доступен только через Caddy.

## Public routes

| Method | Route | Реальное поведение |
| --- | --- | --- |
| GET | `/health/live` | Liveness процесса: возвращает `{ status: "ok", service: "api" }` без обращения к зависимостям. |
| GET | `/health/ready` | Readiness PostgreSQL и Redis: HTTP 200 при обеих доступных зависимостях, HTTP 503 при сбое; ответ содержит только `up`/`down`, без адресов и внутренних ошибок. |
| GET | `/health` | Совместимый alias readiness с тем же 200/503-контрактом; Compose использует явный `/health/ready`. |
| GET | `/public/sites/:siteSlug/cities` | Возвращает опубликованный сайт, отсортированный каталог опубликованных городов/страниц/тарифов/visible blocks и опубликованные redirects; используется `apps/web` во время static build. |
| GET | `/public/sites/:siteSlug/cities/:citySlug` | Возвращает опубликованный город, опубликованные страницы/тарифы, visible blocks и shallow inheritance content. |
| GET | `/public/sites/:siteSlug/redirects/:id` | Для опубликованного сайта и redirect возвращает HTTP 301 с относительным `Location`; атомарно увеличивает `hitCount` и записывает `lastHitAt`. Неопубликованная или исчезнувшая запись возвращает 404. |
| POST | `/address-checks` | Проверяет адрес через `CoverageService`, сохраняет `AddressCheck`, возвращает публичный результат без raw provider response. Текущий generic-контракт еще не приведен к фактическому словарю провайдеров Tarifnik. |
| POST | `/leads` | Сохраняет заявку, пытается выявить дубликат, при допустимом адресе проверяет договор и ставит delivery. Текущий `addressCheckId` необязателен, поэтому обязательная для обычной формы серверная проверка провайдеров пока не гарантирована. |
| POST | `/lead-access/:leadId/consume` | Однократно обменивает 43-символьный fallback token на минимальную карточку одной заявки; истекший, измененный, отозванный, повторный или относящийся к другой заявке token возвращает 401. |

Для `address-checks` и `leads` по умолчанию подставляется `siteSlug=domru-kazan`; endpoint публично принимает только published site/city/page/tariff. Этот default — свойство прототипа, не универсальный контракт платформы.

### `POST /address-checks`

Тело: `address` обязателен; опциональны `siteSlug`, `citySlug`, `pageSlug`, `objectType`. Поля ограничены по типу и длине, неизвестные поля возвращают 400. Публичная форма также отправляет пустое honeypot-поле `website`; непустое значение отклоняется до БД и внешних интеграций. Возможные статусы: `AVAILABLE`, `UNAVAILABLE`, `AMBIGUOUS`, `MANUAL_CHECK`, `ERROR`.

Если не заданы обе переменные coverage-интеграции, ответ будет `MANUAL_CHECK`. API не интерпретирует это как `available: false`.

Согласованный целевой контракт использует подсказанный и нормализованный DaData адрес и реальный ответ Tarifnik `address/check` со списком провайдеров. Для обычной формы наличие хотя бы одного провайдера запускает проверку действующего абонента независимо от наличия Дом.ру, но delivery дополнительно требует присутствия Дом.ру. Для видимой проверки наличие именно Дом.ру открывает второй шаг с телефоном, после чего применяется тот же фильтр абонента. Текущий `CoverageService` это разделение еще не реализует.

### `POST /leads`

Обязательны `phone` и `citySlug`. Также допускаются slug страницы/тарифа, ссылка на `addressCheckId`, контакты, адрес, service type, UTM, referrer, URL, form name, time on site, device, до 50 viewed pages и до 100 activity events. Браузерные numeric IDs и неизвестные поля не принимаются: API разрешает только slug. Непустое honeypot-поле `website` отклоняется до сохранения.

Контроллер сравнивает телефон или нормализованный адрес с лидами того же сайта за последние 24 часа. Статусы обработки: `PENDING`, `DELIVERED`, `DUPLICATE_SUPPRESSED`, `ACTIVE_SUBSCRIBER_NOT_SENT`, `MANUAL_CHECK`, `ADDRESS_CLARIFICATION`, `MANUAL_CHECK_API`, `DELIVERY_ERROR_EMAIL_SENT`, `DELIVERY_ERROR_EMAIL_FAILED`.

Проверка действующего абонента использует фактическую схему рабочего бота: публичный endpoint Дом.ру `contract-asterisked`, телефон `7XXXXXXXXXX` в query-параметре `contact`, `isActive=1` и городской профиль из `DOMRU_CONTRACT_CITY`, `DOMRU_CONTRACT_ORIGIN`, `DOMRU_CONTRACT_PROVIDER_ID`, `DOMRU_CONTRACT_REFERER`. Для Казани профиль использует `providerid=5`; отдельного `DOMRU_CONTRACT_API_KEY` у этого контракта нет. Неполный или не совпадающий с `citySlug` профиль дает `NOT_CONFIGURED`.

Только валидный JSON с явно присутствующим `contacts: []` означает `NOT_FOUND` и разрешает дальнейшее решение о delivery. Непустой массив означает `ACTIVE`. HTML, пустое тело, невалидный JSON, отсутствие массива `contacts`, неверный телефон, HTTP- или сетевая ошибка дают `ERROR`; лид остается на ручной проверке через `MANUAL_CHECK_API`, и автоматическая передача в Tarifnik не запускается.

Для обычной формы согласованный публичный ответ всегда короткий и не раскрывает внутренний исход: «Спасибо! Заявка отправлена». Видимая проверка подключения сначала возвращает результат адреса без создания лида с телефоном; только ветка с найденным Дом.ру открывает второй шаг заявки. Эти два отдельных browser flow в текущем web еще не реализованы.

## Auth и административные routes

| Method | Route | Назначение |
| --- | --- | --- |
| POST | `/auth/login` | Email/password -> HttpOnly-cookie session; JSON не содержит raw token. |
| GET | `/auth/me` | Проверяет cookie/Bearer-сессию и возвращает `{ user: { id, email } }`. |
| POST | `/auth/logout` | Отзывает текущую persisted-сессию и очищает cookie; вызов идемпотентен. |
| GET/POST/PATCH | `/admin/providers` | Provider records. |
| GET/POST/PATCH | `/admin/sites` | Site records. |
| GET/POST/PATCH | `/admin/users` | Учетные записи администраторов, deactivate/password reset. Поле `role` не поддерживается. |
| GET | `/admin/readiness` | Защищенный configuration gate: `configured`/`blocked` для coverage, contract, Tarifnik, fallback email, rebuild и валидного `PII_RETENTION_DAYS`; возвращает только имена отсутствующих переменных, никогда не значения. |
| GET/POST/PATCH | `/admin/regions` | Region records. |
| GET/POST/PATCH | `/admin/cities` | City records. |
| GET/POST/PATCH | `/admin/pages` | Page records. |
| GET/POST | `/admin/pages/:pageId/blocks` | Просмотр и создание blocks. |
| PATCH/DELETE | `/admin/blocks/:id` | Изменение и удаление blocks. |
| GET/POST/PATCH | `/admin/tariffs` | Tariff records. |
| GET/POST/PATCH/DELETE | `/admin/redirects` | Список, создание, изменение и архивирование redirects. Published-правило допускает только свободный source и существующий published target того же сайта; петли и цепочки блокируются. `DELETE` сохраняет запись как `ARCHIVED`, каждое изменение ставит rebuild. |
| POST | `/admin/tariffs/import` | Старый программный import массива items. |
| POST | `/admin/tariffs/import/validate` | XLSX или rows -> сохраненный validation report. Для файла действуют лимиты 25 МБ, 10 000 строк и 256 столбцов; legacy `.xls` отклоняется. |
| POST | `/admin/tariffs/import/apply` | Атомарно применяет полный snapshot по `runId`; при warnings требует `confirmWarnings: true`. |
| GET | `/admin/tariffs/imports`, `/admin/tariffs/imports/:id` | История и полный report import. |
| POST | `/admin/cities/import/validate` | XLSX или rows -> city import report. Для файла действуют лимиты 25 МБ, 10 000 строк и 256 столбцов; legacy `.xls` отклоняется. |
| POST | `/admin/cities/import/apply` | Применяет run с optional per-row `create`/`update`/`skip`; при warnings требует `confirmWarnings: true`. |
| GET | `/admin/cities/imports`, `/admin/cities/imports/:id` | История и полный report city import. |
| GET | `/admin/rebuilds`, `/admin/rebuilds/:id` | Persistent статус пересборки; список можно фильтровать по `siteId`. |
| POST | `/internal/site-rebuilds/:id/start` | Worker фиксирует начало попытки и получает payload/revision; только сервисный `x-admin-token`. |
| POST | `/internal/site-rebuilds/:id/provider-progress` | Worker сохраняет deployment UUID/status только для текущей processing revision; stale progress игнорируется; только сервисный `x-admin-token`. |
| POST | `/internal/site-rebuilds/:id/result` | Worker сохраняет финальный provider result или ошибку попытки; только сервисный `x-admin-token`. |

После успешной мутации content/city/tariff CRUD routes дожидаются сохранения `SiteRebuild` и постановки job, если доступен Redis. Ответ CRUD не означает, что static web уже пересобран: публикация подтверждена только когда `publishedRevision === requestedRevision` и статус равен `SUCCEEDED`.

`SiteRebuild` дедуплицируется по сайту; `affectedPaths` сейчас всегда `["/*"]`, потому что пересобирается весь static artifact. BullMQ делает до трех попыток с exponential backoff 30 секунд. Legacy webhook получает `rebuildId`, `siteId`, `dedupeKey`, `affectedPaths`, `revision` и idempotency header `<rebuildId>:<revision>` и обязан вернуть финальный `SUCCEEDED`. Coolify adapter запускает resource, сохраняет `deployment_uuid`, опрашивает deployment и преобразует только `finished` в `SUCCEEDED`; pending/failure/timeout опубликованную ревизию не меняют.

### Import contracts

Тарифный import читает первый лист и требует колонки `subekt_rf`, `gorod_name`, `gorod_slug`, `tarif_type`, `post_title`, `post_title_lat`, `nazvanie_tarifa`, `skorost_interneta`, `stoimost_tarifa`. Поддерживаются только типы `Интернет` и `Интернет+ТВ`. Отчет валидирует slug, города выбранного provider, дубли business key и уникальность `post_title_lat` внутри города, скорость, цену, статусы `-1/0/1`, booleans `0/1` и необязательные TV-счетчики. `tv_channels_total` и `tv_channels_hd` должны быть неотрицательными целыми, причем HD не может быть больше общего числа каналов. Отчет также возвращает preview diff с количеством создаваемых, обновляемых и удаляемых тарифов.

Полное описание и TV-счетчики сохраняются в preview candidate и затем в `Tariff.attributes` под стабильными ключами `opisanie_tarifa`, `tv_channels_total`, `tv_channels_hd`. Описание очищается от внешних пробелов, счетчики нормализуются в числа, пустые значения не создают JSON-ключ. Это source-specific данные, отдельные top-level поля API для них не вводятся.

Городской import принимает русские и латинские aliases для субъекта, грамматических форм, slug, legacy URL и офиса, включая фактические комбинированные заголовки канонического `data/imports/cities.xlsx`. Apply блокируется при errors, а при warnings требует явного `confirmWarnings: true`. Регионы и города предварительно загружаются в transaction-local maps, одинаковый нормализованный slug объединяет «Республика Татарстан» из seed и «Татарстан» из XLSX. Новый город получает через bulk insert шесть `DRAFT` страниц: home, internet, internet-tv, tv, address-check и faq; полный пакет выполняется с transaction timeout 30 секунд.

Apply трактует файл как полный snapshot провайдера: partial apply через `acceptedKeys` отклоняется, все строки применяются в одной транзакции с timeout 120 секунд для канонического объема, отсутствующие в новом файле тарифы удаляются, а статус import run меняется вместе с данными. После commit пересборка ставится для всех сайтов провайдера, включая сайты только с удалениями. Ручная смена city/slug тарифа атомарно создает redirect со старого URL; конфликт с опубликованной страницей/тарифом или несовместимым существующим redirect блокирует изменение. Если прежний redirect вел на старый URL, его target в той же транзакции переносится сразу на новый URL, чтобы не образовать второй hop.

## Заявки администратора и internal routes

| Method | Route | Поведение |
| --- | --- | --- |
| GET | `/crm/leads` | Возвращает полный список заявок с relations, без пагинации. |
| GET | `/crm/leads/:id` | Детальная карточка с адресной проверкой, попытками и activity. |
| PATCH | `/crm/leads/:id/status` | Изменяет операторский status и добавляет history с optimistic concurrency. |
| POST | `/crm/leads/:id/retry-delivery` | Возвращает eligible lead в `PENDING` и ставит первую delivery attempt. |
| POST | `/crm/leads/:id/revoke-fallback-access` | Отзывает все еще активные одноразовые fallback tokens заявки. Защищен общим admin guard. |
| POST | `/internal/lead-deliveries/:id` | Worker-only handler очереди. Защищен тем же guard. |
| POST | `/internal/pii-retention` | Worker-only bounded purge: требует service `x-admin-token` и валидный `PII_RETENTION_DAYS`, удаляет один batch просроченных лидов с cascade-данными, истекшие fallback tokens и осиротевшие старые AddressCheck; возвращает только cutoff и счетчики. |

`/crm/leads` сейчас возвращает PII без серверной пагинации и фильтрации. Admin `/leads` использует endpoint только после проверки HttpOnly-cookie сессии и фильтрует полученный список в браузере; для большого объема нужна отдельная серверная пагинация.

Retention endpoint физически удаляет весь `Lead`, чтобы PII не осталось в `contractResult`, `apiResult`, UTM или delivery JSON. Cascade удаляет `LeadDeliveryAttempt`, `LeadActivityEvent`, `LeadStatusHistory` и `LeadAccessToken`; старые `AddressCheck` удаляются только после исчезновения всех ссылок. Свежий duplicate, ссылающийся на удаляемый лид, предварительно отвязывается. Один вызов ограничен `PII_RETENTION_BATCH_SIZE` (default 500, максимум 5000); worker повторяет batches и запускает scheduler ежедневно. Без явно утвержденного срока endpoint возвращает 503, scheduler отключен, а release readiness остается `blocked`.

## Отсутствующие routes

В коде нет endpoints для action log, media, analytics, variables, publication schedule, preview, rollback, SEO validation, page templates, tariff history, предложений редиректов из 404 и callback statuses from Tarifnik. Их нельзя считать частью текущего API.
