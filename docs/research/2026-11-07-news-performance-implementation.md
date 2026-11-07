# Ускорение публикации и коррекция статьи, #562/#569

7 ноября 2026. Владелец разрешил реализацию, Node/Astro update, push и test release. Реальные материалы и рабочие правки не публиковать. Статус: LOCAL CHECKED / TEST RELEASE PENDING.

## Что изменено

- Из renderNewsArticle удалён header summary; первый абзац body, карточки и description/OG/JSON-LD сохраняются. Общий ARTICLE preview использует тот же renderer. Regression воспроизвёл повтор до правки и прошёл после неё с/без обложки.
- Node22.23.4 (официальный Windows node.exe сверён по SHASUMS256), .node-version, engines, все Node Docker stages и CI согласованы. Локальный toolchain из .codex-tmp не заменяет системный Node; в проверках выбирается pinned binary и собственный pnpm shim. Astro web/admin7.4.7, интеграция React6.0.5 сохранена; Vite8.3.6 override согласован без peer conflicts. Frozen install проходит. Audit:0high/0critical,13low/moderate; все affected versions были в исходном lockfile, разбор отдельно #570, без внеплановой замены API зависимостей.
- File work concurrency8: обход каталогов/чтение/hash/copy+file fsync; directory fsync выполняется по глубине, потомки раньше родителей. При ошибке начатые операции полностью завершаются до cleanup. Сортировка inventory и immutable manifest не меняются. ReadArtifact на trust boundaries не мемоизирован, конечный readback/corruption/hidden/symlink/receipt/CAS checks сохранены.
- HTML читается один раз для SEO/loopback/versioned assets, другие текстовые файлы остаются проверенными. Ссылки foreign/missing/escaping artifact отвергаются. Prefix/serving/retention protocol прежний; никаких mutable HTML либо старых assets под новым ID.
- Astro build --timings и bounded advisory workTimings: snapshot/sourceCheck/sourceCopy/media/astro/verify/seal, отдельно sealInventory/sealWrite/sealSync/sealReadback. API валидирует имена/числа, сохраняет между этапами и защищает sequence/attempt CAS. Счётчики страниц сохраняются при timing-only event; телеметрия не меняет исход операции. Validation/queue/activation/ACK по-прежнему отделены стадиями; они не выдаются за compile время.

## Native incremental и выбор режима

scripts/probe-astro-incremental.mjs: реальный installed Astro, изолированный проект,3цикла full/incremental по500static routes. Same-prefix warm переиспользует500страниц; новый assetsPrefix каждый раз рендерит500. Общего ускорения на этой простой fixture не получилось. Время пробных прогонов не является прогнозом VPS. Native cache работает, но нынешняя publication identity делает его непригодным для повторной CMS-публикации без нового asset-set protocol. В соответствии с условием плана выбран ускоренный full build; отдельный проект reuse #571 открыт. Экспериментальный флаг на внешнем сайте не включён.

## Проверки и доказательства

Профильные checks: web/admin Astro check без ошибок; news/SEO/progress/file-work tests прошли; реальный StaticArtifactBuilder прошёл после сохранения page counts в timing events. Existing activation/retention suites прошли (Windows symlink privilege skip отдельно); полный gate ещё ожидается.

Сравнительный I/O rehearsal scripts/rehearse-publication-performance.mjs создаёт4237синтетических HTML,4248файлов,351160159байт; baseline8f04bc9f и optimized выполняют одинаковые SEO/asset/inventory/seal/readback, чередование порядка,3прогона, полное совпадение inventory hashes. Внешние API/контент не используются. Итоговые цифры будут добавлены после завершения; предварительные прогоны с параллельной нагрузкой не принимаются за финальный matched результат. OS page cache не сбрасывается, каждый seal получает новое release tree; это не глобальная cold-cache гарантия. Локальные Windows milliseconds не являются замером всей внешней публикации; Linux fsync/recovery проверяет runtime rehearsal.

Внешний exact CI/deployment/CODE и read-only сравнение реальных content/revisions/publication/catalog будут добавлены после выполнения. Реальная CMS публикация или её время этим кодовым выпуском не проверяются.

Первый полный gate: admin CSP build превысил120с под параллельной нагрузкой; readiness docs8f04bc9f нарушили existing literal guard. Новый #573 launcher исправляет игнорирование --test-concurrency после файлов:3процесса ранее стартовали одновременно при1, теперь exclusive-lock regression проходит. #574 восстанавливает owner-only/P3 формулировки; tests не ослаблены. Прежняя пометка ограниченного concurrency в #564 уточнена отдельной поправкой; #567 остаётся открытым. Первый красный gate не принят; финальный повтор ожидается.

Второй полный gate с фактическим concurrency2:1078pass/1fail/1Windows symlink skip,534350ms. Единственный fail — Linux Node/Caddy image из Windows git archive: core.autocrlf превратил LF blob shell helper409bytes в CRLF export429bytes. В первом gate этот Docker failure тоже присутствовал (итого1075pass/2fail/1cancel/1skip). #575 закрепляет *.sh text eol=lf; финальный export создаётся с autocrlf=false/eol=lf и сверяется с Git bytes. Код/проверки публикации не ослаблялись, оба красных прогона не засчитаны; повтор полного gate ожидается.


## Локальная приёмка завершена

Финальный полный `pnpm check --test-concurrency=2` с действующим launcher: 1079pass/0fail/0cancel/1skip, total1080, exit0. Immutable export treede569d2c32f94efdd127fabf6148ffcfc671f87b; все30non-Markdown staged files побайтно совпадают с ним, shell LF проверен до запуска. Единственный Windows symlink privilege skip компенсируется Linux/non-root runtime rehearsal. Внутри реального Node/Caddy контейнера подтверждён Node22.23.4. Тайм-ауты, assertions и состав обязательных suites не ослаблены.

Local real browser:1440/834/390/320, article header summary0, первый абзац сохранён,24px после header, без overflow. Mixed DRAFT+CHANGED использует synthetic HTTP fixture: один publish, намеренно потерянный ответ, reload/recovery/SUCCEEDED, error link и focus restore;4modal widths. ReactAria sheet активен, touchAction manipulation, scopedStyles0; unauthorized inline script/style заблокированы. Это не публикация реальных статей. Собственные browser/context и local servers закрыты.

Числа I/O: исходные65516,66580,63775ms, новые26095,26642,22416ms; медиана65.516→26.095с, примерно2.51x для verify+seal+readback. Совпадают4237HTML/4248files/351160159bytes и все file hashes. Это локальный синтетический этап, не длительность реальной CMS-публикации. Первичный пробный прогон с параллельной нагрузкой исключён; небольшая нагрузка упаковки исходников могла влиять на последний optimized sample, поэтому результаты не объявляются универсальным SLA. Final timings hooks являются advisory, не меняют bytes/checks. [Данные](evidence/2026-11-07-news-performance/file-benchmark.json), [native probe](evidence/2026-11-07-news-performance/native-probe.json).

Native feature в production не включён по условию fallback плана; #571 остаётся открытым. #570 и #567 также не закрываются этим выпуском. CODE/live проверка ещё ожидается; реальные рабочие данные не публиковались.
