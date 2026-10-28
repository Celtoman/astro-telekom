# CITY_HOME — локальная проверка перед внешним выпуском

28 октября 2026. Задача [#401](https://github.com/Celtoman/astro-telekom/issues/401); [контракт](../plans/2026-10-28-city-home-contract.md), [план](../plans/2026-10-28-city-home-implementation.md). Эти результаты не подтверждают внешний выпуск.

Полный `pnpm check` завершился успешно: типизация API/web/admin/worker, Prisma validate, сборки, SEO gate и все тесты без падений/пропусков/отмен. Единственный точный baseline — в [TEST_COVERAGE.md](../TEST_COVERAGE.md). После обновления документов отдельно прошли ci-runtime/documentation-consistency и git diff --check. Независимый review не оставил существенных замечаний в проверенной области.

Проверена настоящая immutable Astro-сборка синтетического города с шестью тарифами. Все двенадцать локальных CITY SVG загрузились. В браузере document.scrollWidth равен clientWidth на1440/834/390/320/1000; таблица имеет собственную горизонтальную прокрутку. Длинные графики, кнопка и название города на320 не расширяют viewport. Контакты: Desktop419px, Tablet451px, две карточки без офиса.

Проверены AND-фильтры, отсутствие результатов и сброс, независимые строки сравнения, числовые сортировки, readonly контекст выбранного тарифа и очистка при обычном открытии. Контролируемый HTTP-приёмник в браузере вернул503, затем201: повтор сохранил submissionKey, передал город/тариф без configuration/address. Реальных внешних заявок не отправлялось. Изолированные controller/outbox тесты проверяют названия из serving snapshot.

PostgreSQL rehearsal0062 проверяет сохранение Hero/каталога и четырёх прежних HOME factText, независимость HOME/CITY, атомарность, idempotence и неизменяемые публикации. [Снимок действующих данных до обновления](evidence/2026-10-28-city-home-local/live-before.json) сохранён для сравнения после deployment/CMS activation.

В консоли остаются известные сообщения CSP none вместе с другими источниками — [#280](https://github.com/Celtoman/astro-telekom/issues/280). В этой задаче CSP-директивы не менялись; браузерные результаты не объявляются полностью чистой console.

Снимки блока контактов: [Desktop](evidence/2026-10-28-city-home-local/city-final-contacts-1440.png), [Tablet](evidence/2026-10-28-city-home-local/city-final-contacts-834.png), [Mobile](evidence/2026-10-28-city-home-local/city-final-contacts-390.png), [320](evidence/2026-10-28-city-home-local/city-final-contacts-320.png).
