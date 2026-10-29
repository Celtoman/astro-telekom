# Архивная очистка публикаций — внешняя приёмка

29 октября 2026. Выполнена разрешённая владельцем задача [#440](https://github.com/Celtoman/astro-telekom/issues/440), проблема [#438](https://github.com/Celtoman/astro-telekom/issues/438). Порядок: внешний архив и восстановление, первая GC и проверка, партии по пять, итоговая проверка, включение scheduler. [Машинные доказательства](evidence/2026-10-29-publication-retention/acceptance.json), [эксплуатационный runbook](../runbooks/publication-retention.md).

## Результат

Удалён только старый HTML 27 публикаций: 108513 файлов, 13270859993 логических байта. Publication volume уменьшился с 25786068992 до 11854028800 занятых байт: освобождено 13932040192 байта, около 12,98 ГиБ. На диске доступно 21996380160 байт, около 20,49 ГиБ; занято 73,52% вместо исходных 95,68% до очистки build cache. Изменение диска включает выпуск новых runtime images, поэтому освобождение HTML отдельно измерено по publication volume.

Сохранены 1573 старых asset-файла (77197344 байта), все manifests/receipts и журналы операций. Все 27 старых CSS URL дали 200; historical metadata/receipts всех архивных деревьев прочитаны, восемь старых CMS receipts проверены через private HTTP. Обычный полный reader отказывает архивному дереву. Осталось 13 полных запечатанных версий, включая active, baseline, прежнюю действующую и две исходные rollback, а также версии за семь суток. Legacy current и старый private build не удалялись. Eligible candidates после GC — ноль.

## Архив и восстановление

В существующем Timeweb S3 сохранены 32 полных архива общим размером 3073163534 байта: 27 удалённых публикаций, четыре исходные защищённые версии и новый действующий code artifact. Каждый объект скачан обратно; все файлы реально восстановлены в изолированный каталог и сверены с manifest по размеру/SHA-256. Перед каждым удалением host helper повторил S3 readback/restore. Архивы не перезаписываются и helper не удаляет их; минимальный срок — 90 суток. У общего bucket не было настроенного lifecycle раннего удаления.

Локальный metadata archive содержит 117 валидных JSON manifests/receipts/intents/baseline; SHA-256 2885c29cabab24ef4539929830e79a9b059bb09045e5fe18ef1049480d3970e0. Прерванный исходный tar.gz.partial не считается проверенной резервной копией. Полные per-artifact архивы S3 и их проверка — отдельное доказательство. Операционные журналы и proofs сохранены в каталоге server-backups владельца и в /root/maintenance/astro-retention-check-20261029 на VPS.

## Выпуск и сохранность контента

Код `98adae87901e3951690840b6149420a336d42699`: полный Linux pnpm check без ошибок/пропусков, реальный Node/Caddy runtime rehearsal, независимое ревью с исправлением четырёх замечаний. Актуальный числовой baseline — только в [TEST_COVERAGE](../TEST_COVERAGE.md). [CI](https://github.com/Celtoman/astro-telekom/actions/runs/40943339931) зелёный. Coolify MCP deployment `h8cw4mj6d8uw5lejmpaghamv` — finished, exact SHA; приложение running:healthy. CODE receipt SUCCEEDED.

Новый active `a1f5c0f0e0cda0b7c77d56473cf9ccd2d133156ea1d79e6c80495604d83169a3`; прежний active `b870d08bc3bdbb83d05b735f26ff3bb2a155adc517688e19b6e3783541d7d223` сохранён. Publication `cmvs82yuw000101o52i6ams8d`, working/published revisions 24/24 и catalog digest `d9b3c8469cdeffccbf3a3ad896ba6979af13cbc6a8e383aa4ca99348b9095d07` совпали до/после. Baseline `a5c3994b11742c77eed7721b8b2d993adff8102ece136aea0025ce630402b475` и исходные rollback `483421ae0990b0574edcf6f71e7ca4601abd97729ced81eea21771829d9a0a0c`, `eb6cda7e06f9f8927f5dfae015bdb5d8628efedbc44ff7f4a1cbe4df245e71f7` полностью сверены по manifest после очистки.

HOME/CITY, active assets, API health/readiness дали 200. Внешние public/admin по-прежнему 401 без BasicAuth, noindex сохранён. CMS/Figma не менялись. 23 контейнера других проектов сохранили ID и restart counters; все исходные 25 volumes сохранены. Docker Engine остался 29.5.1.

## Регулярный запуск и границы

Versioned host helper/bridge и три systemd unit совпадают с выпущенным Git commit. publication-retention.timer и publication-retention.path enabled/active. Ежедневный запуск — 02:30 UTC, то есть 05:30 МСК, с задержкой до пяти минут; ближайший после установки — 30 октября 05:32:39 МСК. Дополнительный запуск — при изменении receipts. Ручной и настоящий path-triggered запуск завершились success/exit 0, кандидатов ноль. Для проверки события был открыт и закрыт write-descriptor существующего receipt без записи байтов; его SHA-256 не изменился, новый receipt/snapshot не создавался.

Каждый запуск проверяет SQL/BullMQ и protected set; отказ S3/metadata/очереди запрещает удаление. Бюджет publication volume 12 ГиБ — предупреждение в журнале, а не основание удалять protected версии; при высокой частоте сборок вопрос бюджета остаётся отдельной находкой PF-148. Откат к коду без GC-aware readers требует предварительного восстановления архивного HTML либо совместимой версии кода; порядок — в runbook.

Во время изолированных тестов обнаружены и отдельно зарегистрированы [остаточные anonymous volumes](https://github.com/Celtoman/astro-telekom/issues/441) и [CRLF shell helpers Windows](https://github.com/Celtoman/astro-telekom/issues/442). Только собственные 51 unused test volume удалены с проверкой исходного inventory; исправление самих rehearsal scripts не входило в эту задачу. Неиспользуемый build cache очищен штатным builder prune, images и volumes при этой операции сохранены. Решение о реальном трафике остаётся за владельцем.
