# Компактные результаты и очистка поиска: коррекция Figma

Дата: 14 октября 2026 года. Task [#291](https://github.com/Celtoman/astro-telekom/issues/291). Статус: DESIGN_UPDATED — две правки применены в Figma; перенос в код ожидает просмотра и согласования владельца.

Владелец отменил подписи регионов под названиями городов и подложку крестика в поиске. Регион остаётся данными для согласованного ранжирования; видимая строка содержит только город. Поиск по региону, немедленный переход и красноватый Selected сохраняются.

Изменены существующие компоненты без новых вариантов и токенов:

- City Option Row: Default/Hover/Focus/Disabled снова 48 px вместо 64 px, Region скрыт, выбранная поверхность сокращена до высоты строки.
- Search Clear: скрыт связанный Icon/Backdrop и квадрат Duotone внутри собственного экземпляра Icon/Close. Остался крестик в контейнере 16×16 px; область нажатия 44×44 px. Общий Icon/Close и отдельное закрытие модалки не изменялись.
- Уточнены описания наборов Hero и O01, обозначена граница Figma/код.

Проверено наследование в 18 вариантах Hero и 12 вариантах O01: высота всех City Option Row 48 px, видимых Region нет, Search Clear не содержит видимой подложки. Визуально проверены Results на Desktop/Tablet/Mobile: Hero 1360/720/358 px и O01 1440/834/390 px. Сохранилось красное выделение введённой части названия. Макеты остаются примерами состояния; реальные поиск и переходы в этой Figma-коррекции не тестировались.

Скриншоты:

| Размер | Hero | O01 |
| --- | --- | --- |
| Desktop | [Изображение](evidence/2026-10-14-city-search-compact-correction/hero-desktop.png) | [Изображение](evidence/2026-10-14-city-search-compact-correction/modal-desktop.png) |
| Tablet | [Изображение](evidence/2026-10-14-city-search-compact-correction/hero-tablet.png) | [Изображение](evidence/2026-10-14-city-search-compact-correction/modal-tablet.png) |
| Mobile | [Изображение](evidence/2026-10-14-city-search-compact-correction/hero-mobile.png) | [Изображение](evidence/2026-10-14-city-search-compact-correction/modal-mobile.png) |

Источник: [Hero Results Mobile](https://www.figma.com/design/PiSCXYR88uqqcS6tKVfd8T?node-id=1163-482), [O01 Results Mobile](https://www.figma.com/design/PiSCXYR88uqqcS6tKVfd8T?node-id=1125-1702). Код и его SVG-ассеты, CMS, push, деплой и публикация библиотеки не изменялись. README и описания текущей реализации остаются верны для кода коммита fc5494f7. Предыдущая [приёмка](2026-10-14-city-search-unified-acceptance.md) сохраняется как исторический результат до этой коррекции.
