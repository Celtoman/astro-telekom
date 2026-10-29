# План внедрения архивной очистки публикаций

**Цель:** Ограничить рост publication volume без потери serving, baseline, двух rollback-версий и подтверждений завершённых операций.

**Архитектура:** Приватный controller сериализует GC с CMS/CODE через существующую очередь. Host orchestrator сохраняет полный артефакт в существующем Timeweb S3, скачивает его обратно и проверяет восстановление до подтверждения архива. Immutable manifest/receipt сохраняются, архивный HTML удаляется по durable GC marker, assets остаются по прежним URL.

**Стек:** Node.js built-ins, Python 3 standard library, Laravel/AWS SDK существующего Coolify, systemd timer/path; новых pnpm-зависимостей нет.

## Согласованный порядок
1. Полный исходный архив вне VPS; проверить весь manifest и пробное восстановление.
2. Тестами воспроизвести опасные сценарии: protected set, незавершённые intents, повтор historical receipt, отказ без архива, symlink, crash resume и общая очередь controller.
3. Добавить apps/web/scripts/publication/artifact-retention.mjs, metadata/archived readers в artifact-store.mjs и приватные retention endpoints/serial methods controller.
4. Добавить deploy/publication-retention.py и S3 bridge без копирования credentials в приложение; systemd service + daily timer + path после receipts.
5. Полный pnpm check, Linux rehearsal, Conventional Commit, CI и exact Coolify rollout.
6. Вне VPS архив + checksum + restore каждого кандидата; удаление малыми партиями; live readback serving/API, старые assets и restart/recovery.
7. Включить scheduler, проверить enabled/last run, обновить #440/#438 и документацию.

## Границы
- Сохранять active, baseline/fallback, две последние подтверждённые версии, 7 суток, все нерешённые intents и их previous artifact.
- Архивы не удалять раньше 90 суток. HTML и assets разделяются только через GC-aware lifecycle; immutable manifest не переписывается.
- При ошибке metadata, S3, SQL/BullMQ или serving — удаление запрещено.
- Legacy current и его дерево сохраняются до отдельной проверенной миграции.
- Нельзя иметь второй независимый lock, не участвующий в builder/activation.
- Изменения исходного рабочего каталога по дизайну не включать в коммит.

## Проверки
node --test tests/publication-retention.test.mjs tests/publication-controller.test.mjs tests/publication-runtime.test.mjs tests/static-publication-activation.test.mjs
pnpm check
Linux rehearsal проверяет baseline, archive/restore, historical receipt, GC crash/retry и serving/assets.
