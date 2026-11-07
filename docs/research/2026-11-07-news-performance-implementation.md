# Ускорение публикации и коррекция статьи, #562/#569

7 ноября 2026. Владелец разрешил реализацию, Node/Astro update, push и test release. Реальные материалы и рабочие правки не публиковать. Статус: TEST RELEASED / VERIFIED.

## Что изменено

- Из renderNewsArticle удалён header summary; первый абзац body, карточки и description/OG/JSON-LD сохраняются. Общий ARTICLE preview использует тот же renderer. Regression воспроизвёл повтор до правки и прошёл после неё с/без обложки.
- Node22.23.4 (официальный Windows node.exe сверён по SHASUMS256), .node-version, engines, все Node Docker stages и CI согласованы. Локальный toolchain из .codex-tmp не заменяет системный Node; в проверках выбирается pinned binary и собственный pnpm shim. Astro web/admin7.4.7, интеграция React6.0.5 сохранена; Vite8.3.6 override согласован без peer conflicts. Frozen install проходит. Audit:0high/0critical,13low/moderate; все affected versions были в исходном lockfile, разбор отдельно #570, без внеплановой замены API зависимостей.
- File work concurrency8: обход каталогов/чтение/hash/copy+file fsync; directory fsync выполняется по глубине, потомки раньше родителей. При ошибке начатые операции полностью завершаются до cleanup. Сортировка inventory и immutable manifest не меняются. ReadArtifact на trust boundaries не мемоизирован, конечный readback/corruption/hidden/symlink/receipt/CAS checks сохранены.
- HTML читается один раз для SEO/loopback/versioned assets, другие текстовые файлы остаются проверенными. Ссылки foreign/missing/escaping artifact отвергаются. Prefix/serving/retention protocol прежний; никаких mutable HTML либо старых assets под новым ID.
- Astro build --timings и bounded advisory workTimings: snapshot/sourceCheck/sourceCopy/media/astro/verify/seal, отдельно sealInventory/sealWrite/sealSync/sealReadback. API валидирует имена/числа, сохраняет между этапами и защищает sequence/attempt CAS. Счётчики страниц сохраняются при timing-only event; телеметрия не меняет исход операции. Validation/queue/activation/ACK по-прежнему отделены стадиями; они не выдаются за compile время.

## Native incremental и выбор режима

scripts/probe-astro-incremental.mjs: реальный installed Astro, изолированный проект,3цикла full/incremental по500static routes. Same-prefix warm переиспользует500страниц; новый assetsPrefix каждый раз рендерит500. Общего ускорения на этой простой fixture не получилось. Время пробных прогонов не является прогнозом VPS. Native cache работает, но нынешняя publication identity делает его непригодным для повторной CMS-публикации без нового asset-set protocol. В соответствии с условием плана выбран ускоренный full build; отдельный проект reuse #571 открыт. Экспериментальный флаг на внешнем сайте не включён.

## Проверки и доказательства

Профильные checks: web/admin Astro check без ошибок; news/SEO/progress/file-work tests прошли; реальный StaticArtifactBuilder прошёл после сохранения page counts в timing events. Existing activation/retention suites прошли (Windows symlink privilege skip отдельно); финальный полный gate и exact Linux CI прошли (результаты ниже).

Сравнительный I/O rehearsal scripts/rehearse-publication-performance.mjs создаёт4237синтетических HTML,4248файлов,351160159байт; baseline8f04bc9f и optimized выполняют одинаковые SEO/asset/inventory/seal/readback, чередование порядка,3прогона, полное совпадение inventory hashes. Внешние API/контент не используются. Обе завершённые серии приведены ниже; предварительный пробный прогон с параллельной нагрузкой не используется для оценки. OS page cache не сбрасывается, каждый seal получает новое release tree; это не глобальная cold-cache гарантия. Локальные Windows milliseconds не являются замером всей внешней публикации; Linux fsync/recovery проверяет runtime rehearsal.

Внешний exact CI/deployment/CODE и read-only сравнение реальных content/revisions/publication/catalog завершены; доказательства ниже. Реальная CMS публикация или её время этим кодовым выпуском не проверяются.

Первый полный gate: admin CSP build превысил120с под параллельной нагрузкой; readiness docs8f04bc9f нарушили existing literal guard. Новый #573 launcher исправляет игнорирование --test-concurrency после файлов:3процесса ранее стартовали одновременно при1, теперь exclusive-lock regression проходит. #574 восстанавливает owner-only/P3 формулировки; tests не ослаблены. Прежняя пометка ограниченного concurrency в #564 уточнена отдельной поправкой; #567 остаётся открытым. Первый красный gate не принят; финальный повтор ожидается.

Второй полный gate с фактическим concurrency2:1078pass/1fail/1Windows symlink skip,534350ms. Единственный fail — Linux Node/Caddy image из Windows git archive: core.autocrlf превратил LF blob shell helper409bytes в CRLF export429bytes. В первом gate этот Docker failure тоже присутствовал (итого1075pass/2fail/1cancel/1skip). #575 закрепляет *.sh text eol=lf; финальный export создаётся с autocrlf=false/eol=lf и сверяется с Git bytes. Код/проверки публикации не ослаблялись, оба красных прогона не засчитаны; повтор полного gate ожидается.


## Локальная приёмка завершена

Финальный полный `pnpm check --test-concurrency=2` с действующим launcher: 1079pass/0fail/0cancel/1skip, total1080, exit0. Immutable export treede569d2c32f94efdd127fabf6148ffcfc671f87b; все30non-Markdown staged files побайтно совпадают с ним, shell LF проверен до запуска. Единственный Windows symlink privilege skip компенсируется Linux/non-root runtime rehearsal. Внутри реального Node/Caddy контейнера подтверждён Node22.23.4. Тайм-ауты, assertions и состав обязательных suites не ослаблены.

Local real browser:1440/834/390/320, article header summary0, первый абзац сохранён,24px после header, без overflow. Mixed DRAFT+CHANGED использует synthetic HTTP fixture: один publish, намеренно потерянный ответ, reload/recovery/SUCCEEDED, error link и focus restore;4modal widths. ReactAria sheet активен, touchAction manipulation, scopedStyles0; unauthorized inline script/style заблокированы. Это не публикация реальных статей. Собственные browser/context и local servers закрыты.

Числа I/O: исходные65516,66580,63775ms, новые26095,26642,22416ms; медиана65.516→26.095с, примерно2.51x для verify+seal+readback. Совпадают4237HTML/4248files/351160159bytes и все file hashes. Это локальный синтетический этап, не длительность реальной CMS-публикации. Первичный пробный прогон с параллельной нагрузкой исключён; небольшая нагрузка упаковки исходников могла влиять на последний optimized sample, поэтому результаты не объявляются универсальным SLA. Final timings hooks являются advisory, не меняют bytes/checks. [Данные](evidence/2026-11-07-news-performance/file-benchmark.json), [native probe](evidence/2026-11-07-news-performance/native-probe.json).

Native feature в production не включён по условию fallback плана; #571 остаётся открытым. #570 и #567 также не закрываются этим выпуском. CODE/live проверка завершена; реальные рабочие данные не публиковались.

## Exact test release и live-проверки

Код: bbed4107058f22c5426c3fe55bec8790b58b3740. Выпущенный SHA: bc2ac7f139fc13a3b4554d13dcf57dcb6955adf6 — последующая однострочная docs-only коррекция сохраняет уточнение владельца «вне milestone Release 1»; runtime-файлы идентичны проверенному экспорту. Подтверждён [exact CI42379641266](https://github.com/Celtoman/astro-telekom/actions/runs/42379641266):1080pass/0fail/0skip,417773ms. Superseded CI bbed отменён после docs-only коррекции, это не падение продуктовых тестов.

Coolify MCP: app jlrsktdos9yhchkgnrd9f5fj, deployment wdo1tcsuchtw5rym6uh7ts7b, exact bc2ac7f, finished07.11.2026 14:19:48UTC, running:healthy. Deployment занял322с; это выпуск кода, не длительность CMS-публикации. Для точности source временно закреплялся на SHA, после завершения восстановлен в HEAD. Последующие docs-only commits не требуют повторного runtime deployment.

CODE: HTTP200/SUCCEEDED, checkedAt2026-11-07T14:23:08.103Z. Artifact d51a14414358d6490ea71cde0cff5d79b0c0385d23f905a2184c634121012bf0; renderer d2459a721f5f5d9917396762a0f6026e68c30a13cd04c458b2862372745bae55; manifest278f9f262cd8ad334ea7c26d9b7e3fcec955b6ba7151555fd0f939fe3e600e4d. Во время202UNCERTAIN повторялся тот же CODE identity, без новой CMS-публикации/дубликата deployment.

- Public:32проверки list/category/6статей на1440/834/390/320. Один h1, headerSummary0, первый body paragraph сохранён, cover загружается, отступ после header24px, горизонтального overflow нет. Карточки сохраняют анонсы и normal/hover/active/focus, вложенных ссылок нет. Manifest реально загружен с use-credentials; без Basic Auth оба домена401. App CSP violations отсутствуют.
- ARTICLE preview:те же4ширины, body/cover/отступы сохранены. Один checkpoint PATCH перехвачен браузером и локально отвечен точным GET workspace; реальный сервер получил только read-only POST preview. Реальных save/publish запросов не было.
- Admin:16экранов news/categories/news-settings/404 на4ширинах. ReactAria sheet активен, scopedStyles0, overflow нет. Native и принудительный fallback SPA, Back и сохранение того же React-root проверены в destination и после Back.64CSP-события относятся исключительно к стороннему Kaspersky connect-src; app-origin нарушений0, политика ради него не ослаблялась. Локальные negative script/style probes блокируются. Safari, физический touch и screen reader отдельно не проверялись.
- До/после совпадают полные данные всех6статей, их ревизии5/3/3/2/2/2 и published snapshots, категории,29CMS-ревизий, serving publication cmw6do7a0000601qr3n1fmos7(sequence26), catalogDigest c7628fa28dddd06c9ad695ab39ce79bfac74b40cfb47d10da7b8d2c0d04e4333 и семантический digest каталога. Статьи уже были опубликованы владельцем до выпуска; этот CODE использовал обслуживаемый snapshot. Реальные статьи и рабочие изменения не сохранялись и не публиковались.

Sanitized локальные доказательства: .codex-tmp/news-562/{ci-proof,deployment,code-verification,source-pin,preservation,live-public-result,live-public-cards-result,live-preview-result,live-admin-result,live-admin-screens-result}.json. Все собственные browser/context/локальные серверы закрыты. QA-ожидания hydration/видимости sidebar и отключение ViewTransition до загрузки модуля скорректированы в игнорируемом probe; runtime assertions не ослаблены.

## Повторный замер на окончательном коде и ограничения

Сохранена также полная [повторная серия](evidence/2026-11-07-news-performance/file-benchmark-final.json): исходные59211,96778,216892ms; новые24547,25400,36233ms. На обоих путях4237HTML/4248files/351160159bytes и одинаковые inventory hashes. OS cache и нагрузка Windows-host не контролировались, разброс исходного пути велик. Поэтому результат первой серии65.516→26.095с используется только как локальная характеристика файловой фазы, а повтор не превращается в обещание3.8x для сайта. Общая публикация реальных материалов на VPS не измерялась по запрету владельца. Полная статическая генерация сохраняется; эффект переиспользования HTML и новый asset protocol требуют отдельного #571. #570/#567 также остаются открытыми. Техническая приёмка test-контура не является решением о готовности к реальному трафику.
