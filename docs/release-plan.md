# План релизов и статус первого MVP

Этот документ группирует работу по релизным границам. Детальный исполнимый план с файлами и проверками находится в [2026-09-07-platform-stabilization-and-mvp.md](plans/2026-09-07-platform-stabilization-and-mvp.md).

## Release 0 — локальный прототип

Статус: **реализован, но с известными ограничениями**.

- Monorepo, Docker Compose, Prisma migrations и seed.
- NestJS API, HttpOnly-cookie/совместимые Bearer-сессии с единым уровнем доступа администратора и CRUD базовых сущностей.
- Статический Astro-сайт с Release 1 route inventory, страницей каждого опубликованного города и detail каждого опубликованного тарифа этого города; service detail сохранены как будущие данные без URL.
- XLSX-import городов/тарифов с validate/apply reports.
- Прием лида, deduplication, contract check, delivery attempts и доставка в Tarifnik/email fallback.
- Static admin с рабочими каталогами и импортами тарифов/городов, заявками и редиректами; отдельный BullMQ worker обрабатывает доставки, оповещения, пересборки и PII retention.

Release 0 не является production release: тестовый gate и multi-city static routing реализованы, но управляемые версии, аудит, rollback и часть эксплуатационных панелей отсутствуют. Защищенный внешний test-контур подтверждает deployment-механику, но не означает готовность к реальному трафику. Demo fallback в public build требует явного `ALLOW_DEMO_DATA=true` и больше не срабатывает молча при недоступном API.

## Release 1 — минимальный публичный запуск

Цель: один реальный партнерский сайт Дом.ру с достоверным статическим HTML для каждого опубликованного города, наблюдаемой публикацией, безопасной обработкой лида и проверенным delivery sandbox. Казань остается тестовым городом раннего этапа, но больше не определяет структуру релиза.

Публичный состав фиксирует [каноническая структура сайта](site-structure.md): `/`, `/{location}` для каждого города канонического импорта, `/{location}/{tariffSlug}` для каждого опубликованного тарифа опубликованного города, карта покрытия, города обслуживания, три legal-страницы и общий шаблон 404. При `N` опубликованных городов и `T` их опубликованных тарифов это `N + T + 6` обычных HTML-маршрутов. Остальные контентные и service pages относятся к следующим релизам, даже если записи уже есть в базе.

Условия завершения:

1. Публичный output, sitemap, внутренние ссылки и redirects соответствуют exact составу `N + T + 6`; переход на городскую структуру, live-приемка HTTP 404 и возврат тарифных страниц завершены в [#136](https://github.com/Celtoman/astro-telekom/issues/136), [#141](https://github.com/Celtoman/astro-telekom/issues/141) и [#149](https://github.com/Celtoman/astro-telekom/issues/149). Последний live inventory — 207 городов, 3 859 тарифов и 4 072 уникальных URL. Дублированные записи `HOME`, не создающие дополнительных маршрутов, отдельно отслеживаются в [#150](https://github.com/Celtoman/astro-telekom/issues/150).
2. Все automated checks green в чистом окружении.
3. Production build блокируется, если API-данные отсутствуют, origin не является чистым HTTPS origin или final SEO output не проходит проверку. API/origin fail-fast, post-build sitemap/raw HTML gate и воспроизводимый первый Coolify bootstrap [#55](https://github.com/Celtoman/astro-telekom/issues/55) подтверждены; внешний production CI/CD не должен разрешать demo mode.
4. Импорт тарифов имеет утвержденную полную семантику и не оставляет устаревшие публичные предложения.
5. Rebuild job имеет status/retry и подтвержденный результат HTML.
6. Fallback link безопасно открывает нужную заявку либо удалена из письма.
7. Админский вертикальный поток import -> apply -> rebuild status показывает реальные данные.
8. Real/sandbox contracts DaData, Tarifnik `address/check`, Dom.ru `contract-asterisked`, Tarifnik `appeal/create` и email согласованы и проверены. Обычная форма и видимая проверка подключения разделены; delivery невозможен без обязательной проверки провайдеров и однозначного `contacts: []`.
9. Срок хранения сырых заявок 180 дней согласован; до реального трафика утверждены оператор, legal basis, политика, согласие/отзыв и правила передачи PII внешним сервисам.
10. `TARIFNIK_UTM_CAMPAIGN` переведен с test-метки на подтвержденное production-значение.
11. Настроен внешний application-aware PostgreSQL backup и подтверждено восстановление в изолированную БД с проверкой schema/migrations и целостности данных.

## Release 2 — расширенный контентный контур

Цель: добавить городские тарифные, сервисные и прочие страницы из полной структуры без hardcoded Казани и без нарушения release-aware публикации.

City HOME, published-only Release 1 sitemap, глобальная навигация, одношаговые HTTP 301 с CRUD/hit tracking и multi-city build smoke уже подчиняются явной релизной политике. Перед Release 2 эту policy нужно расширить отдельным решением, а не возвращать автоматическую публикацию всех `Page`/`Tariff` со статусом `PUBLISHED`.

## Release 3 — управляемая CMS и эксплуатация

Цель: дать редактору управляемые версии, шаблоны/блоки, аудит, историю импортов и эксплуатационные панели без demo UI.

Нужны: versioning, audit log, media, SEO validation, analytics, раздел «Переменные» с согласованными уровнями наследования, управление учетными записями администраторов без ролевой модели, monitoring и автоматизированный deployment pipeline. Базовый backup/restore является условием Release 1; в Release 3 он может быть расширен политиками ротации, мониторингом и регулярными учениями. Для PII purge срок 180 дней уже согласован; юридическая основа и согласие остаются в Release 1.

## Внешние зависимости

Живые test-контракты DaData, обоих API Tarifnik, положительная/отрицательная семантика `contacts` Дом.ру и фактическая доставка синтетического письма Resend подтверждены; полный городской справочник, безопасная retry-политика, HTTP/contract-проверка и persistent outbox обычного уведомления реализованы. Миграция `0015`, worker и ручной retry outbox подтверждены на production-контуре: сохраненное уведомление перешло из `revision 1 / FAILED / HTTP 403` в `revision 2 / SUCCEEDED` с provider ID. До Release 1 остаются правомерность передачи PII, оператор/политика/согласие, production campaign Tarifnik и backup/restore rehearsal. [#144](https://github.com/Celtoman/astro-telekom/issues/144) и [#145](https://github.com/Celtoman/astro-telekom/issues/145) сознательно отложены владельцем, поэтому родительская [#31](https://github.com/Celtoman/astro-telekom/issues/31) остается открытой. Изменение production campaign Tarifnik не входит в автономную работу агента и требует отдельного решения владельца. Дополнительных правил Tarifnik по rate limit и SLA владелец не получал; callback отсутствует.
