# Архивирование и очистка публикаций

Задача [#440](https://github.com/Celtoman/astro-telekom/issues/440), проблема [#438](https://github.com/Celtoman/astro-telekom/issues/438). Реализация не меняет опубликованный каталог и не создаёт CMS snapshot.

Подтверждённое внедрение 29 октября 2026: [внешняя приёмка](../research/2026-10-29-publication-retention.md). Timer/path включены, ручной и событийный запуски проверены.

## Защищённые данные

Controller читает фактическую Caddy configuration с разрешённым Origin. Сохраняются active, все serving/fallback roots, legacy baseline, две последние успешно подтверждённые версии помимо active, версии за семь суток, неподтверждённые артефакты и candidate/previous незавершённых CMS/CODE intents. Неопознанные release directories и legacy current не удаляются. Восстановленный оператором артефакт закрепляется и больше не попадает в автоматическую GC.

Host orchestrator проверяет отсутствие PENDING/QUEUED/RUNNING/RETRYING SiteRebuild, PENDING/RUNNING SitePublication и active/wait/paused/delayed BullMQ jobs. Это read-only SQL через psql и чтение Redis, не запись в базу из web/worker. Ошибка чтения запрещает очистку. При занятости процесс ждёт до минуты и откладывает запуск.

## Внешний архив и восстановление

deploy/publication-retention.py создаёт отдельный tar.gz с полным release и неизменяемым manifest. Все файлы сверяются по размеру и SHA-256. Непривилегированные пользователи не могут передать произвольный путь: resource, volume и S3 prefix закреплены для этого контура.

deploy/publication-retention-s3.php запускается только в существующем контейнере Coolify. Ключи берутся из его зашифрованной S3Storage model и не копируются в приложение, CLI arguments или журналы. Используется существующий Timeweb S3 storage 1; другой endpoint отклоняется. Файлы staging находятся в /data/coolify/backups/publication-retention, который смонтирован в Coolify как /var/www/html/storage/app/backups/publication-retention.

Object key: astro-telekom/publications/<artifactId>/<manifestDigest>.tar.gz. Существующий объект не перезаписывается. После upload объект скачивается обратно; проверяются его checksum/размер и восстановление каждого файла в изолированный каталог. Только после этого machine-authenticated controller принимает archive proof. Архив хранится не менее 90 суток; helper не удаляет S3 objects и не меняет lifecycle общего bucket.

Полный исходный архив на компьютере владельца и архивы в S3 — разные доказательства. Прерванный tar.gz.partial не считается резервной копией.

## Контракт GC

/retention/plan, /retention/archive, /retention/collect и /retention/restore доступны только в private controller на 8081 с x-admin-token. Публичного proxy к ним нет. Все операции проходят через ту же serial queue, что CMS и CODE; собственный process flock helper дополнительно исключает одновременный ручной и scheduled запуск.

До удаления проверяются весь sealed release, receipt, archive proof и актуальный protected set. Immutable gc/<id>.json связывает удаление с manifest и проверенным архивом. Удаляются только .html из manifest с проверкой границ собственного release и отсутствия symlink; пустые дочерние каталоги удаляются без рекурсивного обхода. Assets, manifests, receipts и operation records сохраняются. gc-deleted/<id>.json фиксирует завершение. Прерванное удаление продолжается по тому же marker после повторного S3 readback/restore.

readArtifact по-прежнему требует полный локальный release и запрещает activation архивного дерева. readHistoricalArtifact допускает metadata только для подтверждённого terminal receipt с валидным GC/archive record. Повтор завершённой CMS/CODE операции возвращает прежний receipt и не активирует старую версию. Свежие проверки S3 добавляются в immutable archive-verifications отдельно от идентичности исходного архива; это позволяет безопасно продолжить GC после длительной паузы. Штатные regular .pending-UUID после прерывания immutable writer игнорируются; неизвестные файлы и symlink блокируют GC.

Для восстановления оператор скачивает и проверяет архив, размещает полное дерево release в private /publication/restores/<id> и вызывает POST /retention/restore с artifactId. Под общей очередью проверяется полная опись; отсутствующие файлы копируются в private temp, синхронизируются и публикуются hard-link без перезаписи существующих. Каталоги синхронизируются до durable gc-restored marker. Частичное восстановление возобновляется; повтор подтверждённого возвращает успех. Полный readArtifact снова проходит; версия закрепляется. Восстановление не переключает сайт и не публикует CMS.

## Установка на проверенном контуре

После зелёного полного gate/CI и exact-SHA Coolify deployment:

1. Скопировать versioned Python helper в /opt/astro-telekom-retention/publication-retention.py, mode 0700.
2. Скопировать PHP bridge в /data/coolify/backups/publication-retention/publication-retention-s3.php, mode 0600; проверить php -l внутри Coolify.
3. Установить три versioned systemd unit из deploy/; выполнить systemd-analyze verify и daemon-reload.
4. Сначала запустить helper без --apply и сверить protected/candidates с live Caddy, baseline и очередями.
5. --apply --limit 1: архив, download, изолированное восстановление, GC одной версии, readback HTML/assets/API и диск.
6. После проверки обработать остальные кандидаты малыми партиями; --limit допускает 1–100.
7. Только после успешной приёмки включить publication-retention.timer и publication-retention.path. Timer запускается ежедневно в 02:30 UTC, path реагирует на новые receipts. Каждый запуск повторяет protected/SQL/BullMQ/архивные проверки.
8. Проверить enabled/active, list-timers и journalctl -u publication-retention.service. Код scheduler и факт его включения фиксируются отдельно.

Рекомендуемые команды:

    python3 /opt/astro-telekom-retention/publication-retention.py
    python3 /opt/astro-telekom-retention/publication-retention.py --apply --limit 1
    systemctl enable --now publication-retention.timer publication-retention.path
    systemctl list-timers publication-retention.timer
    journalctl -u publication-retention.service --no-pager -n 30

В журнале есть число кандидатов, archived/restored checksum, deleted HTML/байты и свободное место. При 75% выводится disk_warning, при 85% — disk_critical; превышение бюджета publication volume 12 GiB отмечается publication_budget_warning. Это запись в service journal, не отдельное письмо владельцу. Защищённые данные не удаляются ради лимита. Старые private builds не удаляются этим helper: их отдельная проверка и резервирование не заменяются возрастным rm.

## Проверки и остановка

Нужны tests/publication-retention.test.mjs (protected set, intents, archive evidence, crash/resume, symlink, historical receipts, общая queue, реальное восстановление), tests/publication-retention-archive.test.mjs и Python archive tests (полная файловая опись, corruption, traversal, отсутствие файлов и S3 failure без удаления). Перед commit/push — полный pnpm check. Linux должен выполнить symlink test без пропуска и реальный Node/Caddy runtime rehearsal.

Чтобы прекратить будущие запуски: systemctl disable --now publication-retention.timer publication-retention.path. Уже начатое удаление прерывается безопасно по durable marker и может быть продолжено. Код предыдущего релиза без GC-aware readers нельзя выпускать поверх уже очищенного volume: такой rollback требует полного восстановления архивных HTML либо версии кода с поддержкой GC metadata.

## Ручное обслуживание вне publication GC

Private build от 13 октября удалена отдельно 30 октября после внешнего архива и полного Linux-восстановления; штатный helper по-прежнему не удаляет builds. [Результат и инцидент системного journal](../research/2026-10-30-vps-cleanup.md). Для строгого сохранения журнала за 30 суток перед удалением нужно прочитать tail realtime timestamp каждого закрытого файла и сохранить пересекающий границу файл вне VPS; один vacuum-time не является доказательством полноты окна. Инцидент [#444](https://github.com/Celtoman/astro-telekom/issues/444) остаётся открытым, утраченная история не восстановлена.
