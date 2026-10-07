# Текущее состояние проекта

Сверка: 7 октября 2026 года. Статус — **прототип с защищённым внешним test-контуром**. Только владелец определяет готовность к реальному трафику. Наличие кода, успешная локальная проверка и внешняя приёмка — разные виды доказательств.

Этот документ описывает действующую реализацию и её ограничения. Целевое поведение задаёт [продуктовый контракт](product-contract.md), следующую очередь — [план релизов](release-plan.md), механические статусы работ — [GitHub Issues](https://github.com/Celtoman/astro-telekom/issues). Датированные SHA, deployment IDs и измерения сохраняются в [исследованиях и приёмках](research/README.md).

## Последняя подтверждённая приёмка

Код f70cc16 (#259/#260) прошёл локальный gate, Linux CI и exact deployment; контур running:healthy. Рабочая ревизия 18 и опубликованный snapshot 16 сохранены, Title всех 207 городских HOME и новые API проверены внешним read-only HTTP smoke. Интерактивная навигация проверена локально; внешний browser E2E недоступен. [Доказательства](research/2026-10-06-admin-navigation-and-rate-limits.md).

## Датированные приёмки публикации

На защищённом test-контуре код `215cf652315cc27c2eb0ab20e4594828628237a8` прошёл Linux CI и exact deployment. Автоматический CODE-release сохранил обслуживаемую версию; две ручные CMS-публикации завершились без redeploy за 141 и 117 секунд. По итогам проверки рабочая и опубликованная ревизии равны 16, исходный Title восстановлен на всех 207 городских HOME. Это датированное измерение, а не SLA или постоянное значение каталога. [Доказательства и границы](research/2026-10-06-publication-progress-and-recovery.md).

Отдельно подтверждены [одна синтетическая sales-заявка](research/2026-09-25-release-one-synthetic-lead-acceptance.md), [снимок атрибуции](research/2026-09-25-lead-attribution-acceptance.md), [первые экраны и ручной review](research/2026-10-06-manual-publication-rollout.md). Внешняя интерактивная приёмка в браузере не заменяется HTTP smoke или локальным browser smoke на fixtures.

## Реализовано и остаётся

| Область | Текущая реализация | Ограничения и следующий объём |
| --- | --- | --- |
| Инфраструктура | pnpm monorepo; PostgreSQL/Redis; API readiness; Coolify Compose; separate migration/runtime images; CI запускает `pnpm check`. | Migration target прямого prod Compose исправлен и проверен на отдельной PostgreSQL 18: все миграции и точный повтор (#236). Полный direct stack не проверен. Локальная transient-блокировка Docker context — [#251](https://github.com/Celtoman/astro-telekom/issues/251). |
| Данные и запуск | Единственная Prisma schema и клиент `apps/api/generated`; 59 миграций до `0059_callback_optional_city`. Миграции выполняются до API. | Seed проходит свежую PostgreSQL 18 и publication preflight; атомарен, повторный запуск сохраняет данные и credentials. Примеры тарифов — DRAFT без цен. На действующем test-контуре seed выключен. |
| Доступ | HttpOnly-cookie admin session; защищённые admin/machine/worker routes; login rate limit, CORS и noindex; внешний test-контур закрыт Basic Auth. | Dependency audit после #258 — без advisory entries; origin/absolute HTTP request targets используют одинаковые специализированные buckets (#259). Нет scoped service accounts и полного read-only Agent diagnostics API: [#34](https://github.com/Celtoman/astro-telekom/issues/34). |
| Города | Канонический XLSX-справочник; формы топонимов, office state, subscriber profile; поиск, фильтры, cursor-list, create/edit, readiness, slug/301, архив и восстановление в DRAFT. HOME связана с общим CITY_HOME template. | Индивидуальные city content/SEO override не используются. Координат и географической карты нет; coverage проверяется по адресу. |
| Тарифы | Строгий 37-колоночный full-snapshot XLSX; validate/apply/guarded undo; серверная business identity; ручной редактор, цены, комплектация, availability, archive/purge/slug/301. | Новые тарифные/сервисные листинги находятся за пределами Release 1. |
| Public web | Static Astro из authoritative inventory `N + T + 6`; общая главная, все опубликованные city HOME, tariff detail, пять общих страниц, отдельная noindex-404. Sitemap index и redirects используют тот же снимок. | Service pages остаются данными без detail URL. Schema.org Product/FAQ/Organization не реализована; имеется базовый WebPage. |
| Публикация | Save → рабочая ревизия/audit → review всех URL → ручной immutable snapshot → Astro/SEO build → атомарная активация Caddy → durable receipt и SQL acknowledgment. Progress, счётчики, elapsed и recovery сохраняются; ETA требует три сопоставимых успеха. | Coolify CMS не делает redeploy приложений; код выпускается отдельно и сохраняет обслуживаемый snapshot. Расписания нет. Старые artifacts/assets сохраняются; GC не реализован. Полный [контракт](publication.md). |
| Главные страницы и CMS | HOME Hero; CITY_HOME Hero + Figma B04 тарифы. Редакторы `/templates/home` и `/templates/tariffs`, 13 read-only паспортов (три APPROVED/1.0.0, десять DRAFT). «Страницы» объединяет шаблоны и отдельные паспорта; старые блоки скрыты миграцией 0058 с before/after историей. | Будущие Figma-блоки добавляются отдельно; Header и девять блоков tariff detail остаются CODE/DRAFT. Функциональные страницы — [#194](https://github.com/Celtoman/astro-telekom/issues/194). |
| Preview | `/templates/tariff` использует программный typed tariff renderer и диагностику комплектации. Общий `/preview` показывает рабочий Release 1 catalog в sandboxed iframe с desktop/tablet/mobile режимами. Hero-факты, карточки и detail используют общий tariffView; Hero-факты вычисляются общим heroFacts только из ACTIVE-тарифов. Все семь сохранённых настроек tariff_grid, состав и сортировка тарифов и versioned legal-тексты совпадают с витриной. | HTML preview остаётся отдельным безопасным renderer; состав заголовков всех Release 1 страниц сверяется с реальной Astro-сборкой. CSS, шрифты и штатные изображения берутся из публичных исходников при сборке admin. Формы, навигация, поиск и расчёт комплектации отключены; это визуальная проверка, а не E2E действий сайта. |
| SEO и переменные | Восемь SEO/OG-шаблонов, all-URL resolution, noindex/sitemap; legacy SEO-колонки удалены. Телефоны Site; 11 ACTIVE typed codes; рабочий/опубликованный usage; cursor insertion в SEO, promoText, двух Hero и заголовке/описании тарифного блока; guarded migration API DEPRECATING → replacementCode. | Переходы из usage заголовка/описания двух Hero и тарифного блока открывают соответствующий текущий рабочий редактор с site context, включая исторический published BLOCK. Нет согласованной реальной пары замены и интеграции будущих полей: [#190](https://github.com/Celtoman/astro-telekom/issues/190), родитель [#166](https://github.com/Celtoman/astro-telekom/issues/166). |
| Адрес | Глобальный DaData suggest/clean, мягкий IPLocate boost, фактический город/регион адреса, официальный Tarifnik address/check; source-город не ограничивает поиск. | Недоступная интеграция возвращает честную ошибку/ручной маршрут, не ложное подтверждение coverage. |
| Заявки | Публичные bounded DTO, honeypot/rate limit/dedup, AddressCheck, configuration/consent/reason/comment/attribution snapshots. Фоновая цепочка DaData Phone → contract check → routing → Tarifnik/email, persistent attempts/history и безопасные ручные retry. | Внешние результаты интеграций не подменяются наличием env. Дополнительная legal-проверка [#144](https://github.com/Celtoman/astro-telekom/issues/144) остаётся P3 вне milestone Release 1 и не является условием решения о трафике. |
| Worker и retention | BullMQ decision/delivery/notification/rebuild; минутный reconciler и ежедневный PII purge. Согласованный срок сырых заявок 180 дней. Только API пишет в PostgreSQL. | Без Redis rebuild остаётся PENDING; process-local lead fallback теряется при restart. `tariff-imports` listener не имеет producer и не участвует в текущем импорте. |
| Admin и наблюдение | React-roots, Tailwind/shadcn и React Aria; каталоги/импорты, лиды, redirects/hits, audit detail, trash, first-screen/SEO editors, публикация и fallback-доступ. | Trash выдаёт bounded группы; универсального per-entity rollback, media/analytics/monitoring panels и error tracker нет. |

## Контракт данных и публикации

Только API пишет в PostgreSQL. Admin, public browser и worker используют HTTP. Сохранение меняет рабочую ревизию и audit, но не опубликованный сайт. Ручная публикация выпускает весь сохранённый снимок, включая города, тарифы, тексты и SEO.

В Coolify public HTML, runtime redirects, quote/address/lead API следуют exact обслуживаемому снимку из доверенного Caddy/controller context. Успех подтверждается durable receipt и независимой сверкой SQL; потерянный activation outcome сохраняет ту же rebuild job для восстановления. Code deployment пересобирает уже обслуживаемый snapshot новым renderer, не публикуя черновики.

Public content общих страниц ещё разрешается Provider → Site → Page, городской HOME — через общий PageTemplate. Legacy deep merge удаляется только после переноса всех непустых значений и проверки эквивалентности; SEO override cleanup уже завершена отдельно.

## Проверки и окружение

Control GET/POST публикации используют отдельные HTTP-соединения через `Connection: close`, чтобы config reload Caddy не оставлял readback на прежнем admin socket (#262). ETag CAS, проверка serving/manifest, durable receipt и восстановление UNCERTAIN сохранены; подробности в [контракте публикации](publication.md).

Точный baseline и назначение suites находятся только в [TEST_COVERAGE.md](TEST_COVERAGE.md). Зелёный demo build доказывает сборку кода, но не доступность живого каталога, правильность seed или внешний browser E2E. Проверки публикации используют настоящие PostgreSQL/Redis/Nest HTTP/Astro/Caddy; внешние отправки проверяются отдельно с синтетическими данными.

Переменные и операционные команды ведутся в [deployment.md](deployment.md), структура — в [site-structure.md](site-structure.md), HTTP — в [api-contracts.md](api-contracts.md), worker — в [worker.md](worker.md). Отсутствующая конфигурация, ошибка или недоступное evidence не означают нулевые данные или успешную проверку.

Bootstrap нового контура проверен на свежей БД и повторном запуске; реальные условия тарифов требуется импортировать перед их публикацией. Действующий Coolify-контур не следует переинициализировать ради этого. Packaging-дефект #236 исправлен и проверен migration rehearsal; полный direct stack не проверен.

## Навигация админки после #260

Разделы админки используют Astro ClientRouter и общий сохраняемый AdminWorkspace React-root. Меню, шапка и publication polling сохраняются, а каждый lazy экран монтируется заново по pathname/query и проверяет свежую сессию и рабочие данные. Совпадающие одновременные GET объединяются; завершённые ответы не кешируются, мутация/401 прекращает объединение старых чтений. Смена пользователя перемонтирует индикатор; изменение component URL после code deployment снимает persistence. Login, lead-access и sandboxed preview сохраняют отдельные документы. Контролируемый локальный browser smoke не заменяет внешний E2E; [приёмка #259/#260](research/2026-10-06-admin-navigation-and-rate-limits.md).

### Контракт #193 в текущем коде

Старый каталог, опубликованный до композиции 2.0.0, проецируется из строго известной семиблочной последовательности в Hero + новый тарифный блок; исходный immutable snapshot не меняется. Неизвестный состав отклоняется. Миграция 0058 повышает только рабочую ревизию и сохраняет скрытые PageTemplateBlock и их прежние данные в аудите. CODE пересобирает обслуживаемый snapshot, не публикуя рабочие изменения владельца. Внешнее применение подтверждается отдельной проверкой exact-SHA deployment.


### Проверка публикации: уточнение 7 октября 2026

Реализовано исправление #264/#265: совместимость старого тарифного блока служебных страниц и структурированная диагностика до рендера. Карточки ошибок публикации показывают шаблон/блок/поле, причину и переход к действующему редактору; подробный контракт — [publication.md](publication.md). Доказательства приёмки exact-SHA и сохранности рабочих данных ведутся в [#265](https://github.com/Celtoman/astro-telekom/issues/265).


Внешняя приёмка #265 на code commit ed6a415e2b0b2fdc4b4d62118e2bd4e267975976 подтверждена 7 октября: CI зелёный, Coolify deployment kdalqnben5mouvxqsjcbi24u finished/healthy, новый CODE-артефакт активен. Последовательная проверка рабочей ревизии 20 прошла 4018 URL без ошибок/предупреждений; preview доступен, все настройки блоков и immutable publication ревизии 16 сохранены. CMS-публикация рабочих изменений не выполнялась. Отдельный нерешённый отказ HTTP 500 при параллельных чтениях зарегистрирован в [#266](https://github.com/Celtoman/astro-telekom/issues/266); устойчивость этого режима приёмкой не подтверждена.

## Figma: B04, O01, FLOW 1 / FLOW 2

В коде перенесены семантические токены и связанные состояния всей выбранной библиотеки для тарифных карточек, выбора города и двух сценариев. B04 сохраняет опубликованный каталог и паспорт; O01 использует опубликованные города, региональную и популярную группы. FLOW 1 сохраняет консультацию оператору без адреса и, на общей главной, без города. FLOW 2 сохраняет положительный адресный gate, явное согласие и не содержит комментария. Документы открываются внутри модалки с возвратом к форме. Реальный телефон поддержки и обещание 15 минут сохранены. Заявки без города честно подписаны в журнале, карточке и оповещении. Протокол локальной проверки и внешнего rollout — [приёмка Figma](research/2026-10-07-figma-flows-acceptance.md); статус исполнения — [#268](https://github.com/Celtoman/astro-telekom/issues/268).
