# Внедрение страницы проверки подключения

Работа по [#479](https://github.com/Celtoman/astro-telekom/issues/479) и [контракту Q1–Q20](../plans/2026-11-04-address-check-implementation-contract.md). Полное внедрение, push, деплой и CMS-публикация разрешены владельцем. Страница внедрена и опубликована в действующем защищённом test-контуре для всех207 городов. Ниже — проверенные технические результаты, без решения о реальном трафике.

## Реализация

Единый независимый CITY_ADDRESS_CHECK 1.0.0 и восемь редактируемых секций. Сайт и sandbox preview используют общие renderer; сквозные этапы, преимущества, консультация и FAQ переиспользуют существующие компоненты. Тарифная карточка и CSS выделены из действующего городского каталога без изменения его разметки. Подборка вычисляется по согласованным категориям/цене, CTA открывает FLOW1. FLOW2 получает канонический pageSlug ADDRESS.

Миграции0063/0064 вводят enum отдельно от данных; создают шаблон, SEO, зависимые страницы всех городов Дом.ру и одну рабочую ревизию сайта. Immutable publications не меняются. Создание и импорт новых городов учитывают ADDRESS; импорт включает зависимые shell в undo snapshot. Route inventory, SEO, sitemap и redirect policy расширены согласованным маршрутом. Стандартные Page/PageBlock writers не заменяют связанную shell ADDRESS.

Редактор `/templates/home?kind=CITY_ADDRESS_CHECK` использует общий механизм полей, лимитов, подстановок, dirty-state, published view и serializable save с optimistic revision. Восемь паспортов выделены в отдельную группу. Ошибки publication/preview ведут к собственному полю ADDRESS. Тексты и исходные шесть FAQ-пар взяты из Screens; данные каталога и общие факты динамические.

В Header исправлено устаревшее описание callback в паспорте ([#478](https://github.com/Celtoman/astro-telekom/issues/478)): самостоятельный FLOW1 соответствует runtime; статус Header не повышен.

## Источник дизайна и адаптивы

Screens `BdxNHlBVZWejREtOEIWDkI`: 620:1549 / 620:1565 / 620:1581 / 620:1597. Получены живые design context четырёх вариантов и отдельные glyph-контексты результатов: общий экспорт Figma возвращал master-иконку вместо override. Локальные SVG check-circle / arrows-left-right / file-x / arrow-clockwise взяты из соответствующих экземпляров; Phosphor Duotone, MIT, лицензия приложена. В runtime временных Figma URLs нет.

Первый браузерный прогон подтвердил отсутствие горизонтального overflow и совпадение ширин шапки/контента: 1360 при1440, 720 при834, 358 при390, 288 при320. Открывается FLOW1 с контекстом тарифа/города, переключение города сохраняет ADDRESS, первый FAQ открыт. После дополнительного сравнения типографики/отступов с design context исправлены размеры H1/текста результатов, радиусы и белая поверхность секции популярных тарифов; повторная визуальная проверка пройдена на всех четырёх ширинах, включая загрузку иконок, FLOW1 и переключатель города; [доказательства](evidence/2026-11-04-address-implementation/visual-check.json).

## Проверки и границы

- Контрактные, route, catalog, renderer и editor suites проходили профильные прогоны.
- Реальный StaticArtifactBuilder собрал контрольный immutable ADDRESS snapshot для всех трёх городов fixture; canonical, sitemap, восемь секций, контекст FLOW2, локальные иконки и первая FAQ-пара проверены.
- Изолированная PostgreSQL18: bootstrap, backfill, idempotence, сохранение HOME/immutable публикации, другой provider, атомарный save, stale revision и rollback при занятом slug — PASS.
- Web/admin Astro check — 0 ошибок; у admin сохранены два прежних hints.
- Первый полный gate выявил устаревшие ожидания реестра паспортов/импорта и документации. Итоговый полный `pnpm check` завершился exit0: tests927, pass926, fail0, skipped1 (Windows symlink privilege; Linux rehearsal проверяет защиту).

Перед внешним выпуском read-only baseline: 207 опубликованных городов, 4018 маршрутов; workingRevision=publishedRevision=24, неопубликованных изменений0. Это снимок состояния, а не зашитые значения реализации. Новый inventory ожидается по формуле `2N + T + 6`.

Независимый review нашёл #481/#483; оба исправлены, 29 профильных тестов и повторный review без существенных замечаний. Живой каталог проверен для всех207 городов: каждый имеет три подходящих тарифа; ожидаемый новый inventory4225, значение вычислено из текущего каталога, а не задано в коде.

Push, exact-SHA CI/Coolify/CODE, CMS activation receipt и живой smoke подтверждены ниже. Реальные внешние заявки автоматически не отправлялись. Basic Auth/noindex test-контура сохраняются; только владелец определяет готовность к реальному трафику.

## Внешний выпуск и приёмка

- Код [41eedc80](https://github.com/Celtoman/astro-telekom/commit/41eedc80637184233e1ba8052884ea18bb5b21e8) отправлен в master. [CI41817647325](https://github.com/Celtoman/astro-telekom/actions/runs/41817647325):927passed,0failed,0skipped на Linux.
- Coolify MCP deployment `uan1zw22imwic4bg9bho5ock`: finished на этом exact SHA, приложение running:healthy, APIlive/ready200. Runtime RUN_BOOTSTRAP_SEED=false подтверждён через MCP; bootstrap не включался.
- CODE подтверждён сменой обслуживаемого artifact `08b4078b…` → `d4d1ef11…` с сохранением публикации24, её ID и digest публичного каталога. Отдельная CODE-квитанция напрямую не читалась; основание подтверждения записано в release.json.
- Миграция создала рабочую ревизию25. Через реальный редактор сохранена временная правка26 и восстановлен исходный текст27; HOME/CITY_HOME и обслуживаемый каталог не изменились. Все восемь секций доступны. Предпубликационная проверка:210 собственных изменений,4225 URL, PASSED,0warnings/0blocking.
- CMS publication `cmw20tzmt000f01pdzw24unp7`, siteRevision27, SUCCEEDED. Rebuild `cmtw6dpwj015g01o0ho99ow05` /23 — SUCCEEDED. Рабочая/публичная ревизии27/27; опубликованная ADDRESS-композиция совпадает с рабочей.
- Durable receipt из API совпал с действующими HTML: artifact `b6bf93c5ba83c55b77246ac50a1038010f0bb292e6e760321f3cae92857f5930`, renderer `2427fe8116c22323319297e81ce2965dc9b5f108300f216b01ff8c3bcafabaa2`. Catalog/manifest digest и идентичность публикации сохранены в [release.json](evidence/2026-11-04-address-implementation/release.json).
- Проверены все207 новых URL:200, один H1, собственный canonical, восемь секций, ожидаемые тарифы/цены и один serving artifact. Все207 URL находятся в sitemap; всего4225 обычных маршрутов и4226 HTML с404. Basic Auth401, test noindex, readiness200, legal URL200 и контролируемый404 сохранены. [Полный HTTP smoke](evidence/2026-11-04-address-implementation/live-public-smoke.json).
- Публичный браузер1440/834/390/320: ширины1360/720/358/288 совпадают с шапкой, нет overflow и сломанных видимых изображений. Проверены тарифный FLOW1, очистка выбора при обычном звонке, независимые FAQ и сброс адреса при смене города. [Браузер](evidence/2026-11-04-address-implementation/live-browser-check.json).
- Реальный CMS preview проверен на тех же ширинах: восемь секций,3/2/1/1 колонки тарифов,0 активных ссылок/кнопок/скриптов, все видимые изображения загружены. [Preview](evidence/2026-11-04-address-implementation/live-preview-check.json).
- FLOW2 принят с новым pageSlug: адрес выбран из публичного справочника здания текущего города, получен business/TARGET_AVAILABLE. Создан только AddressCheck; телефон и заявка не отправлялись. [Проверка](evidence/2026-11-04-address-implementation/live-flow2-check.json).

Пример опубликованной [страницы](https://tv-internet-dom.ru/abinsk/proverka-podklyucheniya-k-domru-po-adresu); [редактор ADDRESS](https://admin.tv-internet-dom.ru/templates/home?kind=CITY_ADDRESS_CHECK&siteId=cmtuaqqj1000107lkiiiia2xa). Ограничения доступа test-контура сохраняются. Только владелец определяет готовность к реальному трафику.
