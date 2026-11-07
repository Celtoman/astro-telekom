# CSP, manifest и пакет редакционных изменений

7 ноября 2026. Владелец разрешил реализацию/push/test release #564 и дополнение #565. Реальные материалы и рабочие редакции не публиковать. Статус: LOCAL CHECKED / TEST RELEASE PENDING.

- Manifest link получает crossorigin=use-credentials; publication verifier запрещает отсутствие/anonymous. Stable discovery URLs, display=browser и Basic Auth сохраняются.
- Общий helper вычисляет hash88-символьного CSS ReactAria usePress3.52.1. Guard сравнивает точные bytes installed dependency; общий style-src unsafe-inline/static nonce не вводятся.
- html transition:animate=none убран из admin routes, его поведение перенесено в общий static stylesheet. ClientRouter fallback=swap, persistent root, history/dirty guard сохранены. Ненужные per-route inline styles не создаются.
- Один пакет допускает DRAFT+CHANGED. Для серверной eligibility сравнивается working content с serving snapshot по тем же ключам, что у lifecycle; unchanged PUBLISHED и WITHDRAWN отклоняются. UI выбор/retention/select-all/мобильный список используют одно правило и термин «материалы».
- Сохранены точные revisions, serving baseline, deduplicated categories, aliases, один publication/enqueue, повтор operationId и ACK captured revisions. Поздний autosave и невыбранные правки не входят в выпуск.

Предварительная диагностика и A/B находятся в #560/#561/#563; исходная атрибуция public mixed-none исправлена: #280 закрыт, первичная CSP корректна, её DOM менял Kaspersky. Этот выпуск не разрешает адреса антивируса и не меняет его настройки.

До внесения правок read-only live capture показал6live статей,3CHANGED. Владелец продолжает редактировать категории; этот ранний срез не фиксирует состав к моменту выпуска. Непосредственно перед release будет снят новый baseline для сравнения. Первичный root admin build превысил120с и не считается зелёной проверкой; его собственные процессы остановлены. Дальнейшие проверки идут из immutable export с неизменёнными установленными зависимостями.

Полные результаты проверок и выпуска добавляются после завершения. Локальные журналы .codex-tmp/csp-564/ не содержат credentials. Предыдущие изменения владельца сохраняются.

## Завершённые локальные проверки

- Профильный immutable export:33pass/0fail, включая фактическую сборку29admin HTML и PostgreSQL mixed category batch/ACK.
- Финальный полный `pnpm check --test-concurrency=2`:1074pass/0fail/1skip,539447ms, exit0. Единственный skip — недоступная Windows file symlink privilege; Linux/non-root publication runtime прошёл. Все43non-Markdown файла индекса побайтно совпадают с проверенным экспортом tree1fb80632b077db835df9b4c4367d405866515c2c. Дополнительные записи после gate меняют только документацию.
- Предыдущий полный gate с обычной параллельностью:1073pass/1fail/1skip,712953ms. Единственный fail — ACCOUNT seed P2028, #567; seed/ACCOUNT этой задачей не менялись. Отдельная повторная ACCOUNT suite:2pass/0fail,17.9с; затем весь gate повторён с ограничением параллельности без пропуска тестов, без повышения product timeouts и без изменения assertions. Первый прерванный инструментальным reset прогон также не засчитан.
- Regression ReactAria сначала упал из-за отсутствующего hash; metadata verifier сначала принимал manifest без credentials. После правок соответствующие тесты прошли. Общая проверка admin build требует корректный digest каждого emitted style.
- Локальный sealed public artifact ddb16d5e038ab876fd98a1b091b738de510d1d1b7fc0fd7ae4940b78dd523179: browser manifest под синтетическим Basic Auth200/516bytes, crossorigin=use-credentials. Без изменения внешнего контура.
- Собранная admin: stylesheet ReactAria активен, computed touchAction=manipulation, scoped transition styles0; static old-root pseudo animation none/opacity0. Посторонние script/style elements заблокированы negative probes. В обычной среде остаются события Kaspersky, app-origin violations до probes отсутствуют; blanket разрешения не добавлены.
- Browser mixed DRAFT+CHANGED fixture: выбор клавиатурой и pointer, один POST publish, намеренно потерянный ответ, reload/polling той же операции и SUCCEEDED; pending key/alert/dialog очищены. Некорректный CHANGED материал блокирует набор и даёт ссылку редактора.4viewport и modal без overflow. Touch input выбирает материал, Space снимает выбор. Native SPA и fallback без startViewTransition сохраняют тот же persistent root и Back; history guard проверен отдельными тестами. Это синтетические HTTP/SQL проверки, не внешний publish.
- Зависимости, Prisma schema/migrations и наружная Basic Auth/CSP framing policy не менялись. Safari/физический touch/screen reader отдельно не проверены. Внешний exact release и live readback будут добавлены после выполнения; реальные рабочие правки выпускаться не будут.
