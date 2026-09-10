# План релизов и статус первого MVP

Этот документ группирует работу по релизным границам. Детальный исполнимый план с файлами и проверками находится в [2026-09-07-platform-stabilization-and-mvp.md](plans/2026-09-07-platform-stabilization-and-mvp.md).

## Release 0 — локальный прототип

Статус: **реализован, но с известными ограничениями**.

- Monorepo, Docker Compose, Prisma migrations и seed.
- NestJS API, Bearer-сессии с единым уровнем доступа администратора и CRUD базовых сущностей.
- Статический Astro-сайт с dynamic paths для опубликованных городов, страниц и тарифов; в текущей базе опубликована только Казань.
- XLSX-import городов/тарифов с validate/apply reports.
- Прием лида, deduplication, contract check, delivery attempts, CRM API.
- Static admin с рабочими экранами тарифов, городов и заявок, а также worker listeners.

Release 0 не является production release: тестовый gate зеленый, но статический сайт не мультигородской, а часть запланированных admin-разделов еще не реализована. Demo fallback в public build с 7 сентября 2026 требует явного `ALLOW_DEMO_DATA=true` и больше не срабатывает молча при недоступном API.

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
8. Утверждены меры PII, anti-abuse и retention.

## Release 2 — мультигородской контентный контур

Цель: генерировать опубликованные города, сервисные страницы и карточки тарифов из CMS-модели без hardcoded Казани.

Dynamic маршруты City/Page/Tariff, published-only sitemap, городская навигация, одношаговые HTTP 301 с CRUD/hit tracking и multi-city build smoke реализованы. Остаются полноценная модель публикации, статусы preview/rebuild и эксплуатационный QA при фактическом включении новых городов.

## Release 3 — управляемая CMS и эксплуатация

Цель: дать редактору управляемые версии, шаблоны/блоки, аудит, историю импортов и эксплуатационные панели без demo UI.

Нужны: versioning, audit log, media, SEO validation, analytics, раздел «Переменные» с согласованными уровнями наследования, управление учетными записями администраторов без ролевой модели, юридически утвержденный PII retention period для уже реализованного purge, monitoring, backup/restore и CI/CD.

## Внешние зависимости

До Release 1 требуется подтвердить реальные контракты DaData, обоих используемых API Tarifnik (`address/check` и `appeal/create`) и проверки действующего абонента Dom.ru, включая разрешенные поля/обратные статусы и однозначную семантику `contacts`. Также остаются правомерность передачи PII, сроки хранения, домены/бренд, production deployment provider и rules for full tariff snapshot. Эти решения нельзя заменить предположениями в коде.
