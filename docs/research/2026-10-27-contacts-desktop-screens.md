# Контакты: принятие, публикация и обновление Desktop CITY

27 октября 2026. [Задача #400](https://github.com/Celtoman/astro-telekom/issues/400). Основание владельца: «Этот вариант принимаю. Обнови Desktop блока контактов на городской странице Screens. Tablet и Mobile не трогай, вариант с офисом сохрани. Библиотеку публикуй».

Принят компактный Desktop без офиса из [#399](2026-10-27-contacts-desktop-compact.md). Семейство опубликовано; обновлён только выбранный Desktop-экземпляр в CITY Screens. Это приёмка данной коррекции контактов, не новая приёмка всей страницы, других контекстов или сайта.

## Публикация и применение

- Источник: set1998:6, family key465500ccc753f7b0447e0dc00d98da1144a3a26f; статус после публикации **CURRENT**. Описание актуализировано: принятие владельцем, компактный Desktop без офиса, сохранённые офис и Tablet/Mobile.
- В Publish library выбран только BLK-0015 / Контакты — v2:1 из7 изменений. Остальные шесть изменений не включались. [Выбор публикации](evidence/2026-10-27-contacts-desktop-screens/publish-selection.png).
- В Screens использована команда **Update selected instance** для11:3055. ID сохранён, remote-связь и key Desktop9a5fb4b4075d38faa19cb94f23259049aae38aec сохранены. Локальное определение mainComponent обновилось672:77408→900:10798; это новая опубликованная версия того же ключа. Другие экземпляры специально не обновлялись.
- [Desktop-контакты CITY](https://www.figma.com/design/BdxNHlBVZWejREtOEIWDkI?node-id=11-3055):1360×419 вместо1360×475. Городские свойства, Show office=false, номера, расписания и действия сохранены.
- Desktop-страница1440×7080 вместо1440×7136. Футер поднялся6550→6494, промежуток24px и состав12 блоков сохранены. Контакты остаются после FAQ, перед футером.

## Проверки

Полные профили городских Tablet11:3143 и Mobile11:4322 совпали до/после: дерево, геометрия, тексты, стили, реакции и переменные. Их контакты по-прежнему720×451 и358×727. Все остальные Desktop-поддеревья совпали; при сравнении футера нормализован только ожидаемый сдвиг его корневого y на−56px.

Профили трёх исходных мастеров совпали с состоянием перед публикацией. PNG версии с офисом1360×475 до/после побайтово идентичны. Геометрия и дизайн с офисом сохранены.

Визуально проверены нативный экспорт обновлённых контактов и результат в композиции редактора: оба расписания рядом, характеристики поддержки в строке, две карточки равной высоты, переполнений0. CTA592×48, телефонные цели592×44. Все componentProperties совпали с исходными городскими значениями; tel и URL FLOW2 сохранены. После подготовки скриншота финальный полный профиль повторно совпал с проверенным результатом.

Применены figma-use, figma-generate-library, figma-generate-design и проверки ux-audit: опубликованный источник → связанный экземпляр → Desktop-композиция, сохранность других размеров и ясность действий. Новый прогон Present/клавиатуры/скринридера и внешних URL не выполнялся. Код, CMS, сайт, production и Google-реестр не менялись. README не требует обновления: реализация и запуск проекта прежние.

Доказательства: [сводка](evidence/2026-10-27-contacts-desktop-screens/verification.json), [Screens до](evidence/2026-10-27-contacts-desktop-screens/screens-before.json), [после](evidence/2026-10-27-contacts-desktop-screens/screens-after.json), [финальные профили](evidence/2026-10-27-contacts-desktop-screens/final-profiles.json), [источник до](evidence/2026-10-27-contacts-desktop-screens/source-before.json), [после](evidence/2026-10-27-contacts-desktop-screens/source-after.json), [Desktop PNG](evidence/2026-10-27-contacts-desktop-screens/city-desktop-contacts.png), [редактор Screens](evidence/2026-10-27-contacts-desktop-screens/screens-editor.png), [офис до](evidence/2026-10-27-contacts-desktop-screens/office-before.png), [после](evidence/2026-10-27-contacts-desktop-screens/office-after.png).
