# Caddy control transport после config reload

Задача [#262](https://github.com/Celtoman/astro-telekom/issues/262), 6 октября 2026 года. Это датированная приёмка; действующий контракт — [publication.md](../publication.md), состояние — [current-state.md](../current-state.md).

## Доказательство и границы причины

Первый [Linux CI документационного коммита aa2387f](https://github.com/Celtoman/astro-telekom/actions/runs/37473616379/attempts/1) потерял HTTP-соединение на GET `/config/` после принятого POST: `UND_ERR_SOCKET`, затем `ActivationUncertainError` из `activateSerial:92`. Повтор на том же SHA прошёл без изменений. Это ошибка транспорта проверки состояния, а не доказанный отказ самого переключения HTML.

[Caddy 2.11.4, replaceLocalAdminServer](https://github.com/caddyserver/caddy/blob/v2.11.4/admin.go#L345) создаёт новый admin HTTP-сервер и асинхронно вызывает Shutdown прежнего. Контроллер использовал стандартный fetch pool без закрытия соединений, поэтому readback мог попасть на socket прежнего admin-сервера. Гонка выбора такого socket воспроизведена управляемым реальным HTTP-server fixture: после принятого POST сервер закрывает запрос по соединению предыдущего поколения. До исправления два теста падали в readback/reconciliation, после — проходят.

Прямой stress настоящего Caddy не повторил исходную ошибку: Windows probe прошла 100 reload, Linux Node 22.23.2 — 1000 до исправления, ещё 1000 с закрытием соединений. Нулевое число ошибок в этих пробах не доказывает отсутствия гонки; точный Linux CI timing не воспроизведён. Связь CI-сбоя с lifecycle pooled socket обоснована кодом Caddy и управляемым регрессионным сценарием.

## Изменение и сохранённые гарантии

`apps/web/scripts/publication/caddy-activation.mjs` передаёт `Connection: close` в GET и POST к закрытому Caddy control API. Соединения не переносятся через reload; write retry, дополнительные зависимости и новые настройки не добавлены. Стоимость отдельного loopback TCP-соединения ограничена control flow и не затрагивает пользовательские HTTP-запросы.

Origin, timeout, If-Match CAS, sealed artifact/manifest, наблюдение serving identity и durable receipt сохранены. Потерянный POST reply восстанавливается одним чтением состояния, без повторной записи. Недоступный readback по-прежнему возвращает UNCERTAIN и не создаёт success receipt. Существующий worker recovery остаётся ответственным за последующее восстановление.

## Проверки

- `tests/caddy-control-transport.test.mjs`: red — два ожидаемых падения до исправления; green — все три сценария после. Это настоящий локальный HTTP transport с моделируемым закрытием socket, не настоящий Caddy.
- Профильный запуск новых тестов, `static-publication-activation` и `static-publication-pipeline`: все сценарии прошли. Использованы настоящий Caddy, PostgreSQL, Redis/BullMQ, Nest HTTP и Astro. SQL acknowledgment rollback, restart/recovery, отказ невалидной сборки и старые assets сохранены.
- `node --check` изменённого runtime-модуля и полный локальный `pnpm check` прошли без падений. Точный baseline находится только в [TEST_COVERAGE.md](../TEST_COVERAGE.md). Изменённые локальные ссылки и scoped `git diff --check` проверены; CI и внешний rollout фиксируются в комментарии issue после получения результатов.
- До rollout read-only проверка 2026-10-06T14:15:46Z: workingRevision 18, publishedRevision 16, publication `cmuwfx7x1000c01l6orbddgpt`, исходный snapshot сохранён. Рабочий контент владельца в scope не входит.

Сопутствующая [#263](https://github.com/Celtoman/astro-telekom/issues/263) устраняет два устаревших текущих утверждения publication/architecture о внешнем rollout и direct migration target. README проверен: обзор ручной публикации и CODE соответствует контракту; его изменения не требуются. Новых продуктовых или UX-находок в этой задаче нет.
