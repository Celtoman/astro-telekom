# Внешняя приёмка управляемой HOME — 16 октября 2026 года

Итог и границы: [приёмка](../../2026-10-16-general-home-external-acceptance.md).

- `before.json` / `after.json` — состояние до/после: exact deployment, snapshot/revisions/Hero/catalog неизменны, новый обслуживаемый artifact.
- `deployment.json` / `code-release.json` — finished exact SHA и SUCCEEDED CODE receipt.
- `http-proof.json` —68 assets SHA, CSP hashes, readiness/auth, прежние CITY_HOME/тарифная страница.
- `browser-proof.json` — четыре публичные ширины, действия с перехваченными POST, реальный admin preview/editor без content writes.
- `home-1440.png`, `home-834.png`, `home-390.png`, `home-320.png` — настоящая внешняя HOME.
- `admin-preview-1440.png`, `admin-preview-header.png`, `admin-image-proof.json` — settled preview, decode изображений, scroll/geometry и сохранённые диагностические сообщения окружения. Desktop iframe1440 внутри меньшей административной области имеет собственную горизонтальную прокрутку; это не общий overflow публичной страницы.

Файлы не содержат токенов, паролей, cookie или PII заявок. Browser submissions перехвачены; настоящие заявки не отправлялись. FAQ временно демонстрационный по решению владельца D6. Недостающие страницы остаются отдельным этапом D1.
