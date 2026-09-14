# API-контракты текущего прототипа

Базовый prefix: `/api/v1`. Документ сверен 14 сентября 2026 года с маршрутами, зарегистрированными в `apps/api/src/module.ts`. Он не обещает endpoints из продукта, если их нет в коде.

## Общие правила

- API работает на NestJS/Fastify и принимает JSON; server body limit — 35 MB.
- Browser CORS использует credentialed requests для `ADMIN_URL` и явно разрешает методы `GET`, `HEAD`, `POST`, `PATCH`, `DELETE`, `OPTIONS`. Не полагаться на default methods Fastify CORS: без явного списка browser preflight блокирует существующие admin mutation routes.
- `POST /auth/login` создает 12-часовую сессию и возвращает только expiry и пользователя; raw token передается браузеру исключительно в `HttpOnly`, `SameSite=Strict` cookie `admin_session`. В PostgreSQL хранится SHA-256 hash.
- Защищенные административные маршруты принимают cookie-сессию или совместимый `Authorization: Bearer <token>`. `x-admin-token`, совпадающий с `ADMIN_API_TOKEN`, предназначен для машинного сценария; `/internal/*` принимает только его и отклоняет пользовательские сессии.
- У пользовательского доступа один уровень — администратор. Любой активный пользователь с действующей сессией имеет одинаковый полный доступ ко всем административным routes, включая `/crm/leads`; ролевой модели нет.
- Глобальный `ValidationPipe` преобразует DTO, не допускает лишние поля (`forbidNonWhitelisted`) и не возвращает значения в validation errors. Строгими class-based DTO покрыты login, `address-checks`, `leads` и `lead-access`; часть admin CRUD пока сохраняет ручную валидацию.
- Глобальный Redis-backed rate limiter по IP возвращает `429`, но хранит отдельные счетчики по назначению route: по умолчанию 5 login-запросов, 60 запросов подсказок, по 10 запросов проверки адреса, создания заявки и lead-access, а также 300 остальных запросов за 60 секунд. Значения настраиваются `RATE_LIMIT_*`; query string не создает новый bucket, а один API-route не расходует лимит другого. При ошибке Redis limiter не пропускает запрос. Production Compose включает `TRUST_PROXY=true`, поскольку API доступен только через Caddy.

## Public routes

| Method | Route | Реальное поведение |
| --- | --- | --- |
| GET | `/health/live` | Liveness процесса: возвращает `{ status: "ok", service: "api" }` без обращения к зависимостям. |
| GET | `/health/ready` | Readiness PostgreSQL и Redis: HTTP 200 при обеих доступных зависимостях, HTTP 503 при сбое; ответ содержит только `up`/`down`, без адресов и внутренних ошибок. |
| GET | `/health` | Совместимый alias readiness с тем же 200/503-контрактом; Compose использует явный `/health/ready`. |
| GET | `/public/sites/:siteSlug/cities` | Build-time контракт Release 1: опубликованный сайт, отдельные `globalPages`, отсортированные опубликованные города с их контентными Page/Tariff/visible blocks, authoritative `routes` и только эффективные redirects. `routes` содержит ровно `/`, пять обязательных global path и `/{city.slug}` каждого опубликованного города; service/tariff detail в него не входят. Отсутствующая/лишняя общая страница, неверный slug, дубль или коллизия города дают ошибку вместо расширения output. |
| GET | `/public/sites/:siteSlug/cities/:citySlug` | Возвращает опубликованный город, опубликованные страницы/тарифы, visible blocks и shallow inheritance content. |
| GET | `/public/sites/:siteSlug/redirects/:id` | Для опубликованного сайта и redirect возвращает HTTP 301 с относительным `Location`, только пока source свободен, а target входит в текущий Release 1 route inventory; атомарно увеличивает `hitCount` и записывает `lastHitAt`. Неэффективная, неопубликованная или вышедшая за границу релиза запись возвращает 404 без учета перехода. |
| POST | `/address-suggestions` | Проверяет опубликованные site/city, один раз на 24 часа получает мягкий КЛАДР-приоритет через DaData IPLocate и серверно вызывает `suggest/address`; возвращает до 5 структурированных подсказок, не раскрывая DaData credentials браузеру. |
| POST | `/address-checks` | Серверно нормализует выбранную DaData-подсказку через `clean/address`, вызывает официальный Tarifnik `address/check`, сохраняет полный проверенный snapshot и возвращает публичный результат без raw provider response. |
| POST | `/leads` | Сохраняет заявку, выявляет дубликат и принимает routing-решение только по persisted `AddressCheck`. Отсутствующая/ошибочная проверка не разрешает contract check или delivery; очередь ставится только для найденного Дом.ру после однозначного `NOT_FOUND`. |
| POST | `/lead-access/:leadId/consume` | Однократно обменивает 43-символьный fallback token на минимальную карточку одной заявки; истекший, измененный, отозванный, повторный или относящийся к другой заявке token возвращает 401. |

Для `address-checks` и `leads` по умолчанию подставляется `siteSlug=domru-kazan`; endpoint публично принимает только published site/city/page/tariff. Этот default — свойство прототипа, не универсальный контракт платформы.

### `POST /address-suggestions`

Тело: обязательный `query`; опциональны `siteSlug`, `citySlug` и пустой honeypot `website`. API принимает только published site/city как проверенный контекст страницы, ограничивает query официальным максимумом 300 символов и передает в DaData глобальный запрос с `count: 5`. Первый запрос без валидной `address_city_kladr` cookie вызывает серверный IPLocate по `request.ip`; API сохраняет на 24 часа только 13-значный КЛАДР-код либо `none` в HttpOnly/SameSite=Lax cookie. Полученный код передается исключительно в `locations_boost`; IP и определенная география не сохраняются в БД/Redis/заявке. При ошибке, таймауте, локальном IP или `location: null` используется мягкий boost `{ region, city }` опубликованной страницы. Параметр `locations` не передается, поэтому пользователь может выбрать адрес любого города. Валидный ответ без совпадений возвращает пустой список; настоящий HTTP/сетевой сбой или невалидный ответ `suggest/address` возвращает `503`, а сбой IPLocate не меняет успешность подсказок. Собственный rate limit API возвращает `429` с `Retry-After`.

### `POST /address-checks`

Тело: `address` обязателен; структурированная `suggestion` содержит `value`, `unrestricted_value`, `data`; опциональны `siteSlug`, `citySlug`, `pageSlug`, `objectType`. Отсутствующий `pageSlug` не отправляется: пустая строка не является slug и строго отклоняется. Поля ограничены по типу и длине, неизвестные поля возвращают 400. Публичная форма также отправляет пустое honeypot-поле `website`; непустое значение отклоняется до БД и внешних интеграций. Возможные статусы: `AVAILABLE`, `UNAVAILABLE`, `AMBIGUOUS`, `MANUAL_CHECK`, `ERROR`.

Перед Tarifnik API выбранная подсказка проходит серверный DaData `clean/address`; результат преобразуется в тот же envelope, что в рабочем боте: `value=source`, `unrestricted_value=source`, `data=<clean result>`. География нормализованного адреса не сравнивается с городом страницы: `citySlug` определяет опубликованный контекст и источник обращения, а Tarifnik получает фактический адрес пользователя. `POST /address/check` получает ровно `{ suggestion }` с Bearer token. HTTP 200 обязан содержать непустой словарь `providerId: providerName`; HTTP 404 — однозначный пустой список провайдеров; 403/422, сеть, невалидный JSON или неверная структура дают `ERROR`. Без полного DaData/Tarifnik набора переменных либо без валидной подсказки ответ будет `MANUAL_CHECK`; ни один из этих исходов не интерпретируется как разрешение delivery.

В persisted snapshot раздельно сохраняются `providers`, `targetProviderId`, `hasAnyProvider` и `hasTargetProvider`. Наличие хотя бы одного провайдера запускает проверку действующего абонента независимо от наличия Дом.ру, но delivery дополнительно требует присутствия Дом.ру. Для видимой проверки только наличие Дом.ру открывает второй шаг с телефоном, после чего применяется тот же фильтр абонента.

### `POST /leads`

Обязательны `phone` и `citySlug`. Также допускаются slug страницы/тарифа, ссылка на `addressCheckId`, контакты, адрес, service type, UTM, referrer, URL, form name, time on site, device, до 50 viewed pages и до 100 activity events. Браузерные numeric IDs и неизвестные поля не принимаются: API разрешает только slug. UTM допускает только стандартные `utm_id`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `utm_source_platform`, `utm_creative_format` и `utm_marketing_tactic` со строками до 256 символов. `viewedPages` ограничен 16 KB JSON, весь `activity` — 64 KB, а `activity[].data` — 4 KB, 20 ключами, короткими безопасными именами, строками до 500 символов и не более одним уровнем вложенных containers. Непустое honeypot-поле `website` отклоняется до сохранения.

`citySlug` и сохраняемый `Lead.cityId` обозначают город страницы-источника, а не обязаны совпадать с географией адреса подключения. При наличии `addressCheckId` фактический нормализованный адрес и DaData city/settlement/region берутся только из связанного persisted snapshot; проверка принадлежности check тому же сайту и контексту страницы сохраняется как защита от подмены.

Контроллер сравнивает телефон или нормализованный адрес с лидами того же сайта за последние 24 часа. Статусы обработки: `PENDING`, `DELIVERED`, `DUPLICATE_SUPPRESSED`, `ACTIVE_SUBSCRIBER_NOT_SENT`, `PROVIDER_NOT_AVAILABLE_NOT_SENT`, `NO_PROVIDERS_NOT_SENT`, `MANUAL_CHECK`, `ADDRESS_CLARIFICATION`, `MANUAL_CHECK_API`, `DELIVERY_QUEUE_ERROR`, `DELIVERY_ERROR_EMAIL_SENT`, `DELIVERY_ERROR_EMAIL_FAILED`. Сбой постановки BullMQ job не маскируется как ожидание: создается failed attempt канала `QUEUE`, а лид получает `DELIVERY_QUEUE_ERROR`.

Проверка действующего абонента использует фактическую схему рабочего бота: общий публичный endpoint Дом.ру `contract-asterisked`, телефон `7XXXXXXXXXX` в query-параметре `contact`, `isActive=1` и городской профиль `origin/providerid/referer`. Профиль выбирается по нормализованным DaData городу и региону из встроенного UTF-8 справочника: 555 исходных строк, 551 уникальная пара «регион + населенный пункт» и 37 явных региональных fallback-профилей. В окружении требуется только `DOMRU_CONTRACT_API_URL`; отдельного API key нет. Неопределенный город или отсутствующий профиль дает `NOT_CONFIGURED`.

Только валидный JSON с явно присутствующим `contacts: []` означает `NOT_FOUND` и разрешает дальнейшее решение о delivery. Непустой массив означает `ACTIVE`. HTML, пустое тело, невалидный JSON, отсутствие массива `contacts`, неверный телефон, HTTP- или сетевая ошибка дают `ERROR`; лид остается на ручной проверке через `MANUAL_CHECK_API`, и автоматическая передача в Tarifnik не запускается.

Worker повторно проверяет persisted coverage snapshot и однозначный `contractResult.status=NOT_FOUND`/`active=false` перед внешним вызовом. Административный retry разрешен после ошибки очереди, после исчерпанной доставки либо для старого orphan `PENDING` без единой API-попытки; ручные/ошибочные решения coverage или проверки абонента обойти нельзя. Новый ручной цикл начинается со следующего свободного глобального номера API-attempt, но получает собственный retry budget. Официальный `appeal/create` payload содержит только `utm_campaign` из runtime-конфигурации, нормализованный `phone`, допустимый `belong_type`, исходный нормализованный `suggestion` и опциональное имя. HTTP 200 считается успехом только при `result: created | created_duplicate` и непустом `appeal_id`. Автоматические повторы через 5 и 30 минут выполняются только для сети/таймаута, HTTP 408, 425, 429 и 5xx; `Retry-After` для 429 учитывается с верхней границей 24 часа. Постоянный 4xx, невалидный JSON или неожиданный 2xx сразу переводят доставку в email/webhook fallback.

Обычная browser-форма принимает адрес и телефон, но после сохранения показывает только «Спасибо! Заявка отправлена», не раскрывая внутренний исход. Видимая проверка сначала создает `AddressCheck` без телефона: Дом.ру открывает второй шаг заявки, альтернативы ведут на `tarifnik.ru`, пустой список показывает телефон поддержки, а ошибочный/неоднозначный результат не создает лид.

`POST /leads` возвращает `subscriberMode: true` только при persisted-решении `ACTIVE_SUBSCRIBER_NOT_SENT`. Это подсказка для некритичной UI-персонализации, а не credential: API не возвращает HMAC/cookie и не принимает browser-флаг в решении о доставке.

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
| GET/POST/PATCH | `/admin/pages` | Page records. `COVERAGE`, `CITIES`, `PRIVACY`, `PERSONAL_DATA_CONSENT` принимаются только с `cityId: null` и каноническим slug; все остальные типы требуют непустой `cityId`. Несовместимый scope отклоняется до записи. |
| GET/POST | `/admin/pages/:pageId/blocks` | Просмотр упорядоченных blocks и создание блока по строгому type-specific контракту ниже. |
| PATCH/DELETE | `/admin/blocks/:id` | Изменение и удаление blocks. Изменение `blockType` или `data` объединяется с сохраненными корневыми полями и повторно валидирует полный блок; переданное `data` должно быть полным объектом нового типа. |
| GET | `/admin/tariffs` | Cursor-страница каталога тарифов с минимальным list DTO; поддерживает `limit`, `cursor` и поиск `q` по названию, slug или городу. |
| GET | `/admin/tariffs/:id` | Полная карточка тарифа, provider/city context, no-slash `publicPath` и серверный allowlisted `attributeSchema` для длинной формы. |
| POST | `/admin/tariffs` | Создание тарифа с единым identity key `cityId:slug:serviceType`. |
| PATCH | `/admin/tariffs/:id` | Class-based DTO изменения allowlisted полей. Требует `expectedUpdatedAt`; устаревшая форма получает 409. Обязательные поля не принимают `null`, nullable-поля цены/скорости/текста/attributes/SEO очищаются явно. Цена, city/slug, status и SEO требуют `confirmSensitiveChanges`; URL-конфликты проверяются до serializable commit. Ответ раздельно возвращает сохраненный тариф, redirect outcome и rebuild outcome, включая честный `ENQUEUE_FAILED`. |
| GET/POST/PATCH/DELETE | `/admin/redirects` | Список, создание, изменение и архивирование redirects. Published-правило допускает только свободный source и target из Release 1 inventory того же сайта; опубликованный tariff/service detail не является допустимой целью. Пока пять обязательных global pages не опубликованы, публикация redirect блокируется HTTP 409 с причиной неполного inventory. Петли и цепочки блокируются. `DELETE` сохраняет запись как `ARCHIVED`, каждое изменение ставит rebuild. |
| POST | `/admin/tariffs/import` | Старый программный import массива items. |
| POST | `/admin/tariffs/import/validate` | XLSX или rows -> сохраненный versioned validation report со snapshot всего каталога выбранного провайдера. Preview отклоняет URL тарифов, занятые опубликованными страницами. Для файла действуют лимиты 25 МБ, 10 000 строк и 256 столбцов; legacy `.xls` отклоняется. Совместимость с актуальным canonical tariff generator закреплена реальным generated fixture с пустыми optional-ячейками. |
| POST | `/admin/tariffs/import/apply` | Атомарно применяет полный snapshot по `runId`; при warnings требует `confirmWarnings: true`. |
| GET | `/admin/tariffs/imports`, `/admin/tariffs/imports/:id` | История и полный report import. |
| POST | `/admin/cities/import/validate` | XLSX или rows -> versioned city import report с номером строки, normalized candidate, существующим snapshot и field-level diff, включая смену региона. Для файла действуют лимиты 25 МБ, 10 000 строк и 256 столбцов; legacy `.xls` отклоняется. Сохраненный report прежней версии требует повторной проверки файла перед apply. |
| POST | `/admin/cities/import/apply` | В serializable-транзакции атомарно применяет run и переводит его в `APPLIED` только с полным `actions` map: существующий slug допускает `update`/`skip`, новый — `create`/`skip`. Пропущенные, лишние, неизвестные и несовместимые действия, а также изменившийся после validate city snapshot отклоняются; при warnings дополнительно требуется `confirmWarnings: true`. |
| GET | `/admin/cities/imports`, `/admin/cities/imports/:id` | История и полный report city import. |
| GET | `/admin/rebuilds`, `/admin/rebuilds/:id` | Persistent статус пересборки; список можно фильтровать по `siteId`. |
| POST | `/internal/site-rebuilds/:id/start` | Worker фиксирует начало попытки и получает payload/revision; только сервисный `x-admin-token`. |
| POST | `/internal/site-rebuilds/:id/provider-progress` | Worker сохраняет deployment UUID/status только для текущей processing revision; stale progress игнорируется; только сервисный `x-admin-token`. |
| POST | `/internal/site-rebuilds/:id/result` | Worker сохраняет финальный provider result или ошибку попытки; только сервисный `x-admin-token`. |

После успешной мутации content/city/tariff CRUD routes дожидаются сохранения `SiteRebuild` и постановки job, если доступен Redis. Ответ CRUD не означает, что static web уже пересобран: публикация подтверждена только когда `publishedRevision === requestedRevision` и статус равен `SUCCEEDED`.

### Контракт `PageBlock`

Корневой объект допускает только `blockType`, `position`, `visible`, `data`, `source`. При создании обязательны `blockType`, неотрицательный целый `position` до `2147483647` и объект `data`; `visible`, если передан, должен быть boolean, а `source` — `null` либо непустая строка до 200 символов без HTML-разметки. Неизвестные корневые поля отклоняются. Строки внутри `data` должны быть непустыми после trim и не могут содержать `<` или `>`.

| `blockType` | Точный объект `data` |
| --- | --- |
| `hero` | Обязательные `title` (до 120) и `text` (до 1000); опциональный CTA задается парой `ctaText` (до 80) + `ctaHref` (до 2048), отдельно они не принимаются; `eyebrow` (до 80) также опционален. CTA принимает локальный path без завершающего слэша, простой `#fragment` или внешний HTTPS URL без credentials; whitespace, backslash, protocol-relative и executable schemes отклоняются. |
| `rich_text` | Обязательные `title` до 120 и `text` до 4000 символов. |
| `tariff_grid` | Обязательный `title` до 120 символов; опциональные `serviceType` (`INTERNET`, `INTERNET_TV`, `TV`), целый `limit` 1–12 и сохраненный для будущих релизов `morePageType`. Тарифы не хранятся в блоке: Release 1 renderer фильтрует опубликованные предложения текущего города и ведет каждую карточку к `#address-check`, не создавая detail URL. |
| `service_grid` | `title` до 120 и `items` из 1–8 объектов с точными полями `pageType`, `title`, `text`; разрешены page types `INTERNET`, `INTERNET_TV`, `TV`, `ADDRESS_CHECK`, `FAQ`, строки ограничены 120/1000 символами. В Release 1 `pageType` сохраняется как будущая семантика, а действие карточки ведет к `#address-check`. |
| `feature_grid` | `title` до 120 и `items` из 1–8 объектов `{ title, text }` с лимитами 120/1000. |
| `steps` | `title` до 120 и `items` из 2–8 объектов `{ title, text }` с лимитами 120/1000. |
| `faq` | `title` до 120 и `items` из 1–12 объектов `{ question, answer }` с лимитами 240/4000. |

Во всех `data` и элементах массивов действует exact allowlist ключей. Admin list и public catalog стабильно сортируют блоки по `position`, затем по `id`. PATCH, меняющий discriminator или `data`, валидирует полный объединенный блок и условно записывает его только при неизменном сохраненном `blockType`; конкурентная смена типа дает 409. Public catalog возвращает только `visible` blocks, повторно валидирует каждый сохраненный блок и fail-closed требует ровно один видимый `hero` у любой непустой блочной страницы. В Release 1 Astro рендерит блоки городской `HOME`; остальные опубликованные Page могут оставаться в каталоге как данные будущих релизов, но маршрутов не получают. Адресная форма остается системным компонентом и не входит в `PageBlock`.

`SiteRebuild` дедуплицируется по сайту; `affectedPaths` сейчас всегда `["/*"]`, потому что пересобирается весь static artifact. BullMQ делает до трех попыток с exponential backoff 30 секунд. Legacy webhook получает `rebuildId`, `siteId`, `dedupeKey`, `affectedPaths`, `revision` и idempotency header `<rebuildId>:<revision>` и обязан вернуть финальный `SUCCEEDED`. Coolify adapter запускает resource, сохраняет `deployment_uuid`, опрашивает deployment и преобразует только `finished` в `SUCCEEDED`; pending/failure/timeout опубликованную ревизию не меняют.

### Import contracts

Тарифный import читает первый лист и требует колонки `subekt_rf`, `gorod_name`, `gorod_slug`, `tarif_type`, `post_title`, `post_title_lat`, `nazvanie_tarifa`, `skorost_interneta`, `stoimost_tarifa`. Поддерживаются только типы `Интернет` и `Интернет+ТВ`. Отчет валидирует slug, города выбранного provider, дубли business key, скорость, цену, статусы `-1/0/1`, booleans `0/1` и необязательные TV-счетчики. Identity key одинаков для импорта и ручной правки: `cityId:slug:serviceType`; уникальность публичного URL отдельно обеспечивается `(cityId, slug)`. `tv_channels_total` и `tv_channels_hd` должны быть неотрицательными целыми, причем HD не может быть больше общего числа каналов. Отчет также возвращает preview diff с количеством создаваемых, обновляемых и удаляемых тарифов.

Все source-specific поля закрыты единым реестром `TARIFF_ATTRIBUTE_FIELDS`: текст, card/meta-поля, описания, `show_on_site`, booleans, TV-счетчики, онлайн-кинотеатры, оборудование/цены и статусы услуг. Импорт и PATCH используют один нормализатор типов и отклоняют неизвестные непустые колонки/ключи; пустые значения не создают JSON-ключ. Реестр возвращается detail endpoint как схема формы, поэтому импортируемое поле не может быть молча недоступно для проверки и ручной правки. `show_on_site` хранится в `attributes` только как рекомендация источника и не изменяет `Tariff.status`; `connection_cost` нормализуется отдельно в nullable `Tariff.connectionFee` и входит в public catalog для build-time отображения.

Городской import принимает русские и латинские aliases для субъекта, грамматических форм, slug, legacy URL и офиса, включая фактические комбинированные заголовки канонического `data/imports/cities.xlsx`. Apply блокируется при errors, а при warnings требует явного `confirmWarnings: true`. Регионы и города предварительно загружаются в transaction-local maps, одинаковый нормализованный slug объединяет «Республика Татарстан» из seed и «Татарстан» из XLSX. Каждый примененный город получает `PUBLISHED`; новый город создается с одной `PUBLISHED` страницей `HOME`. Полный пакет выполняется с transaction timeout 30 секунд.

Apply тарифа трактует файл как полный snapshot провайдера: partial apply через `acceptedKeys` отклоняется, перед записью повторно сверяются exact tariff snapshot и конфликты slug, а legacy report требует новой проверки файла. Все строки и условный переход run `VALIDATED -> APPLIED` применяются в одной serializable-транзакции с timeout 120 секунд; отсутствующие в новом файле тарифы удаляются. После commit пересборка ставится для всех сайтов провайдера. Ручная смена city/slug тарифа может сохранить provenance-aware redirect, но пока detail URL тарифа не входит в Release 1, такое правило остается неэффективным. Public catalog и runtime resolver fail-closed пропускают только target из актуального route inventory.

## Заявки администратора и internal routes

| Method | Route | Поведение |
| --- | --- | --- |
| GET | `/crm/leads` | Cursor-страница минимального list DTO заявок; поддерживает `limit`, `cursor`, поиск `q` и фильтр `status`. Тяжелые relations доступны только в detail endpoint. |
| GET | `/crm/leads/:id` | Детальная карточка с адресной проверкой, delivery attempts, notification evidence и activity. |
| PATCH | `/crm/leads/:id/status` | Изменяет операторский status и добавляет history с optimistic concurrency. |
| POST | `/crm/leads/:id/retry-delivery` | Безопасно повторно ставит eligible lead в очередь после `DELIVERY_QUEUE_ERROR`, исчерпанной доставки либо orphan `PENDING` без API-attempts. Возвращает фактический `PENDING` или `DELIVERY_QUEUE_ERROR`; не обходит coverage/subscriber routing. |
| POST | `/crm/leads/:id/retry-notification` | Повторно ставит обычное оповещение только после финального `FAILED`; увеличивает revision, создает новый provider idempotency key и возвращает `QUEUED` либо сохраненный `PENDING`. Автоматические попытки внутри revision используют общий ключ. |
| POST | `/crm/leads/:id/revoke-fallback-access` | Отзывает все еще активные одноразовые fallback tokens заявки. Защищен общим admin guard. |
| POST | `/internal/lead-deliveries/:id` | Worker-only handler очереди. Защищен тем же guard. |
| POST | `/internal/lead-notifications/:id` | Worker-only обработчик persistent outbox; принимает attempt/maxAttempts/revision и сохраняет безопасный outcome. Защищен service token guard. |
| POST | `/internal/pii-retention` | Worker-only bounded purge: требует service `x-admin-token` и валидный `PII_RETENTION_DAYS`, удаляет один batch просроченных лидов с cascade-данными, истекшие fallback tokens и осиротевшие старые AddressCheck; возвращает только cutoff и счетчики. |

Оба list endpoint используют стабильную сортировку по timestamp и `id`, `limit=25` по умолчанию и жесткий максимум 100. `cursor` — непрозрачная base64url-позиция; неверное значение дает HTTP 400. Ответ имеет вид `{ items, pageInfo: { limit, total, hasNextPage, nextCursor } }`, где `total` относится ко всему текущему фильтру, а не только к остатку после cursor. `/crm/leads` дополнительно возвращает глобальную `summary` для карточек `total/new/pending/attention`. List DTO заявки содержит только поля журнала, город и безопасный статус notification; история, delivery attempts, activity, результаты проверок и остальные PII загружаются через `/crm/leads/:id` после явного открытия карточки.

Retention endpoint физически удаляет весь `Lead`, чтобы PII не осталось в `contractResult`, `apiResult`, UTM или delivery JSON. Cascade удаляет `LeadDeliveryAttempt`, `LeadNotification`, `LeadActivityEvent`, `LeadStatusHistory` и `LeadAccessToken`; старые `AddressCheck` удаляются только после исчезновения всех ссылок. Свежий duplicate, ссылающийся на удаляемый лид, предварительно отвязывается. Один вызов ограничен `PII_RETENTION_BATCH_SIZE` (default 500, максимум 5000); worker повторяет batches и запускает scheduler ежедневно. Согласованный срок для сырых заявок — 180 дней. Без валидного `PII_RETENTION_DAYS` endpoint возвращает 503, scheduler отключен, а release readiness остается `blocked`.

## Отсутствующие routes

В коде нет endpoints для action log, media, analytics, variables, publication schedule, preview, rollback, SEO validation, page templates, tariff history и предложений редиректов из 404. Callback от Tarifnik не реализован, поскольку партнерский API его не предоставляет. Эти возможности нельзя считать частью текущего API.
