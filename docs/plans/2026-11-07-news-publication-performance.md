# Публикация новостей: скорость, Astro и повтор анонса

7 ноября 2026. Аудит и предложение по запросам владельца. После аудита владелец явно разрешил применение, обновление Node/Astro, проверки, push и test-выпуск. Текущее выполнение: [протокол](../research/2026-11-07-news-performance-implementation.md). Реальные материалы не публиковать. Задачи: [#562](https://github.com/Celtoman/astro-telekom/issues/562), [повтор текста #568](https://github.com/Celtoman/astro-telekom/issues/568), [план коррекции #569](https://github.com/Celtoman/astro-telekom/issues/569).

## Проверенные факты

Read-only HTTP-проверка 7 ноября в12:42UTC нашла уже завершённый пакетный выпуск cmw6do7a0000601qr3n1fmos7. Аудит его не запускал. Рабочие материалы не сохранялись: единственный POST аудитора — вход в админку, последующие запросы только GET. Все6 статей сейчас PUBLISHED; это более новый срез, чем сохранённые6CHANGED при предыдущем CODE-выпуске. Publication до/после текущего чтения совпадает; CMS29/29.

`cmsProgress` существующей job cmtw6dpwj015g01o0ho99ow05, revision31, sampleEligible=true,4237страниц:

| Этап | Секунды | Что включает по коду |
| --- | ---: | --- |
| PREPARING | 6.772 | Начало worker/controller, получение snapshot и подготовка |
| BUILDING | 68.048 | Запуск Astro, компиляция и генерация всех страниц |
| CHECKING | 135.545 | SEO gate, проверка ресурсов, source identity, inventory, seal/copy/fsync и итоговая проверка артефакта |
| ACTIVATING | 34.941 | Проверка кандидата/старого дерева, переключение Caddy и подтверждение serving |
| CONFIRMING | 10.399 | Возврат результата worker/API и SQL ACK |
| Всего | 255.705 | 4мин15.7с от worker start до completedAt |

Это один фактический образец, не среднее и не норматив. Интервал начинается после постановки задачи: длительность UI review, API validation/snapshot transaction и ожидания очереди сюда не входят. Строка job переиспользуется, поэтому её старое createdAt не служит началом этого выпуска. Поле CHECKING не выделяет отдельно verify/copy/fsync; их вклад пока не измерен. Нельзя приписывать все136с SEO или диску. Подготовка исходников Coolify [#553](https://github.com/Celtoman/astro-telekom/issues/553) — другой процесс.

### Почему собирается весь сайт

1. `EditorialPublicationService.candidate()` берёт обслуживаемый source, применяет выбранные изменения и зависимости, готовит media и валидирует полный composite catalog. `publish` создаёт одну SitePublication и один enqueue для пакета. Не выбранные рабочие изменения не включаются.
2. Worker static provider передаёт exact publication в `StaticArtifactBuilder`. Builder всегда запускает обычный `astro build` по полному catalog.routes. Публичный сайт — static output; все HTML объединяются в один sealed release, который Caddy активирует атомарно.
3. Каждый запуск получает private renderer copy и новый cacheDir под operationRoot. В finally весь operationRoot удаляется. `experimental.incrementalBuild` и route cacheKey не настроены. Installed dependencies переиспользуются: CMS-публикация не устанавливает pnpm-пакеты и не запускает Coolify deployment.
4. `artifactId` зависит от publicationId/rebuild identity. Он включён в `build.assetsPrefix` и `publicAsset()` для картинок/иконок/OG. Поэтому даже неизменная страница получает другие ссылки. В установленном Astro assetsPrefix входит в config hash инкрементального кеша; просто сохранить cacheDir и включить флаг недостаточно. `validateAssets` сейчас запрещает ссылки на чужой artifact.
5. `verifyPublication` читает все HTML для SEO, затем текстовые файлы для loopback gate. `validateAssets` делает дополнительный проход. `sealArtifact` строит inventory, перечитывает/хеширует каждый файл, пишет/fsync в staging и повторно проверяет sealed дерево. Activation/reconcile также используют readArtifact с полным inventory. Эти границы защищают целостность и восстановление, их нельзя просто отключить ради скорости.

Полная атомарная версия сайта нужна для согласованного serving. Повторная генерация всех неизменных HTML — следствие нынешней реализации, а не обязательное условие статического сайта.

### Обновление Astro

Проверены установленный код, npm registry и официальные release notes: web/admin7.3.1; latest stable7.4.7 на07.11.2026. [Astro7.4](https://astro.build/blog/astro-740/) добавляет `astro build --timings` и experimental parallel prerendering. [Changelog](https://github.com/withastro/astro/blob/main/packages/astro/CHANGELOG.md) содержит исправления CSP, кешированного вывода и ClientRouter scroll restoration. Это повод для отдельного контролируемого обновления, не доказательство устранения наших двух прежних CSP-причин или ускорения публикации вдвое.

Важная зависимость: registry engines7.4.7 требует Node>=22.23.4; локальная Node, web/admin Dockerfile и CI сейчас22.23.2. Сначала согласовать и выровнять поддерживаемую patch-версию Node22 во всех затронутых build/runtime/CI, затем обновлять Astro одновременно в web/admin. Не менять Node major без отдельной необходимости. Установленный @astrojs/react6.0.5 проверять на совместимость; не запускать вслепую массовое @astrojs/upgrade: latest integration7.1.4 имеет дополнительный peer oxc-transform-react. Все необходимые manifests и pnpm-lock менять вместе, выполнить frozen install и audit high.

[Нативный incrementalBuild](https://docs.astro.build/en/reference/experimental-flags/incremental-build/) существует с7.2 и уже присутствует в нашем7.3.1. Он экспериментальный, требует cacheKey для getStaticPaths и сохранённый cacheDir. По документации concurrency>1 отключает переиспользование. Поэтому сравнивать отдельные режимы: обычный build с ограниченным параллелизмом и incremental с concurrency1. Не складывать несовместимые флаги и не обещать эффект от одного обновления.

### Повтор текста

Во всех6живых HTML summary над обложкой точно совпадает с первым абзацем body (длины217/160/180/275/175/177символов). `wordpressNewsDraft()` берёт анонс из первого абзаца, сохраняя body; это полезно для карточки. `renderNewsArticle()` повторно выводит summary перед cover. Поэтому источник дефекта — использование карточного анонса в article header.

Предлагается убрать article header summary целиком, а не удалять первый абзац body и не сравнивать тексты эвристикой. Summary сохраняется в данных, карточках list/home/related, description/OG/JSON-LD. Общий renderer должен одинаково работать на публичной странице и в ARTICLE preview. Это отдельная короткая коррекция #569, не зависящая от оптимизации сборки.

## Исходный предлагаемый порядок применения (история аудита)

- [ ] 1. Выполнить #569 отдельным изменением: regression для статьи с/без cover; убрать header summary и ненужный CSS selector; проверить сохранность первого абзаца, карточек, SEO/OG/JSON-LD и preview,4ширины/24px/h1. Без изменения БД.
- [ ] 2. Отдельным коммитом выровнять Node до поддерживаемой patch-версии22, обновить Astro web/admin до7.4.7 и только необходимые интеграции. Выполнить audit high, frozen install, полный pnpm check, Docker runtime rehearsal, CSP positive/negative, SPA native/fallback/Back/dirty guard и preview. Не откатывать прежние исправления CSP на основании одной версии framework.
- [ ] 3. Добавить подробные subphase timings: review/API validation, очередь/CODE wait, source copy/media, Astro --timings, SEO, assets scan, inventory/hash, seal/copy/fsync, activation/reconcile/ACK; количество файлов/байт/rendered/reused. Телеметрия не должна менять исход публикации. Разделить фактические phases и пользовательское сообщение «Сборка».
- [ ] 4. На изолированной копии опубликованного snapshot провести не менее3х прогонов cold/warm каждого режима на одинаковых ресурсах. Синтетические article/category edits только в локальной fixture DB/volume; внешние API публикации недоступны. Исходный контрольный full build оставить эталоном. Не создавать тестовые материалы в test-контуре.
- [ ] 5. По детализации ускорить CHECKING/seal: объединить совместимые чтения SEO/loopback/assets/inventory, добавить ограниченный параллелизм чтения/хеширования/записи, проверить безопасный reflink/copy для неизменных bytes. Сохранить проверку конечного дерева, fsync/durable manifest/receipt, запрет symlink и защиту от изменения файла между hash и seal. Не вводить глобальный memoization readArtifact: restart, внешняя порча, GC и activation остаются отдельными trust boundaries.
- [ ] 6. Подготовить изолированный прототип native incrementalBuild: стабильный, versioned namespace ресурсов по проверенному asset-set вместо ID всей публикации; новая версия протокола serving/verifier/manifest/retention, сохранение старых ресурсов. Ключ asset-set учитывает реально влияющие renderer/config/publicEnv/content-generated assets, не только git SHA. Кеш partitioned по сайту/renderer/context, запускается последовательно, cache publication атомарна; повреждение/несовпадение даёт full fallback.
- [ ] 7. Задать cacheKey всех используемых данных городских/тарифных/address маршрутов: общий display/header/footer/variables/SEO/структура и route data. Для первого безопасного режима при article/category-only изменениях можно использовать консервативный digest всей неизменной части вне редакционных данных. Проверить фактические скрытые зависимости loadSiteData, даты/переменные/источники данных; не исключать поля по имени без доказательства. Главную, все news/list/category/related и sitemap/redirects пересчитывать из нового полного snapshot; удалённые URL должны исчезать. При смене renderer/env/общих настроек/CODE — full build. Не сохранять старые HTML со ссылками на старую publication, маскируя integrity errors.
- [ ] 8. Сопоставить full и warm результаты: HTML/метаданные/канонические URL/ресурсы/manifest inventory эквивалентны для одинаковых входов, выбранные edits включены, остальные исключены. Проверить stale revision/baseline, категории, rename/withdraw, related, pagination boundary, missing/corrupt cache, source/context changes, crash/retry/lost reply/ACK/GC/old assets. Полный pnpm check и PostgreSQL/Redis/Astro/Caddy rehearsal обязательны. После отдельного разрешения на выпуск — exact CI→Coolify MCP→CODE→live read-only, сверка неизменных реальных content/revisions/publication/catalog. Само обновление кода не публикует рабочие правки.

## Решение между вариантами

Предпочтительно: сначала контролируемое обновление и ускорение проверки, затем native reuse на изолированном прототипе. Принятие fast path — только после доказанной корректности и устойчивого улучшения общего времени на сопоставимых3прогонах. Обещать секунды до этих измерений нельзя: устранение68сrender не устраняет остальные188с.

Если native cache мешают зависимости/asset protocol или он не ускоряет общий путь, сохранить оптимизированный full build и представить отдельный план собственного route/file reuse с manifest по hash. SSR для news — отдельная смена архитектуры: runtime availability, cache invalidation и rollback; сейчас не выбран. Ускорение за счёт пропуска SEO/hash/ACK или изменения активного дерева по месту исключено.

## Границы результата аудита

Исходники, package manifests/lockfile и инфраструктура не изменены. Новые статьи, preview checkpoint или batch/review/publish не создавались. Полный pnpm check сейчас не запускался: код не менялся. Источники: перечисленные файлы текущего checkout, installed Astro source, read-only HTTP/cmsProgress, official docs/registry. Санитизированный локальный proof: `.codex-tmp/news-562-audit.json`. История предыдущего выпуска использовалась только как контекст, текущее состояние проверено заново.


## Решение по native probe при применении

3цикла по500страниц: одинаковый assetsPrefix переиспользует500/500, новый prefix каждый раз0/500. Общего ускорения на простом fixture не получено. Согласно разделу выбора применяется резервный вариант — оптимизированный full build. Отдельный versioned asset-set/HTML reuse остаётся в #571; SSR и экспериментальный flag в production не вводятся.

## Итог применения 7 ноября 2026

- [x] Убрана только повторная аннотация article header; body/cards/SEO и общий preview сохранены.
- [x] Node22.23.4 и Astro7.4.7 согласованы в проекте/CI/Docker; frozen install, peers, audit high и полный локальный gate выполнены.
- [x] Добавлены Astro --timings и advisory subphase workTimings. Review/queue/activation/ACK остаются существующими стадиями; новая сквозная метрика реальной CMS-публикации не заявляется.
- [x] Ограниченный параллелизм8 и объединение HTML-checks применены с конечным readback, integrity/CAS/fsync/receipt/recovery. Две серии по3сравнения на4237HTML сохранены с ограничениями Windows-host/OS cache; полной cold-cache гарантии нет.
- [x] Изолированный native probe500routes/3цикла выполнен; выбран предусмотренный планом optimized full fallback. Новый versioned asset-set, route cacheKey и production reuse НЕ реализованы: это отдельный #571.
- [x] Regression, полный gate, Linux/non-root Node/Caddy crash/retry/ACK/old assets и exact-SHA CI прошли. Coolify test deployment healthy и CODE SUCCEEDED. Live1440/834/390/320: страницы/карточки/preview/admin/CSP/native+fallback SPA проверены.
- [x] Реальные статьи, рабочие правки, категории, CMS/catalog/serving snapshot сверены до/после и сохранены; CMS publish не вызывался.

Не все исходные идеи стали реализацией: page reuse и связанные с ним rename/withdraw/cache invalidation сценарии требуют #571; для текущего full build сохраняются существующие snapshot/route/integrity suites. [Фактический выпуск, измерения и границы](../research/2026-11-07-news-performance-implementation.md). Исходные unchecked пункты выше оставлены как историческое предложение, а не текущий чек-лист задач.
