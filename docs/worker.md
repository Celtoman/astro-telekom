# Фоновые задачи

Worker запускается из `services/worker/src/index.mjs`. Он требует `REDIS_URL`, подключается через `ioredis` и создает три BullMQ consumers.

| Queue | Consumer | Текущий producer | Фактический статус |
| --- | --- | --- | --- |
| `lead-deliveries` | POST `/api/v1/internal/lead-deliveries/:id` с `ADMIN_API_TOKEN` | `LeadDeliveryService` в API | Работает при настроенном Redis и отдельном worker. |
| `tariff-imports` | POST `/api/v1/admin/tariffs/import` | В коде не найден | Listener есть, producer нет. Админка вызывает validate/apply напрямую. |
| `site-rebuilds` | POST deployment provider, затем `/api/v1/internal/site-rebuilds/:id/result` | `RebuildQueueService` в API | Persistent job в PostgreSQL, три попытки BullMQ с exponential backoff 30 секунд. |

## Доставка заявок

1. `POST /leads` создает `Lead` и при `PENDING` вызывает `LeadDeliveryService.enqueue`.
2. Если определен `REDIS_URL`, API ставит BullMQ job с `jobId=<leadId>:<attemptNumber>`.
3. Worker вызывает внутренний endpoint; тот запускает `LeadDeliveryService.process`.
4. При успешном HTTP response Tarifnik создается успешный `LeadDeliveryAttempt`, лид получает `DELIVERED`.
5. При ошибке создается failed attempt и следующая задача с задержкой 5, затем 30 минут.
6. После третьей неудачи API пытается email/webhook fallback и пишет `DELIVERY_ERROR_EMAIL_SENT` или `DELIVERY_ERROR_EMAIL_FAILED`.

Один `deliveryKey` используется для всех API attempts конкретного лида и передается в header/payload как idempotency key. Реальный контракт Tarifnik и гарантии идемпотентности пока не подтверждены.

## Поведение без Redis

Если API запущен без `REDIS_URL`, delivery выполняется в памяти процесса через `queueMicrotask` или `setTimeout`. Это удобно для локального прототипа, но restart API теряет запланированную попытку. Rebuild при этом не вызывает deployment напрямую: запись остается в PostgreSQL со статусом `PENDING`. После запуска API с Redis незавершенные rebuild-записи повторно публикуются в BullMQ. Worker без `REDIS_URL` не стартует корректно как полноценный async consumer, поэтому production обязательно должен использовать Redis.

## Пересборка статического сайта

1. После успешной мутации content/city/tariff API синхронно создает или обновляет `SiteRebuild`; ответ CRUD означает, что outbox-запись сохранена, но не что сайт опубликован.
2. Дедупликация идет по `site:<siteId>`. Поскольку текущий deployment выпускает весь static artifact, `affectedPaths` честно равен `["/*"]`.
3. API ставит BullMQ job с тремя попытками и exponential backoff 30 секунд. Worker получает через внутренний `/start` endpoint номер ревизии и payload, затем сам вызывает deployment provider.
4. Worker отправляет в `REBUILD_WEBHOOK_URL` поля `rebuildId`, `siteId`, `dedupeKey`, `affectedPaths`, `revision` и idempotency header `<rebuildId>:<revision>`. Провайдер обязан дедуплицировать этот ключ и вернуть финальный JSON `{ "status": "SUCCEEDED", "deploymentId"?: "...", "url"?: "..." }`. HTTP 2xx без этого статуса считается ошибкой и повторяется; success/error worker сохраняет через внутренний `/result` endpoint.
5. Статусы `PENDING`, `QUEUED`, `RUNNING`, `RETRYING`, `SUCCEEDED`, `FAILED`, счетчик попыток, ошибка и ответ провайдера сохраняются в PostgreSQL и читаются через `/admin/rebuilds`.
6. Если новая мутация приходит во время сборки, растет `requestedRevision`; после успеха текущей ревизии API ставит следующую, поэтому более новое изменение не считается опубликованным преждевременно.

Контракт финального синхронного ответа выбран для текущего MVP. Конкретный deployment provider и live-проверка его длительного HTTP-ответа еще не настроены; до этого production-публикация не подтверждена.

## Остановка процесса

Worker перехватывает `SIGINT`/`SIGTERM`: закрывает все три `Worker` (дожидаясь текущих задач через `close()`) и завершает Redis-соединение перед выходом. Live-проверка под реальной нагрузкой (`docker compose stop worker` с активной задачей) не выполнена — см. [workaround-audit.md](research/2026-09-07-workaround-audit.md), W-08.

## Оставшийся неиспользуемый listener

У `tariff-imports` по-прежнему нет producer: admin вызывает validate/apply через API напрямую. До отдельного решения этот listener не является частью надежного import-процесса.
