# BLK-0035: выравнивание содержимого с шапкой

3 ноября 2026. По поручению владельца; задача [#458](https://github.com/Celtoman/astro-telekom/issues/458), проблема [#457](https://github.com/Celtoman/astro-telekom/issues/457), PF-160. Figma, локальная реализация и внешний выпуск проверены.

## Причина и исправление

У [оригинала BLK-0035](https://www.figma.com/design/PiSCXYR88uqqcS6tKVfd8T?node-id=2476-42) внешняя ширина уже совпадала с Header, но внутри добавлялся второй горизонтальный inset 48/32/20 px. CSS повторял его; на промежуточных Desktop дополнительно использовался `calc(100% - 80px)` вместо действующего у шапки `calc(100% - 32px)`.

Убраны только боковые поля секции. Вертикальные 48/32/20 px, поля ссылок 12 px, высоты ссылок/поиска 48 px и область очистки 44×44 px сохранены. Desktop использует тот же предел 1360 px и минимальные края 16 px, что `.gh-header`; до 1100 px предел 720 px. Цвета, Geist, тексты, поиск, URL, данные и сама шапка не менялись.

| Окно | Содержимое раньше | Содержимое теперь | Колонки / ячейка |
| --- | --- | --- | --- |
| 1440 | 1264 | 1360 | 4 / 322 |
| 834 | 656 | 720 | 3 / 224 |
| 390 | 318 | 358 | 2 / 171 |
| 320 | 248 | 288 | 1 / 288 |

В Figma обновлены все 20 вариантов четырёх размеров и пяти состояний, 1672 ячейки фиксированной ширины, описание семейства и аннотация обзора. Все ячейки сохранили автоматическую высоту HUG/AUTO для переноса названий. Идентичность компонентов сохранена; новые master, detach и удаление узлов не выполнялись. Все восемь прямых локальных instances наследуют исправление. Неполные ряды сохраняют ширину колонки. Межколоночные интервалы остаются 24 px на Desktop/Tablet и 16 px на Mobile; код уже имел это мобильное переопределение. Публикация библиотеки не выполнялась; отдельная страница CITIES в Screens не создавалась.

[Структурная проверка и IDs](evidence/2026-11-03-cities-directory-alignment/figma.json), [четыре адаптива Figma](evidence/2026-11-03-cities-directory-alignment/figma-adaptives.png), [пустая выдача Mobile](evidence/2026-11-03-cities-directory-alignment/figma-empty-mobile.png). Изображения просмотрены.

## Проверки реализации

- Полный `pnpm check` завершился с кодом 0; единственный Windows symlink skip не относится к CSS. [Точный baseline](../TEST_COVERAGE.md), [журнал проверки и detector](evidence/2026-11-03-cities-directory-alignment/validation.json).
- Изолированный настоящий Astro static output: 207 городов/41 регион с синтетическими тарифами, 1456 HTML. Экспортированный `verifyPublication`, используемый StaticPublicationBuilder, подтвердил 1455 indexable URL без demo fallback. [Проверка нужного output](evidence/2026-11-03-cities-directory-alignment/static-build.json). Обычный workspace CLI проверяет `apps/web/dist`, поэтому его результат для другого output не принимался.
- Chrome: 15 ширин 320/340/360/375/390/620/621/768/834/1000/1100/1101/1280/1440/1920. Границы H1 и каталога совпадают с Header с допуском менее 0,01 px. Проверены ширины полных/неполных рядов, поиск города/региона, очистка, пустая выдача, длинный запрос, фокус и клавиатурный переход в Казань.
- Четыре неактивных preview-размера и два случая без JS. Все 207 ссылок доступны без JS; preview не содержит активных ссылок/поиска. Переполнений и ошибок public JS нет. [Измерения](evidence/2026-11-03-cities-directory-alignment/local/browser.json), [Desktop](evidence/2026-11-03-cities-directory-alignment/local/public-1440.png), [Tablet](evidence/2026-11-03-cities-directory-alignment/local/public-834.png), [Mobile](evidence/2026-11-03-cities-directory-alignment/local/public-390.png), [320](evidence/2026-11-03-cities-directory-alignment/local/public-320.png); все четыре снимка просмотрены.

Применены figma-use / figma-generate-library / figma-design-to-code, astro-dev, impeccable, ux-audit и справочные правила ui-ux-pro-max. Проверены единые направляющие, иерархия заголовок → поиск → регион → город, адаптивная плотность, мобильные цели касания и восстановление после пустой выдачи. Detector выдал только предупреждение о распространённости Geist; оно не применяется, поскольку шрифт задан утверждённой библиотекой. Изменения ширины не дают основания заменять типографику.

## Внешний выпуск и приёмка

Код `b693c6c80f8977ecdeb6f9e802b17523d16f3fcc` опубликован в master. [Exact-SHA CI](https://github.com/Celtoman/astro-telekom/actions/runs/41609750587) завершил полный gate без падений и пропусков; точные количества — в [TEST_COVERAGE](../TEST_COVERAGE.md). Coolify MCP подтвердил deployment `flckzpibrl3bnrwe9z4m2mdd`: finished, точный SHA, приложение running:healthy. [Метаданные](evidence/2026-11-03-cities-directory-alignment/deployment.json).

CODE вернул HTTP 200 / SUCCEEDED и активный artifact `08b4078b8b6908d2f6ae3a4dbc0d2987d3a6037b8d751f45e72eea969aa34d41`. Сохранены publication `cmvs82yuw000101o52i6ams8d`, ревизии 24/24, 207 городов, 3805 тарифов и sealed catalog digest. Public/tariff digests и полный рабочий каталог до/после равны; из сравнения исключено только динамическое `variableSources.resolvedAt`. Новая CMS-публикация не выполнялась. [CODE receipt](evidence/2026-11-03-cities-directory-alignment/code.json), [сверка сохранности](evidence/2026-11-03-cities-directory-alignment/preservation.json).

Внешний Chrome подтвердил совпадение границ Header, H1 и каталога на всех 15 ширинах из локальной проверки, включая промежуточные. Проверены поиск/нормализация/очистка/фокус/empty, клавиатурный переход в Казань, HOME smoke, два no-JS случая и все 207 ссылок. В admin проверены три штатных режима preview и дополнительный контроль 320 px временным размером iframe; sandbox, неактивные поиск/ссылки и общие стили сохранены. Переполнений и ошибок JS нет. SVG побайтово совпадают с принятыми файлами; Basic Auth и noindex сохранены. [Измерения](evidence/2026-11-03-cities-directory-alignment/live/browser.json), [assets и защита](evidence/2026-11-03-cities-directory-alignment/live/assets.json).

Все четыре внешних снимка просмотрены: [Desktop](evidence/2026-11-03-cities-directory-alignment/live/public-1440.png), [Tablet](evidence/2026-11-03-cities-directory-alignment/live/public-834.png), [Mobile](evidence/2026-11-03-cities-directory-alignment/live/public-390.png), [320](evidence/2026-11-03-cities-directory-alignment/live/public-320.png). Первоначальные длинные locator-снимки preview захватили пустую область и не приняты: заменены просмотренными снимками видимого верха настоящего iframe — [Desktop](evidence/2026-11-03-cities-directory-alignment/live/preview-1440.png), [Tablet](evidence/2026-11-03-cities-directory-alignment/live/preview-834.png), [Mobile](evidence/2026-11-03-cities-directory-alignment/live/preview-390.png), [320](evidence/2026-11-03-cities-directory-alignment/live/preview-320.png). [Метод и повторные измерения](evidence/2026-11-03-cities-directory-alignment/live/preview-capture.json). Доказательства и документация фиксируются отдельными docs-коммитами; повторный deployment для них не требуется.

## Границы проверки

Локальный `astro dev` не достиг ready; проблема отдельно зарегистрирована в [#461](https://github.com/Celtoman/astro-telekom/issues/461), исходники ради обхода не менялись. Браузерная приёмка выполнена на реальной static build. После полного gate на C: снова осталось менее 1 ГиБ; [#455](https://github.com/Celtoman/astro-telekom/issues/455) открыт повторно. Массовая очистка пользовательских данных не выполнялась. Эти вопросы не подменяют успешно завершённый gate.

Реальные заявки не отправлялись. Физические устройства, Safari/Firefox и озвучивание скринридером вне этой проверки. README просмотрен: запуск, структура и границы публикации не изменились; профильный статус внесён в current-state. Существовавшие и параллельные изменения владельца в других документах сохранены отдельно от коммитов этой правки.
