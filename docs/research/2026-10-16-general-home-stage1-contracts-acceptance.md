# Общая HOME — локальная приёмка этапа 1

Дата: 16 октября 2026 года. Учёт: [#344](https://github.com/Celtoman/astro-telekom/issues/344). Основание: владелец согласовал [план](../plans/2026-10-16-general-home-implementation-plan.md) и поручил выполнить только этап 1 по [утверждённым паспортам](../plans/2026-10-16-general-home-passports-actions-draft.md).

## Результат и границы

- `apps/api/src/general-home-model.ts`: типы данных девяти блоков, неизменяемые схемы/смысловые ключи, лимиты, порядок десяти контентных блоков и метаданные `generalHomeCompositionVersion=1.0.0`, `generalHomeImplementationVersion=general-home-v1`. Версия Hero2.0.0 и CITY_HOME не меняются.
- `apps/api/src/general-home.ts`: чистые `validateGeneralHomeBlock` и `validateGeneralHomeComposition`. Они пока не подключены к записям API, публичному каталогу, preview или publication preflight. Безопасный неполный черновик возвращает пропуски; строгий режим отклоняет пропуски; ошибки содержат свойства block/field/reason и читаются через существующий contentErrorLocation.
- `apps/api/src/general-home-passports.ts` и регистрация в `block-passports.ts`: девять новых APPROVED/1.0.0/PENDING, итого22 паспорта; прежние три READY сохранены. Наличие контракта не означает ACTIVE или наличие renderer.
- `apps/admin/src/lib/block-passport-presentation.mjs`: только совместимость read-only потребителя реестра — home.* относятся к общей главной, для новых PENDING нет ссылки на несуществующий редактор. Формы этапа 4 не создавались.

Нет изменений контроллеров/HTTP-маршрутов, каталога, текущих валидаторов Hero/CITY_HOME, Prisma-схемы/миграций/seed, кода публичных блоков, FLOW, рабочих данных, Figma, deployment или CMS-публикации. Другие этапы не начаты.

## Форма контракта

Фиксированные группы — объекты со смысловыми ключами, а не переставляемые редактором массивы. Порядок свойств объекта не влияет на композицию; ключи проверяются строго. Состав блоков передаётся упорядоченным массивом `{blockType, data}` без системных колонок Prisma. Header/Footer в этот массив не входят.

| Блок | Фиксированные ключи |
| --- | --- |
| B14 metrics | brand_history, network_length, city_wifi, network_uptime |
| B14 evidence | infrastructure, development, research; HTTPS-ссылка/подпись источника внутри research |
| B15 items | speed, fiber, wifi6, movix, connection, support |
| B06b steps | request, appointment, installation, confirmation |
| Movix features | television, search, devices |
| Movix cinemas | kinopoisk, ivi, okko, premier, start, amediateka |
| B16 groups | payments: bonus/promised_payment/autopay; management: app/pause/tariff_builder; smart_home: intercom/cameras/city_wifi |
| FAQ items | Переменный массив question/answer:0–50 черновик,1–50 строгий режим |

SITE-переменные допустимы в заголовках/описаниях, смысловых текстах карточек/показателей/сносок и FAQ по явно заданным путям схемы. UI-подписи, placeholders, alt, assets и URL переменных не допускают. CITY/TARIFF/неизвестные переменные запрещены. Специальная грамматика `<red>` сохранена только у Hero через его существующий валидатор.

Пример результата проверки неполного черновика композиции: `[{block: "home.provider_about", field: "metrics.network_length.value"}]`. В строгом режиме тот же пропуск вызывает ContentValidationError с reason=REQUIRED. Неверные типы/лишние поля/ключи, HTML, служебные символы, опасные URL/credentials, превышения лимитов и неизвестные версии отклоняются и в черновике. Входные объекты не изменяются и не заполняются вымышленными данными.

## Проверки

TDD: первые14 тестов нового suite сначала упали на отсутствии новых контрактов/паспортов. После реализации они прошли. Два дополнительных теста сначала обнаружили пропуск sparse arrays и отсутствие структурированной диагностики у некорректного Hero во wrapper; после исправления прошли все16. Два теста read-only UI сначала обнаружили неправильную классификацию новых home.*; исправление ограничено существующим представлением реестра.

- `pnpm --filter @provider/api lint` — exit0.
- `pnpm --filter @provider/api build` — exit0; Prisma client сгенерирован из существующей схемы без tracked изменений generated/schema.
- `pnpm --filter @provider/admin lint` — exit0,0 ошибок/предупреждений,2 существующих hints в useUnsavedChanges/admin-api.
- `pnpm --filter @provider/admin build` — exit0,22 страницы. Предупреждение Shiki/CSP не связано с изменённым кодом и не исправлялось в этом этапе.
- `node --test --test-reporter=spec tests/general-home.test.cjs tests/block-passports.test.cjs tests/admin-block-passports-ui.test.mjs tests/block-validation.test.cjs tests/first-screen-editor.test.cjs tests/page-template.test.cjs tests/catalog-variables.test.cjs tests/home-hero-1d.test.cjs tests/publication-validation.test.cjs` — **67/67,0 failures,0 skipped**, включая два PostgreSQL rehearsal прежних миграций в изолированных контейнерах.
- Первый запуск first-screen migration test остановился из-за выключенного Docker. Docker Desktop запущен; полный профильный набор повторён успешно. Рабочая БД не использовалась для rehearsal.

Проверены также локальные ссылки, `git diff --check`, фактический состав реестра и отсутствие изменений следующих этапов. README продолжает корректно описывать runtime HOME из одного Hero; ссылка на актуальные паспорта уже есть. Обновлены block-passports, current-state, api-contracts, architecture, TEST_COVERAGE и документы согласования/плана.

Полный `pnpm check`, внешний save/browser E2E, визуальная проверка Figma/новых публичных блоков и deployment не выполнялись: этот этап ограничен чистыми контрактами и read-only метаданными. Перед push кода потребуется полный gate по правилам проекта. Следующее действие — показать этот результат владельцу; этап 2 не начинать без нового поручения.
