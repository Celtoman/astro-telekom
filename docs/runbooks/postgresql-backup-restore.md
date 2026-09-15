# PostgreSQL backup и restore rehearsal

Runbook относится к PostgreSQL 18 в Git-based Docker Compose Application `astro-telekom`. Встроенный database-aware backup Coolify для такого типа ресурса недоступен, поэтому источником консистентной копии служит `pg_dump --format=custom`, а не архив работающего `postgres_data`.

## Согласованная политика

Владелец подтвердил применение этой политики 15 сентября 2026 года вместе с разрешением на push, deployment и финальный restore rehearsal.

| Параметр | Значение |
| --- | --- |
| Хранилище | Приватный бакет Timeweb S3, отдельный от сервера Coolify |
| Шифрование | До отправки: CMS EnvelopedData с AES-256 и RSA-4096 сертификатом `deploy/backup/recipient-certificate.pem`; передача только по HTTPS |
| Retention | 35 дней; сценарий удаляет только просроченные `astro-telekom/postgresql/*.dump.cms` и не затрагивает другие префиксы |
| RPO | Не более 24 часов: encrypted backup запускается каждые 8 часов (02:15, 10:15 и 18:15 по Москве), оставляя запас на задержку или отдельный failed run |
| RTO | До 4 часов на получение, расшифровку, восстановление PostgreSQL 18, audit и переключение приложения |
| Rehearsal | Еженедельно в том же daily-окне и вручную перед рискованной миграцией |

Публичный сертификат хранится в Git. Закрытый ключ не передается Coolify, S3 или GitHub и не должен попадать в логи. Рабочая копия владельца создана вне репозитория:

```text
C:\secure-backups\astro-telekom\backup-recipient-private.pem
```

SHA-256 fingerprint сертификата: `20:79:60:06:48:2F:20:35:29:C8:1C:99:E3:55:46:F1:50:5D:C5:62:D2:1D:92:9F:22:C7:D0:EB:5D:DC:AD:82`. До приема реальных заявок закрытый ключ нужно сохранить второй копией в защищенном хранилище владельца. Потеря ключа делает backup невосстановимым; публикация ключа раскрывает все сохраненные копии.

## Как выполняется backup

`scripts/postgres-backup-rehearsal.mjs` читает Coolify API token только из окружения или локального `.env`, находит настроенное S3 и создает краткоживущие presigned URL сроком не более часа. Исполняемые helper, SQL-аудит и public certificate входят в собираемый из exact Git revision image `deploy/backup/Dockerfile`; из S3 никогда не загружается код для исполнения. Из-за ограничения Coolify scheduled task `VARCHAR(255)` короткий Signature V2 URL используется только для GET неисполняемого line-based config с presigned PUT/GET URL и exact SHA; upload, read-back, listing и delete подписываются SigV4. Parser принимает только фиксированный allowlist полей и не использует `source`/`eval`. TLS защищает передачу, а сам dump дополнительно зашифрован CMS до upload.

`backup-runner` имеет лимиты CPU/RAM/PID, подключается к source PostgreSQL отдельной ролью `BACKUP_POSTGRES_USER` с членством только в `pg_read_all_data` и не монтирует `postgres_data` или application volumes. До чтения данных helper fail-closed отклоняет DB owner, superuser, `CREATEDB`/`CREATEROLE`/replication/BYPASSRLS, `pg_write_all_data`, наследуемую привилегированную роль и фактические CREATE/write/sequence-mutation privileges. Kernel-managed `flock` не оставляет stale directory lock; долгоживущие exporter и disposable PostgreSQL запускаются с закрытым lock fd, поэтому orphan-процесс не удерживает блокировку после гибели parent helper. Перед `initdb` helper удаляет source host/user/password из окружения, а archive восстанавливается ролью `restore_owner` без superuser/createdb/createrole.

## Подготовка read-only роли

В Coolify задать production `BACKUP_POSTGRES_USER=astro_backup` и независимый случайный `BACKUP_POSTGRES_PASSWORD` длиной не менее 32 символов. Обе переменные должны быть runtime-only и literal; build-time/preview scope для production password запрещен.

При каждом deployment one-shot `backup-bootstrap` из того же exact-revision image запускает `scripts/provision-postgres-backup-role.sql` от DB owner. SQL читает backup password только из environment через `psql \\getenv`, не передает его аргументом процесса и не печатает значение. Первый запуск создает login role, повторные идемпотентно обновляют пароль и минимальные атрибуты, затем выдают только `pg_read_all_data` и `CONNECT` к текущей БД. Существующая роль с ownership, elevated attributes или любым membership кроме `pg_read_all_data` останавливает deployment до изменения данных. Постоянный `backup-runner` стартует только после успешного завершения bootstrap и не получает DB owner credential.

Runner повторно проверяет фактические database/schema/table/sequence privileges перед каждым dump. Не выдавать `astro_backup` `pg_write_all_data`, ownership, `CREATEDB`, `CREATEROLE`, `SUPERUSER`, replication/BYPASSRLS или application secrets. После смены production database обычный redeploy повторит `GRANT CONNECT` для новой БД.

Внутри контейнера `scripts/postgres-backup-rehearsal.sh`:

1. экспортирует один read-only repeatable-read snapshot и использует его одновременно для полного `scripts/release-one-database-audit.sql` и `pg_dump`;
2. отдельно проверяет major клиента и source-сервера PostgreSQL 18 и создает непустой custom-format dump;
3. шифрует dump до передачи и фиксирует SHA-256/размер ciphertext;
4. загружает объект в S3, читает его обратно и сравнивает размер/checksum;
5. для rehearsal расшифровывает считанный объект временным вторым recipient, поднимает отдельный `initdb`-кластер PostgreSQL 18 на временном Unix socket, выполняет `pg_restore --exit-on-error`, staged `ANALYZE` и тот же read-only audit;
6. требует полного совпадения snapshot/restore audit, завершенной без rollback migration history, сохраняет latest migration и SHA-256 канонической ordered history (`migration_name<TAB>finished<TAB>active<LF>`), требует нулевых route collisions и relation integrity violations;
7. до зеленого результата удаляет временный task и служебный S3-config; backup считается принятым только после успешных retention и локальной записи evidence, иначе удаляется по exact key. Retention обходит все страницы S3 listing.

Вывод ограничен датой, object key, exact SHA, версией PostgreSQL, размером, checksum, агрегированными counts и результатами gate. Секреты и PII не выводятся.

## Ручной запуск

В локальном `.env` должны присутствовать `COOLIFY_API_URL`, `COOLIFY_API_TOKEN` и `COOLIFY_RESOURCE_UUID`. Рабочее дерево обязано быть чистым: source SHA всегда читается из `git rev-parse HEAD`, production override отсутствует. Orchestrator сам читает последний `finished` deployment через Coolify API; локальный HEAD, live deployment и обязательный ожидаемый `BACKUP_DEPLOYMENT_SHA` должны совпасть. Это связывает workflow/orchestrator и фактически запущенный immutable runner одним exact commit:

```powershell
$env:BACKUP_DEPLOYMENT_SHA = '<40-character deployed commit SHA>'
$env:BACKUP_EVIDENCE_FILE = 'C:\secure-backups\astro-telekom\latest-evidence.json'
$env:BACKUP_RECIPIENT_PRIVATE_KEY_PATH = 'C:\secure-backups\astro-telekom\backup-recipient-private.pem'
$env:BACKUP_OPENSSL_PATH = 'C:\Program Files\Git\usr\bin\openssl.exe'
node scripts/postgres-backup-rehearsal.mjs --rehearse --verify-offline-key
```

Успех — exit code `0` и evidence JSON с `s3Readback: true`, `restoreRehearsal: "success"`, `offlineRecipientVerified: true`, `auditMatch: "true"`, нулевыми `migrationIntegrityViolations`/`routeCollisions`/`relationIntegrityViolations`, непустыми `backupBytes` и 64-символьными ciphertext/plaintext SHA-256.

## GitHub Actions

Workflow `.github/workflows/postgres-backup.yml` требует GitHub Secrets `COOLIFY_API_URL`, `COOLIFY_API_TOKEN`, `COOLIFY_RESOURCE_UUID`; `BACKUP_S3_STORAGE_UUID` и непустой текущий `BACKUP_DEPLOYMENT_SHA` задаются как repository variables. Отсутствующая или устаревшая SHA останавливает job до создания backup. Секреты доступны только Node-шагу, а не checkout/setup/upload actions. Runs каждые 8 часов делают encrypted backup, субботний ночной запуск дополнительно выполняет restore rehearsal временным recipient. Idempotent S3 и Coolify GET имеют bounded transport retry; красный run остается явным GitHub Actions alert, который оператор обязан повторить до нарушения 24-часового RPO. Safe manifest сохраняется GitHub artifact на 35 дней.

Routine weekly rehearsal не получает offline private key. Доступность основного recovery key проверяется ручным `--verify-offline-key`: ciphertext повторно скачивается из S3 и расшифровывается локально, а plaintext checksum сравнивается с manifest без передачи ключа в GitHub или Coolify.

После каждого production deployment обновите `BACKUP_DEPLOYMENT_SHA` полным commit SHA. Если переменная задана неверно или устарела, job падает до создания backup; manifest сохраняет SHA и UUID фактически последнего `finished` deployment из Coolify control plane.

## Аварийное восстановление

1. Скачать выбранный `.dump.cms` из приватного бакета и сверить размер/SHA-256 с evidence.
2. Расшифровать локально, не выводя путь к закрытому ключу или содержимое dump в CI/logs:

   ```powershell
   & 'C:\Program Files\Git\usr\bin\openssl.exe' cms -decrypt -binary -inform DER `
     -in '<backup.dump.cms>' `
     -recip 'deploy\backup\recipient-certificate.pem' `
     -inkey 'C:\secure-backups\astro-telekom\backup-recipient-private.pem' `
     -out '<restored.dump>'
   ```

3. Создать чистую disposable PostgreSQL 18 из `template0`; никогда не восстанавливать rehearsal поверх production.
4. Выполнить `pg_restore --exit-on-error --no-owner --no-acl`, staged `ANALYZE`, затем `scripts/release-one-database-audit.sql`.
5. Сравнить `latestMigration`, `migrationHistorySha256`, counts и все integrity/collision checks с evidence. Для независимого пересчета digest преобразовать ordered строки `applied_migrations` в UTF-8 записи `migration_name<TAB>finished<TAB>active<LF>` без BOM и применить SHA-256; такой формат не зависит от CSV quoting или CRLF рабочей машины. `finished_at IS NULL` и любой `rolled_back_at` запрещены. При любом расхождении остановиться; не переключать приложение на восстановленную БД.
6. После приемки согласовать maintenance window, заменить `DATABASE_URL`, применить только отсутствующие forward migrations и выполнить обычный release smoke.

## Ротация ключа и сбой

- Для ротации заменить repository public certificate только после успешного ручного rehearsal нового key pair. Старый закрытый ключ хранить до истечения 35 дней для всех ранее созданных объектов; сценарий не обещает несколько постоянных recipients в одном архиве.
- Failed task не считается backup. Проверить причину по безопасному коду ошибки, исправить и повторить вручную; не публиковать полную команду task, presigned URL или dump. Lock освобождается ядром при завершении процесса; вручную удалять lock-файл не требуется.
- Если GitHub schedule не запускался более 24 часов, RPO нарушен: создать ручной backup немедленно и зафиксировать инцидент до любых production-изменений.
- Текущий общий Timeweb credential технически может удалить свежие объекты; Versioning/Object Lock и отдельная cleanup role вынесены в [#152](https://github.com/Celtoman/astro-telekom/issues/152). До его закрытия retention является application-managed, а не WORM-гарантией.
