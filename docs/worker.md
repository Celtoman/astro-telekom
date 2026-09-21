# Фоновые задачи

Worker запускается из `services/worker/src/index.mjs`. Он требует `REDIS_URL`, подключается через `ioredis` и создает пять BullMQ consumers и одну maintenance queue с двумя Job Scheduler.

В Coolify worker имеет отдельный container healthcheck `services/worker/src/healthcheck.mjs`. Проверка создает короткоживущее Redis-соединение с отключенными бесконечными retry и требует ответ `PONG`; она не выполняет business job и не зависит от очереди, но не позволяет считать worker здоровым при потере Redis.

| Queue | Consumer | Текущий producer | Фактический статус |
| --- | --- | --- | --- |
| `lead-deliveries` | POST `/api/v1/internal/lead-deliveries/:id` с `ADMIN_API_TOKEN` | `LeadDeliveryService` в API | Работает при настроенном Redis и отдельном worker. |
| `lead-notifications` | POST `/api/v1/internal/lead-notifications/:id` с `ADMIN_API_TOKEN` | `LeadNotificationOutboxService` в API | Persistent outbox: три DB-accounted попытки с exponential backoff 30 секунд, periodic recovery и revision/attempt job ID. |
| `tariff-imports` | Legacy route удален | В коде не найден | Listener остался без producer и не используется; админка вызывает versioned validate/apply напрямую. |
| `site-rebuilds` | POST deployment provider, затем `/api/v1/internal/site-rebuilds/:id/result` | `RebuildQueueService` в API | Persistent job в PostgreSQL, три попытки BullMQ с exponential backoff 30 секунд. |
| `maintenance` | POST `/api/v1/internal/pii-retention` и `/api/v1/internal/site-publications/release-due` с `ADMIN_API_TOKEN` | Job Scheduler `pii-retention-daily` и `publication-schedules-every-minute` | PII job регистрируется только при валидном `PII_RETENTION_DAYS`; publication reconciler регистрируется всегда и каждую минуту передает наступившие snapshots в `site-rebuilds`. |

## Доставка заявок

1. `POST /leads` создает `Lead` и при `PENDING` вызывает `LeadDeliveryService.enqueueTracked`. Проверка Dom.ru выполняется при наличии хотя бы одного провайдера, но `PENDING` допустим только при одновременном наличии Дом.ру, проверенном `AddressCheck` и однозначном ответе `contacts: []`. Профиль Дом.ру выбирается по нормализованным DaData городу и региону из полного встроенного справочника.
2. Если определен `REDIS_URL`, API ставит BullMQ job с допустимым детерминированным `jobId=lead-delivery-<leadId>-attempt-<attemptNumber>`. Ошибка producer создает failed `QUEUE` attempt и переводит лид в `DELIVERY_QUEUE_ERROR`, а не остается скрытым `PENDING`.
3. Worker вызывает внутренний endpoint; тот запускает `LeadDeliveryService.process`.
4. Успехом считаются только `created` или `created_duplicate` с непустым `appeal_id`; тогда создается успешный `LeadDeliveryAttempt`, а лид получает `DELIVERED`.
5. Сетевая ошибка/таймаут и HTTP 408, 425, 429 или 5xx создают failed attempt и следующую задачу с задержкой 5, затем 30 минут. Глобальный `attemptNumber` всегда растет, а отдельный `retryNumber` отсчитывает три автоматические попытки внутри каждого нового ручного цикла. Для 429 валидный `Retry-After` заменяет стандартную задержку, но ограничивается 24 часами. Если отложенную задачу создать не удалось, ложное `nextAttemptAt` очищается.
6. Постоянные 4xx и неоднозначные успешные ответы не повторяются. Они сразу направляются в email/webhook fallback; временная ошибка приходит туда после третьей неудачи. Итог — `DELIVERY_ERROR_EMAIL_SENT` или `DELIVERY_ERROR_EMAIL_FAILED`.

Один `deliveryKey` используется для связи всех локальных попыток конкретного лида, но не передается в недокументированных header/payload. Официальный API Tarifnik не предоставляет idempotency key; сохраненный партнером дубль возвращается как успешный `created_duplicate`. Поэтому автоматический retry ограничен только ошибками, которые с высокой вероятностью являются временными.

Административный `POST /crm/leads/:id/retry-delivery` разрешен для `DELIVERY_QUEUE_ERROR`, двух финальных delivery-error статусов и старого orphan `PENDING` без API-attempts. Для завершенной, заблокированной coverage/subscriber или уже начавшей API-доставку заявки повтор отклоняется. Это позволяет восстановить незапущенную очередь без обхода продуктовой маршрутизации и без конфликта уникального `(leadId, attemptNumber, channel)`.

## Оповещение оператора о новой заявке

1. `POST /leads` в одной транзакции создает `Lead` и связанную `LeadNotification`; outbox не копирует телефон, адрес, email или текст письма.
2. После commit API ставит отдельный job `lead-notification-<notificationId>-revision-<revision>-attempt-<attempt>`. Сбой producer возвращает запись в `PENDING` с безопасным `queue_error`; startup и минутный reconciler повторно ставят незавершенные записи. Счетчик попыток хранится в PostgreSQL и не сбрасывается при потере Redis.
3. Worker вызывает защищенный `/internal/lead-notifications/:id` с 30-секундным timeout. API атомарно переводит запись в `RUNNING`, поэтому второй worker не может одновременно отправить то же оповещение. Свежий `RUNNING` не отбирается при rolling restart; только запись старше двухминутного lease возвращается в очередь.
4. Resend success требует HTTP 2xx и непустой message ID; webhook success требует HTTP 2xx. Внешний запрос ограничен 15 секундами. В outbox сохраняются transport, provider ID, число попыток, безопасный error code и HTTP status, но не response body.
5. Типизированные ошибки сети/чтения ответа и HTTP 408/425/429/5xx повторяются не более трех раз с exponential backoff. Постоянные 4xx, неверный response contract, отсутствие transport и неизвестный implementation exception завершаются `FAILED` без бессмысленных повторов; последний сохраняется только как безопасный `internal_error`.
6. Admin показывает статус в журнале и карточке. `POST /crm/leads/:id/retry-notification` разрешен только для `FAILED`, через compare-and-swap увеличивает revision и ставит новый job, поэтому два параллельных оператора не запускают две отправки.

Доставка имеет at-least-once семантику: если внешний transport принял сообщение, а API завершился до записи `SUCCEEDED`, возможен повтор. Все автоматические попытки одного revision передают Resend/webhook общий idempotency header `lead-notification-<leadId>-revision-<revision>`, чтобы transport подавил дубль; manual retry увеличивает revision и получает новый ключ для нового цикла.

## Удаление просроченных PII

1. Worker проверяет, что `PII_RETENTION_DAYS` — целое число от 1 до 3650. При отсутствии или ошибке scheduler не создается, а `/admin/readiness` остается `blocked`.
2. Scheduler ежедневно создает `pii-retention` job. Cron можно изменить через `PII_RETENTION_CRON`; timezone фиксирован UTC.
3. Worker вызывает worker-only endpoint и повторяет до 100 batches по `PII_RETENTION_BATCH_SIZE` (default 500, максимум 5000). Непогашенный backlog приводит к retry job, а не к ложному success.
4. API в serializable transaction выбирает старые лиды по `createdAt`, отвязывает более свежие duplicates и физически удаляет старые лиды. FK cascade удаляет status history, activity, delivery payloads, notification evidence и access tokens.
5. Истекшие fallback tokens удаляются независимо, а старые `AddressCheck` — только если на них больше не ссылается ни один лид. Ответ содержит только cutoff и счетчики, без удаленных данных.

Hard-delete выбран, чтобы PII не осталось в JSON payloads. Согласованный срок хранения сырых заявок — 180 дней; юридическое основание обработки и текст согласия остаются отдельным release-блокером.

Локальная runtime-проверка подтвердила scheduler metadata `key=pii-retention-daily`, `name=pii-retention`, pattern `0 3 * * *`, timezone UTC в отдельной Redis DB; test DB после проверки очищена.

## Публикация по расписанию

1. Admin передает будущий ISO timestamp и точный `expectedWorkingRevision`. API сразу сохраняет неизменяемый `SitePublication` со статусом `SCHEDULED`; более поздние рабочие правки его каталог не меняют.
2. До наступления срока оператор может отменить расписание. Снимок физически не удаляется: получает `CANCELLED` и `cancelledAt`.
3. BullMQ Job Scheduler `publication-schedules-every-minute` каждую минуту вызывает worker-only endpoint. API в serializable-транзакции bounded-пакетом до 25 записей переводит наступившие snapshots в `PENDING`.
4. Если для сайта уже активна или опубликована более новая ревизия, старый наступивший snapshot отменяется автоматически и не попадает в deployment.
5. Каждый захваченный snapshot передается в обычный `RebuildQueueService`; повторная постановка того же publication ID идемпотентна. Если enqueue падает, API возвращает запись в `SCHEDULED`, а maintenance job получает ошибку и повторяется по BullMQ retry policy.
6. Пятиминутный lease позволяет следующему reconciler вернуть в работу `PENDING` snapshot, если API остановился после DB-claim, но до создания rebuild. Только финальный успех обычного rebuild продвигает опубликованную ревизию.

Время хранится как `TIMESTAMPTZ`; browser переводит выбранное локальное время в ISO UTC. Текущая точность запуска — до одной минуты плюс фактическое ожидание очереди и длительность полной статической сборки.

## Поведение без Redis

Если API запущен без `REDIS_URL`, delivery и lead notification выполняются в памяти процесса через `queueMicrotask` или `setTimeout`. Это удобно для локального прототипа; delivery restart API может потерять, а notification остается в PostgreSQL и восстанавливается при следующем старте API. Rebuild без Redis не вызывает deployment напрямую: запись остается в PostgreSQL со статусом `PENDING`; отложенный snapshot остается `SCHEDULED`, пока отдельный worker не вызовет due reconciler. После запуска API с Redis незавершенные notification/rebuild записи повторно публикуются в BullMQ. Worker без `REDIS_URL` не стартует корректно как полноценный async consumer, поэтому production обязательно должен использовать Redis.

## Пересборка статического сайта

1. После ручного сохранения тарифа API в одной serializable-транзакции создает только рабочую ревизию и audit event. Явная немедленная либо запланированная публикация отдельно фиксирует неизменяемый `SitePublication`; только при запуске этот ID передается в `SiteRebuild`. Ответ CRUD означает, что рабочая версия сохранена, но не что сайт опубликован.
2. Дедупликация идет по `site:<siteId>`. Поскольку текущий deployment выпускает весь static artifact, `affectedPaths` честно равен `["/*"]`; точечная пересборка не вводилась.
3. `requestedPublicationId` может обновиться во время сборки, но `/start` фиксирует его как `processingPublicationId`. `web-publish` читает именно этот снимок; следующий job получает более новый requested snapshot. Совместимый rebuild без snapshot по-прежнему явно очищает stale IDs и временно собирает текущий каталог, но текущие content mutators такие jobs не создают.
4. API ставит BullMQ job с тремя попытками и exponential backoff 30 секунд. Worker получает через внутренний `/start` endpoint номер ревизии и payload, затем сам вызывает deployment provider.
5. При `REBUILD_PROVIDER=webhook` worker отправляет в `REBUILD_WEBHOOK_URL` поля `rebuildId`, `siteId`, `dedupeKey`, `affectedPaths`, `revision` и idempotency header `<rebuildId>:<revision>`; HTTP 2xx без финального `SUCCEEDED` считается ошибкой. При `REBUILD_PROVIDER=coolify` worker делает авторизованный `POST /api/v1/deploy` по resource UUID, сразу сохраняет полученный `deployment_uuid` через `/provider-progress`, затем ограниченно опрашивает `GET /api/v1/deployments/{uuid}`.
6. Финальный успех помечает processing publication как `SUCCEEDED` и продвигает `Site.publishedRevision`; финальная ошибка помечает только этот snapshot как `FAILED`. Последняя успешная публикация остается источником public API.
7. Статусы rebuild, счетчик попыток, ошибка и ответ провайдера сохраняются в PostgreSQL и читаются через `/admin/rebuilds`. Отдельного admin-журнала `SitePublication` пока нет.

В Coolify-режиме `queued` и `in_progress` — промежуточные состояния, `finished` преобразуется в `SUCCEEDED`, а `failed`/cancelled/неизвестный статус и timeout приводят к ошибке попытки без продвижения `publishedRevision`. UUID и последний provider status сохраняются, поэтому retry продолжает незавершенный deployment; новый запуск создается только после финального failure или при отсутствии UUID. В БД сохраняется сокращенный provider payload без logs и API token. Реализация [#57](https://github.com/Celtoman/astro-telekom/issues/57) подтверждена реальным Coolify polling rehearsal до `finished` на точном deployment commit.

## Остановка процесса

Worker перехватывает `SIGINT`/`SIGTERM`: закрывает все пять `Worker` и maintenance queue (дожидаясь текущих задач через `close()`), затем завершает Redis-соединение. Live-проверка под реальной нагрузкой (`docker compose stop worker` с активной задачей) не выполнена — см. [workaround-audit.md](research/2026-09-07-workaround-audit.md), W-08.

## Оставшийся неиспользуемый listener

У `tariff-imports` по-прежнему нет producer: admin вызывает validate/apply через API напрямую. До отдельного решения этот listener не является частью надежного import-процесса.
