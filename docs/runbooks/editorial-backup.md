# Резервирование редакционных медиа и БД

Пункт принятого плана новостей T3/T10, [#534](https://github.com/Celtoman/astro-telekom/issues/534), [#546](https://github.com/Celtoman/astro-telekom/issues/546). Код установлен изd5a12f0f; два реальных S3 download/hash/PG18 restore пройдены до и после переноса. После переноса проверены6 assets / 38 files / 12 editorial references; timer enabled/active, production DB не восстанавливалась. [Внешние доказательства](../research/2026-11-07-news-external-release.md). Старый publication-retention продолжает резервировать только immutable публичные артефакты, его поведение не меняется.

`deploy/editorial-backup.py` делает custom PostgreSQL dump работающей БД приложения и копию immutable originals/derivatives из фиксированного editorial-media volume. API сначала сохраняет неизменяемые файлы, затем коммитит ready metadata; удаления медиа нет. Поэтому снимок БД вместе с последующим полным набором immutable файлов содержит все ссылки этого снимка. Во время backup приложение не останавливается. Параллельный DDL может прервать dump; такой комплект не принимается.

Manifest перечисляет каждый файл, размер и SHA256. Существующий private Timeweb S3 используется через отдельный PHP bridge внутри Coolify; credentials остаются в его модели. Префикс `astro-telekom/editorial-backups/{archiveSha256}.tar.gz`, существующий объект не перезаписывается, удаление объектов отсутствует. После download проверяются все байты и полный архив, затем настоящая PostgreSQL18 восстанавливается в invocation-owned контейнере с network=none и tmpfs. Проверяются originals/derivatives и ссылки текущих статей, категорий, settings, истории и опубликованных catalogs. Это не production restore и не активация сайта.

До начала проверяется пиковое место по размерам БД/media с запасом; symlink/неизвестные пути отклоняются. API origin сверяется с фактическими props AdminWorkspace в admin-контейнере того же фиксированного ресурса. Неудачное восстановление или cleanup контейнера запрещает успешный proof. Приватный proof записывается в `/var/lib/astro-editorial-backup`; stdout содержит только counts/hashes/status, без текста статей, строк БД и секретов. Ошибки cleanup содержат только имя собственного fixture для адресной диагностики.

## Проверка расписания

20 ноября 2026 в 03:45 МСК плановый запуск завершился ошибкой [#645](https://github.com/Celtoman/astro-telekom/issues/645). В тот же день ручной запуск штатной службы завершился в 12:46 МСК. Подтверждены чтение архива из S3, совпадение контрольных сумм и изолированное восстановление PostgreSQL 18 с 10 медиаобъектами, 70 файлами, 443 ссылками и 93 редакционными записями. Сбой ночью не воспроизвёлся. Таймер активен. Для закрытия инцидента остаётся сверить следующий запуск именно от таймера и его новый proof.

## Применение после gates

1. Проверить целевой resource, host/ОС/нагрузку/диск, действующие containers/mounts и отсутствие незавершённого deployment. Сверить source SHA и локальные проверки. Существующие credentials/backup jobs не менять.
2. На проверенный host установить Python helper в `/opt/astro-telekom-retention/editorial-backup.py`0700, PHP bridge в `/data/coolify/backups/publication-retention/editorial-backup-s3.php`0600. Проверить синтаксис Python и PHP внутри Coolify. Создать root-only proof directory0700.
3. `/etc/astro-editorial-backup.env`0600 содержит только `ASTRO_EDITORIAL_API_ORIGIN=https://<проверенный ADMIN_DOMAIN>`, без token/password. Helper независимо сверяет его с настоящим ресурсом.
4. Установить service/timer, выполнить `systemd-analyze verify` и daemon-reload. Сначала вручную запустить один backup и проверить S3 readback, настоящий PG restore, media/reference counts и отсутствие оставшегося fixture. Проверить, что CMS/revisions/catalog не изменились.
5. Только после успешного результата включить timer: ежедневно00:45UTC (03:45МСК), jitter до5минут, missed run после запуска хоста. Существующее расписание publication-retention сохраняется. Новый workflow не удаляет S3 archives; local scratch удаляется после проверки, proofs сохраняются.
6. До WordPress apply использовать настоящий свежий proof соответствующего API. После переноса повторить backup/restore уже с6черновиками/6обложками и сверить новые references. Нельзя писать proof вручную для обхода барьера.

Откат — disable/stop только editorial-backup.timer/service; сохранённые архивы/proofs и production DB/media не удалять. Восстановление приложения из backup — отдельная операторская операция после выбора комплекта и проверки его checksum; этот helper не пишет восстановленные данные в production.
