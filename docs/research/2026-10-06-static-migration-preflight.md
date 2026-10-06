# Проверка действующего baseline перед переходом публикации

6 октября 2026 года, 00:49:32 UTC, завершена авторизованная read-only сверка защищённого test-контура перед переходом #238.

Coolify resource `jlrsktdos9yhchkgnrd9f5fj` имеет `running:healthy`, auto-deploy выключен. Последний deployment `dmuhed9mjs1gnuozbo2g5nvt` — `finished` на exact SHA `d440ec4208b87591cb92778928e707120599b6b4`. Seed выключен. Site `cmtuaqqj1000107lkiiiia2xa` / `domru-site`: working revision 11, published revision 7; publication `cmufiu2ik001r01ufdxel4o3a` и rebuild — `SUCCEEDED`. State и публичный catalog проверены до и после всей сверки, совпали.

`scripts/static-publication-migration-preflight.mjs` выполнил настоящий Astro build из опубликованного catalog и проверил все 4 018 действующих маршрутов плюс HTML 404. Совпали title, description, canonical, robots, H1, полный текст body и назначения ссылок; generated asset hashes и Astro scopes исключены из сравнения контента. Каждый ответ получил ожидаемый HTTP status и HTML content type. Отдельно сохранены размер и SHA-256 исходных байтов каждого HTML.

- Catalog digest: `e6030c7f5e6c5191a14a769426f95eb3aa843234d08e1e0bc28d88fae73c6f95`.
- Digest упорядоченного полного HTML inventory: `9aa7c337d42d5594c33007bee368baeebfe63cdcbdee0ae4241389052dd21d1f`.

Это доказательство совпадения действующей статики с опубликованным снимком, а не выполненный перенос. Production volume напрямую не читался; при startup runtime обязан самостоятельно проверить его actual fingerprint, route inventory и exact SQL snapshot. Working revision не публиковалась, внешние данные не изменялись. Перед deployment требуется свежая проверка неизменности baseline; CODE и CMS после rollout проверяются отдельно. Полный локальный JSON proof хранит только IDs, публичные hashes/размеры и пути, без credentials.
