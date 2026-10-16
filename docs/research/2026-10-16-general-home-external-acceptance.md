# Управляемая общая HOME: итоговая приёмка и внешний выпуск

Дата: 16 октября 2026 года. Задача [#344](https://github.com/Celtoman/astro-telekom/issues/344). Все семь этапов [согласованного плана](../plans/2026-10-16-general-home-implementation-plan.md) реализованы и проверены. Автономное поручение владельца разрешает commit, push и deployment. По уточнению D6 в защищённом test-контуре временно допустимы любые FAQ-демоданные; фактические ответы будут позже. Это не утверждение готовности к реальному трафику.

## Выпущенный код и сохранённые данные

Код `240c15a76ff69a201b3d6d26345ac19b13b6f5b8` отправлен в master. Полный локальный `pnpm check` завершился exit0, без failures/skips; числовой baseline ведётся только в [TEST_COVERAGE](../TEST_COVERAGE.md). [Linux CI 38916777920](https://github.com/Celtoman/astro-telekom/actions/runs/38916777920) завершился SUCCESS для этого exact SHA.

Coolify deployment `lrgifv6pzxbcfdhgidunzpq5` завершился `finished` на том же SHA, состояние приложения `running:healthy`. Automatic deployment и bootstrap seed выключены. После deployment CODE завершился `SUCCEEDED` с HTTP200 и активировал artifact `8688732183c31062a7775d6f62c417951065a52c5da8b8a8cccd2ab93acb9893`; renderer `ebeac8a5a1239fa13a6f678fb815d59c89cec53b06a12c60b1ca05b259757025`. Первый bounded-запрос вернул202/UNCERTAIN во время сборки; та же durable-работа завершилась, повторное согласование подтвердило200, новый deployment не создавался.

Readback подтверждает фактическую новую композицию `/`, новый artifact и сохранение рабочей/опубликованной ревизий23/23, publication `cmvb26nmn000401mc1ukxauqi`, digest каталога `1b698c16322ae2402147ba71e769ebefa077661781f4a0cc22d30343ec1c9de6` и digest Hero. Применённая0061 и полная опубликованная композиция уже существовали до этого code deployment. Текущая проверка не записывала CMS-контент и не создавала новую контентную публикацию. Сохранённые две FAQ-демопары оставлены по решению владельца.

## Аудит выполнения семи этапов

| Этап | Реализованный результат | Проверяемые доказательства |
| --- | --- | --- |
| 1. Контракты | Девять схем, фиксированные смысловые ключи, безопасный неполный черновик и строгая готовность, версия состава отдельно от Hero/CITY_HOME | [Контракты и профильные проверки](2026-10-16-general-home-stage1-contracts-acceptance.md); suite general-home |
| 2. API | Site-scoped GET/PATCH десяти блоков, serializable save/revision/audit,409 без частичной записи, SITE-подстановки/usages, snapshot и точная диагностика | [Приёмка API](2026-10-16-general-home-stage2-api-acceptance.md), API/каталог/publication suites в TEST_COVERAGE |
| 3. Данные | Guarded/idempotent0061, сохранение Hero/CITY_HOME и истории публикаций; пустой FAQ по умолчанию, без автоматического заполнения | [PostgreSQL rehearsal](2026-10-16-general-home-stage3-data-acceptance.md), внешние before/after |
| 4. Админка | Десять редакторов, фиксированные массивы, FAQ0–50, переменные, несохранённый ввод, field focus, working/published; девять readiness READY | [Редакторы](2026-10-16-general-home-stage4-editors-acceptance.md), настоящий внешний editor GET и browser smoke |
| 5. Сайт | Header → Hero1d → 2g → B14 → B15 → B06b → Movix → B16 → 2e → B13 → B19 → Footer; один H1, белая основа, trusted assets, точный CSP | [Компоненты](2026-10-16-general-home-stage5-blocks-acceptance.md), [полная локальная приёмка](2026-10-16-general-home-full-acceptance.md), внешний browser/HTTP |
| 6. Действия | Header/B06b FLOW2, inline2e без второй формы, legal с сохранением ввода/фокуса, canonical city intent, B13 и FAQ | Перехваченные заявки без боевой отправки, real browser controls, local event/DOM tests; границы отсутствующих страниц ниже |
| 7. Preview и проверки | Общая композиция/оболочка в sandbox, неактивные controls, точная диагностика неполного блока и восстановление, static artifact test, reviews, общий gate | Full public/preview PNG и JSON, внешний admin iframe/editor, CI и CODE receipt |

## Внешние проверки

[Пакет доказательств](evidence/2026-10-16-general-home-external/README.md) содержит машинные readback и PNG. Главная на1440/834/390/320 содержит десять контентных блоков в согласованном порядке, один H1, белую основу, два текущих FAQ-ответа и не имеет общего горизонтального переполнения. Видимые города24/18/12 соответствуют адаптиву; secondary CTA2g остаётся голубой. Сверка с исходными Screens и одинаковая геометрия public/preview выполнены в локальной интеграционной приёмке. Новый дизайн не вводился; Figma не менялась.

Проверены Header/B06b/мобильное меню → существующий FLOW2, выбранный адрес, подтверждённый городской контекст, действующий режим поддержки абонента и inline-консультация с возвратом из legal. Address/lead POST перехвачены браузером: настоящих заявок, доставки и уведомлений не создавалось. Эти сценарии проверяют клиентское поведение и обработку receipt; новый реальный provider end-to-end не заявляется.

Настоящие административные `/preview` и `/templates/home?kind=HOME` открыты с cookie-сессией. Preview содержит все блоки и отключённые controls. Дополнительный settled capture после `fonts.ready`, decode изображений и возврата в начало подтвердил логотип и все57 видимых изображений. Рабочая/публичная версии остались23. Первоначальный слишком ранний PNG не использован как доказательство отсутствия логотипа.

Основной browser-прогон не зарегистрировал ошибок JavaScript. Отдельный диагностический прогон сохранил console-сообщения локального Kaspersky, изменяющего CSP, и сообщение404 без установленного URL; в его tracked responses/requestsfailed ошибок нет. Эти сообщения не выданы за проверенный дефект приложения. Исходная политика приложения не ослаблялась; SHA inline scripts проверены по фактическому remote HTML отдельно, а локальная сборка проверена браузером с неизменёнными байтами и действующей CSP.

Все68 versioned native assets загружены с внешнего сайта и побайтно соответствуют каноническому Git-manifest; два inline script hash разрешены CSP. `/health/ready` возвращает200, анонимный публичный запрос401. Каталог содержит4018 маршрутов. HTTP-regression по автоматическому правилу первого/последнего canonical slug и самого длинного названия города (`/abinsk`, `/zverevo`, `/bolshaya-subbotikha`) и первой странице тарифа (`/abinsk/giga-300`) возвращает200 с прежней оболочкой. Полный inventory проверен immutable build gate; браузер не обходил все4018 страниц.

## Оставленный отдельный объём

Семь проверенных целей отсутствуют в published inventory и возвращают404: `/movix`, `/faq`, `/contacts`, `/wifi-router` и `/moscow/domru-domashniy-internet`, `/moscow/domru-domashniy-internet-televidenie`, `/moscow/cifrovoe-televidenie-domru`. По D1 создание отсутствующих страниц — отдельный этап; их назначения сохранены и успешное открытие не заявляется. Тематические страницы нужны по согласованной общей городской структуре, Москва не становится выборочным приоритетом.

Акции [#340](https://github.com/Celtoman/astro-telekom/issues/340) и новости [#341](https://github.com/Celtoman/astro-telekom/issues/341) остаются в бэклоге. Подготовка фактического FAQ будет позже по D6. Пользовательское соглашение не менялось. Группа CMS #167 и прежние задачи не закрываются этим выпуском. Следующий документационный commit фиксирует доказательства; обслуживаемый код остаётся exact SHA240c15a7.
