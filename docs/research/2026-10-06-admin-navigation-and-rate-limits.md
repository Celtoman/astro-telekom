# Навигация админки и rate-limit request targets

Дата: 6 октября 2026 года. Согласованный scope — #259 и #260. Рабочий контент владельца не публикуется при выпуске кода.

## Изменения

Разделы админки используют Astro ClientRouter и общий сохраняемый AdminWorkspace React-root. Меню, шапка и publication polling сохраняются, а каждый lazy экран монтируется заново по pathname/query и проверяет свежую сессию и рабочие данные. Совпадающие одновременные GET объединяются; завершённые ответы не кешируются, мутация/401 прекращает объединение старых чтений. Смена пользователя перемонтирует индикатор; изменение component URL после code deployment снимает persistence. Login, lead-access и sandboxed preview сохраняют отдельные документы.

Лёгкий summary и bulk values убирают лишний graph и последовательное чтение телефонов. Cities читает list параллельно с metadata/auth. Variable-catalog получает согласованный typed source context без рендера всех страниц и тарифов; authoritative usages и immutable published evidence сохраняются.

Rate-limit max/key извлекают raw path из HTTP(S) absolute target; origin и absolute targets делят один bucket. До исправления локальный POST login имел limit=300 вместо 5. Реальный TCP regression проверяет строгие лимиты и 429 для login/suggestions/address-check/leads/lead-access, без нормализации dot/percent сегментов.

## Контролируемый browser benchmark

Внешний admin недоступен для встроенного браузера: ERR_BLOCKED_BY_CLIENT. Для сравнения использована локальная production-сборка, read-only копия ответов действующего контура и одинаковая искусственная задержка API 450 ms (variable-catalog 2400 ms). Полезное содержимое — таблица раздела или телефонное поле после auth/data; измеряются resource timings и long tasks. Это контролируемое сравнение, не внешний пользовательский TTI/SLA и не чистое server time.

| Повторный переход, медиана трёх | До, ms | После, ms |
| --- | ---: | ---: |
| Города | 1038 | 590 |
| Значения сайта | 1045 | 573 |
| Тарифы | 572 | 540 |

Итоговые серии после: города 889/588/590, значения 871/573/562, тарифы 560/540/531. В этих сериях по одному long task 50 ms в двух переходах городов; другие переходы без long tasks. Первый визит тарифов в новой вкладке 900 ms, прежняя зафиксированная первая загрузка 798 ms: улучшение холодного старта не доказано, lazy chunks имеют отдельную стоимость. Общая оболочка сохраняется, fresh auth выполняется каждый раз, polling не перезапускается на каждом переходе.

## Функциональный browser smoke

На локальной production-сборке проверены: dirty link cancel; Back cancel/accept и Forward; сохранность значения при отмене; fresh state при возврате; смена fixture пользователя; logout и 401 → login; mobile 390×844, закрытие меню и фокус main. Console errors на итоговой сборке отсутствуют. Early history bridge установлен до router: capture на window target не обгоняет ранее зарегистрированный listener; иначе restoration swap удалял портал диалога. React Aria диалог заменяет native confirm для внутренних переходов; browser beforeunload сохранён для полной перезагрузки.

Изменения fixture не отправлялись на действующий сайт: replay server отклоняет редакционные мутации. Внешний интерактивный E2E и реальный browser Save/import/undo/publish в этой работе не подтверждены; обязательные API/SQL/публикационные regression suites запускаются полным gate.

## Приёмка выпуска

Полный локальный `pnpm check` на итоговом коде: 695/695 tests, exit 0. [Linux CI](https://github.com/Celtoman/astro-telekom/actions/runs/37471585298) завершился успешно для [f70cc16](https://github.com/Celtoman/astro-telekom/commit/f70cc1641023240635d6b2b335017e3afcec2304). Coolify deployment `tyhqld7rvwavmkqrkdsi1e62` завершился на том же exact SHA, контур running:healthy. Деплой уже был запущен к моменту проверки; повторный запуск не создавался. При in_progress внешние адреса кратковременно отвечали 503, после finished снова 200; точная длительность перерыва не измерена. Других активных сессий этого проекта в Codex не найдено.

Read-only HTTP smoke 2026-10-06T13:42:33.324Z: summary 142 bytes вместо прежнего полного graph 27283 bytes; bulk values совпадают с одиночным formatter, оба чтения без admin credential возвращают 401. Три variable contexts (без выбора / Казань / выбранный тариф Казани), включая значения и usages, эквивалентны ответам перед выпуском. Warm median четырёх повторных чтений variable-catalog — 1425 ms; прежний HTTP baseline 2595 ms снят ранее в тот же день и имеет другое время/объём ответа. Это измерение с сетью, без browser render, не чистое server time и не SLA. Новый ответ 188121 bytes: payload не заявляется уменьшенным.

Raw TLS POST пустого DTO address-suggestions: origin и absolute targets оба HTTP 400 с RateLimit-Limit=60. Реальных данных формы и внешнего DaData вызова нет. В production включён draft header format, поэтому проверяется RateLimit-Limit, а не только X-RateLimit-Limit. Полный исчерпывающий счётчик/429 для пяти buckets доказан локальным raw TCP regression.

На действующем контуре сохранены workingRevision=18, publishedRevision=16, publicationId=`cmuwfx7x1000c01l6orbddgpt`, catalogDigest=`d78ad29ac1aec6c466e2a299f553b0592be29331203d3899048abc304e1d745d`. Проверены Title всех 207 городских HOME, SEO catalog соответствует immutable snapshot; новый CODE artifact `fcf1013e9e2e3fe0f1e014123afcdfd039d9b38f4d15513c9ebb017bd89db629` обслуживается, versioned favicon доступен. Новый admin runtime, early history bridge и React-root JS доступны. Bootstrap seed и autodeploy выключены. Рабочий контент владельца не публиковался.

GitHub #259 и #260 закрыты коммитом. Внешний browser E2E остаётся явно непроверенной границей; локальный интерактивный smoke и реальные API/SQL/HTTP проверки перечислены выше.

Astro contract: [ClientRouter и persistence](https://docs.astro.build/en/guides/view-transitions/); также проверен установленный router/swap implementation.

Повторное открытие подробностей publication indicator после перехода проверено в локальном браузере; временные порталы меню/индикатора закрываются на astro:after-swap без перезапуска polling.
