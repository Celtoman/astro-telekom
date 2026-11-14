# SPEED_TEST: перенос из Screens в код

14 ноября2026. [Задача #601](https://github.com/Celtoman/astro-telekom/issues/601), [согласованный план](../plans/2026-11-14-speedtest-implementation-plan.md). Статус: TEST_RELEASED / WIDGET_QA_BLOCKED. Код и контент выпущены в защищённый test-контур. Live-замер остаётся непринятым: внешний iframe получил TLS connection reset в сети проверки, [#605](https://github.com/Celtoman/astro-telekom/issues/605).

## Источник и границы

Эталоны: Screens BdxNHlBVZWejREtOEIWDkI,1238:867/879/891/903;1440/834/390/320. [Принятый контент](../content/speedtest-page-content.md), [последнее обновление библиотеки](2026-11-14-speedtest-copy-update.md).

Сохраняются11размещений, шесть информационных блоков, четыре нативные мобильные ленты и отдельные акценты. Согласованные исключения: настоящий OpenSpeedTest.com iframe на всю ширину контентной области вместо градиентного стартового экрана; действующие общие шапка, футер и настройки контактов.

Виджет загружается сразу, замер запускается вручную. Дополнительных подписей, внешнего Provided by, таймеров, кнопок повтора загрузки, fallback-переходов, собственной истории результатов и автоматической диагностики нет. Внутреннее содержимое iframe принадлежит поставщику.

## Изоляция

Рабочая копия: C:/Users/Александр/.codex/worktrees/astro-speedtest-601/astro-telekom, detached origin/master9a0f21fd. Исходная D:/01 vibecode/astro-telekom с незавершёнными и staged изменениями сохранена. Никакие сторонние commits/WIP не переносятся в этот выпуск.

## Проверка измерителя до интеграции

В отдельной локальной HTTP-оболочке с frame-src https://openspeedtest.com настоящий iframe загрузил интерфейс и завершил ручной замер с четырьмя показателями внутри страницы. Ухода top-level страницы не было. На390/320px проверено наличие кнопки запуска; это не повторный полный замер на каждой ширине. Числа отражают маршрут тестового браузера и не являются критериями скорости или доказательством доступности из всех сетей.

HTTP-launcher, полученный при ранних исследованиях, не доказывал браузерное embedded-поведение. Встроенный браузер подтвердил рабочий интерфейс; работа на origin проекта остаётся обязательной отдельной проверкой после активации.

## Backend

Добавлены фиксированная типизированная модель1.0.0, исходные тексты, guarded GET/PATCH редактора, PageType/SEO-kind, optional inventory и GLOBAL source. Миграции0073/0074 затрагивают только working-данные. Профильные проверки:61pass; три isolated PostgreSQL rehearsals SPEED_TEST/ACCOUNT/OFFICIAL_SITE прошли. Независимый task-review: spec PASS / quality CLEAN. Это не полный общий gate или внешний release.

Исторические SQL0067/0072 сохранены. Их rehearsal воспроизводит backfill с текущим global-scope guard, не удаляя новые страницы.

## Renderer и редактор

Публичный и sandbox renderer используют одни тексты и профильные стили; preview не исполняет iframe или формы. Новые7профильных render/build/fixture тестов включают две настоящие Astro-сборки before/after, CSP, optional inventory и23исходныхSVG. Изолированная копия renderer исключает гонку `.astro/.prerender` с другими build-тестами. Web lint:0errors/0warnings/0hints.

CMS содержит90фиксированных native текстовых полей, FAQ и schema-derived SITE picker. Вставка сохраняет selection/caret. Guarded PATCH отделён от публикации; 409/ошибка сети сохраняют ввод.23профильных admin/registry/recovery tests, API lint/build и admin lint/build пройдены; admin lint:0errors/0warnings,2existing hints. Независимые task-review и финальный межкомпонентный review: PASS/CLEAN. [Итоговый review](evidence/2026-11-14-speedtest-code/final-review.md).

## Локальная IAB-приёмка

Встроенный браузер проверил actual client widths1440/834/390/320. Горизонтального переполнения body и обрезки текста нет, все иконки загружены. Высоты шести информационных секций совпадают с Screens; единственное отличие — factors наTablet770вместо768px из-за естественной высоты заголовка, текст не сжат. Одинаковые24px между размещениями и перед футером. [Геометрия и browser QA](evidence/2026-11-14-speedtest-code/local-iab/browser-qa.json).

Четыре мобильные ленты проверены нативной прокруткой до конца/назад; вертикальное движение над ними продолжает страницу. Первый и последний FAQ раскрываются и закрываются клавиатурой; меню/callback закрываются Escape с возвратом фокуса. [Desktop](evidence/2026-11-14-speedtest-code/local-iab/desktop.jpg), [Mobile](evidence/2026-11-14-speedtest-code/local-iab/mobile.jpg).

Синтетический GLOBAL FLOW2 прошёл адресную503→повтор, выбор дома, lead503→успешный повтор. Источник остаётся GLOBAL/`proverit-skorost-interneta`, фактический город —moscow из результата проверки. Номер, согласие и submissionKey сохраняются; меняется только timeOnSiteSeconds. Реальные заявки или уведомления не создавались. [Readback](evidence/2026-11-14-speedtest-code/local-iab/flow2-qa.json).

В настоящем admin bundle проверены90полей, SITE-вставка в курсор,409иобрыв сети без потери ввода, успешное working-сохранение с ревизией2/1, FAQ add/move/remove и preview с разрешённой SITE-переменной. Sandbox пустой, живого измерителя в нём нет. Диалог подтверждения сброса ввода появился; закрытие через IAB не удалось подтвердить, синтетическую вкладку перезапустили. Это ограничение browser QA, а не подтверждённая ошибка приложения; поведение guard покрыто кодовой проверкой. [QA](evidence/2026-11-14-speedtest-code/local-iab/admin-qa.json), [редактор](evidence/2026-11-14-speedtest-code/local-iab/admin-editor.jpg).

## Выпуск и итоговая проверка

Полный `pnpm check --test-concurrency=2` завершился с exit0:1141test,1140pass,0fail,1Windows-symlinkskip;901604ms. CI/Linux дополнительно проверяет этот guard. [Проверка](evidence/2026-11-14-speedtest-code/local-validation.json). Первый прогон обнаружил три пропущенных интеграционных ожидания (admin inventory, migration-head docs, bootstrap count); они исправлены с независимым review. Второй оборвался при перезапуске локального окружения и не считается PASS. Третий полный прогон зелёный.

Код `8a3ccfbd3cdea524e22212c5c186f3ac3dee4038` прошёл [exact-SHA CI43613999383](https://github.com/Celtoman/astro-telekom/actions/runs/43613999383):1141pass/0fail/0skip. [CI readback](evidence/2026-11-14-speedtest-code/ci.json).

Coolify MCP deployment `1eizs70shs3t89ssfztzzga3` finished14.11.2026в16:32:05UTC, exact SHA совпал, приложение running:healthy. После тайм-аутов MCP-чтения и явного сообщения использован документированный REST fallback с тем же ограниченным team token. Новый deployment повторно не запускался. [Deployment](evidence/2026-11-14-speedtest-code/deployment.json), [application](evidence/2026-11-14-speedtest-code/application.json).

CODE SUCCEEDED с прежней publication `cmweuuve1000a01mrxlwxb32p`,siteRevision32 и renderer `fd444b0af80e6158ad74ada59e76692d2d2d01f80b4899c007885a7709bfa0df`. Первый ответ потерян по тайм-ауту; повторена та же идемпотентная команда с тем же deployment/commit. [CODE receipt](evidence/2026-11-14-speedtest-code/code-release.json).

Перед CMS подтверждены33/32, ровно одна новая SPEED_TEST, preflight PASSED/4243URL/0issues и неизменность остального каталога. CMS publication `cmwgmwk86000101rwcm9tyfhf` SUCCEEDED14.11.2026в16:46:25UTC; readback33/33, review0, rebuild SUCCEEDED с publishedPublicationId этого же выпуска. [До](evidence/2026-11-14-speedtest-code/prepublication.json), [подтверждение](evidence/2026-11-14-speedtest-code/cms-release.json), [после](evidence/2026-11-14-speedtest-code/postpublication.json).

Публичный и рабочий каталоги совпадают:4243маршрута,207городов,3805тарифов. Semantic digest без единственной новой страницы/route/SEO остался `1cd1246fb9f9b8947edeceeafeac1700d2c29176dbefecfdf4801fdd91c12a1e`; полный новый digest `f66ae07504b9f7edeaa5ffa10a7a1cebc27fdf6df9c2f1d08e47e69f2c608177`. Посторонние черновики не выпускались.

Живой HTML200 содержит согласованные H1/canonical/eager iframe и порядок размещений. Все23SVG совпали по SHA-256 с исходными экспортами. Без credentials401; noindex/nofollow и ограничивающий CSP сохранены. [HTTP proof](evidence/2026-11-14-speedtest-code/live-http.json). Live CMS GET/editor200, working/published content совпадают, missingFields0,33/33; реальные тексты для QA не менялись. [Admin readback](evidence/2026-11-14-speedtest-code/live-admin.json).

## Живой браузер и блокер измерителя

IAB после перезапуска не открыл test-origin: ERR_TIMED_OUT при локальном fake-IP DNS. Владелец явно разрешил резервный фоновый Chromium/Playwright. В его процессе использованы независимо проверенные A-records, исходные HTTPS hostname и обычная проверка TLS; системные DNS/прокси/защита не менялись.

На1440/834/390/320 нет горизонтального переполнения body и обрезки видимого текста; видимые иконки загружены, fonts loaded. Проверка обрезки учитывает overflow:visible у H1 и исключает скрытую accessibility-подсказку AddressOnly. Четыре mobile rails прокручены wheel до конца и назад; вертикальное движение над ними продолжает страницу. FAQ first/last проверены клавиатурой, menu/callback Escape возвращают фокус. Pageerror0; реальные заявки и уведомления не создавались. [QA](evidence/2026-11-14-speedtest-code/live-browser/browser-qa.json).

**Live-замер не принят:** iframe `https://openspeedtest.com/speedtest` завершился `net::ERR_SSL_PROTOCOL_ERROR`. Отдельный curl с independently verified23.239.29.5, исходным TLS-hostname и проверкой сертификата получил connection reset. Это наблюдение текущей сети, не подтверждение глобального сбоя поставщика или ошибки CSP. Ручной замер, четыре результата и повтор на test-origin не подтверждены. Сервис не заменён; отклонённые владельцем fallback/подписи/таймеры не добавлены. #605 связан как native sub-issue #601; оба остаются открытыми.

Фактические полные снимки содержат пустую область iframe из-за этого сбоя: [Desktop1440](evidence/2026-11-14-speedtest-code/live-browser/desktop.jpg), [Tablet834](evidence/2026-11-14-speedtest-code/live-browser/tablet.jpg), [Mobile390](evidence/2026-11-14-speedtest-code/live-browser/mobile.jpg), [Mobile320](evidence/2026-11-14-speedtest-code/live-browser/mobile320.jpg). Готовность к реальному трафику не заявляется.

## Доступ и служебные данные

При первичном входе URL с тестовыми Basic Auth credentials попал в служебный вывод браузера; об этом сразу сообщено владельцу. Дальше использовался чистый URL, в резервном браузере — origin-scoped httpCredentials без вывода. Credentials отсутствуют в коде и артефактах по staged-сканированию; пароль в этой задаче не менялся. Временный machine-key файл использовался только для авторизованного выпуска.

Автопроверка отклонила рекурсивное удаление собственного временного SDD-аудита с причиной blocked by policy. Удаление не обходилось; scratch оставлен в изолированном worktree, доказательства отдельно сохранены в репозитории.

После всех live API-проверок собственный временный machine-key файл удалён точечным Remove-Item; Test-Path=False. Существующий файл credentials владельца сохранён. Финальный staged-скан20файлов:0совпадений секретов;132локальные ссылки проверены. Documentation-consistency:2pass, diff-check чистый. Итоговый commit содержит только документацию и доказательства; работающий код остаётся8a3ccfbd.

После перезапуска ОС-resolver отдавал fake-IP198.18.0.76. A-записи двух test-доменов независимо сверены через Cloudflare DoH, соединение выполнено с исходным TLS-hostname и проверкой сертификата; глобальные DNS/сеть не менялись. Повторный readback подтвердил32/32,review0и прежний semantic digest каталога.
