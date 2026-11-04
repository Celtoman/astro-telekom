# Тарифы: внешняя публикация и проверка всего каталога

4 ноября 2026 года, защищенный test-контур. Задача [#495](https://github.com/Celtoman/astro-telekom/issues/495), связанные #491/#468/#492. Реализация — [отдельный отчет](2026-11-04-tariff-contract-implementation.md).

## Результат

Три согласованные коррекции выпущены: явная доступность ТВ-приставки, общий список подписок и отдельная разовая оплата ONT. Миграция 0065 применена, новая публикация активна, рабочая/опубликованная ревизии 28/28. Проверки опубликованных данных, расчета, HTML и интерфейса завершились без ошибок.

- Код: `8b03ab78fbb75e69d60ea18f9de4c05ee5cb5f74`; [CI41897510806](https://github.com/Celtoman/astro-telekom/actions/runs/41897510806) — success.
- Coolify: приложение `jlrsktdos9yhchkgnrd9f5fj`, deployment `gtzfw2gjkfkk2gwcg9ojh1u0`, finished на exact SHA; приложение running:healthy. В логах подтверждены выход migrate до запуска healthy API и запуск web. Агент не повторял миграцию вручную.
- CODE: SUCCEEDED, прежние publication/revision27/catalogDigest сохранены. Штатный machine-only bridge вернул durable receipt; новый заголовок подписок подтвержден в обслуживаемом HTML до CMS.
- CMS: publication `cmw2jk1nr000401p3r0xykg4b`, revision28, SUCCEEDED. Artifact `cc5ba2386039e46e8db6a33ced4600df6023ccb6f1e0b3e76c8a06d7a1fed233`, renderer `f0365e10a02175bbd5fc55e68b0e74f176207cddc3c965e65834efe40820a434`. Receipt согласован с SQL-состоянием и фактически читаемым public catalog.

## Данные и сохранность

Сверены все 3805 активных тарифов 207 городов с подтвержденным переносом.2335 приставок доступны;1470 недоступны, включая 29 тарифов без подтвержденного источника по отдельному решению владельца. Платный выкуп без рассрочки сохранен. Неподтвержденная цена 0 не создает предложение.

Имена, slug, базовые/акционные цены, скорости, подключение и все остальные атрибуты сохранены. HOME, CITY, ADDRESS, глобальные страницы, маршруты и редиректы не изменены этим переносом. История содержит 3805 изменений ревизии 28; последние 100 записей имеют source `migration:0065:tvbox-availability`. Прежний immutable snapshot до CMS остался побайтово эквивалентен исходному public catalog. Архивные 108 записей не включены в текущие маршруты; их сохранность проверена миграционным rehearsal, полного повторного live-чтения архивных полей в этом выпуске не выполняли.

Publication-review: PASSED,4225 URL, issues=[]; новый artifact содержит также 404. Общая библиотека Figma не публиковалась.

## Проверки

| Проверка | Результат |
| --- | --- |
| Все допустимые комплектации фактически опубликованного каталога |25405, независимое сложение сумм, errors=[], warnings=[] |
| Публичный HTTP quote API |347 сценариев для 207 городов, включая 31 ожидаемый отказ; totals/choices/charges/selection/fingerprint совпали |
| Каждая тарифная страница |3805 HTTP200, корректные H1/canonical/описание/цена/условные блоки/оборудование/подписки/услуги/городские ссылки, failures=[] |
| Browser UI |Два тарифа ×1440/834/390/320, первоначальные суммы и смена выкупа; переполнений, pageerror и ошибочных API-запросов нет |
| Защита/доступность |Семь публичных/admin URL без авторизации 401; authorized health200; HSTS/nosniff и test noindex сохранены |
| Общий gate |Локальный pnpm check:931 passed,0 failed,1 Windows skip; exact-SHA CI success. Runtime-код при live-проверке не менялся |

На [тарифе Тольятти](https://tv-internet-dom.ru/tolyatti/giga-300) калькулятор показывает 800 ₽/мес и 5900 ₽ разово:1000 подключение+4900 ONT. Выкуп роутера 3590 ₽ увеличивает только разовый итог до 9490 ₽. На [тарифе Бердска](https://tv-internet-dom.ru/berdsk/giga-300-movix-zasmotris-3-hd) приставка 4950 ₽ предлагается без рассрочки; итог 1001+4950=5951 ₽, абонплата 1630 ₽ не меняется. Эти суммы относятся к данным текущего снимка.

## Визуальная граница и находка

Проверен текущий шаблон сайта после трех коррекций; полный перенос нового дизайна T01–T06 из Figma остается отдельным этапом. Проверка не объявляет соответствие всего существующего сайта новым макетам. На 320 подпись видеонаблюдения переносит «мес.» после «₽/»; косметическая находка [PF-179](../product-findings.md#pf-179--разрыв-единицы-оплаты-в-подписи-видеонаблюдения-на-320-px) записана отдельно, CSS не менялся. Это не ошибка суммы или доступности.

Реальные заявки, внешняя доставка, keyboard/AT и полная WCAG-приемка этим прогоном не проверялись. Готовность к реальному трафику по правилам прототипа определяет только владелец.

## Доказательства и повторение

[Сводка](evidence/2026-11-04-tariff-contract-release/checks.json), [деплой](evidence/2026-11-04-tariff-contract-release/deployment.json), [миграция](evidence/2026-11-04-tariff-contract-release/migration-verification.json), [CODE receipt](evidence/2026-11-04-tariff-contract-release/code-receipt.json), [CMS receipt](evidence/2026-11-04-tariff-contract-release/cms-receipt.json), [состояние после публикации](evidence/2026-11-04-tariff-contract-release/after-publication-state.json), [все расчеты](evidence/2026-11-04-tariff-contract-release/all-combinations.json), [API](evidence/2026-11-04-tariff-contract-release/live-api.json), [HTML](evidence/2026-11-04-tariff-contract-release/live-html.json), [браузер](evidence/2026-11-04-tariff-contract-release/browser-validation.json), [защита](evidence/2026-11-04-tariff-contract-release/security-health.json), [каталог публичного домена](evidence/2026-11-04-tariff-contract-release/public-source-verification.json).

Скрипты проверки и PNG находятся в том же каталоге доказательств; исходные полные каталоги/кейсы — в `D:/Temp/tariff-contract-release`. `verify-live.py <expected-pages.json> html` и `verify-live.py <api-cases.json> api` выполняют только чтение/quote. HTTP connections переиспользуются, gzip распаковывается перед HTMLParser; до 8 параллельных статических GET, quote последовательно с паузой не менее 0.4 с между стартами. Реальные Lead/address endpoints не вызываются. Учетные данные читаются только из исключенного `.env`, в доказательства не входят.

Предыдущие deployments `h5drs2mcpjit4nl3ze7iulnx` и `fyo1flt6izzuxnfoniqq3iin` были отменены владельцем. После уточнения «Пока остановить внешние изменения» агент остановился; последующее «Деплой прошел, проверяй» возобновило согласованный цикл. Третий deployment запущен через UI. Миграция и публикация подтверждены после восстановления;503 из предыдущей проверки больше не является текущим состоянием.
