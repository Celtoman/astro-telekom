# Фоновые задачи

Coolify Compose закрепляет `REBUILD_PROVIDER=static` с закрытым `STATIC_PUBLICATION_URL`. Он сначала читает immutable receipt по rebuild ID/revision, затем при необходимости вызывает controller `/publish` с exact publication/site identity. Coolify этим provider не вызывается. Неопределённый ответ, недоступный start или SQL acknowledgment переносят ту же job через BullMQ `moveToDelayed`/`DelayedError`, не расходуя bounded failure attempts и не сообщая SQL FAILED; это восстановление уже запрошенной публикации, без планирования новых публикаций. Доказанный отказ сборки/активации использует обычную retry-политику. Coolify Compose закрепляет static для API/worker; прямой prod Compose сохраняет прежний provider. Внешний rollout static ещё не выполнен.

Worker запускается из `services/worker/src/index.mjs`. Он требует `REDIS_URL`, подключается через `ioredis` и создает шесть BullMQ consumers и одну maintenance queue с двумя Job Scheduler.

В Coolify worker имеет отдельный container healthcheck `services/worker/src/healthcheck.mjs`. Проверка создает короткоживущее Redis-соединение с отключенными бесконечными retry и требует ответ `PONG`; она не выполняет business job и не зависит от очереди, но не позволяет считать worker здоровым при потере Redis.

| Queue | Consumer | Текущий producer | Фактический статус |
| --- | --- | --- | --- |
| `lead-decisions` | POST `/api/v1/internal/lead-decisions/:id` с `ADMIN_API_TOKEN` | `LeadDecisionService` после сохранения sales-заявки | DB-backed маршрут: причина → DaData Phone → проверка абонента → решение → доставка. Минутная сверка возвращает незавершенные решения после сбоя очереди или процесса. |
| `lead-deliveries` | POST `/api/v1/internal/lead-deliveries/:id` с `ADMIN_API_TOKEN` | `LeadDeliveryService` в API | Работает при настроенном Redis и отдельном worker. |
| `lead-notifications` | POST `/api/v1/internal/lead-notifications/:id` с `ADMIN_API_TOKEN` | `LeadNotificationOutboxService` в API | Persistent outbox: три DB-accounted попытки с exponential backoff 30 секунд, periodic recovery и revision/attempt job ID. |
| `tariff-imports` | Legacy route удален | В коде не найден | Listener остался без producer и не используется; админка вызывает versioned validate/apply напрямую. |
| `site-rebuilds` | POST deployment provider, затем `/api/v1/internal/site-rebuilds/:id/result` | `RebuildQueueService` в API | Persistent job в PostgreSQL, три попытки BullMQ с exponential backoff 30 секунд. |
| `maintenance` | POST `/api/v1/internal/pii-retention` и `/api/v1/internal/lead-decisions/reconcile` с `ADMIN_API_TOKEN` | Job Scheduler `pii-retention-daily` и `lead-decision-reconcile-every-minute` | PII job регистрируется только при валидном `PII_RETENTION_DAYS`; reconciler заявок запускается каждую минуту. |

## Доставка заявок

1. `POST /leads` атомарно сохраняет `Lead` и notification outbox. Sales-заявка получает `DECISION_PENDING`, а не выполняет внешнюю проверку в HTTP-запросе; несбытовые причины (`existing_subscriber_support`, `billing`), ручные причины (`relocation`, `other`), противоречащий комментарий и дубликаты сразу сохраняются без постановки в очередь. Фоновый `LeadDecisionService` сперва проверяет снимок причины/комментария, затем DaData Phone: только `qc=0` и совпадающий нормализованный номер ведут к проверке договора. Финальный иной `qc` блокирует передачу, техническая ошибка повторяется через 5 и 30 минут, после третьей попытки остается оператору. Финальный результат по телефону переиспользуется 24 часа; полный ответ DaData не сохраняется. Затем проверка Dom.ru выбирает профиль по фактическим данным DaData адреса. Лишь `contacts: []` с `NOT_FOUND` переводит заявку в delivery `PENDING`; прочее остается без автоматической передачи. Минутный reconciler восстанавливает сохраненные pending/due retry/истекший lease. Delivery worker повторно проверяет телефон, coverage, причину и отрицательный ответ по договору.
2. Если определен `REDIS_URL`, API ставит BullMQ job с допустимым детерминированным `jobId=lead-delivery-<leadId>-attempt-<attemptNumber>`. Ошибка producer создает failed `QUEUE` attempt и переводит лид в `DELIVERY_QUEUE_ERROR`, а не остается скрытым `PENDING`.
3. Worker вызывает внутренний endpoint; тот запускает `LeadDeliveryService.process`. До внешнего запроса API атомарно переводит лид из `PENDING` в `DELIVERY_API_OUTCOME_UNKNOWN` и сохраняет API attempt со статусом `OUTCOME_UNKNOWN`. Если этот маркер не записан, запрос в Tarifnik не отправляется. Повторный job не отправляет заявку при неизвестном исходе.
4. Успехом считаются только `created` или `created_duplicate` с непустым `appeal_id`; тогда в одной транзакции attempt становится `SUCCEEDED`, а лид — `DELIVERED`. Если Tarifnik принял заявку, но эта транзакция упала, оба маркера неизвестного исхода остаются для проверки оператором; failed attempt, автоматический retry и резервное письмо не создаются.
5. Сетевая ошибка/таймаут и HTTP 408, 425, 429 или 5xx переводят заранее созданный attempt в `FAILED` и назначают следующую задачу с задержкой 5, затем 30 минут. Глобальный `attemptNumber` всегда растет, а отдельный `retryNumber` отсчитывает три автоматические попытки внутри каждого нового ручного цикла. Для 429 валидный `Retry-After` заменяет стандартную задержку, но ограничивается 24 часами. Если отложенную задачу создать не удалось, ложное `nextAttemptAt` очищается.
6. Постоянные 4xx и неоднозначные успешные ответы не повторяются. Они сразу направляются в email/webhook fallback; временная ошибка приходит туда после третьей неудачи. До внешней отправки одна транзакция записывает `FAILED` API attempt и переводит `DELIVERY_API_OUTCOME_UNKNOWN` в `DELIVERY_EMAIL_OUTCOME_UNKNOWN`; без успешной записи письмо не отправляется. EMAIL attempt использует тот же глобальный `attemptNumber`, что и завершившая цикл API-попытка. Результат EMAIL и финальный статус лида сохраняются одной транзакцией: `DELIVERY_ERROR_EMAIL_SENT` при подтвержденной отправке, `DELIVERY_ERROR_EMAIL_FAILED` при ошибке транспорта. Ошибка записи после вызова транспорта оставляет видимый маркер неизвестного результата; повторный worker job не отправляет письмо второй раз автоматически.

Один `deliveryKey` используется для связи всех локальных попыток конкретного лида, но не передается в недокументированных header/payload. Официальный API Tarifnik не предоставляет idempotency key; сохраненный партнером дубль возвращается как успешный `created_duplicate`. Поэтому автоматический retry ограничен только ошибками, которые с высокой вероятностью являются временными.

Каждая завершенная попытка DaData Phone и выбранный маршрут фиксируются отдельным `LeadDecisionEvent` в той же транзакции, что и текущий статус; проверка абонента добавляет собственное событие без копирования полного ответа интеграции. После трех технических ошибок оператор может запросить одну новую попытку через защищенный `/crm/leads/:id/retry-phone-check`: событие сохраняет автора и предыдущий результат, следующий глобальный номер не сбрасывается. Повторный технический сбой этой ручной попытки снова остается финальным до нового явного действия. Reconciler после сбоя очереди восстанавливает номер ожидаемой попытки, а при истекшем lease — `decisionAttemptNumber` уже выполнявшегося job.

Административный `POST /crm/leads/:id/retry-delivery` разрешен для `DELIVERY_QUEUE_ERROR`, двух финальных delivery-error статусов и старого orphan `PENDING` без API-attempts. Для `DELIVERY_API_OUTCOME_UNKNOWN`, `DELIVERY_EMAIL_OUTCOME_UNKNOWN` и исторического orphan `PENDING` с терминальной неудачной API-попыткой без расписанного retry требуется не менее двух минут с последнего изменения заявки и явное `confirmUnknownOutcome: true` после проверки соответственно Tarifnik или внешней почты/webhook: повтор может создать дубль. Обычный retry этих состояний отклоняется; compare-and-swap по статусу и `updatedAt` не позволяет одновременно запустить два операторских повтора. Для завершенной или заблокированной coverage/subscriber заявки повтор отклоняется. Новый ручной цикл получает следующий глобальный номер API-попытки; заранее сохраненный `OUTCOME_UNKNOWN` attempt резервирует номер даже при сбое записи результата. EMAIL fallback этого цикла записывается под своим номером и не конфликтует с предыдущим `(leadId, attemptNumber, channel)`. Внешняя отправка и запись БД не образуют единую транзакцию, поэтому ручной повтор имеет at-least-once семантику.

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

Hard-delete выбран, чтобы PII не осталось в JSON payloads. Согласованный срок хранения сырых заявок — 180 дней. Перепроверка юридического основания обработки и текста согласия ведётся в [#144](https://github.com/Celtoman/astro-telekom/issues/144) как P3 вне milestone Release 1; решение о допуске реального трафика принимает владелец.

Снимок атрибуции `Lead.attributionSnapshot` содержит серверные IP/User-Agent и удаляется тем же hard-delete всего Lead; отдельной очереди и копии этих полей в notification outbox нет.

Локальная runtime-проверка подтвердила scheduler metadata `key=pii-retention-daily`, `name=pii-retention`, pattern `0 3 * * *`, timezone UTC в отдельной Redis DB; test DB после проверки очищена.

## Переход к ручной публикации

Публикации запускаются только явным действием администратора. Worker при запуске удаляет legacy scheduler публикаций из Redis до создания consumers. Остаточные maintenance jobs прежней функции завершаются без обращения к API публикации; lead reconciler и PII scheduler продолжают работу. Миграция `0057` отменяет ожидавшие снимки, сохраняет их историю и удаляет поля расписания. Уже переданный в сборку отложенный снимок должен завершиться до применения миграции.

## Поведение без Redis

Если API запущен без `REDIS_URL`, lead decision, delivery и lead notification выполняются в памяти процесса через `queueMicrotask` или `setTimeout`. Это удобно для локального прототипа; restart может потерять in-memory job, но состояние решения и notification остаются в PostgreSQL. При следующем запуске полноценного worker минутный reconciler восстанавливает pending/retry решения. Rebuild без Redis не вызывает deployment напрямую: запись остается в PostgreSQL со статусом `PENDING`. Worker без `REDIS_URL` не стартует корректно как полноценный async consumer, поэтому production обязательно должен использовать Redis.

## Пересборка статического сайта

1. После ручного сохранения тарифа API в одной serializable-транзакции создает только рабочую ревизию и audit event. Явная ручная публикация отдельно фиксирует неизменяемый `SitePublication` и передаёт его ID в `SiteRebuild`. Ответ CRUD означает, что рабочая версия сохранена, но не что сайт опубликован.
2. Дедупликация идет по `site:<siteId>`. Поскольку текущий deployment выпускает весь static artifact, `affectedPaths` честно равен `["/*"]`; точечная пересборка не вводилась.
3. `requestedPublicationId` может обновиться во время сборки, но `/start` фиксирует его как `processingPublicationId`. Static builder читает только этот exact снимок; legacy `web-publish` использует его processing catalog; следующий job получает более новый requested snapshot. Совместимый rebuild без snapshot по-прежнему явно очищает stale IDs и временно собирает текущий каталог, но текущие content mutators такие jobs не создают.
4. API ставит BullMQ job с тремя попытками и exponential backoff 30 секунд. Worker получает через внутренний `/start` endpoint номер ревизии и payload, затем сам вызывает deployment provider.
5. При `REBUILD_PROVIDER=webhook` worker отправляет в `REBUILD_WEBHOOK_URL` поля `rebuildId`, `siteId`, `dedupeKey`, `affectedPaths`, `revision` и idempotency header `<rebuildId>:<revision>`; HTTP 2xx без финального `SUCCEEDED` считается ошибкой. При `REBUILD_PROVIDER=coolify` worker делает авторизованный `POST /api/v1/deploy` по resource UUID, сразу сохраняет полученный `deployment_uuid` через `/provider-progress`, затем ограниченно опрашивает `GET /api/v1/deployments/{uuid}`.
6. Финальный успех помечает processing publication как `SUCCEEDED` и продвигает `Site.publishedRevision`; финальная ошибка помечает только этот snapshot как `FAILED`. Последняя успешная публикация остается источником public API.
7. Статусы rebuild, счетчик попыток, ошибка и ответ провайдера сохраняются в PostgreSQL и читаются через `/admin/rebuilds`. Отдельного admin-журнала `SitePublication` пока нет.

В Coolify-режиме `queued` и `in_progress` — промежуточные состояния, `finished` преобразуется в `SUCCEEDED`, а `failed`/cancelled/неизвестный статус и timeout приводят к ошибке попытки без продвижения `publishedRevision`. UUID и последний provider status сохраняются, поэтому retry продолжает незавершенный deployment; новый запуск создается только после финального failure или при отсутствии UUID. В БД сохраняется сокращенный provider payload без logs и API token. Реализация [#57](https://github.com/Celtoman/astro-telekom/issues/57) подтверждена реальным Coolify polling rehearsal до `finished` на точном deployment commit.

## Остановка процесса

Worker перехватывает `SIGINT`/`SIGTERM`: закрывает все шесть `Worker` и maintenance queue (дожидаясь текущих задач через `close()`), затем завершает Redis-соединение. Live-проверка под реальной нагрузкой (`docker compose stop worker` с активной задачей) не выполнена — см. [workaround-audit.md](research/2026-09-07-workaround-audit.md), W-08.

## Оставшийся неиспользуемый listener

У `tariff-imports` по-прежнему нет producer: admin вызывает validate/apply через API напрямую. До отдельного решения этот listener не является частью надежного import-процесса.
