# Task 3 — публичный renderer SPEED_TEST и preview

Статус: код реализован, профильные проверки зелёные. Визуальную и интерактивную приёмку в Codex IAB выполняет контроллер. Commit/push/deploy, внешние CMS-изменения и редактор страницы не выполнялись.

## Изменения

- `apps/web/src/lib/speed-test-render.ts`: общий чистый TS renderer Hero, шести редакционных секций и FAQ; весь редакционный текст приходит из Page.content. Поддержка использует site.supportPhone и site.publicDisplay.supportHours. Строки экранируются. Отображение Wi‑Fi и Мбит/⁠с/МБ/⁠с нормализуется без записи в CMS.
- `apps/web/src/components/speed-test/{SpeedTestPage,SpeedTestStyles}.astro`: shared AddressOnly/HomeFaq/HomeBlockStyles, общий layout Header/Footer. Сохранены 6 принятых секций, экспортированные иконки, цвета/радиусы/шрифт/размеры и порядок страницы. Четыре мобильные native scroll-ленты с gap16 и peek16, именованными регионами/tabindex; на D/T — сетки. Карточки растут под длинный текст; сравнение, единицы измерения и примечания вне лент. Support400px D и растягивается до высоты соседа. Diagnosis остаётся вертикальным.
- Hero: один eager iframe `https://openspeedtest.com/speedtest`, width100%, ratio2:1/min-height440px, без Run/таймеров/onload-диагностики/fallback/ссылок/внешних подписей. При1360px высота680px. H1 уточнён живой сверкой контроллера: D48/50/800/-2.4,T40/43/700/-1.6,M28/33/700/-1.5.
- `apps/web/src/data/speed-test-page.ts`, `apps/web/src/data/site.ts`, `apps/web/src/pages/[city]/index.astro`: строгая pure schema-валидация snapshot, optional GLOBAL_PAGE SPEED_TEST, canonical/meta через seoByPath. Только ветка SPEED_TEST вызывает Astro.csp.insertDirective для frame-src .com; script/connect/worker policy не расширены, глобальный browser-security-policy не изменён.
- `apps/admin/src/lib/preview-document.mjs`, `scripts/preview-public-styles.mjs`: общая preview-ветка с тем же renderer, отключёнными ссылками/формой и пустой размерной областью виджета. В preview нет исполняемого third-party iframe/script/src; все ответы доступны через native details. Общие стили/AddressOnly/FAQ переиспользуются.
- `apps/web/public/images/speed-test/v1/*.svg`:23 точных экспортированных исходника с описательными именами; SHA-256/происхождение в `docs/research/evidence/2026-11-14-speedtest-copy-update/runtime-asset-manifest.json`, без временных URL.
- `scripts/rehearse-speed-test-web.mjs`, `tests/helpers/speed-test-source.cjs`: воспроизводимый локальный exact fixture catalog поверх существующего полного test source с ACCOUNT/OFFICIAL_SITE/городами. Изолированная Astro-сборка, post-build SEO gate, localhost static server и синтетические FLOW2 ответы без production API.
- `tests/speed-test-render.test.mjs`, `tests/speed-test-build.test.mjs`, две соответствующие строки `docs/TEST_COVERAGE.md`.

## Проверки

Все команды из checkout с PATH `.codex-tmp/bin;C:/Users/Александр/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin;...`, Node24.22.1.

1. До реализации `node --test tests/speed-test-render.test.mjs` — ожидаемый RED: renderer отсутствует (ERR_MODULE_NOT_FOUND).
2. `pnpm.cmd --filter @provider/web lint` — PASS,61files,0errors/0warnings/0hints.
3. `node --test tests/speed-test-build.test.mjs tests/speed-test-render.test.mjs` — PASS,6tests,0fail/0skip. Две реальные Astro-сборки before/after; отсутствие опционального URL в старом каталоге, наличие нового URL/SEO/canonical/sitemap,11блоков,изолированный итоговый frame-src с сохранением Metrika,старые routes,23SVGsha; весь текст,escape,preview inert,4региона,динамические контакты,schema.
4. `node --test tests/speed-test-render.test.mjs tests/official-site-render.test.mjs tests/official-site-owner-fixes.test.mjs tests/account-page-editor.test.mjs tests/general-home-preview.test.mjs` — PASS,15tests,0fail/0skip.
5. `node scripts/rehearse-speed-test-web.mjs --serve` и последующая пересборка H1 fixture — PASS; post-build SEO gate пройден.
6. Impeccable mechanical detector по новым SpeedTestPage/SpeedTestStyles/speed-test-render — `[]`, находок нет. Применены astro-dev, figma-design-to-code, impeccable, ux-audit, web-accessibility. Повторное design interview заменено принятым brief/Figma по прямому поручению контроллера; дизайн не переизобретался.
7. `git diff --check` — PASS; только уже существующие CRLF warnings generated API-файлов из предыдущей задачи.

Node при импорте существующих TS-моделей API выдаёт штатный MODULE_TYPELESS_PACKAGE_JSON warning; он не является Astro-диагностикой и не исправлялся изменением module type.

Первичная IAB-сверка контроллера при actual clientWidth1440: prep1078/tasks761/diagnosis577/FAQ534 точно совпали с Figma,23иконки загружены. Metrics/factors были на16px ниже эталона из-за объединения двух Figma-рядов в одну grid с row-gap16; исправлено на measured row-gap32 при column-gap16. Desktop support body «Описание проблемы» сохраняет measured text-frame min-height48 (Figma832×48), чтобы однострочный browser wrap не сокращал исходный ритм секции на24px; весь блок искусственно не растягивается. Контроллер подтвердил actual832px и body heights24/72/24 при font16/line24; различие последнего body с Figma48 проверено отдельно. После последних CSS-уточнений QA fixture успешно пересобран, SEO gate пройден; итоговый визуальный readback — у контроллера.

## Локальная QA

- Runtime: `http://localhost:4932/proverit-skorost-interneta`
- Preview: `http://localhost:4932/__preview-speed-test`
- Static dist: `.codex-tmp/speed-test-web/dist`
- Действующий exec session server55116; контроллер может оставить его до конца IAB QA.
- Локальный сервер применяет штатный ALLOW_DEMO_DATA=true исключительно ради разрешённого loopback API; каталог загружается из exact snapshot (fallback не вызывается). Из-за production URL guard локальная canonical — `http://localhost:4321`, тогда как production fixture тестов собрана с `https://partner.example.test`.
- Селекторы `data-speed-test-block="hero|preparation|metrics|tasks|factors|diagnosis|support|faq"`, `data-speed-test-scroll="preparation|metrics|tasks|factors"`; карточки — article внутри области прокрутки.

## Граница доказательств

### Визуальный fix-round 1

Контроллер и reviewer подтвердили совпадение всех шести Desktop-высот. При actual clientWidth834 планшетный контейнер был786px/x24 вместо принятого720px/x57; tablet width исправлен на `min(720px,calc(100% - 48px))`. Mobile390: ширина358px, preparation1208/factors577/support1047 совпадают; уточнение геометрии metrics/tasks/diagnosis выполняется контроллером и не скрывается текущей правкой.

### Визуальный fix-round 2 и synthetic FLOW2

- Примечание metrics.units.note исправлено с14/20 на исходные16/24 на всех четырёх ширинах.
- По живому DOM/Figma контроллера сохранены точные минимальные высоты отдельных текстовых рамок, которые браузер укладывает в меньшее число строк: Mobile task intro144 и последний diagnosis condition60;320 preparation intro144/comparison body168, support card title50, последний diagnosis body240, первый units body192; Tablet support intro72. Все рамки могут расти с длинным CMS-текстом.
- Повторная live-Figma сверка узкой preparation карточки показала горизонтальную шапку200×75 с иконкой40×40, title152×75 и body200×192. Ошибочное вертикальное направление CSS удалено; исходный полный текст сохранён. Tablet diagnosis использует исходную левую колонку220px (body356px).
- Подсказка подготовки исправлена на «6 карточек · Листайте →»; другие ленты — «4 карточки».
- Свежая IAB-сверка контроллера после основной коррекции: все шесть высот Desktop и Mobile390 точно совпадают с принятыми Screens;320 все кроме последнего отдельно исправленного metrics совпадают. В Tablet factors естественная браузерная шапка50px вместо Figma48px увеличивает секцию на2px: текст не сжимался и не обрезался ради выравнивания; это сохранённое отклонение в пользу читаемости. Итоговый readback последних трёх CSS-уточнений остаётся у контроллера.
- Локальная fixture дополнена `POST /__fixture` с режимами `success`, `address-error`, `lead-error` и необязательным `resetRequests:true`; `GET /__fixture` возвращает mode и синтетические запросы `{path,body,mode}`. Error-режим отвечает503 для соответствующего адресного/lead запроса до переключения обратно в success. Production-код и внешние API не затрагиваются. HTTP-тест подтверждает адресный retry, lead retry и сохранение исходного payload/submissionKey в журнале.
- Последний focused прогон: `node --test tests/speed-test-build.test.mjs tests/speed-test-render.test.mjs` —7PASS,0fail/0skip, включая две реальные Astro-сборки и synthetic FLOW2 server.
- Обнаружена и устранена изоляция test helper: одновременные прямые Astro-build при разных out/cacheDir всё равно используют общий project-root `.astro/.prerender`. QA build один раз упал missing chunk во время параллельного теста, затем прошёл последовательно. Теперь fixture build создаёт приватную копию renderer и junction только установленных зависимостей, по действующему образцу StaticArtifactBuilder; generated копия удаляется лишь после проверки абсолютной границы `.codex-tmp`. Production Astro config неизменен.

Четыре browser viewport, реальный iframe start/result/retry, горизонтальная клавиатурная прокрутка, контраст/фокус, FLOW2 и итоговые визуальные снимки переданы контроллеру: этот агент не запускал внешний браузер или Playwright. Полный pnpm check, admin build с последующим редактором, итоговый review и документацию README/current-state/site-structure выполняет контроллер. Новых несогласованных продуктовых идей или посторонних проблем не обнаружено.
