# PostgreSQL 18 backup/restore для Git-based Coolify Application

Дата проверки: 2026-09-15. Область: issue [#145](https://github.com/Celtoman/astro-telekom/issues/145), PostgreSQL `18.6`, Git-based Docker Compose Application в Coolify и защищенное off-server S3-compatible хранилище. Использованы только официальные документы PostgreSQL, Coolify, Amazon S3 и текущий официальный репозиторий Coolify. На момент первичного исследования провайдер и числовая policy не были зафиксированы; при реализации владелец поручил выполнить #145, а live control-plane подтвердил единственное usable хранилище `timeweb S3`. Для него технически подготовлены provider-independent client-side encryption, retention 35 дней, RPO 24 часа с восьмичасовым расписанием и RTO 4 часа; эти бизнес-параметры остаются предложением до явного одобрения владельца. Фактические проверки вынесены в [операционный runbook](../runbooks/postgresql-backup-restore.md).

## Короткий вывод

Текущий ручной `pg_dump --format=custom` является правильной основой логической копии одной application database, но issue #145 пока не закрывает: `pg_restore --list` только читает оглавление архива и не доказывает успешное восстановление. Нужны регулярный database-aware job, защищенная off-server копия, явная проверка целостности после скачивания и полный restore rehearsal в отдельной PostgreSQL 18 с запуском проектного SQL-аудита.

Встроенный database-aware backup Coolify нельзя применить к текущей топологии. PostgreSQL находится внутри Git-based Docker Compose resource типа `Application`; поддержка таких баз остается открытым enhancement [coollabsio/coolify#7528](https://github.com/coollabsio/coolify/issues/7528). Экран Application Backups умеет архивировать mount, но официальный Coolify предупреждает, что file-level архив работающей БД может быть неконсистентным и не должен заменять engine-aware backup.

Предпочтительный путь для #145 без отдельной миграции инфраструктуры — оставить PostgreSQL в текущем Compose и добавить собственный повторяемый поток `pg_dump 18 -> проверка архива -> checksum/size -> client-side encryption -> off-server upload -> download/decrypt -> pg_restore 18 -> SQL-аудит`. Альтернатива — вынести PostgreSQL в standalone Coolify Database/Service и использовать нативное расписание Coolify; это более крупная архитектурная миграция и данным исследованием не выбирается.

## Что подтверждено в текущем проекте

- Production Compose фиксирует `postgres:18.6-alpine` и named volume `postgres_data` в [`docker-compose.coolify.yml`](../../docker-compose.coolify.yml).
- [`docs/runbooks/release-one-data-migration.md`](../runbooks/release-one-data-migration.md) уже создает непустой custom-format dump через PostgreSQL-контейнер, копирует его в закрытый каталог, запускает `pg_restore --list` из `postgres:18.6-alpine` и удаляет временный файл из контейнера.
- Тот же runbook прямо указывает, что проверка списка не заменяет restore rehearsal, а off-server перенос пока оставлен будущей backup policy.
- [`docs/research/2026-09-09-coolify-deployment.md`](2026-09-09-coolify-deployment.md) правильно отделяет application volume archive от `pg_dump` и фиксирует отсутствие database-aware backup для Git-based Compose Application.

Следовательно, задача не в замене уже выбранного формата, а в автоматизации, внешнем хранении, наблюдаемости и доказанном восстановлении.

## PostgreSQL 18: подтвержденные свойства и ограничения

### `pg_dump`

Официальная документация PostgreSQL 18 подтверждает следующие свойства:

- `pg_dump` формирует согласованный логический snapshot даже при конкурентной работе базы и не блокирует обычных readers/writers;
- один запуск сохраняет только одну database; cluster-wide roles и tablespaces в него не входят;
- custom format (`-Fc`) предназначен для `pg_restore`, сжат по умолчанию, позволяет выбирать и переупорядочивать объекты и поддерживает parallel restore;
- `pg_dump` может читать серверы не новее своего major; клиент 18 откажется снимать dump с сервера 19 или новее;
- загрузка dump в более новый сервер поддерживается как основной путь переноса, а загрузка в сервер более старого major не гарантируется.

Источники: [PostgreSQL 18: `pg_dump`](https://www.postgresql.org/docs/18/app-pgdump.html), [PostgreSQL 18: SQL Dump](https://www.postgresql.org/docs/18/backup-dump.html).

Вывод для проекта: backup и rehearsal нужно выполнять клиентами major 18 против PostgreSQL 18. После будущего major-upgrade сервера образ/клиент backup job должен обновляться вместе с ним; нельзя оставлять зафиксированный `pg_dump 18` против более нового сервера.

`pg_dump` не сохраняет роли и tablespaces. Текущие `--no-owner --no-acl` сознательно делают application dump переносимым под отдельного владельца restore-БД, но это не backup всего кластера. Если эксплуатация начнет зависеть от внешних ролей, tablespaces или других cluster-wide объектов, для них потребуется отдельный `pg_dumpall --globals-only` и отдельная проверка восстановления. Секреты и server configuration всё равно не входят в логический dump.

### `pg_restore`

Официальный `pg_restore` по умолчанию продолжает работу после SQL-ошибок и сообщает их количество только в конце. Поэтому rehearsal должен использовать `--exit-on-error`; иначе частично восстановленная база может ошибочно выглядеть успешной. Чистую target database следует создавать из `template0`, чтобы локальные дополнения `template1` не вызвали duplicate definitions. `--single-transaction` дает all-or-nothing и подразумевает fail-fast, но несовместим с parallel jobs и на больших схемах может потребовать больше lock table space; это опция после измерения, а не обязательный default.

Источник: [PostgreSQL 18: `pg_restore`](https://www.postgresql.org/docs/18/app-pgrestore.html).

Минимальное доказательство восстановления для #145:

1. создать отдельную disposable PostgreSQL `18.6` без доступа извне;
2. создать пустую database из `template0`;
3. восстановить custom archive через `pg_restore --exit-on-error --no-owner --no-acl`;
4. выполнить `ANALYZE` после restore;
5. запустить [`scripts/release-one-database-audit.sql`](../../scripts/release-one-database-audit.sql) на восстановленной базе;
6. подтвердить migration history, totals/status counts, связи, route collisions и `relation_integrity_violations = 0`;
7. удалить disposable database/volume после сохранения нечувствительного evidence.

Архив считается недоверенным исполняемым вводом: PostgreSQL предупреждает, что restore исполняет команды из dump. Восстанавливать следует только собственный объект с подтвержденным checksum, в изолированный контур, не предоставляя ему внешние credentials приложения.

### Дискретный dump не равен PITR

PostgreSQL отдельно описывает continuous WAL archiving и Point-in-Time Recovery. Логический dump восстанавливает состояние только на момент своего snapshot и не позволяет replay изменений до произвольной точки. Более того, документация `pg_dump` предупреждает, что кроме простых случаев он обычно не является единственным достаточным регулярным production backup.

Источник: [PostgreSQL 18: Continuous Archiving and Point-in-Time Recovery](https://www.postgresql.org/docs/18/continuous-archiving.html).

Вывод для #145: согласованный RPO нельзя подменять словом «ежедневно». Реализация запускает dump каждые 8 часов, оставляя 16 часов запаса относительно предложенного RPO 24 часа; красный GitHub Actions run является операторским alert и требует ручного повторения. Если допустимый RPO меньше интервала логических копий, issue потребует дополнительного WAL/PITR-контура либо более частых dumps. RTO можно считать подтвержденным только по измеренному полному rehearsal, включая скачивание, расшифрование, restore, audit и переключение приложения.

## Coolify: что доступно текущей топологии

### Разделение ресурсов

В Coolify Git repository с Docker Compose build pack создает `Application`, тогда как Docker Compose Empty и one-click stacks относятся к `Service`. Официальный database-backup workflow поддерживает standalone Database и распознанные database-компоненты внутри Service, но не произвольный PostgreSQL-контейнер внутри Git-based Application.

Источники: [Coolify: Docker Compose applications](https://coolify.io/docs/applications/builds/docker-compose), [Coolify: database backups](https://coolify.io/docs/databases/backups).

Это ограничение актуально на дату исследования:

- enhancement [#7528](https://github.com/coollabsio/coolify/issues/7528) остается открытым и прямо описывает отсутствие `ServiceDatabase`/scheduled backup для Git-based Compose Applications;
- maintainer перечисляет отсутствующие UI/config, координацию backup с automatic redeploy и обработку удаления/существенного изменения DB service: [maintainer comment](https://github.com/coollabsio/coolify/issues/7528#issuecomment-3955610700);
- в текущей модели [`ServiceDatabase`](https://github.com/coollabsio/coolify/blob/113a2f229d7fa2391119d9acf149e9b0b70382f5/app/Models/ServiceDatabase.php) есть связь с `Service`, но нет связи с `Application` (проверенный commit [`113a2f2`](https://github.com/coollabsio/coolify/commit/113a2f229d7fa2391119d9acf149e9b0b70382f5)).

### Почему Application volume backup недостаточен

Coolify умеет по расписанию создавать `.tar.gz` для application mounts, сохранять локально и отправлять копию в S3-compatible storage. Но официальный документ предупреждает: если приложение пишет в mount во время архивации, file-level copy может быть inconsistent/corrupted; для database следует использовать engine-aware workflow либо останавливать writes/containers. Dashboard также не выполняет restore такого archive — тест нужно проводить отдельно.

Источник: [Coolify: storage mount backups](https://coolify.io/docs/core/persistent-storage/storage-mounts/backups).

Поэтому архив `postgres_data` допустим лишь как дополнительный defense-in-depth слой с остановкой использующих volume контейнеров. Он не заменяет `pg_dump`, не является критерием приемки #145 и не должен быть единственной off-server копией.

### Требования к собственному job

Пока PostgreSQL остается частью Git-based Application, собственный job должен:

- использовать PostgreSQL client major 18 и custom format;
- завершаться до upload при ненулевом exit code `pg_dump`, нулевом размере или ошибке `pg_restore --list`;
- публиковать объект только под уникальным immutable key после локальной проверки;
- не пересекаться со вторым backup, destructive maintenance, migration/import и по возможности redeploy; минимум — атомарно не публиковать незавершенный dump и сигнализировать о прерывании;
- иметь timeout, bounded retry только для transport failures и явное уведомление о пропущенном RPO;
- не писать `POSTGRES_PASSWORD`, S3 secret, repository/encryption key, SQL rows или PII в stdout/stderr;
- сохранять только безопасное evidence: UTC timestamp, exact application SHA, версии server/client, database identifier без credentials, dump size, SHA-256, remote object/snapshot ID, длительности и результаты audit.

Реализация следует этим требованиям: `backup-runner` отделен от production volume и ограничен ресурсами; audit и dump используют один exported snapshot; idempotent S3/GET-запросы имеют не более трех transport attempts; concurrency group запрещает параллельные workflow runs; любой failed run остается красным GitHub alert. Non-idempotent создание/запуск Coolify task намеренно не повторяется автоматически, чтобы не породить второй backup без однозначного execution ID.

## S3-compatible storage: какие гарантии нужно проверить

### Coolify validation ограничена

Coolify принимает `endpoint`, `bucket`, `region`, `access key`, `secret key` и передает файлы через MinIO `mc`. Проверка подключения выполняет `ListObjectsV2`.

Источник: [Coolify: S3 storage overview](https://coolify.io/docs/core/s3-storage/overview).

Вывод: зеленая Coolify validation подтверждает только доступ к списку объектов. Она не доказывает `PutObject`/`GetObject`, шифрование, checksum headers, lifecycle, versioning, Object Lock, download или restore. Все эти возможности должны быть отдельными acceptance checks выбранного endpoint.

### Шифрование

Amazon S3 шифрует новые объекты at rest через SSE-S3 по умолчанию и поддерживает SSE-KMS/DSSE-KMS. Это гарантия Amazon S3, а не автоматическая гарантия любого S3-compatible провайдера. Client-side encryption выполняется до передачи: storage получает ciphertext, а ключи остаются у клиента.

Источники: [Amazon S3: default bucket encryption](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-encryption.html), [Amazon S3: client-side encryption](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingClientSideEncryption.html), [Amazon S3: encryption in transit](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingEncryptionInTransit.html).

Для #145 выбран provider-independent принцип: dump с PII шифруется на клиенте до off-server upload; bucket-side encryption, если подтверждена провайдером, применяется вторым слоем. Реализация использует OpenSSL CMS EnvelopedData с AES-256 и repository public RSA-4096 certificate; основной private recovery key хранится вне GitHub, Coolify, deployment host и S3 и проверяется отдельным offline-key rehearsal. Потеря ключа рассматривается как потеря backup.

### Retention и защита от удаления

Amazon S3 Object Lock работает по WORM-модели только вместе с Versioning. Governance mode допускает bypass специально уполномоченным principal, compliance mode не позволяет сократить retention или удалить защищенную версию даже root до истечения срока. Lifecycle expiration current version в versioned bucket не равен удалению всех данных: noncurrent versions и delete markers имеют отдельные правила.

Источники: [Amazon S3: Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html), [Amazon S3: lifecycle configuration](https://docs.aws.amazon.com/AmazonS3/latest/userguide/intro-lifecycle-rules.html), [Amazon S3: Object Lock considerations](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock-managing.html).

Вывод: provider должен подтвердить Versioning, Object Lock modes и Lifecycle semantics именно для своего S3-compatible API. Retention задается одновременно для current objects, noncurrent versions и incomplete multipart uploads. Backup writer не должен иметь право обходить retention; cleanup credential/role отделяется от upload credential. Значения retention нельзя выбрать из технической документации — они зависят от согласованных RPO, RTO, требований к PII и стоимости хранения.

### Checksum

Amazon S3 умеет проверять явные CRC/SHA checksums при upload и возвращать сохраненный checksum для последующей проверки. `ETag` нельзя считать универсальным MD5: его смысл меняется при multipart upload и некоторых режимах server-side encryption.

Источники: [Amazon S3: checking upload integrity](https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity-upload.html), [Amazon S3: checking data at rest](https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity-at-rest.html).

Для #145 нужны два независимых уровня:

1. локальный SHA-256 и byte size проверенного plaintext custom dump, сохраненные в нечувствительном evidence/manifest;
2. checksum выбранного S3 API при upload/download либо повторный SHA-256 после скачивания и расшифрования.

Совпавший checksum доказывает байтовую целостность, но не логическую восстановимость. Последнюю доказывают только `pg_restore --exit-on-error` и application-specific SQL audit на disposable PostgreSQL.

## Implementation contract и граница #145

Первые семь строк ниже — критерии базовой приемки #145. Неизменяемость/WORM и полное переключение приложения полезны как последующее усиление, но не подменяют буквальные критерии issue: в #145 требуется согласовать retention/RPO/RTO и доказать application-aware restore/audit, а не внедрить PITR или провести production cutover.

| Этап | Обязательное доказательство | Fail-closed условие |
|---|---|---|
| Снятие dump | server/client version 18, unique UTC name, exit code 0 | client старее server, ошибка `pg_dump` |
| Локальная проверка | size > 0, `pg_restore --list` успешно, SHA-256 | пустой/нечитаемый archive |
| Шифрование | ciphertext создан, recovery key доступен из отдельного secret source | ключ отсутствует или попал в log |
| Off-server upload | unique remote ID/key, upload подтвержден, объект читается обратно | только локальная копия либо только `ListObjectsV2` validation |
| Retention (#145) | exact backup prefix, срок 35 дней, paginated listing и bounded delete только просроченных объектов | срок не применяется либо cleanup выходит за prefix |
| Restore rehearsal | download, decrypt, checksum match, `pg_restore --exit-on-error` в PostgreSQL 18 | любое restore warning/error |
| Data audit | migration history/counts, collisions, relations, integrity checks | ненулевое нарушение или несовпавшие ожидаемые counts |
| RPO/RTO (#145) | timestamp последнего успешного backup, 8-часовое расписание с RPO 24 часа и измеренная длительность DB restore/audit относительно согласованного RTO 4 часа | пропущенное окно без alert либо DB rehearsal превышает RTO |
| Delete resistance (#152 hardening) | provider policy read-back, writer не может bypass/delete, Versioning/Object Lock при поддержке | lifecycle/Object Lock предполагаются, но не проверены |
| Full cutover rehearsal (отдельное release-доказательство) | измеренная длительность переключения приложения и smoke после смены `DATABASE_URL` | RTO полного сервиса только оценен |

Операционный job должен оставлять последнюю известную хорошую копию до подтверждения новой и не удалять локальный временный dump до успешного upload/read-back. После успеха plaintext удаляется безопасно в пределах возможностей файловой системы; в repository, logs и Coolify execution history он не попадает.

## Состояние решений

Первичное исследование оставляло provider и policy открытыми. Для #145 теперь технически выбраны Timeweb S3, RPO 24 часа, RTO 4 часа, retention 35 дней, CMS AES-256/RSA client-side encryption и расписание без пересечения запусков. Исполняемые helper/audit/certificate входят в immutable exact-revision image, а S3 передает только allowlisted конфигурационные данные.

Для завершения #145 остаются ровно два внешних условия: явное одобрение владельцем этих бизнес-параметров и финальный external exact-SHA backup/restore rehearsal после deployment immutable runner. Без них нельзя честно отметить согласование и фактическую внешнюю приемку.

Provider-side Versioning/Object Lock, разделение writer/cleanup credentials и доказательство невозможности удаления относятся к [#152](https://github.com/Celtoman/astro-telekom/issues/152), а не к базовой приемке #145. Более строгая GFS-ротация, PITR/WAL archive и полный application cutover rehearsal также остаются отдельными последующими решениями.

## Как исследование меняет текущие документы

- Вывод [`2026-09-09-coolify-deployment.md`](2026-09-09-coolify-deployment.md) «`pg_dump` + off-server storage + restore test» подтвержден и остается актуальным.
- Формулировку следует понимать точно: database-aware backup доступен не только standalone Database, но и распознанным database-компонентам `Service`; недоступен именно текущему Git-based Compose `Application`.
- Этап backup в [`release-one-data-migration.md`](../runbooks/release-one-data-migration.md) остается полезным pre-migration safeguard, но для #145 его нужно дополнить отдельным регулярным runbook: расписание, encryption/upload/read-back, retention, alerts и полноценный restore/audit rehearsal.
- `pg_restore --list` остается ранней проверкой archive format, а не доказательством recoverability.
