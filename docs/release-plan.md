# План релизов и статус первого MVP

Этот документ группирует работу по релизным границам. Детальный исполнимый план с файлами и проверками находится в [2026-09-07-platform-stabilization-and-mvp.md](plans/2026-09-07-platform-stabilization-and-mvp.md).

## Release 0 — локальный прототип

Статус: **реализован, но с известными ограничениями**.

- Monorepo, Docker Compose, Prisma migrations и seed.
- NestJS API, Bearer-сессии с единым уровнем доступа администратора и CRUD базовых сущностей.
- Статический Astro-сайт для Казани с четырьмя типами контентных страниц, FAQ, тарифными карточками и формой проверки адреса.
- XLS-import городов/тарифов с validate/apply reports.
- Прием лида, deduplication, contract check, delivery attempts, CRM API.
- Static admin/CRM prototypes и worker listeners.

Release 0 не является production release: тестовый gate зеленый, но статический сайт не мультигородской, а admin UI частично имитирует данные. Demo fallback в public build с 7 сентября 2026 требует явного `ALLOW_DEMO_DATA=true` и больше не срабатывает молча при недоступном API.

## Release 1 — безопасный MVP Казани

Цель: один реальный сайт Дом.ру в Казани с достоверным статическим HTML, наблюдаемой публикацией, безопасной обработкой лида и проверенным delivery sandbox.

Условия завершения:

1. Все automated checks green в чистом окружении.
2. Production build блокируется, если API-данные отсутствуют или demo mode включен. — API fail-fast и отдельный явный `ALLOW_DEMO_DATA` покрыты реальными build-тестами; осталось запрещать demo mode во внешних production CI/CD настройках.
3. Импорт тарифов имеет утвержденную полную семантику и не оставляет устаревшие публичные предложения.
4. Rebuild job имеет status/retry и подтвержденный результат HTML.
5. Fallback link безопасно открывает нужную заявку либо удалена из письма.
6. Админский вертикальный поток import -> apply -> rebuild status показывает реальные данные.
7. Real/sandbox contracts coverage, contract API, Tarifnik и email согласованы и проверены.
8. Утверждены меры PII, anti-abuse и retention.

## Release 2 — мультигородской контентный контур

Цель: генерировать опубликованные города, сервисные страницы и карточки тарифов из CMS-модели без hardcoded Казани.

Нужны: маршруты Site/City/Page/Tariff, sitemap из published data, 301 redirects, полноценная модель публикации, статусы preview/rebuild, городская навигация и QA generated HTML.

## Release 3 — управляемая CMS и эксплуатация

Цель: дать редактору управляемые версии, шаблоны/блоки, аудит, историю импортов и эксплуатационные панели без demo UI.

Нужны: versioning, audit log, media, SEO validation, analytics, управление учетными записями администраторов без ролевой модели, policy-driven PII retention, monitoring, backup/restore и CI/CD.

## Внешние зависимости

До Release 1 требуется решение владельца продукта и внешних сторон по: contract Tarifnik, разрешенным полям/обратным статусам, правомерности передачи PII, срокам хранения, доменам/бренду, production deployment provider и rules for full tariff snapshot. Эти решения нельзя заменить предположениями в коде.
