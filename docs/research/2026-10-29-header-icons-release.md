# Иконки шапки — исправление и выпуск

29 октября 2026. Владелец разрешил заменить четыре иконки шапки, скрыть стрелку города на Mobile/320, сохранить телефон/меню, CMS и Figma, проверить1440/834/390/320 и выполнить commit/push/deploy в test. [Задача #435](https://github.com/Celtoman/astro-telekom/issues/435), sub-issue [#433](https://github.com/Celtoman/astro-telekom/issues/433), [исходный аудит](2026-10-29-header-icons-audit.md).

## Изменения

Общий `renderHomeHeader` public/preview использует четыре точных read-only экспорта Screens: `header-map-pin.svg`, `header-chevron-down.svg`, `header-search.svg`, `header-support.svg` в `images/general-home`. Старые общие файлы `images/figma` сохранены у остальных потребителей. Preview asset loader автоматически включает repository-owned файлы этой папки.

Mobile selector `.gh-city-trigger .gh-city-chevron` сильнее `.gh-city-trigger img`, поэтому скрытие действует на390/320 с первого кадра, включая no-JS и sandbox preview. На Desktop/Tablet стрелка14px сохраняется. Остальные значки16px; телефон22/18 и меню44 со своей подложкой не менялись. Сохранность телефона, меню и четырёх общих прежних SVG проверяется по SHA256.

Существующий тест native HOME artifact дополнен проверкой фактической доставки четырёх новых assets по версионному пути. Новых тестовых случаев не добавлялось. Профильные shell/preview/state проверки прошли18/18. Локальная проверка завершена:8 холодных HOME/CITY,4 реальные навигационные цепочки,4 no-JS и8 sandbox preview на1440/834/390/320. Модули задерживались900ms, наблюдение4.2s: один неизменный видимый кадр шапки, CLS0. SVG проверены по фактическим ответам HTTP; все четыре равны экспортам Screens. Стрелка скрыта390/320 с JS, без JS и в preview. Телефон/меню сохранены, city picker, закрытие меню и возврат фокуса работают. [Измерения](evidence/2026-10-29-header-icons-release/local-browser.json), [сохранные assets](evidence/2026-10-29-header-icons-release/preserved-assets.json), [проверки](evidence/2026-10-29-header-icons-release/checks.json). Полный `pnpm check` прошёл870/870,0fail/0skip. Процесс проверки ограничен двумя CPU из-за ранее зафиксированного Windows resource issue #430; команды и состав gate не менялись.

## Граница выпуска

Код пока не отправлен и не выпущен. Для push требуется полный `pnpm check`; затем зелёный CI выбранного SHA, Coolify MCP finished/exact SHA/running:healthy, CODE SUCCEEDED и повторная живая проверка нового artifact. Общий snapshot/CMS/public digest должны сохраниться. Figma и библиотека не изменяются. Документ не выдаёт локальную сборку за результат test-контура.
