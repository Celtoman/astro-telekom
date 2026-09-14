# План релизов и статус первого MVP

Этот документ группирует работу по релизным границам. Детальный исполнимый план с файлами и проверками находится в [2026-09-07-platform-stabilization-and-mvp.md](plans/2026-09-07-platform-stabilization-and-mvp.md).

## Release 0 — локальный прототип

Статус: **реализован, но с известными ограничениями**.

- Monorepo, Docker Compose, Prisma migrations и seed.
- NestJS API, HttpOnly-cookie/совместимые Bearer-сессии с единым уровнем доступа администратора и CRUD базовых сущностей.
- Статический Astro-сайт с dynamic paths для опубликованных городов, страниц и тарифов; в текущей базе опубликована только Казань.
- XLSX-import городов/тарифов с validate/apply reports.
- Прием лида, deduplication, contract check, delivery attempts и доставка в Tarifnik/email fallback.
- Static admin с рабочими каталогами и импортами тарифов/городов, заявками и редиректами; отдельный BullMQ worker обрабатывает доставки, оповещения, пересборки и PII retention.

Release 0 не является production release: тестовый gate зеленый и multi-city static routing реализован, но в текущих данных опубликована только Казань, а управляемые версии, аудит, rollback и часть эксплуатационных панелей отсутствуют. Защищенный внешний test-контур подтверждает deployment-механику, но не означает готовность к реальному трафику. Demo fallback в public build с 7 сентября 2026 требует явного `ALLOW_DEMO_DATA=true` и больше не срабатывает молча при недоступном API.

## Release 1 — безопасный MVP Казани

Цель: один реальный сайт Дом.ру в Казани с достоверным статическим HTML, наблюдаемой публикацией, безопасной обработкой лида и проверенным delivery sandbox.

Условия завершения:

1. Все automated checks green в чистом окружении.
2. Production build блокируется, если API-данные отсутствуют, origin не является чистым HTTPS origin или final SEO output не проходит проверку. API/origin fail-fast, post-build sitemap/raw HTML gate и воспроизводимый первый Coolify bootstrap [#55](https://github.com/Celtoman/astro-telekom/issues/55) подтверждены; внешний production CI/CD не должен разрешать demo mode.
3. Импорт тарифов имеет утвержденную полную семантику и не оставляет устаревшие публичные предложения.
4. Rebuild job имеет status/retry и подтвержденный результат HTML.
5. Fallback link безопасно открывает нужную заявку либо удалена из письма.
6. Админский вертикальный поток import -> apply -> rebuild status показывает реальные данные.
7. Real/sandbox contracts DaData, Tarifnik `address/check`, Dom.ru `contract-asterisked`, Tarifnik `appeal/create` и email согласованы и проверены. Обычная форма и видимая проверка подключения разделены; delivery невозможен без обязательной проверки провайдеров и однозначного `contacts: []`.
8. Срок хранения сырых заявок 180 дней согласован; до реального трафика утверждены оператор, legal basis, политика, согласие/отзыв и правила передачи PII внешним сервисам.
9. `TARIFNIK_UTM_CAMPAIGN` переведен с test-метки на подтвержденное production-значение.
10. Настроен внешний application-aware PostgreSQL backup и подтверждено восстановление в изолированную БД с проверкой schema/migrations и целостности данных.

## Release 2 — мультигородской контентный контур

Цель: генерировать опубликованные города, сервисные страницы и карточки тарифов из CMS-модели без hardcoded Казани.

Dynamic маршруты City/Page/Tariff, published-only sitemap, городская навигация, одношаговые HTTP 301 с CRUD/hit tracking и multi-city build smoke реализованы. Остаются полноценная модель публикации, статусы preview/rebuild и эксплуатационный QA при фактическом включении новых городов.

## Release 3 — управляемая CMS и эксплуатация

Цель: дать редактору управляемые версии, шаблоны/блоки, аудит, историю импортов и эксплуатационные панели без demo UI.

Нужны: versioning, audit log, media, SEO validation, analytics, раздел «Переменные» с согласованными уровнями наследования, управление учетными записями администраторов без ролевой модели, monitoring и автоматизированный deployment pipeline. Базовый backup/restore является условием Release 1; в Release 3 он может быть расширен политиками ротации, мониторингом и регулярными учениями. Для PII purge срок 180 дней уже согласован; юридическая основа и согласие остаются в Release 1.

## Внешние зависимости

Живые test-контракты DaData, обоих API Tarifnik, положительная/отрицательная семантика `contacts` Дом.ру и фактическая доставка синтетического письма Resend подтверждены; полный городской справочник, безопасная retry-политика, HTTP/contract-проверка и persistent outbox обычного уведомления реализованы. Миграция `0015`, worker и ручной retry outbox подтверждены на production-контуре: сохраненное уведомление перешло из `revision 1 / FAILED / HTTP 403` в `revision 2 / SUCCEEDED` с provider ID. До Release 1 остаются правомерность передачи PII, оператор/политика/согласие, production campaign Tarifnik и backup/restore rehearsal. Дополнительных правил Tarifnik по rate limit и SLA владелец не получал; callback отсутствует.
