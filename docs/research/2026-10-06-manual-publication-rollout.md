# Выкладка ручного review и удаления расписания

Владелец явно разрешил commit, push, deployment и проверку. Работа относится к [#238](https://github.com/Celtoman/astro-telekom/issues/238), [#239](https://github.com/Celtoman/astro-telekom/issues/239) и [#241](https://github.com/Celtoman/astro-telekom/issues/241). Это приёмка текущего этапа, не завершение самостоятельной CMS-публикации без redeploy.

## Выпущенный код

- Exact SHA: `d440ec4208b87591cb92778928e707120599b6b4` в `master`.
- Локальный `pnpm check` и [Linux CI](https://github.com/Celtoman/astro-telekom/actions/runs/37379395103) прошли без пропусков. Числовой baseline хранится в [TEST_COVERAGE.md](../TEST_COVERAGE.md).
- Coolify deployment `dmuhed9mjs1gnuozbo2g5nvt`: `finished`, provider commit совпадает с exact SHA; ресурс `jlrsktdos9yhchkgnrd9f5fj` — `running:healthy`.
- Авторизованный smoke завершён 6 октября 2026 года в 01:08:58 МСК. Автодеплой остаётся выключенным.
- `migrate` успешно завершился до здорового API, `bootstrap-seed` был явно отключён, `web-publish` завершился до старта `web`. Дерево выпущенного коммита содержит миграции до `0057_remove_publication_schedule`. Таблицу migrations напрямую в SQL не читали.

Первый CI на `d57baf0` выявил Linux-права тестового Caddy fixture; [#242](https://github.com/Celtoman/astro-telekom/issues/242) исправлена в выпущенном SHA и закрыта только после зелёного Linux CI. Production permissions этим исправлением не менялись.

## Проверенные внешние результаты

1. Readiness вернула HTTP 200 с доступными PostgreSQL и Redis.
2. `/publication` и его React-root доступны. Все обнаруженные JS-модули, включая импортируемые общие компоненты, отдаются с HTTP 200; в графе компонента есть ручное действие «Опубликовать изменения», отсутствуют `datetime-local` и действие планирования.
3. `publication-review` доступен как machine request и через новую HttpOnly/Secure/SameSite=Strict cookie-сессию администратора. Login/logout успешны, тестовая сессия удалена после проверки. Review: working revision 11, published revision 7, пять записей изменений, `PASSED`.
4. Прежние POST schedule, DELETE schedule и POST internal release-due возвращают HTTP 404 с действительной machine-аутентификацией. `publication-state` больше не содержит `scheduledPublication`.
5. Сохранённые рабочие изменения не опубликованы code deployment: working revision осталась 11, published revision — 7; SHA-256 сериализованного public catalog до и после совпал: `e6030c7f5e6c5191a14a769426f95eb3aa843234d08e1e0bc28d88fae73c6f95`.
6. Каталог: 207 городов, 3 805 тарифов, 4 018 маршрутов. Главный title совпал с состоянием до deployment. Контрольные `/kazan`, `/kazan/giga-300`, `/politika-konfidencialnosti` имеют один H1 и ожидаемый canonical. Все 15 локальных assets, найденных в HTML главной, доступны.
7. Read-only API первых экранов из #193 вернул HOME и CITY_HOME, согласованные поля и пустые `missingFields`. Сохранение этих экранов на внешнем контуре не выполнялось.

Всего выполнена 41 авторизованная HTTP-проверка. Секреты и session cookie не включены в evidence. Локальные JSON/log artifacts сохранены вне Git в каталоге visualizations этой задачи.

## Границы

Встроенный браузер вернул `ERR_BLOCKED_BY_CLIENT` при открытии защищённого домена. Внешние клики, responsive screenshot и browser E2E не проверены. Предыдущий responsive smoke 375/768/1024/1440 px проводился на контролируемых ответах; он не заменяет внешний browser E2E.

На внешнем контуре не создавали новую рабочую запись и не запускали CMS-публикацию существующих пяти изменений. Действующий worker всё ещё вызывает Coolify deployment. Новый Caddy activation core присутствует в исходниках, но не подключён к worker/API/Compose. [#234](https://github.com/Celtoman/astro-telekom/issues/234) и #238 остаются открытыми; внешний save→publish без redeploy не доказан.

Прямой SQL-аудит и чтение внешних Redis scheduler keys не выполнены. Реальные сценарии отмены старых ожиданий, блокировки уже переданного снимка и Redis cleanup проверены в изолированном PostgreSQL/Redis rehearsal. На внешнем preflight не было активных либо ожидающих публикаций; опубликованная ревизия и catalog hash сохранились.
