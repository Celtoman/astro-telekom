# Task 2 — независимая проверка backend

Проверены brief, отчёт исполнителя и task-2-diff.txt относительно 9a0f21fd. Основной источник проверки — diff; вне него просмотрены только существующие OFFICIAL_SITE controller, generic Page writer, общий structured validator и serving-publication-context для проверки конкретных рисков совместимости и обхода revision/serving-контракта. Исходники, миграции и тесты не менялись.

## Соответствие заданию

**PASS для backend-объёма task 2.** Endpoint `/admin/sites/:siteId/speed-test` соответствует уточнению контроллера.

- SPEED_TEST добавлен в PageType/SeoTemplateKind отдельной enum-миграцией 0073; backfill 0074 меняет рабочие данные, ревизию и audit, не переписывая immutable publication snapshots. Уникальный site-global scope, canonical slug, проверки трёх типов URL-коллизий и изоляция провайдера соблюдены.
- Схема 1.0.0 содержит шесть фиксированных информационных разделов, H1 и FAQ. Смысловые карточки заданы объектами с фиксированными ключами. Нет CMS layout, цветов, иконок, widget URL/scripts, локального телефона или графика. Существующий structured validator запрещает неизвестные поля, небезопасный текст и переменные вне SITE; draft сохраняет пустые строки с missingFields, публикация их блокирует.
- Default JSON и SQL содержат исходный текст; отдельный data test сопоставляет все approved-copy literals и шесть FAQ с MD, включая обе оговорки и исключение глобальных контактов.
- GET/PATCH защищены AdminTokenGuard; save проверяет expectedWorkingRevision, использует Serializable, атомарно записывает PAGE revision/audit и возвращает актуальную страницу. Stale/P2034 преобразуются в 409. Generic Page writer запрещает создание/подмену SPEED_TEST и изменение уже существующей страницы в обход формы.
- Включены optional inventory (+1 маршрут), собственный SEO, preflight, catalog variable resolution/usages, рабочие usages и паспорта. Исторические источники без SPEED_TEST продолжают давать прежний inventory.
- GLOBAL FLOW2 whitelist дополнен ровно новой страницей; serving source/type/slug, фактический город/регион и привязка AddressCheck сохраняют прежние ограничения. Callback/tariff/configuration не получают новых привилегий.

## Качество

**CLEAN: actionable Critical/Important замечаний не найдено.** Выявленного существенного расширения scope или регрессии в рассмотренном diff нет.

Проверены конкретные риски: обход dedicated revision writer через generic Page PATCH; использование latest SQL SUCCEEDED вместо exact serving при static provider; мутация старых snapshots; нарушение fixed keys/variable scopes; ослабление GLOBAL source/check matching. По просмотренному коду оснований для замечаний нет.

Повторные тесты не запускались: конкретного сомнения, требующего отдельного probe, не возникло. Результаты 61 pass/0 fail и изолированных PostgreSQL rehearsals приняты из отчёта исполнителя; это не независимый повтор запуска. Полный общий gate остаётся обязанностью контроллера после интеграции.

## Зависимости следующих задач

- Runtime должен реализовать тот же контракт, фиксированную композицию и безопасный вывод текста, добавление ровно одного optional route, сохранение inventory исторических snapshots, системные контакты/графики и отдельный widget/CSP контракт.
- CMS должен использовать `/admin/sites/:siteId/speed-test`, native field paths и missingFields, сохранить введённые данные при 409 и давать честные working/published states. Ссылки `/templates/speed-test` и passport editorReadiness READY завершатся фактической реализацией этого редактора в последующей задаче; backend-проверка не подтверждает их готовность самостоятельно.
- Перед общим завершением сверить паспортные утверждения renderer/editor с реализацией и выполнить общий gate. Эти зависимости не являются дефектами task 2.

## Дополнение — интеграционная сверка seed

Проверен актуальный diff `scripts/rehearse-seed.mjs` и относящиеся к seed исправления `docs/deployment.md` / `docs/TEST_COVERAGE.md`. Остальные интеграционные изменения этих документов вне данного дополнения не оценивались.

**Spec PASS; quality CLEAN. Critical/Important замечаний нет.** Ожидания 12 routes / 12 SEO соответствуют добавлению одного SPEED_TEST к прежнему синтетическому seed-каталогу. Проверка не ограничена счётчиком: отдельно утверждаются единственный канонический GLOBAL_PAGE route, одна SPEED_TEST Page с правильными siteId / cityId=null / slug / PUBLISHED, literal default content в рабочем source и rendered catalog, собственный SEO template и SEO результата. Seed-абзацы документации согласованы с этими утверждениями; production code этим исправлением не меняется.

Новые build, сервисы и тестовые запуски не выполнялись. Результат `node --test tests/seed.test.cjs`: 1 PASS / 36,3 с принят из сообщения контроллера, независимо не воспроизводился. Общий gate после интеграции ещё ожидается; этот review не заменяет его.
