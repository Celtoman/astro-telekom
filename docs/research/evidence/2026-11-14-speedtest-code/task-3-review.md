# Task 3 — независимая проверка spec и quality

14 ноября 2026. Проверен task-3-diff.txt и актуальные файлы изолированного checkout. Backend Task 2 повторно полностью не проверялся. Код reviewer не менял; единственная запись — этот отчёт.

**Spec: PASS** для проверенной реализации. **Quality: CLEAN** — открытых подтверждённых замечаний нет после оперативного исправления tablet-ширины. Это не заменяет визуальную и интерактивную приёмку контроллера в Codex IAB.

## Устранённая находка

- **[P2] Ширина tablet не соответствовала принятому Screen.** В исходном diff `apps/web/src/components/speed-test/SpeedTestStyles.astro:77` задавал `width:calc(100% - 48px)`: при viewport 834 получалось 786px с отступом 24px. `geometry-tablet.json:1` задаёт для всех шести секций 720px с отступом 57px; brief также требует iframe шириной 720px. Это меняло ширину всех карточек, переносы текста и композицию. Контроллер независимо подтвердил 786/24 в IAB. В актуальном файле строка 77 уже исправлена на `width:min(720px,calc(100% - 48px))`; вычисляемый результат теперь 720/57. Повторная визуальная проверка исправленной сборки — у контроллера. Открытой находкой это больше не считается.

## Что проверено

- Фиксированный eager iframe `https://openspeedtest.com/speedtest`, содержательная title, ширина 100%, отсутствие собственных таймеров, onload-диагностики, автозапуска, fallback/Provided by, capture/history/results.
- Общие Header/Footer, AddressOnly с `pageScope="GLOBAL"` и canonical slug SPEED_TEST; FAQ через существующий renderer. Принятый порядок 11 размещений, шесть редакционных секций и полный текст из модели. Контакты и график берутся из site/publicDisplay.
- Четыре нативные именованные области прокрутки с tabindex, без JS-карусели; акценты и методы вынесены из лент, diagnosis вертикален, размеры карточек растут с текстом. Геометрия проверялась по исходным JSON и CSS, а не объявлялась доказанной unit-тестами.
- Все строки редакционного контента проходят HTML escaping; fixed asset names/iframe origin не управляются CMS. Чистая схема snapshot проверяет версию, точный состав объектов и обязательные поля без загрузки Nest.
- Optional GLOBAL_PAGE не создаёт URL в старом snapshot; SEO/canonical/sitemap приходят из существующего каталога. Реальная сборка проверяет старые routes и изоляцию эффективного frame-src только на SPEED_TEST, включая сохранение разрешений Metrika. Общие script/connect/admin политики не расширены.
- Preview использует тот же renderer, инертную область виджета и отключённые исходящие действия/форму; FAQ остаётся доступен через native details без JS. CSS/assets подключены существующим trusted loader.
- Все 23 runtime SVG отдельно побайтово сверены SHA-256 с соответствующими `.superpowers/sdd/.../assets/<sourceFile>`; совпадение 23/23. Проверены описательные имена и provenance manifest без временных remote URL.

## Независимо выполненные проверки

Node 24.22.1, PATH из `.codex-tmp/bin` и bundled primary runtime:

1. `node --test tests/speed-test-render.test.mjs tests/official-site-render.test.mjs tests/account-page-editor.test.mjs tests/general-home-preview.test.mjs` — **9 PASS**, 0 fail/skip.
2. `node --test tests/speed-test-build.test.mjs` — **2 PASS**, 0 fail/skip; две реальные изолированные Astro-сборки, optional URL, SEO, CSP и SVG. Выполнено до узкого исправления tablet CSS; сборка после визуальных CSS-коррекций и её readback остаются у контроллера.

Наблюдался существующий MODULE_TYPELESS_PACKAGE_JSON warning при импорте чистых TS-моделей API; тесты завершились успешно. Full gate, внешние операции, браузерные окна, commit/push/deploy reviewer не выполнял.

Реальный start/result/retry iframe, жесты и клавиатурная прокрутка, FLOW2/dialog focus, отсутствие переполнения и окончательное сходство четырёх ширин подтверждаются отдельным IAB-протоколом контроллера. Наличие DOM/CSS и зелёных тестов не объявляется подтверждением этих runtime-свойств.

## Повторная проверка visual fix-round 2

**Spec: PASS; quality: CLEAN.** Проверены только новые изменения `SpeedTestStyles.astro`, подсказки и notes в `speed-test-render.ts`, а также synthetic fixture в `scripts/rehearse-speed-test-web.mjs`. Новых подтверждённых дефектов не обнаружено.

- Примечание units больше не получает `speed-test-small`, поэтому наследует исходные 16/24 на всех четырёх ширинах. Остальные подписи остаются в своей типографике.
- Mobile min-height для task intro 144 и последнего condition 60, narrow intro 144/comparison body 168/support title 50/последнего diagnosis body 240 ограничены нужными поверхностями и breakpoint. Это нижние границы отдельных текстовых фреймов: длинный или увеличенный текст может растягиваться, фиксированной высоты секций и overflow clipping не добавлено.
- Narrow preparation header вернулся к горизонтальному flex: при карточке 232 и padding16 область 200, icon40 + gap8 + title152; body занимает те же 200. Внутренняя геометрия допускает source header75/body192 и высоту карточки311 с gap12.
- Подсказка корректно выводит «6 карточек» для preparation и «4 карточки» для остальных трёх лент, не меняя их клавиатурный или нативный scroll-контракт.
- Fixture остаётся loopback-only, без remote API/production writes. POST `/__fixture` принимает только три известных режима, request log хранится в памяти; JSON body имеет лимит128KiB и обработку ошибки parse. `address-error`/`lead-error` дают synthetic503, `success` восстанавливает штатный синтетический ответ; resetRequests позволяет отделить попытки. Полезная нагрузка не переносится в HTML или исполняемый код.

Полная сборка и ранее проверенные backend/model/route/CSP контракты повторно не запускались. Семь профильных tests после правок сообщены исполнителем; как собственный повторный запуск reviewer они не заявляются. Итоговый IAB readback четырёх ширин, error/retry и реального измерителя выполняет контроллер.

## Финальная узкая повторная проверка

**Spec: PASS; quality: CLEAN.** В последних изменениях новых подтверждённых дефектов нет:

- Tablet diagnosis использует первую колонку220px: при исходной ширине ряда656, padding24×2 и gap32 остаётся body356px; это независимо сверено с `geometry-tablet.json`. Tablet support intro min-height72 также совпадает с исходным текстовым фреймом656×72.
- Narrow units ограничивает min-height192 только первым body первого столбца; заметка, формула и прочие тексты не получают эту нижнюю границу. Фиксированная высота или обрезка не добавлены.
- Fixture создаёт уникальный `renderer-*` через mkdtemp внутри проверенного checkout/.codex-tmp, копирует исходники/config/scripts, подключает зависимости через junction на Windows или dir symlink на других ОС и запускает Astro с cwd приватного apps/web. Проектные `.astro`/`.prerender` больше не разделяются с параллельной обычной сборкой; dist/cache заданы отдельно. Cleanup проверяет вложенность renderer в root, находится в finally и удаляет только временный renderer, не output сборки. Новых production-путей или внешних операций не появилось.

Исполнитель сообщил 7 профильных tests и две реальные Astro-сборки PASS после последних правок. Reviewer повторно сборки не запускал; последний проход был чтением изменений и исходной геометрии. Финальная визуальная/интерактивная приёмка остаётся отдельным доказательством контроллера.

## Проверка сохранения байтов после staging

**CLEAN.** Единственное новое правило `.gitattributes` — `apps/web/public/images/speed-test/v1/*.svg text eol=lf` — ограничено 23 экспортированными SVG и предотвращает их преобразование в CRLF при последующих Windows checkout. `git check-attr` подтверждает text=set/eol=lf. Независимая проверка через бинарный `git show :<path>` подтвердила совпадение SHA-256 original SDD asset = working file = staged blob и отсутствие CRLF для всех 23 файлов; текущие тестируемые SVG не изменены. Сводка `asset-bytes.json` соответствует проверенному результату. У content-документа остался один завершающий перенос строки; удаление дополнительной пустой строки не меняет текст. Сборки и сервисы в этом узком проходе не запускались; новых замечаний нет.
