# Фоновые задачи

Worker запускается из `services/worker/src/index.mjs`. Он требует `REDIS_URL`, подключается через `ioredis` и создает четыре BullMQ consumers и одну scheduler queue.

В Coolify worker имеет отдельный container healthcheck `services/worker/src/healthcheck.mjs`. Проверка создает короткоживущее Redis-соединение с отключенными бесконечными retry и требует ответ `PONG`; она не выполняет business job и не зависит от очереди, но не позволяет считать worker здоровым при потере Redis.

| Queue | Consumer | Текущий producer | Фактический статус |
| --- | --- | --- | --- |
| `lead-deliveries` | POST `/api/v1/internal/lead-deliveries/:id` с `ADMIN_API_TOKEN` | `LeadDeliveryService` в API | Работает при настроенном Redis и отдельном worker. |
| `tariff-imports` | POST `/api/v1/admin/tariffs/import` | В коде не найден | Listener есть, producer нет. Админка вызывает validate/apply напрямую. |
| `site-rebuilds` | POST deployment provider, затем `/api/v1/internal/site-rebuilds/:id/result` | `RebuildQueueService` в API | Persistent job в PostgreSQL, три попытки BullMQ с exponential backoff 30 секунд. |
| `maintenance` | POST `/api/v1/internal/pii-retention` с `ADMIN_API_TOKEN` | BullMQ Job Scheduler `pii-retention-daily` | Регистрируется только при валидном `PII_RETENTION_DAYS`; UTC cron по умолчанию `0 3 * * *`, три попытки. |

## Доставка заявок

1. `POST /leads` создает `Lead` и при `PENDING` вызывает `LeadDeliveryService.enqueue`. По согласованной границе проверка Dom.ru выполняется при наличии хотя бы одного провайдера, но `PENDING` допустим только при одновременном наличии Дом.ру и однозначном ответе `contacts: []`; текущая реализация еще допускает отсутствие `addressCheckId` и нестрого трактует форму ответа `contacts`.
2. Если определен `REDIS_URL`, API ставит BullMQ job с `jobId=<leadId>:<attemptNumber>`.
3. Worker вызывает внутренний endpoint; тот запускает `LeadDeliveryService.process`.
4. При успешном HTTP response Tarifnik создается успешный `LeadDeliveryAttempt`, лид получает `DELIVERED`.
5. При ошибке создается failed attempt и следующая задача с задержкой 5, затем 30 минут.
6. После третьей неудачи API пытается email/webhook fallback и пишет `DELIVERY_ERROR_EMAIL_SENT` или `DELIVERY_ERROR_EMAIL_FAILED`.

Один `deliveryKey` используется для всех API attempts конкретного лида и передается в header/payload как idempotency key. Базовый официальный и живой test-контракт Tarifnik подтвержден, но это расширение header/payload и гарантии идемпотентности в публичной спецификации не описаны.

## Удаление просроченных PII

1. Worker проверяет, что `PII_RETENTION_DAYS` — целое число от 1 до 3650. При отсутствии или ошибке scheduler не создается, а `/admin/readiness` остается `blocked`.
2. Scheduler ежедневно создает `pii-retention` job. Cron можно изменить через `PII_RETENTION_CRON`; timezone фиксирован UTC.
3. Worker вызывает worker-only endpoint и повторяет до 100 batches по `PII_RETENTION_BATCH_SIZE` (default 500, максимум 5000). Непогашенный backlog приводит к retry job, а не к ложному success.
4. API в serializable transaction выбирает старые лиды по `createdAt`, отвязывает более свежие duplicates и физически удаляет старые лиды. FK cascade удаляет status history, activity, delivery payloads и access tokens.
5. Истекшие fallback tokens удаляются независимо, а старые `AddressCheck` — только если на них больше не ссылается ни один лид. Ответ содержит только cutoff и счетчики, без удаленных данных.

Hard-delete выбран, чтобы PII не осталось в JSON payloads. Срок хранения намеренно не зашит в код и должен быть утвержден юридически до production.

Локальная runtime-проверка подтвердила scheduler metadata `key=pii-retention-daily`, `name=pii-retention`, pattern `0 3 * * *`, timezone UTC в отдельной Redis DB; test DB после проверки очищена.

## Поведение без Redis

Если API запущен без `REDIS_URL`, delivery выполняется в памяти процесса через `queueMicrotask` или `setTimeout`. Это удобно для локального прототипа, но restart API теряет запланированную попытку. Rebuild при этом не вызывает deployment напрямую: запись остается в PostgreSQL со статусом `PENDING`. После запуска API с Redis незавершенные rebuild-записи повторно публикуются в BullMQ. Worker без `REDIS_URL` не стартует корректно как полноценный async consumer, поэтому production обязательно должен использовать Redis.

## Пересборка статического сайта

1. После успешной мутации content/city/tariff API синхронно создает или обновляет `SiteRebuild`; ответ CRUD означает, что outbox-запись сохранена, но не что сайт опубликован.
2. Дедупликация идет по `site:<siteId>`. Поскольку текущий deployment выпускает весь static artifact, `affectedPaths` честно равен `["/*"]`.
3. API ставит BullMQ job с тремя попытками и exponential backoff 30 секунд. Worker получает через внутренний `/start` endpoint номер ревизии и payload, затем сам вызывает deployment provider.
4. При `REBUILD_PROVIDER=webhook` worker отправляет в `REBUILD_WEBHOOK_URL` поля `rebuildId`, `siteId`, `dedupeKey`, `affectedPaths`, `revision` и idempotency header `<rebuildId>:<revision>`; HTTP 2xx без финального `SUCCEEDED` считается ошибкой. При `REBUILD_PROVIDER=coolify` worker делает авторизованный `POST /api/v1/deploy` по resource UUID, сразу сохраняет полученный `deployment_uuid` через `/provider-progress`, затем ограниченно опрашивает `GET /api/v1/deployments/{uuid}`.
5. Статусы `PENDING`, `QUEUED`, `RUNNING`, `RETRYING`, `SUCCEEDED`, `FAILED`, счетчик попыток, ошибка и ответ провайдера сохраняются в PostgreSQL и читаются через `/admin/rebuilds`.
6. Если новая мутация приходит во время сборки, растет `requestedRevision`; после успеха текущей ревизии API ставит следующую, поэтому более новое изменение не считается опубликованным преждевременно.

В Coolify-режиме `queued` и `in_progress` — промежуточные состояния, `finished` преобразуется в `SUCCEEDED`, а `failed`/cancelled/неизвестный статус и timeout приводят к ошибке попытки без продвижения `publishedRevision`. UUID и последний provider status сохраняются, поэтому retry продолжает незавершенный deployment; новый запуск создается только после финального failure или при отсутствии UUID. В БД сохраняется сокращенный provider payload без logs и API token. Реализация [#57](https://github.com/Celtoman/astro-telekom/issues/57) покрыта локальными тестами, но не закрывается до вызова реального Coolify resource.

## Остановка процесса

Worker перехватывает `SIGINT`/`SIGTERM`: закрывает все четыре `Worker` и maintenance queue (дожидаясь текущих задач через `close()`), затем завершает Redis-соединение. Live-проверка под реальной нагрузкой (`docker compose stop worker` с активной задачей) не выполнена — см. [workaround-audit.md](research/2026-09-07-workaround-audit.md), W-08.

## Оставшийся неиспользуемый listener

У `tariff-imports` по-прежнему нет producer: admin вызывает validate/apply через API напрямую. До отдельного решения этот listener не является частью надежного import-процесса.
