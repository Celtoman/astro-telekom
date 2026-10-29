# Стабильность публичных страниц — 29 октября 2026

Разрешённая задача [#414](https://github.com/Celtoman/astro-telekom/issues/414), sub-issues #410–#413 и #415. CMS/тексты/Figma/library сохраняются. [План](../plans/2026-10-29-public-shell-stability.md).

## Причины и решение

- В Screens HOME192:653/924/1188 и CITY11:1937/3143/4322 верхнее поле24px. Код применял его только к CITY. Теперь это общая внешняя геометрия BaseLayout. Однопиксельное различие исходных header129/121/109 против128/120/108 разрешено прямым поручением владельца об одинаковой шапке: используется общая128/120/108.
- Деферированный модуль подменял уже показанный телефон; city-context поздно восстанавливал выбранный город. Теперь CSP-hashed head bootstrap читает только известные storage keys, parser-time header/footer initializer применяет состояние до видимости. Нет JS/storage — серверный fallback остаётся видимым. Позднее событие subscriber использует тот же идемпотентный setter; срок30дней и его событие сохранены.
- Geist swap загружал латиницу и кириллицу отдельно, меняя размеры уже видимой страницы. Основные subsets предзагружаются, все faces используют optional. При медленном шрифте браузер сохраняет стабильный fallback на текущем документе; следующий документ с готовым шрифтом использует Geist. Проверка не обещает одинаковый шрифт при любой скорости сети, она исключает позднюю замену и перестройку страницы.
- Общий H1 получает overflow-wrap:anywhere. Текст не изменён, юридические документы не перередактированы.
- Negative table margin10/6px создавал внутренний scrollY. Отступ вынесен на внешний scroller, table margin0. Все строки, row gaps, сортировка и горизонтальная прокрутка сохранены.
- В экспортированных Movix SVG backdrop начинался в отрицательных координатах, glyph был сдвинут вправо. Восстановлены существующие полноценные64/48SVG из3dadca30, компенсация img80/60 удалена. Это осознанное исправление ошибочной геометрии источника по поручению владельца; Figma не менялась.

[Происхождение и размеры](evidence/2026-10-29-public-shell-stability/source-proof.json). [Снимок до изменений](evidence/2026-10-29-public-shell-stability/before.json).

## Дополнительная проверка progressive HTML

Первый внешний прогон выявил ещё один CLS на HOME Desktop:0.00116–0.00194. MutationObserver подтвердил, что parser успевал показать пустой `.home-address-reassurance` до получения его дочернего picture и текста; высота менялась с0 до24px, поднимая форму на24px. Резервируется минимальная высота уже существующей иконки:24px/20px. Многострочный текст остаётся свободным, тексты не меняются. Первую внешнюю версию e08a883 не считаем завершённой приёмкой. Принудительная350ms пауза сразу после открывающего тега пояснения на локальном новом artifact дала CLS0 на1440/834/390/320; независимый review доправки не нашёл Critical/Important. [До](evidence/2026-10-29-public-shell-stability/progressive-html-before.json), [после](evidence/2026-10-29-public-shell-stability/progressive-html-after.json).

## Холодная проверка конфигуратора тарифа

На e46a9bce cold320 выявил scrollWidth363 при CLS0: только два fieldset/select выступали за viewport. Browser min-width:min-content задавал332px при доступных258px; имеющийся select max-width100% ограничивался этим слишком широким родителем. В тёплом прогоне переполнение не проявлялось. [#415](https://github.com/Celtoman/astro-telekom/issues/415) добавлен в #414. Правка — min-width0 у существующих fieldset; тексты, варианты и вычисления сохраняются. Независимый review не нашёл Critical/Important. [Диагностика](evidence/2026-10-29-public-shell-stability/tariff-cold-before.json). Новая локальная immutable-сборка прошла cold1440/834/390/320 и смену опций: CLS0, fieldset320=258px, min-width0. Для локального origin защищённый публичный quote API проксировался тестовым harness; CMS и заявки не изменялись. [Проверка](evidence/2026-10-29-public-shell-stability/tariff-cold-local.json).

## Локальная проверка

Настоящий StaticArtifactBuilder собрал124 маршрута на сокращённой копии текущего опубликованного каталога: шесть городов, все22 тарифа Казани, реальные заголовки/юридические тексты. Это тестовый fixture, не новая CMS-публикация. API URL и SEO inventory проходят обычные build-policy guards. Полный публичный каталог не редактируется.

Chromium,1440/834/390/320: HOME/CITY с действующим subscriber mode. Видимые кадры сразу содержат нужный номер и город, header y24, CLS0 при искусственной задержке fonts800ms; до исправления на HOME Tablet измерено0.1544. Table clientHeight=scrollHeight; наTablet/Mobile сохраняется scrollX. Footer width/height и внутренний каркас HOME/CITY одинаковы. Проверены сортировка, три юридических документа на четырёх размерах, warm navigation, просроченное/недоступное storage, no-JS fallback и явная активация subscriber event.

Дополнительно cold paint наD/320: тариф, города, покрытие, три документа,404; промежуточный1000. В этих контролируемых сценариях CLS0, исключений JavaScript нет. Это не универсальная гарантия для всех браузеров и будущего контента. [Основная проверка](evidence/2026-10-29-public-shell-stability/local-browser.json), [общие маршруты](evidence/2026-10-29-public-shell-stability/local-shared-cold.json), [до изменений](evidence/2026-10-29-public-shell-stability/before-browser.json), [Desktop](evidence/2026-10-29-public-shell-stability/local-city-1440.png), [320](evidence/2026-10-29-public-shell-stability/local-city-320.png).

Независимый read-only review не нашёл Critical/Important. Astro check без ошибок/предупреждений; профильные тесты прошли. Механический detector отметил только сохранённые Geist/существующие shadow conventions; новая визуальная система не вводилась. Полный `pnpm check` прошёл, актуальный baseline — только в [TEST_COVERAGE](../TEST_COVERAGE.md). Внешний выпуск пока не завершён.
