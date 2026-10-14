# Movix: удаление надзаголовка и центрирование устройств

Актуальное [дополнение #310](#дисклеймер-и-центрирование-по-чипам--task310) приведено в конце документа. Основная часть ниже сохраняет снимок #308; прежние Desktop-превью заменены свежими экземплярами при следующей правке.

Дата: 14 октября 2026 года. Task [#308](https://github.com/Celtoman/astro-telekom/issues/308). Статус: DESIGN_UPDATED_FOR_REVIEW. После оценки8/10 владелец поручил убрать верхнюю строку и отцентровать устройства на Desktop.

«ВИДЕОСЕРВИС ДОМ.РУ» удалён из всех восьми master B17. Intro использует естественную высоту и уменьшился на30px: удалены строка18px и её промежуток12px. Заголовок и остальной контент сохранены.

Desktop: прежний сдвиг PNG y=-24 снят. Artwork растягивается по высоте Main; PNG имеет вертикальное ограничение CENTER и размещён по формуле `(Artwork.height - Image.height) / 2`. Main.minHeight равен469,1px — высоте изображения750×469,1. Заголовок остаётся сверху: Content.y=0. В Links Main486px, Picture.y=8,45px; в None Main469,1px, Picture.y=0. Разница центров изображения и Main равна0 в обоих вариантах. Полоса логотипов расположена ниже Main; она не входит в область центрирования.

| Device | Высота Links / None |
| --- | --- |
| Desktop1360 | 598 / 581 |
| Tablet720 | 1064 / 1000 |
| Mobile358 | 1218 / 1082 |
| Mobile320288 | 1322 / 1186 |

[Desktop с действиями](https://www.figma.com/design/PiSCXYR88uqqcS6tKVfd8T?node-id=1628-1594), [Desktop без действий](https://www.figma.com/design/PiSCXYR88uqqcS6tKVfd8T?node-id=1628-1713), [обзор](https://www.figma.com/design/PiSCXYR88uqqcS6tKVfd8T?node-id=1592-565). IDs восьми master и свойства Title/Intro сохранены. Desktop-превью обновлены свежими связанными экземплярами; Tablet/Mobile-превью обновились от master.

Проверены все восемь вариантов: надзаголовок отсутствует, заголовок/описание присутствуют, по6 чипов, outside=[]; действия только у Links. Просмотрены финальные [Desktop Links](evidence/2026-10-14-movix-centering/desktop-links.png), [Desktop None](evidence/2026-10-14-movix-centering/desktop-info.png), [Tablet Links](evidence/2026-10-14-movix-centering/tablet-links.png), [Mobile Links](evidence/2026-10-14-movix-centering/mobile-links.png), [Mobile320 None](evidence/2026-10-14-movix-centering/mobile320-info.png). Иллюстрация не пересекается с преимуществами, логотипы и сноска видны. [Геометрия и проверки](evidence/2026-10-14-movix-centering/acceptance.json).

Применены figma-use/figma-generate-library, Impeccable и ux-audit в действующей системе. Это точечное дополнение к [коррекции #307](2026-10-14-movix-reference-chip-correction.md): другие компоненты, палитра, чипы и размеры PNG не менялись. README/current-state остаются актуальными для реализации; код, CMS, публикация библиотеки и Screens в задачу не входят. Документы проверены на локальные ссылки и diff whitespace.

## Дисклеймер и центрирование по чипам — task310

14 октября2026, [task#310](https://github.com/Celtoman/astro-telekom/issues/310). Владелец задал текст «Какие онлайн-кинотеатры доступны, зависит от выбранного тарифа» и попросил вертикальное центрирование относительно чипов. Текст заменён во всех восьми вариантах. Desktop Footer.counterAxisAlignItems изменён с MAX на CENTER: прежнее смещение центра на12px устранено. В обоих вариантах разница центров дисклеймера и ряда чипов равна0.

Caption/Regular12/16 и ширина392px сохранены. Desktop-текст занимает две строки32px внутри ряда40px, по4px сверху и снизу; явный перенос после запятой оставляет вторую часть предложения целиком и убирает одинокое слово «тарифа». Текст при нормализации пробелов точно соответствует поручению владельца. Tablet — одна строка, Mobile/320 — две, под сеткой чипов. Высоты блоков и геометрия устройств из #308 не изменились.

Актуальные [Desktop Links](https://www.figma.com/design/PiSCXYR88uqqcS6tKVfd8T?node-id=1637-1586), [Desktop None](https://www.figma.com/design/PiSCXYR88uqqcS6tKVfd8T?node-id=1637-1705), [обзор](https://www.figma.com/design/PiSCXYR88uqqcS6tKVfd8T?node-id=1592-565). Все восемь master сохранены; обзор обновлён связанными экземплярами. Проверка: точный текст во всех вариантах, outside=[], Desktop CENTER/разница0. Просмотрены [Desktop Links](evidence/2026-10-14-movix-disclaimer/desktop-links.png), [Desktop None](evidence/2026-10-14-movix-disclaimer/desktop-info.png), [Tablet](evidence/2026-10-14-movix-disclaimer/tablet-links.png), [Mobile](evidence/2026-10-14-movix-disclaimer/mobile-links.png), [320](evidence/2026-10-14-movix-disclaimer/mobile320-info.png). [Геометрия](evidence/2026-10-14-movix-disclaimer/acceptance.json). Статус: DESIGN_UPDATED_FOR_REVIEW; код/CMS/Screens и публикация библиотеки не входят в задачу. README/current-state остаются актуальными для реализации.
