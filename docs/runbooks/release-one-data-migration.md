# Безопасная миграция данных на структуру Release 1

Этот runbook впервые применялся перед deployment ревизии с миграциями `0021`–`0026`, а текущая процедура дополнена для `0032_canonical_city_home` и forward-only repair `0039_repair_site_publication_revision`. После уточнения владельца 14 сентября 2026 года route inventory включает отдельный URL каждого опубликованного тарифа опубликованного города. Решение о готовности платформы к реальному трафику принимает только владелец; runbook не выносит такой вердикт. Его задача — сохранить доказательства состояния данных, применить миграции без потери связей и подтвердить точный route inventory.

## Ограничения безопасности

- Не запускать migration без проверенной точки восстановления во внешнем backup-решении владельца и pre-migration audit. Ручной `pg_dump` ниже остается только аварийным одноразовым safeguard и не является реализацией отмененной #145.
- Не сохранять dump или audit output в репозитории. Dump может содержать персональные данные заявок.
- От начала pre-migration audit до создания и успешного завершения чистого publication snapshot остановить импорты, CMS-записи и ручные публикации. Перед migration должны отсутствовать `SitePublication` в `SCHEDULED`/`PENDING`/`RUNNING` и `SiteRebuild` в `PENDING`/`QUEUED`/`RUNNING`/`RETRYING`; `0032` и `0039` повторяют эту проверку под табличными блокировками и завершаются по bounded timeout, а не конкурируют с записью.
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

Основной recovery point создается и проверяется внешним backup-решением владельца по его собственной инструкции. Команды ниже — необязательный одноразовый дополнительный `pg_dump`; `$backupRoot` должен указывать на защищенный каталог вне репозитория. Репозиторий не задает для этой копии провайдера, расписание или retention policy.

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

Читаемый список `pg_restore --list` подтверждает структуру custom dump, но не заменяет restore rehearsal. До применения `0032` восстановить эту копию в отдельную PostgreSQL 18 и повторить audit уже на восстановленной базе.

## 3. Выполнить pre-migration audit

Скрипт [release-one-database-audit.sql](../../scripts/release-one-database-audit.sql) начинает `BEGIN TRANSACTION READ ONLY` и завершает `ROLLBACK`. Он выводит migration history, точные totals и разрезы по статусам, пять обязательных global pages, отсутствующие/legacy/неканонические/повторные городские HOME, dangling page references, route collisions, redirects за пределы Release 1 и нарушения связей.

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
- `missing_city_home_pages = 0` и `dangling_page_references = 0`;
- `relation_integrity_violations = 0`.
- `active_site_publications = 0` и `active_site_rebuilds = 0`; не запускать новые CMS-записи и публикации до успешного snapshot шага 7.

Перед первым применением `0032` в известном внешнем контуре ожидаются `legacy_city_home_pages = 206`, `noncanonical_city_home_pages = 206` и `duplicate_city_home_pages = 206`. Любое другое число требует повторной сверки с текущей БД: migration намеренно не угадывает нестандартную конфигурацию.

`redirect_targets_outside_release_one` до перехода может быть ненулевым из-за legacy service/detail URL. Такие записи не удалять без отдельного разбора. Managed redirect тарифа становится эффективным, только если сам тариф, его город и сайт опубликованы; остальные правила остаются provenance-данными вне публикации.

## 4. Применить migration на exact SHA

Перед deployment повторить изолированную репетицию repair-контракта на PostgreSQL 18:

```powershell
node scripts/rehearse-site-publication-repair.mjs
```

Успех означает, что active publication/rebuild отклонены, legacy broken site получил ровно одну рабочую ревизию с полным audit payload, а уже опубликованная revision 4, подготовленная неопубликованная revision 4 и чистая база не изменились. Полные publication rows совпали до/после, а повторное применение `0039` осталось no-op. Это не заменяет rehearsal backup внешнего контура.

Запустить обычный deployment конкретного `$releaseCommit` и дождаться успешного one-shot `migrate`. Не запускать `bootstrap-seed` повторно без отдельной необходимости: в Coolify `RUN_BOOTSTRAP_SEED` после первого запуска должен оставаться `false`.

Ожидаемая последовательность migration:

1. `0021_site_global_release_pages` добавляет первые четыре enum value;
2. `0022_site_global_page_scope` делает `Page.cityId` nullable и добавляет scope/unique ограничения;
3. `0023_bootstrap_release_one_global_pages` идемпотентно создает недостающие global pages в `DRAFT`.
4. `0024_cookie_policy_page_type` отдельной транзакцией добавляет `COOKIE_POLICY`.
5. `0025_publish_release_one_catalog` обновляет scope constraint, создает cookie page, публикует пять global pages и все города, а также создает каноническую `HOME` с пустым slug, если именно такой записи еще нет. Историческая HOME со slug `home` этой проверкой не переиспользуется — это причина cleanup в `0032`.
6. `0026_backfill_city_home_template` добавляет канонические семь блоков только тем опубликованным city HOME, у которых до миграции не было ни одного `PageBlock`; существующие композиции не перезаписываются.
7. `0032_canonical_city_home` внутри явной транзакции и под bounded `SHARE ROW EXCLUSIVE` locks сначала отклоняет активную publication/rebuild. Затем она принимает только единственную HOME с пустым slug либо известную пару `slug=''` + `slug='home'` с одинаковыми status/SEO/content/нормализованными блоками. Заголовки известной legacy-пары различаются, поэтому сохраняется title канонической строки, а legacy title не считается payload. Для пары migration переводит `Lead.pageId` и `AddressCheck.pageId` на каноническую страницу, удаляет legacy HOME с ее блоками, добавляет DB constraint/index и одну системную рабочую ревизию затронутого сайта. При ином расхождении migration падает до записи; исторические `SitePublication.catalog` остаются неизменяемыми. Поэтому `0032` выпускается по стандартной схеме expand–migrate–contract: совместимый backend и DB-инварианты, новый чистый publication snapshot, затем строгая web-проверка.
8. `0039_repair_site_publication_revision` под теми же bounded locks выбирает только Site с `workingRevision = publishedRevision`, без более новой подготовленной `ContentRevision`, чей последний `SUCCEEDED` snapshot не совпадает с live name/slug/телефонами. Миграция повышает working revision ровно на один и добавляет `ContentRevision`/`AuditEvent` с source `migration:0039_repair_site_publication_revision`; `SitePublication` не меняется и автоматическая publication не запускается.

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

- migration history содержит завершенные `0021`–`0039` без `rolled_back_at`;
- totals сайтов, городов, тарифов, проверок адреса, заявок и redirects точно равны pre-migration;
- для первого применения `0032` `pages_total` уменьшается ровно на pre-migration `legacy_city_home_pages`, а `page_blocks_total` — на число блоков удаленных legacy HOME; содержимое сохраненных канонических HOME не меняется;
- все существовавшие ссылки `Lead.pageId` и `AddressCheck.pageId` на legacy HOME теперь указывают на соответствующую каноническую HOME, а totals обеих таблиц не меняются;
- `Site.workingRevision` каждого затронутого сайта увеличен на один, добавлены одна `ContentRevision` и один `AuditEvent` с source `migration:0032_canonical_city_home`; `Site.publishedRevision` и старые `SitePublication.catalog` не изменены;
- зафиксирован точный `Site.workingRevision`, созданный `0032`; именно этот номер передается как `expectedWorkingRevision` в шаге 7, а любые другие CMS-записи до завершения snapshot запрещены процедурой;
- для каждого сайта, выбранного `0039`, `Site.workingRevision` увеличен ровно на один, созданы по одной `ContentRevision` и `AuditEvent` с source `migration:0039_repair_site_publication_revision`, а `publishedRevision` и все исторические `SitePublication` байт-в-байт не изменены;
- сайты с уже подготовленной рабочей ревизией, совместимым snapshot или без publication не изменены; точный `workingRevision`, созданный `0039`, фиксируется для явной publication в шаге 7;
- для каждого сайта `global_page_inventory` содержит ровно пять канонических пар type/slug в `PUBLISHED`;
- `published_tariff_detail_routes` равен числу опубликованных тарифов, принадлежащих опубликованным городам опубликованного сайта;
- все строки `City` и их `HOME` имеют `PUBLISHED`;
- `invalid_published_city_home_templates` имеет `violation_count = 0`, то есть видимые блоки каждой опубликованной городской `HOME` идут в точной канонической последовательности;
- `missing_city_home_pages`, `legacy_city_home_pages`, `noncanonical_city_home_pages`, `duplicate_city_home_pages` и `dangling_page_references` имеют `violation_count = 0`;
- collision-проверки и `relation_integrity_violations` равны нулю после применения policy; legacy redirects за пределы inventory могут храниться, но не должны стать эффективными.

Если counts расходятся не по указанному правилу или integrity/collision check ненулевой, остановить deployment до web publication. Не выполнять самодельную down migration; исследовать расхождение на копии и использовать проверенный backup для согласованного восстановления.

## 6. Проверить пять global pages

Через административный API заполнить и отдельно утвердить:

- `/karta-pokrytiya-provaydera`;
- `/goroda-obsluzhivaniya`;
- `/politika-konfidencialnosti`;
- `/soglasie-na-obrabotku-personalnyh-dannyh`.
- `/politika-obrabotki-faylov-kuki`.

Три legal-текста версионированы в `apps/web/src/data/legal-pages.ts` и используют hostname текущего `PUBLIC_SITE_URL`. Дополнительная сверка ИП, ИНН, ОГРНИП, адреса, получателей данных и `info@tv-internet-dom.ru` вынесена в низкоприоритетную #144 и не является rollout-gate; публикация всех пяти записей остается техническим условием build-time inventory.

## 7. Проверить production-like build и deployment

Получить public catalog через live API и доказать:

```text
published city routes = N
published tariff detail routes = T
indexable HTML routes = N + T + 6
sitemap routes = N + T + 6
future service detail routes = 0
effective redirect targets outside inventory = 0
404 = HTTP 404 + noindex + no canonical
```

Выпуск выполняется тремя независимыми exact-SHA этапами без временной legacy-ветки в финальном коде:

1. **A0 — tolerant reader:** exact-SHA deployment `06e2e45560d93aa1fea2ae873d0694b80179af20` (`xri5lnmbcouzqw2rcglslrqv`) оставил чтение исторического snapshot совместимым, но заставил city form брать каноническую HOME с пустым slug. CI и deployment завершились успешно; авторизованный `/kazan` вернул HTTP 200, одну форму и ни одного `pageSlug=home`.
2. **A1 — expand/migrate:** развернуть migration, API/admin guards и audit при совместимом web-reader. Убедиться, что migration и post-migration audit завершились, а старый успешный static release продолжает обслуживаться.
3. Не снимая запрет на CMS-записи, штатным `POST /admin/sites/:siteId/publications` опубликовать зафиксированный после migration точный `workingRevision` как `expectedWorkingRevision`. Дождаться `SUCCEEDED` и подтвердить, что build catalog этого immutable snapshot содержит ровно одну HOME с пустым slug для каждого города.
4. **B — contract:** отдельным exact-SHA deployment включить строгую web-проверку дублей/непустого slug, выполнить production-like build без `ALLOW_DEMO_DATA`, post-build SEO gate и HTTP/canonical smoke.

Не объединять A1 и B: при отсутствии активной publication Coolify build берет последний `SUCCEEDED` snapshot, который до нового snapshot еще содержит legacy-дубли или устаревшую Site identity/contact и закономерно блокируется строгим reader. Для `0039` A1 завершается только после проверки repair revision и явной публикации именно ее номера; migration сама не разрешает переход к strict build. В evidence сохранить SHA и deployment ID, номера рабочей/опубликованной ревизий, repair `ContentRevision`/`AuditEvent`, неизменный historical snapshot, число опубликованных городов, exact список sitemap URL и HTTP/canonical smoke. Эти проверки подтверждают технический результат, но решение о готовности платформы к трафику остается только за владельцем.
