# ACCOUNT — диагностика #521 и мобильная прокрутка

5 ноября2026. Задача [#527](https://github.com/Celtoman/astro-telekom/issues/527), проблема [#521](https://github.com/Celtoman/astro-telekom/issues/521). Проверяется живой `/lichnyy-kabinet-dom-ru` на390/320; дизайн, Desktop/Tablet, Figma и CMS не меняются. Выпуск страницы описан в [предыдущем протоколе](2026-11-05-account-test-release.md).

## Что удалось установить

Подтверждённый провокатор исходного сбоя — программная запись `scrollLeft=0` между CDP-жестами. После неё браузер получает touchstart/move/end и pointercancel, но иногда не передаёт вертикальное движение странице. Внутренняя причина в Chromium не локализована; называть конкретный browser-engine bug доказанным нельзя.

| Контроль | Случаи | Нулевой вертикальный сдвиг |
| --- | --- | --- |
| Исходный wheel→touch→JS reset→vertical |30|7|
| То же без wheel, с JS reset |30|11|
| Возврат свайпом, без JS reset |30|0|
| Горизонтальный свайп→сразу вертикальный, без паузы/reset |30|0|
| Простой HTML с native overflow, без кода сайта, JS reset |4|1|
| Временный overflow-y:hidden в браузере, JS reset |4|2|

Проверки по30 случаев:2 ширины ×3 свежих контекста ×5 лент, Edge156. Контроли по4 случая:2 ширины ×2 свежих контекста на выбранной ленте. Инструментирование сохранило target/геометрию, visualViewport/scale, focus, touch/pointer/scroll, selection и отсутствие открытого modal. В исходных failures: scrollHeight=clientHeight, preventDefault не наблюдался в capture-логе; это не доказательство отсутствия всех поздних обработчиков. Простой HTML также воспроизвёл сбой, что исключает специфичный код страницы как необходимую причину. Временный CSS не исправил тест; в файлы публичных стилей он не переносился.

[Полная сводка контролей](evidence/2026-11-05-account-mobile-scroll/ablation.json), [исходные failure traces](evidence/2026-11-05-account-mobile-scroll/failure-traces.json). Исторические падения сохранены, новые PASS их не перезаписывают.

## Что исправлено в QA

[`scripts/qa/account-mobile-scroll.mjs`](../../scripts/qa/account-mobile-scroll.mjs) — повторяемый read-only сценарий. Он использует native touch через Input.dispatchTouchEvent; mouse/wheel и keyboard получают отдельные свежие non-touch contexts. Программная запись горизонтальной позиции запрещена протоколом: перехват setter считает записи, любой ненулевой результат делает наблюдение INVALID. Native прокрутка через браузер этот JS setter не вызывает.

Проверяется фактическая полная горизонтальная видимость каждой из18 карточек на пути вперёд и обратно, а не только количество DOM-узлов или видимость последнего peek. В начале, середине, конце и после возврата каждой ленты проверяются вертикальные жесты в обе стороны; в середине — также диагональные. Отдельный быстрый свайп сразу переходит в вертикальный жест без искусственной паузы/reset. Положение пальца проверяется по hit-test, settled-состояние — по последовательным animation frames, а не фиксированной задержке1.5s. События ввода должны быть действительно доставлены; отсутствие события не может дать PASS.

Для точного полного выравнивания карточки на320 минимальный крупный шаг пилота заменён короткой native-коррекцией с измерением touch slop. Это исправление QA, не CSS страницы. Экспериментальный pilot с synthesizeScrollGesture не дал требуемого движения в данной среде и не был принят; итоговый протокол использует отдельно проверенный dispatchTouchEvent. Причина неработающего экспериментального драйвера не устанавливалась.

[`tests/account-mobile-scroll-qa.test.mjs`](../../tests/account-mobile-scroll-qa.test.mjs) проверяет INVALID после reset/недоставленного ввода/неполных данных, FAIL исходного zero-delta, два направления/root-X, отличие полной карточки от peek, корректный hit-point и5px-коррекцию без осцилляции. Зафиксирован RED→GREEN,8/8; профильные ACCOUNT suites вместе с новым QA —18/18. API source не менялся, существующий dist использовался по действующим правилам; новый API build не требовался.

Выполнены `node --check`, профильные18тестов, обе полные браузерные матрицы и `git diff --check`. Это локальная поставка QA-инструмента и результатов; push нового кода/deployment не выполняются. Новый полный pnpm check/CI этой поставке не приписывается; перед возможным push QA-кода действует отдельный полный gate по AGENTS.md.

## Итоговая мобильная матрица

Статус: **PASS**. Оба browser reports имеют completedAt, failures=[], проверены полнота всех контекстов и совпадение SHA256 протокола с итоговым кодом.

| Итоговый контроль | Результат |
| --- | --- |
| Edge156.0.4314.58 / Chrome156.0.8078.80 | Оба390/320, по2 touch-повтора и отдельному wheel/keyboard контексту на ширину |
| Полная видимость каждой карточки вперёд/назад |288 наблюдений:8 touch contexts ×18 карточек ×2 направления, PASS |
| Вертикальные/диагональные жесты в разных позициях |400 наблюдений, PASS |
| Быстрый горизонтальный→вертикальный переход |40 наблюдений, PASS |
| Wheel/trackpad и keyboard на обоих краях |20 прогонов лент, PASS;20 вертикальных wheel-проверок |
| Всего проверок вертикального движения |460, ошибок0; программных горизонтальных reset0 |
| Сохранность serving данных |Digest публичной проекции совпал с CMS29;4226 routes/207 cities/3805 tariffs |

[Машиночитаемый итог](evidence/2026-11-05-account-mobile-scroll/summary.json), [Edge](evidence/2026-11-05-account-mobile-scroll/edge-final/results.json), [Chrome](evidence/2026-11-05-account-mobile-scroll/chrome-final/results.json), [сохранность каталога](evidence/2026-11-05-account-mobile-scroll/catalog-preservation.json). Итоговый SHA256 QA:`c704b303973af0c187c81f0b1d9e7edc9bc0c53ea2fd09e4d608def49ad7e524`.

Среда: Windows, установленные Edge и Chrome через Playwright1.62.1, height900, width390/320. По два полных touch-повтора на ширину/браузер; wheel/keyboard — по одному свежему контексту на ширину/браузер. В результатах сохраняется SHA256 самого QA-скрипта и фактический artifactId страницы.

## Повторение

Нужны Node22+, установленный Playwright и браузеры Edge/Chrome. Новых npm-зависимостей или глобальных настроек не добавлено. Для Codex bundled runtime путь к пакету задаётся через `PLAYWRIGHT_MODULE_PATH`; значения Basic Auth читаются из локального `.env` и не попадают в отчёт.

```powershell
$env:PLAYWRIGHT_MODULE_PATH = '<absolute path to installed playwright package>'
node scripts/qa/account-mobile-scroll.mjs --browsers=msedge,chrome --repeat=2 --widths=390,320 --out=.codex-tmp/account-mobile-scroll
node --test tests/account-mobile-scroll-qa.test.mjs
```

Официальный [CDP Input protocol](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Input.pdl) задаёт координаты в CSS pixels относительно viewport и правила touchEnd. Свойства scroll chaining различаются по осям в [CSS Overscroll specification](https://www.w3.org/TR/css-overscroll-1/); эти документы описывают API/модель, но не доказывают внутреннюю причину текущего сбоя.

## Граница результата

Физические Android/iOS, Safari/WebKit и screen reader не проверялись; в этой сессии нет настроенного доступа к физическому мобильному браузеру, ADB не найден. Эмуляция390/320 не является physical-device или WCAG certification. Реальные заявки/звонки/платежи/CMS-save не выполнялись. Публичный renderer и данные страницы не изменены; новый deployment или CMS snapshot этой задачей не запускается. Фактический статус GitHub issue после проверки фиксируется отдельно.
