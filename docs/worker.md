# Фоновые задачи

Worker запускается из `services/worker/src/index.mjs`. Он требует `REDIS_URL`, подключается через `ioredis` и создает три BullMQ consumers.

| Queue | Consumer | Текущий producer | Фактический статус |
| --- | --- | --- | --- |
| `lead-deliveries` | POST `/api/v1/internal/lead-deliveries/:id` с `ADMIN_API_TOKEN` | `LeadDeliveryService` в API | Работает при настроенном Redis и отдельном worker. |
| `tariff-imports` | POST `/api/v1/admin/tariffs/import` | В коде не найден | Listener есть, producer нет. Админка вызывает validate/apply напрямую. |
| `site-rebuilds` | POST `REBUILD_WEBHOOK_URL` | В коде не найден | Listener есть, producer нет. API вызывает webhook напрямую через `RebuildQueueService`. |

## Доставка заявок

1. `POST /leads` создает `Lead` и при `PENDING` вызывает `LeadDeliveryService.enqueue`.
2. Если определен `REDIS_URL`, API ставит BullMQ job с `jobId=<leadId>:<attemptNumber>`.
3. Worker вызывает внутренний endpoint; тот запускает `LeadDeliveryService.process`.
4. При успешном HTTP response Tarifnik создается успешный `LeadDeliveryAttempt`, лид получает `DELIVERED`.
5. При ошибке создается failed attempt и следующая задача с задержкой 5, затем 30 минут.
6. После третьей неудачи API пытается email/webhook fallback и пишет `DELIVERY_ERROR_EMAIL_SENT` или `DELIVERY_ERROR_EMAIL_FAILED`.

Один `deliveryKey` используется для всех API attempts конкретного лида и передается в header/payload как idempotency key. Реальный контракт Tarifnik и гарантии идемпотентности пока не подтверждены.

## Поведение без Redis

Если API запущен без `REDIS_URL`, delivery выполняется в памяти процесса через `queueMicrotask` или `setTimeout`. Это удобно для локального прототипа, но restart API теряет запланированную попытку. Worker без `REDIS_URL` не стартует корректно как полноценный async consumer, поэтому production обязательно должен использовать Redis.

## Необходимая доработка

Очередь пересборки должна стать единым механизмом публикации с persistent job, retry и status. Либо неиспользуемые listeners `tariff-imports` и `site-rebuilds` надо удалить до появления producer. План этой работы — Task 4 в [плане реализации](plans/2026-09-07-platform-stabilization-and-mvp.md).
