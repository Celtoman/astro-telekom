# ACCOUNT — перенос в код и минимум CMS

5 ноября 2026. Задача [#511](https://github.com/Celtoman/astro-telekom/issues/511), принятый план `cfb9524d`. Этот отчёт описывает локальную реализацию. Код c2982c7 отправлен в master, exact-SHA CI зелёный, test-deployment finished/healthy. После отдельного согласия владельца CMS29 активирована, durable receipt SUCCEEDED; [отдельный внешний протокол](2026-11-05-account-test-release.md) содержит актуальный CODE/live статус и полный diff.

## Реализация

- Один глобальный `/lichnyy-kabinet-dom-ru`,13 собственных программных блоков и готовые Header/Address-only/FAQ/Footer.13 функций композиции не превращены в13 редакторов/записей блоков. Figma и опубликованная библиотека при переносе не менялись.
- Page.content ACCOUNT1.0.0: H1, четыре исходных абзаца введения, B2C loginUrl,14 фиксированных image slots, FAQ. У13 изображений есть caption, у appScreen его нет. SEO редактируется в существующем редакторе. Условия, инструкции, суммы и сроки остаются CODE; телефоны подключения/поддержки общие для сайта.
- `/templates/account` и защищённый GET/PATCH `/admin/sites/:siteId/account`: fresh working data, serializable expectedWorkingRevision/409, safe incomplete draft, no autosave/publication. Поддержаны unsaved navigation, FAQ add/delete/reorder/focus, insertion только SITE-кодов FAQ и recovery link к разрешённому полю. Published view использует actual serving publication, недоступность не маскируется SQL fallback.
- Миграции0066/0067 добавляют Page/SEO kind и site-scoped working page. Глобальный scope constraint обновлён; действуют partial unique и canonical check, защита City/Page/Redirect collision. Seed создаёт тот же минимум на свежей БД и не переписывает authored ACCOUNT/SEO. Immutable publications не меняются.
- ACCOUNT опционален для исторических snapshots. Старый snapshot сохраняет прежние маршруты; новый добавляет ровно+1. Astro/SEO/sitemap/publication используют один inventory.
- GLOBAL FLOW2 получает source из serving catalog, нормализует выбранный дом, определяет фактический город вместе с регионом и связывает global page/city/addressCheck. Вымышленная Казань не передаётся. Source CITY/null/foreign нельзя переиспользовать; callback/tariff/configuration-привилегии не добавлены.
- Одни renderers/стили для public и sandbox preview. В preview внешний эффект отключён, все FAQ можно прочитать. Для адресной формы выделены общие существующие стили HomeAddressFormStyles; остальные страницы сохраняют прежние правила.

## Изображения и зависимости

Сохранены точные14 raster assets из high-fidelity Figma context и готовые store badges/лампочка. В репозитории нет временных Figma URL. [Реестр и SHA256](evidence/2026-11-05-account-implementation/assets.json). App screen содержит JPEG с SEFT trailer; расширение исправлено на `.jpg`, исходные bytes не перекодировались.

Перед sealing artifact gate проверяет14 уникальных слотов, разрешённый HTTPS host/путь, публичные DNS/IP с pinning, отсутствие redirects, MIME,10MiB/20MP/single-frame, полный Sharp decode и SHA256 в имени. Удалённое изображение копируется под immutable artifact prefix; повторяемая сборка не зависит от дальнейшей замены исходного URL. Ошибка нового файла не переписывает прежний HTML/artifact. Загрузчик медиа CMS не добавлен: редактор получает подготовленную постоянную ссылку.

Для явного decoder dependency закреплён Sharp0.35.5. Совместимые patch overrides устранили обнаруженные high advisories Sharp/Vite/Zod/Undici ([#513](https://github.com/Celtoman/astro-telekom/issues/513)); manifests и lockfile изменены вместе. Свежий `pnpm audit --audit-level=high`:0 high/critical,7 low/8 moderate. Это результат проверки lockfile на дату запуска. Оставшиеся15 entries вынесены в отдельный разбор [#515](https://github.com/Celtoman/astro-telekom/issues/515), в ACCOUNT не исправляются автоматически.

## Проверки и результаты

| Область | Проверено | Результат |
| --- | --- | --- |
| Контракт/API |14 slots,6 FAQ defaults, CODE-only fields, URL/schema, SITE substitution, source matching, positive GLOBAL lead/idempotency, guarded save409, actual-serving published view | PASS |
| PostgreSQL18 | Пустая БД→migrations→seed; existing site→0067; повтор, authored content, другие provider, неизменность publication, save409, City/Page/Redirect collision rollback | PASS |
| Реальные private artifacts | Старый snapshot, новый ACCOUNT, broken image; ровно+1 маршрут, SEO/sitemap,13 placements,14 assets,5 rails,6 FAQ | PASS |
| Декодирование/сеть |14 оригиналов, повреждённый PNG/JPEG, размер/MIME/hash, private DNS, TLS IP pinning, redirect, mixed-case HTTPS bypass regression, repeatable import | PASS |
| Public1440/834/390/320 | Width1360/720/358/288; нет общего X overflow, все images полностью загружены, D оглавление в один ряд | PASS локальной геометрии; визуальная сверка ниже |
| Ленты390/320 |5 лент/18 карточек на каждом размере: wheel/trackpad до конца/обратно, native touch, вертикальный жест после горизонтального, keyboard ArrowRight, без switching buttons | PASS в Chromium touch emulation |
| Навигация/FAQ | Все11hash, Back/прямой hash URL, native FAQ Space open/close; три безопасных tel в FAQ, preview neutralization | PASS проверенных сценариев |
| FLOW2390/320 | Контролируемые TARGET_AVAILABLE/ALTERNATIVES_AVAILABLE/NO_PROVIDERS, technical error/retry, сохранность ввода, GLOBAL source/actual city; без отправки заявки | PASS синтетического runtime |
| CMS |14 src/alt,13 caption,6 initial FAQ; field recovery, save9→10, disabled insertion during save, add/reorder/delete/focus,409 без потери ввода, отказ от unsaved navigation | PASS на intercepted synthetic API, без живых записей |
| Code review | Независимые backend/frontend review, исправлены найденные замечания | PASS финальной сверки исправлений; новых подтверждённых P1/P2 в frontend/backend-коде не найдено |
| Полный gate | pnpm check на итоговом коде | PASS:956 passed/0 failed/1 skipped, exit0; Windows/Node22.23.2,4 ядра только у дерева gate. Skip — недоступная Windows symlink privilege |
| Linux/non-root ACCOUNT | Old A без ACCOUNT → CMS B с ACCOUNT,14 native decode assets/выдача через Caddy, configuration CODE и restart без API | PASS внутри полного gate |
| Внешний test | exact SHA CI→Coolify→CODE→согласованный CMS snapshot/receipt | CI957/957, deployment finished/healthy, CODE и CMS29 SUCCEEDED; live — [внешний протокол](2026-11-05-account-test-release.md) |

Первый полный gate выявил устаревшие ожидания тестов по числу паспортов/маршрутов/SEO и migration head; они обновлены под явный дополнительный ACCOUNT, без ослабления проверок. В CITY test double добавлен реальный slug запрашиваемого города. Cold Docker runtime rehearsal упёрся в600s build limit при загрузке и экспорте dependency image; повтор построил image, но automatic CODE не завершился; изолированный повтор прежнего полного сценария прошёл2/2. При controlled full gate защищённый диагностический POST подтвердил SUCCEEDED того же CODE после120s ожидания. Точная причина задержки пока не установлена; Итоговый прогон прошёл: pure automatic CODE A95356ms, context CODE83384ms, до успеха ручного POST не было. Бюджет Windows fixture240s, Linux120s. Эти времена меньше120s и не доказывают точную причину предыдущих срывов; production-регресс не подтверждён. Это бюджет fixture, production guards не менялись. Ограничение остановки child по node:test timeout вынесено отдельно в #517. Ни одной ошибке не присвоен допустимый красный baseline.

Доказательства браузера: [геометрия](evidence/2026-11-05-account-implementation/browser/geometry.json), [выравнивания/700/1101/якоря](evidence/2026-11-05-account-implementation/browser/layout-navigation.json), [взаимодействия](evidence/2026-11-05-account-implementation/browser/interactions.json), [CMS](evidence/2026-11-05-account-implementation/browser/cms.json), [FLOW2](evidence/2026-11-05-account-implementation/browser/flow.json). Скриншоты четырёх ширин и CMS находятся рядом. Браузер: headless Edge/Chromium156.0.4314.58 на Windows; viewport height900 для геометрии и850 для жестов. Это эмуляция, не физический iOS/Android и не WCAG/AT certification.

Визуальные исправления при проверке: восстановлена отдельная голубая image panel слева в Business B и правая колонка с отдельной нижней карточкой; Important A единый с лампочкой и исходным делением абзацев; Address-only Tablet сохраняет исходные house/badge; адресные input/button используют общий grid; ширина контента согласована с Header, высота карточек определяется соответствующим рядом. Мокап компактно обрезан, caption отсутствует. Паспорт P11 уточнён: голубая поверхность приостановления — полоса условий, снимок белый; равная высота голубой image panel относится к бизнесу.

Полный gate: [машиночитаемый результат](evidence/2026-11-05-account-implementation/checks.json). На Windows ограничивалась ProcessorAffinity только у запущенного shell/pnpm и его дочерних процессов; Node `availableParallelism=4`. Настройки ОС/Docker и production runtime не менялись.

## Что требуется перед внешней активацией

1. Зелёный полный gate завершён. ACCOUNT-изменения изолированно зафиксированы c2982c7; чужие незакоммиченные документы сохранены.
2. Владелец разрешил push/test-deployment. Exact-SHA CI и Coolify MCP deployment подтверждены; CODE прежнего serving snapshot контролируется по [внешнему протоколу](2026-11-05-account-test-release.md).
3. Полный working diff предъявлен и отдельно согласован: одна новая ACCOUNT с SEO, без чужих изменений. Активирована ревизия29; durable receipt, actual serving id/revision, URL/SEO/media и сохранность прочего каталога фиксируются во внешнем протоколе.

Недостающие `/official-site-domru`, `/faq`, `/proverit-skorost-interneta`, `/{location}/tehpodderzhka` не реализованы и остаются зависимостями публичного выпуска. Их canonical targets сохранены; для поддержки используется существующий выбор города. Реальный вход, платёж, расторжение, установка приложений, звонки и внешние заявки не выполнялись. Полная функциональная приёмка всех внешних/недостающих переходов и решение о реальном трафике остаются за владельцем.
