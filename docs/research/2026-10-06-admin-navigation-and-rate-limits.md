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

Итоговые серии после: города 889/588/590, значения 871/573/562, тарифы 560/540/531. В этих сериях по одному long task 50 ms в двух переходах городов; другие переходы без long tasks. Первый визит тарифов в новой вкладке 900 ms, прежний cold baseline 675 ms: улучшение холодного старта не доказано, lazy chunks имеют отдельную стоимость. Общая оболочка сохраняется, fresh auth выполняется каждый раз, polling не перезапускается на каждом переходе.

## Функциональный browser smoke

На локальной production-сборке проверены: dirty link cancel; Back cancel/accept и Forward; сохранность значения при отмене; fresh state при возврате; смена fixture пользователя; logout и 401 → login; mobile 390×844, закрытие меню и фокус main. Console errors на итоговой сборке отсутствуют. Early history bridge установлен до router: capture на window target не обгоняет ранее зарегистрированный listener; иначе restoration swap удалял портал диалога. React Aria диалог заменяет native confirm для внутренних переходов; browser beforeunload сохранён для полной перезагрузки.

Изменения fixture не отправлялись на действующий сайт: replay server отклоняет редакционные мутации. Внешний интерактивный E2E и реальный browser Save/import/undo/publish в этой работе не подтверждены; обязательные API/SQL/публикационные regression suites запускаются полным gate.

## Приёмка выпуска

Полный gate, exact-SHA CI/deployment и внешний read-only HTTP smoke фиксируются после их завершения. HTTP проверяет summary/bulk guard, эквивалентность трёх variable contexts, сохранность owner working revision и publication snapshot, безопасный edge rate-limit probe без credentials формы/PII.

Astro contract: [ClientRouter и persistence](https://docs.astro.build/en/guides/view-transitions/); также проверен установленный router/swap implementation.

Повторное открытие подробностей publication indicator после перехода проверено в локальном браузере; временные порталы меню/индикатора закрываются на astro:after-swap без перезапуска polling.
