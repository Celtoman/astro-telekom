# T4: независимый редакционный выпуск

Статус: LOCAL BACKEND CHECKED / EXTERNAL RELEASE PENDING. Задача [#534](https://github.com/Celtoman/astro-telekom/issues/534). Публичная верстка, preview, админский workspace, category reassignment и внешняя активация нового раздела ещё не приняты.

## Реализованные границы

- Черновики имеют собственные revisions и не повышают общий `Site.workingRevision`. Создание использует постоянный client id; сохранение проверяет `expectedRevision` в serializable transaction. Безопасный незавершённый draft разрешён, неизвестные структуры отклоняются.
- Все опубликованные редакции сохраняются; остальные history rows ограничены 20 checkpoints, текущей и захваченными pending operations. Restore создаёт рабочую редакцию и не выпускает её.
- Review и publish используют подтверждённый serving source из validation snapshot. Нет подмены DB drafts или public catalog. Если serving недоступен, опубликованная версия помечена недоступной; редактирование draft сохраняется. CODE читает exact immutable catalog.
- Selected article/category/settings/404 snapshots накладываются на baseline. Новая категория — явная зависимость статьи; существующий category draft автоматически не выпускается. Медиа выбираются из составного опубликованного источника. Review не создаёт crop-файлы: неприменённый crop блокирует проверку с полем ошибки.
- Digest связывает baseline, entity revisions, snapshots, media и aliases. Новый baseline/сохранение требуют новой проверки. Operation id возвращает тот же SQL publication; failed operation не ставится на повтор под прежним id.
- SQL site lock и pending barrier разделяют legacy/editorial release. Caddy проверяет `basePublicationId`: stale release не перезаписывает другой материал. CMS упорядочен по `releaseSequence`; source revision остаётся provenance. CODE сохраняет publication/catalog/sequence. Старые manifests совместимы и получают sequence при CODE upgrade.
- Acknowledgment меняет только выбранные сущности и не продвигает общий `publishedRevision`. Запоздалый receipt не откатывает новый entity watermark; published content читается из serving source.
- Projection добавляет list/article/category inventory, сортировку по исходной дате/id, 12 записей, pagination 7/5 slots и related. Editorial SEO отделён от legacy templates. Выпуск только 404 не запускает `/news`.
- Смена slug создаёт одношаговые aliases; снятие удаляет статью и aliases к исчезнувшим целям. `/novosti` и `/news/page/1` появляются при существовании `/news`; `/akcii-domru` не переназначается. DB aliases остаются DRAFT и активируются catalog. Миграция 0069 добавляет `managedEditorialKey`: общий redirect editor не меняет их отдельно. Ручной 301 может вести на live news.
- Legacy capture сохраняет live editorial source/aliases и не захватывает news drafts. Readers выбирают новый выпуск по sequence; возвращаемый legacy revision сохраняет прежнее значение.
- Builder копирует только выбранные производные: hash keys, regular files без symlink, размер/SHA, фиксированный public path. Файлы входят в versioned artifact. News-верстка подключается в T7.

## Доказательства и ограничения

PostgreSQL 18 store rehearsal: один успех / один 409 при параллельном save; POST без дубля; 20 checkpoints плюс опубликованная редакция; restore только в draft; revisions 52:50 и ноль публикаций сохранены.

Publication rehearsal: шесть отдельных выпусков и idempotent retry; draft B и неготовый working site phone исключены из A; edit-during-publish остаётся draft; stale review отклонён; slug301/withdrawal/404 и legacy capture проверены; watermark остался 52:50. Queue и SQL acknowledgment — fixtures, не внешняя Caddy activation.

Sealed artifact/protocol tests проверяют CMS при одинаковой source revision, stale baseline, CODE sequence mutation, upgrade исторического manifest без смены catalog/publication и прежние controller/receipt scenarios. Caddy control HTTP здесь fixture; настоящий runtime regression входит в полный gate.

Migration rehearsal 0068+0069 сохраняет два snapshots, ручной redirect и legacy revisions после 67 старых миграций; проверяет четыре sequence, legacy dedup и отсутствие автоматически созданных новостей. HTTP fixture проверяет cookie guard всех scopes, static-vs-dynamic routing и whitelist body. Результаты фиксируются в progress/evidence.

Остались: public HTML/Schema/OG/404/media, четыре preview width, browser recovery/conflicts, category reassignment с отдельными live/draft revisions, полный CODE/CMS pipeline test-контура и сохранение импорта в черновиках.

Полный gate объединённого состава поверх `7f19e1c6` (включая параллельный favicon-выпуск): `pnpm check`, 1004 pass / 0 fail / 1 skip, exit 0. Проверенная tree `39be93935ef75037e9cdb5a1de133b67f0ba064a`; 63 staged файла совпали с frozen source. Финальный запуск выполнен с ограничением CPU affinity проверочного процесса до четырёх ядер, без изменения тестов или их лимитов. Отдельная предварительная Docker-сборка заполнила кеш после медленных загрузок. Более ранние неуспешные попытки сохранены в private logs; допустимый красный baseline не вводился. Последующее обновление документации не меняет проверенный код.
