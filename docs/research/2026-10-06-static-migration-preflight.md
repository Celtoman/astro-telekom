# Проверка действующего baseline перед переходом публикации

6 октября 2026 года, 00:49:32 UTC, завершена авторизованная read-only сверка защищённого test-контура перед переходом #238.

Coolify resource `jlrsktdos9yhchkgnrd9f5fj` имеет `running:healthy`, auto-deploy выключен. Последний deployment `dmuhed9mjs1gnuozbo2g5nvt` — `finished` на exact SHA `d440ec4208b87591cb92778928e707120599b6b4`. Seed выключен. Site `cmtuaqqj1000107lkiiiia2xa` / `domru-site`: working revision 11, published revision 7; publication `cmufiu2ik001r01ufdxel4o3a` и rebuild — `SUCCEEDED`. State и публичный catalog проверены до и после всей сверки, совпали.

`scripts/static-publication-migration-preflight.mjs` выполнил настоящий Astro build из опубликованного catalog и проверил все 4 018 действующих маршрутов плюс HTML 404. Совпали title, description, canonical, robots, H1, полный текст body и назначения ссылок; generated asset hashes и Astro scopes исключены из сравнения контента. Каждый ответ получил ожидаемый HTTP status и HTML content type. Отдельно сохранены размер и SHA-256 исходных байтов каждого HTML.

- Digest публичной проекции catalog: `e6030c7f5e6c5191a14a769426f95eb3aa843234d08e1e0bc28d88fae73c6f95`.
- Digest упорядоченного полного HTML inventory: `9aa7c337d42d5594c33007bee368baeebfe63cdcbdee0ae4241389052dd21d1f`.

Это доказательство совпадения действующей статики с опубликованным снимком, а не выполненный перенос. Production volume напрямую не читался; при startup runtime обязан самостоятельно проверить его actual fingerprint, route inventory и exact SQL snapshot. Working revision не публиковалась, внешние данные не изменялись. Перед deployment требуется свежая проверка неизменности baseline; CODE и CMS после rollout проверяются отдельно. Полный локальный JSON proof хранит только IDs, публичные hashes/размеры и пути, без credentials.

## Привязка полного снимка и восстановление startup

В 01:13 UTC machine-only exact snapshot API подтвердил полный digest `d22b47fbf4386175b19ff3865e7714cb03b5fb9eabb17f4ed6edf3f1bb65d5e2` той же публикации. Публичный CitiesController исключает пять диагностических полей (`variableUsages`, `variableSources`, `variableWarnings`, `seoWarnings`, `variableUsageVersion`); после их исключения получен исходный digest `e6030c7f…`. Поэтому проверенные контент и HTML fingerprint остаются применимыми, но runtime proof обязан хранить полный digest SQL snapshot.

Первый rollout `4vhzjrvu4tdrdkmbu5y5lqsr` на `eb56d7cedffd9999cbab632fecba9826021b96ae` остановил startup по несовпадению proof/snapshot (#249). Исправление единственного owned env digest с readback и Coolify restart `ftc7wttmmixasw2hknluvvbf` восстановило runtime; deployment завершён на том же SHA, приложение healthy, публичные HTML/API отвечают 200. Seed выключен, working/published revisions остались 11/7; сохранение и CMS publication до восстановления не запускались.

Preflight теперь отдельно связывает machine-only exact snapshot с публичной проекцией и строит proof из full snapshot. Regression test отклоняет хеш проекции вместо snapshot, чужую identity, изменённый публичный контент и state, не соответствующий full digest. Существующий fail-closed runtime guard сохранён.
