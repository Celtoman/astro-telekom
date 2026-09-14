# Безопасная миграция данных на структуру Release 1

Этот runbook применяется перед первым deployment ревизии, содержащей миграции `0021`–`0023`. Он не разрешает запуск production-трафика: задача — сохранить доказательства состояния данных, применить миграции без потери связей и подтвердить точный route inventory.

## Ограничения безопасности

- Не запускать migration до проверенного `pg_dump` и pre-migration audit.
- Не сохранять dump или audit output в репозитории. Dump может содержать персональные данные заявок.
- На время backup и обоих audit не выполнять импорт городов/тарифов, редактирование страниц, заявок или redirects.
- Не редактировать строки напрямую в PostgreSQL. Контент и статусы страниц меняются через административный API после проверки миграции.
- При любом ненулевом blocker или нарушении связей остановиться до deployment. Старый static release должен оставаться активным.

Все команды ниже выполняются из корня checkout на точном коммите, который планируется развернуть. В примерах используется PowerShell и production Compose; для Coolify нужно выполнять их на сервере приложения либо адаптировать только способ выбора контейнера, не сами SQL-проверки.

## 1. Зафиксировать ревизию и контейнер

```powershell
$releaseCommit = git rev-parse HEAD
docker ps --filter 'label=com.docker.compose.service=postgres' --format '{{.ID}} {{.Names}} {{.Status}}'
$postgresContainer = '<точный ID контейнера PostgreSQL этого приложения>'
if ($postgresContainer -notmatch '^[a-f0-9]{12,64}$') { throw 'Нужно указать точный container ID из docker ps' }
$releaseCommit
docker inspect $postgresContainer --format '{{.Name}} {{.State.Status}} {{.State.Health.Status}}'
```

В evidence сохранить commit SHA, container ID и имя контейнера. Не выбирать первый результат автоматически: на host могут работать несколько Compose-проектов. Не продолжать, если SHA отличается от проверенной CI-ревизии или PostgreSQL не healthy.

## 2. Получить и проверить backup

`$backupRoot` должен указывать на защищенный каталог вне репозитория. После проверки копию нужно перенести в зашифрованное off-server/S3-хранилище согласно backup policy.

```powershell
$backupRoot = 'C:\secure-backups\astro-telekom'
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupName = "release-one-pre-$stamp.dump"
$backupPath = Join-Path $backupRoot $backupName

docker exec $postgresContainer sh -c 'umask 077; pg_dump --format=custom --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /tmp/release-one-pre.dump'
if ($LASTEXITCODE -ne 0) { throw 'pg_dump завершился ошибкой' }
docker cp "${postgresContainer}:/tmp/release-one-pre.dump" $backupPath
if ($LASTEXITCODE -ne 0) { throw 'Не удалось скопировать dump из контейнера' }
docker exec $postgresContainer rm -f /tmp/release-one-pre.dump

$backupFile = Get-Item -LiteralPath $backupPath
if ($backupFile.Length -le 0) { throw 'Получен пустой dump' }
docker run --rm --mount "type=bind,source=$backupRoot,target=/backup,readonly" postgres:18.6-alpine pg_restore --list "/backup/$backupName" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'pg_restore не смог прочитать dump' }
$backupFile | Select-Object FullName, Length, LastWriteTimeUtc
```

Читаемый список `pg_restore --list` подтверждает структуру custom dump, но не заменяет restore rehearsal. До реального трафика восстановить эту копию в отдельную PostgreSQL 18 и повторить audit уже на восстановленной базе.

## 3. Выполнить pre-migration audit

Скрипт [release-one-database-audit.sql](../../scripts/release-one-database-audit.sql) начинает `BEGIN TRANSACTION READ ONLY` и завершает `ROLLBACK`. Он выводит migration history, точные totals и разрезы по статусам, четыре обязательные global pages, route collisions, redirects за пределы Release 1 и нарушения связей.

```powershell
$preAuditPath = Join-Path $backupRoot "release-one-pre-$stamp.txt"
Get-Content -Raw scripts/release-one-database-audit.sql |
  docker exec -i $postgresContainer sh -c 'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' |
  Tee-Object -FilePath $preAuditPath
if ($LASTEXITCODE -ne 0) { throw 'Pre-migration audit завершился ошибкой' }
```

До migration должны быть сохранены:

- `sites_total`, `cities_total`, `pages_total`, `page_blocks_total`, `tariffs_total`, `address_checks_total`, `leads_total`, `redirects_total`;
- все разрезы `*_by_status` и `pages_by_type_status`;
- `city_global_slug_collisions = 0`;
- `redirect_source_route_collisions = 0`;
- `relation_integrity_violations = 0`.

`redirect_targets_outside_release_one` до перехода может быть ненулевым из-за legacy detail URL. Такие записи не удалять: после deployment они останутся provenance-данными, но runtime/build policy не включит их в публикацию.

## 4. Применить migration на exact SHA

Запустить обычный deployment конкретного `$releaseCommit` и дождаться успешного one-shot `migrate`. Не запускать `bootstrap-seed` повторно без отдельной необходимости: в Coolify `RUN_BOOTSTRAP_SEED` после первого запуска должен оставаться `false`.

Ожидаемая последовательность migration:

1. `0021_site_global_release_pages` добавляет четыре enum value;
2. `0022_site_global_page_scope` делает `Page.cityId` nullable и добавляет scope/unique ограничения;
3. `0023_bootstrap_release_one_global_pages` идемпотентно создает недостающие global pages в `DRAFT`.

Не публиковать страницы и не запускать web publisher вручную до post-migration audit.

## 5. Выполнить post-migration audit

Повторить тот же read-only SQL на том же контейнере и сохранить отдельный файл:

```powershell
$postAuditPath = Join-Path $backupRoot "release-one-post-$stamp.txt"
Get-Content -Raw scripts/release-one-database-audit.sql |
  docker exec -i $postgresContainer sh -c 'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' |
  Tee-Object -FilePath $postAuditPath
if ($LASTEXITCODE -ne 0) { throw 'Post-migration audit завершился ошибкой' }
```

Приемка post-migration:

- migration history содержит завершенные `0021`, `0022`, `0023` без `rolled_back_at`;
- totals сайтов, городов, блоков, тарифов, проверок адреса, заявок и redirects точно равны pre-migration;
- `pages_total` увеличился только на количество действительно отсутствовавших global pages;
- для каждого сайта `global_page_inventory` содержит ровно четыре канонические пары type/slug;
- созданные страницы имеют `DRAFT`, пока владелец не добавил и не утвердил контент;
- collision-проверки и `relation_integrity_violations` равны нулю после применения policy; legacy redirects за пределы inventory могут храниться, но не должны стать эффективными.

Если counts расходятся не по указанному правилу или integrity/collision check ненулевой, остановить deployment до web publication. Не выполнять самодельную down migration; исследовать расхождение на копии и использовать проверенный backup для согласованного восстановления.

## 6. Подготовить четыре global pages

Через административный API заполнить и отдельно утвердить:

- `/karta-pokrytiya-provaydera`;
- `/goroda-obsluzhivaniya`;
- `/politika-konfidencialnosti`;
- `/soglasie-na-obrabotku-personalnyh-dannyh`.

Legal-тексты нельзя заменять демонстрационными формулировками. Публикация всех четырех записей — обязательное условие build-time inventory; до этого publisher должен завершаться ошибкой до переключения активного symlink.

## 7. Проверить production-like build и deployment

Получить public catalog через live API и доказать:

```text
published city routes = N
indexable HTML routes = N + 5
sitemap routes = N + 5
future service/tariff detail routes = 0
effective redirect targets outside inventory = 0
404 = HTTP 404 + noindex + no canonical
```

Затем выполнить production-like web build без `ALLOW_DEMO_DATA`, проверить post-build SEO gate и только после этого завершить exact-SHA deployment. В evidence сохранить SHA, deployment ID, число опубликованных городов, exact список sitemap URL и HTTP/canonical smoke. Родительская задача #136 закрывается только после этой проверки.
