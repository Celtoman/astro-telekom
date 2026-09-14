# Технический долг — индекс

Дата последней сверки реестра с GitHub: 14 сентября 2026 года. **Полное описание каждой проблемы (доказательство, влияние, следующее действие) живёт в GitHub Issue, не здесь** — эта таблица дублировала текст до 8 сентября 2026, что и было источником рассинхронизации; теперь она только индекс. Как устроена вся система — [docs/task-management.md](task-management.md).

Приоритеты: P0 — блокирует безопасный запуск или ведет к недостоверным данным; P1 — нарушает ключевой путь первого релиза; P2 — существенно ограничивает эксплуатацию; P3 — улучшение качества и поддерживаемости.

**Статус ведётся в GitHub Issues** (репозиторий `Celtoman/astro-telekom`, label `tech-debt` + приоритет). 🟢 — open, ✅ — closed. Актуально на момент чтения этой таблицы issue может отличаться от статуса ниже — сверяться по ссылке, не по этому файлу, если нужен текущий статус.

## P0

| ID | Issue | Суть |
| --- | --- | --- |
| TD-01 | [#1](https://github.com/Celtoman/astro-telekom/issues/1) ✅ | Test-double синхронизирован с контроллером, добавлены сценарии дубликатов; release gate зеленый |
| TD-02 | [#2](https://github.com/Celtoman/astro-telekom/issues/2) ✅ | HMAC-ссылка заменена серверным одноразовым token с TTL, отзывом и admin UI |
| TD-03 | [#3](https://github.com/Celtoman/astro-telekom/issues/3) ✅ | Demo-data требуют явного флага; policy и final HTML защищены тестами [#4](https://github.com/Celtoman/astro-telekom/issues/4) |
| TD-96 | [#121](https://github.com/Celtoman/astro-telekom/issues/121) ✅ | Публичные формы восстановлены после CSP-регресса; исполняемый код собирается first-party bundle, а final HTML проверяет каждый оставшийся inline hash |
| TD-100 | [#129](https://github.com/Celtoman/astro-telekom/issues/129) ✅ | Legacy hero CTA с конечным слэшем нормализован идемпотентной data migration до строгой runtime-публикации |
| TD-101 | [#130](https://github.com/Celtoman/astro-telekom/issues/130) ✅ | Production HOME/INTERNET Казани сохраняют неполный legacy PageBlock snapshot вместо нового прототипа |

## P1

| ID | Issue | Суть |
| --- | --- | --- |
| TD-04 | [#5](https://github.com/Celtoman/astro-telekom/issues/5) ✅ | Базовый public catalog и multi-city static paths; текущая Release 1 policy дополнительно ограничивает маршруты |
| TD-05 | [#6](https://github.com/Celtoman/astro-telekom/issues/6) ✅ | Persistent rebuild-job: dedupe, BullMQ retry/backoff, API-статус и финальный результат provider |
| TD-06 | [#7](https://github.com/Celtoman/astro-telekom/issues/7) ✅ | Full-snapshot import атомарно удаляет отсутствующие тарифы, требует подтверждения warnings и создает redirects при ручной смене URL |
| TD-07 | [#8](https://github.com/Celtoman/astro-telekom/issues/8) ✅ | Redirect CRUD, conflict/one-hop validation, build-generated Caddy routing, runtime HTTP 301 и hit tracking |
| TD-08 | [#9](https://github.com/Celtoman/astro-telekom/issues/9) ✅ | Demo UI заменен реальными экранами тарифов, городов и заявок по [docs/admin-design-system.md](admin-design-system.md) |
| TD-09 | [#10](https://github.com/Celtoman/astro-telekom/issues/10) ✅ | Реализованы HttpOnly-cookie login/me/logout и auth-gated React shell; browser service-token удален |
| TD-10 | [#11](https://github.com/Celtoman/astro-telekom/issues/11) ✅ | Защищенный release configuration gate блокирует готовность при пустых Contract/Tarifnik/coverage/email/rebuild variables без раскрытия значений |
| TD-21 | [#12](https://github.com/Celtoman/astro-telekom/issues/12) ✅ | Уязвимый `xlsx@0.18.5` заменен на `read-excel-file`; импорт принимает только ограниченный XLSX |
| TD-22 | [#37](https://github.com/Celtoman/astro-telekom/issues/37) ✅ | Compose переведен на обязательный для PostgreSQL 18 volume mount `/var/lib/postgresql` |
| TD-23 | [#38](https://github.com/Celtoman/astro-telekom/issues/38) ✅ | Seed использует явный ESM entrypoint сгенерированного Prisma client и снова запускается на Node 22 |
| TD-24 | [#39](https://github.com/Celtoman/astro-telekom/issues/39) ✅ | City import использует transaction-local maps, атомарное создание HOME с блоками и проходит полный пакет 207 строк |
| TD-25 | [#40](https://github.com/Celtoman/astro-telekom/issues/40) ✅ | Пользовательские сессии отделены от worker-only `/internal/*`, доступных только по сервисному токену |
| TD-27 | [#42](https://github.com/Celtoman/astro-telekom/issues/42) ✅ | Импорт тарифов сохраняет полное описание и нормализованные счетчики TV-каналов |
| TD-28 | [#43](https://github.com/Celtoman/astro-telekom/issues/43) ✅ | Snapshot тарифов использует канонические slug из справочника 207 городов |
| TD-30 | [#45](https://github.com/Celtoman/astro-telekom/issues/45) ✅ | Full-snapshot из 3 859 тарифов атомарно применяется с явным transaction timeout |
| TD-31 | [#46](https://github.com/Celtoman/astro-telekom/issues/46) ✅ | Preview блокирует city+slug коллизии, генератор разводит допустимые пары типов |
| TD-33 | [#48](https://github.com/Celtoman/astro-telekom/issues/48) ✅ | Browser CORS явно разрешает `PATCH` и `DELETE` для admin mutation routes |
| TD-37 | [#55](https://github.com/Celtoman/astro-telekom/issues/55) ✅ | Coolify runtime publisher устранил build-time цикл; первый и повторный live deployment подтверждены |
| TD-41 | [#61](https://github.com/Celtoman/astro-telekom/issues/61) ✅ | API runtime image сохраняет workspace `apps/api/node_modules`; bootstrap seed использует тот же runtime layout |
| TD-42 | [#62](https://github.com/Celtoman/astro-telekom/issues/62) ✅ | One-shot containers исключены из health; два последовательных live deployment остались `running:healthy` |
| TD-44 | [#64](https://github.com/Celtoman/astro-telekom/issues/64) ✅ | Label escaping выключен, runtime Basic Auth подтвержден ответами 401/200 на обоих доменах |
| TD-45 | [#65](https://github.com/Celtoman/astro-telekom/issues/65) ✅ | Trusted frozen lockfile, общий pnpm cache и bounded retry подтвердили cold/warm и live deployment без timeout |
| TD-46 | [#66](https://github.com/Celtoman/astro-telekom/issues/66) ✅ | `mv -fT` сохраняет валидный publication symlink; два последовательных live deployment прошли без 503 |
| TD-47 | [#67](https://github.com/Celtoman/astro-telekom/issues/67) ✅ | Delivery возможен без однозначно завершенной проверки провайдеров |
| TD-54 | [#74](https://github.com/Celtoman/astro-telekom/issues/74) ✅ | Обычная заявка и видимая проверка подключения смешаны в одной форме без DaData |
| TD-59 | [#79](https://github.com/Celtoman/astro-telekom/issues/79) ✅ | Городской профиль рабочего бота перенесен; HTML, malformed JSON и неверный `contacts` блокируют delivery |
| TD-61 | [#81](https://github.com/Celtoman/astro-telekom/issues/81) ✅ | Payload `Tarifnik appeal/create` не соответствует официальному контракту v3.0 |
| TD-64 | [#84](https://github.com/Celtoman/astro-telekom/issues/84) ✅ | Повторная доставка различает временные, постоянные и неоднозначные ошибки Tarifnik |
| TD-65 | [#85](https://github.com/Celtoman/astro-telekom/issues/85) ✅ | Временное ограничение адреса городом формы было реализовано, затем отменено решением [#87](https://github.com/Celtoman/astro-telekom/issues/87) |
| TD-66 | [#86](https://github.com/Celtoman/astro-telekom/issues/86) ✅ | Обычные Resend/webhook-уведомления проверяют HTTP-ответ; Resend success дополнительно требует непустой `id` |
| TD-67 | [#87](https://github.com/Celtoman/astro-telekom/issues/87) ✅ | Ограничение адреса городом страницы снято; source-контекст отделен от адреса подключения |
| TD-68 | [#88](https://github.com/Celtoman/astro-telekom/issues/88) ✅ | Подсказки получили отдельный rate-limit bucket, честные ошибки и читаемый клавиатурный dropdown |
| TD-69 | [#89](https://github.com/Celtoman/astro-telekom/issues/89) ✅ | DaData использует мягкий IPLocate/page-context boost без ограничения адресов других городов |
| TD-71 | [#92](https://github.com/Celtoman/astro-telekom/issues/92) ✅ | BullMQ-safe `jobId` и явный `DELIVERY_QUEUE_ERROR` не позволяют потерять заявку при сбое постановки в очередь |
| TD-73 | [#95](https://github.com/Celtoman/astro-telekom/issues/95) ✅ | Ручной retry использует следующий свободный глобальный номер попытки и отдельный безопасный retry budget |
| TD-81 | [#103](https://github.com/Celtoman/astro-telekom/issues/103) ✅ | Production восстановлен до 207 городов и полного snapshot из 3 859 тарифов; runtime rebuild опубликован |
| TD-82 | [#104](https://github.com/Celtoman/astro-telekom/issues/104) ✅ | Генератор исключает пустые `inlineStr`; parser fixture и production preview подтверждают 3 859/3 859 строк без ручной нормализации |
| TD-85 | [#108](https://github.com/Celtoman/astro-telekom/issues/108) ✅ | Admin `/tariffs` не дает открыть и вручную отредактировать отдельный тариф без полного повторного импорта |
| TD-86 | [#110](https://github.com/Celtoman/astro-telekom/issues/110) ✅ | Импорт и ручной редактор не имеют единого типизированного контракта всех полей тарифа |
| TD-87 | [#111](https://github.com/Celtoman/astro-telekom/issues/111) ✅ | Ручные изменения и импорт рассчитывают `identityKey` тарифа по разным business key |
| TD-88 | [#113](https://github.com/Celtoman/astro-telekom/issues/113) ✅ | Каталог `/cities` падает до выбора строки из-за безусловного рендера редактора с `selectedCity = null` |
| TD-89 | [#114](https://github.com/Celtoman/astro-telekom/issues/114) ✅ | Старый preview полного импорта может молча перезаписать свежую ручную правку тарифа |
| TD-90 | [#115](https://github.com/Celtoman/astro-telekom/issues/115) ✅ | Устаревший ответ проверки XLSX может примениться после смены файла или провайдера в форме импорта тарифов |
| TD-91 | [#116](https://github.com/Celtoman/astro-telekom/issues/116) ✅ | Опубликованный redirect может остаться в public catalog после снятия с публикации города или целевого тарифа |
| TD-93 | [#118](https://github.com/Celtoman/astro-telekom/issues/118) ✅ | Full-snapshot импорт может применить тариф с URL опубликованной страницы и оставить сайт несобираемым |
| TD-104 | [#133](https://github.com/Celtoman/astro-telekom/issues/133) 🟢 | Public build, sitemap, ссылки и redirects не ограничены каноническим составом Release 1 |
| TD-105 | [#134](https://github.com/Celtoman/astro-telekom/issues/134) 🟢 | `Page` не поддерживает общие страницы сайта, обязательные для Release 1 |
| TD-106 | [#135](https://github.com/Celtoman/astro-telekom/issues/135) 🟢 | Импорт городов закрепляет одну опубликованную Казань и старый комплект страниц |
| TD-107 | [#137](https://github.com/Celtoman/astro-telekom/issues/137) ✅ | Seed заполняет предложный и родительный падежи Казани для корректных локальных заголовков |
| TD-108 | [#138](https://github.com/Celtoman/astro-telekom/issues/138) 🟢 | Public site не задает favicon и получает лишний 404 |
| TD-109 | [#139](https://github.com/Celtoman/astro-telekom/issues/139) ✅ | Городская HOME Release 1 выводит полный тарифный snapshot без legacy-фильтра и лимита |
| TD-110 | [#140](https://github.com/Celtoman/astro-telekom/issues/140) ✅ | `pull_policy: never` запрещает Coolify 4.3.19 скачивать локальный API image для `bootstrap-seed`; exact-SHA deployment подтвержден |
| TD-111 | [#141](https://github.com/Celtoman/astro-telekom/issues/141) 🟢 | Public Caddy отдает noindex-404 для неизвестного URL, но с HTTP 200 |
| TD-112 | [#142](https://github.com/Celtoman/astro-telekom/issues/142) ✅ | Все опубликованные city HOME используют каноническую композицию из семи блоков; импорт, API и web защищают единый контракт |
| TD-113 | [#143](https://github.com/Celtoman/astro-telekom/issues/143) ✅ | `/goroda-obsluzhivaniya` выводит региональный каталог, поиск, переход к проверке покрытия и FAQ вместо плоской сетки |

## P2

| ID | Issue | Суть |
| --- | --- | --- |
| TD-11 | [#13](https://github.com/Celtoman/astro-telekom/issues/13) 🟢 | Нет аудита, версий, schedule публикации, корзины, rollback |
| TD-12 | [#14](https://github.com/Celtoman/astro-telekom/issues/14) 🟢 | Наследование `content` — только shallow merge верхнего уровня |
| TD-13 | [#15](https://github.com/Celtoman/astro-telekom/issues/15) ✅ | `PageBlock` поддерживает семь строго валидируемых типов, а Astro рендерит полный минимальный набор |
| TD-14 | [#16](https://github.com/Celtoman/astro-telekom/issues/16) 🟢 | Public DTO/rate limit/honeypot и 180-дневный policy-driven purge реализованы; остаются legal basis, согласие и правила передачи PII |
| TD-92 | [#117](https://github.com/Celtoman/astro-telekom/issues/117) ✅ | Tariff PATCH принимает `null` для обязательных полей и может передать ошибку целостности в Prisma |
| TD-94 | [#119](https://github.com/Celtoman/astro-telekom/issues/119) ✅ | Запоздалый ответ быстрого просмотра может открыть не последний выбранный тариф |
| TD-95 | [#120](https://github.com/Celtoman/astro-telekom/issues/120) ✅ | После apply импорт тарифов не очищает DOM file input и мешает повторно выбрать тот же XLSX |
| TD-15 | [#17](https://github.com/Celtoman/astro-telekom/issues/17) ✅ | Обычное оповещение лида переведено в persistent outbox с recovery, bounded retry, admin-статусом и ручным повтором |
| TD-16 | [#18](https://github.com/Celtoman/astro-telekom/issues/18) ✅ | Production требует чистый HTTPS origin; post-build gate сверяет sitemap, robots, raw HTML и `noindex` 404 |
| TD-17 | [#19](https://github.com/Celtoman/astro-telekom/issues/19) ✅ | One-shot migration job до API; readiness проверяет PostgreSQL/Redis, liveness отделен; seed остается явной безопасной операцией |
| TD-48 | [#68](https://github.com/Celtoman/astro-telekom/issues/68) ✅ | Публичная lead telemetry имеет allowlist, depth/key/string и суммарные JSON-лимиты |
| TD-49 | [#69](https://github.com/Celtoman/astro-telekom/issues/69) ✅ | Журналы заявок и тарифов используют bounded cursor-пагинацию и серверные фильтры; list DTO заявки исключает тяжелые relations |
| TD-51 | [#71](https://github.com/Celtoman/astro-telekom/issues/71) ✅ | Admin overview оставляет реальные счетчики разделам и не показывает hardcoded catalog/publication или удаленную CRM |
| TD-52 | [#72](https://github.com/Celtoman/astro-telekom/issues/72) ✅ | Browser security headers и hash-based CSP для web/admin закреплены edge/build-проверками |
| TD-55 | [#75](https://github.com/Celtoman/astro-telekom/issues/75) ✅ | Subscriber mode сразу переводит публичные контакты на отдельный номер техподдержки и сохраняет некритичный browser-флаг на 30 дней |
| TD-56 | [#76](https://github.com/Celtoman/astro-telekom/issues/76) ✅ | UI и API требуют безопасный построчный create/update/skip с защитой от stale preview |
| TD-57 | [#77](https://github.com/Celtoman/astro-telekom/issues/77) ✅ | Публичный сайт выводит nullable стоимость подключения; сохраненная рекомендация `show_on_site` явно отделена от статуса публикации |
| TD-58 | [#78](https://github.com/Celtoman/astro-telekom/issues/78) ✅ | Автоматический редирект не синхронизирует статус с публикацией тарифа |
| TD-60 | [#80](https://github.com/Celtoman/astro-telekom/issues/80) ✅ | Все фильтруемые каталоги используют единый явный сброс временных фильтров без URL/browser persistence |
| TD-62 | [#82](https://github.com/Celtoman/astro-telekom/issues/82) ✅ | Проверка договора Дом.ру использует полный регионально однозначный справочник городов |
| TD-72 | [#93](https://github.com/Celtoman/astro-telekom/issues/93) ✅ | Русские статусы объясняют состояние заявки, а внешний ID читается из канонического поля модели |
| TD-74 | [#96](https://github.com/Celtoman/astro-telekom/issues/96) ✅ | Документированная команда локального seed загружает переменные из корневого `.env` |
| TD-77 | [#99](https://github.com/Celtoman/astro-telekom/issues/99) ✅ | Production Resend использует проверенный sender; live HTTP 403 устранен |
| TD-78 | [#100](https://github.com/Celtoman/astro-telekom/issues/100) ✅ | `RESEND_API_KEY` ограничен Coolify runtime scope и исключен из build arguments |
| TD-79 | [#101](https://github.com/Celtoman/astro-telekom/issues/101) ✅ | Resend/webhook idempotency key разделен по manual retry revision |
| TD-83 | [#106](https://github.com/Celtoman/astro-telekom/issues/106) ✅ | Публичные HTML-URL должны публиковаться без завершающего слэша с единым canonical/sitemap/redirect contract |
| TD-97 | [#124](https://github.com/Celtoman/astro-telekom/issues/124) ✅ | Городская HOME использует только управляемую структуру; после унификации шаблона hardcoded fallback удален полностью |
| TD-98 | [#127](https://github.com/Celtoman/astro-telekom/issues/127) ✅ | Seed создает demo-тарифы только в пустом каталоге и не возвращает их после полного snapshot-импорта |
| TD-99 | [#128](https://github.com/Celtoman/astro-telekom/issues/128) ✅ | Ссылка звонка в публичной шапке нормализуется из показанного пользователю номера |

## P3

| ID | Issue | Суть |
| --- | --- | --- |
| TD-18 | [#20](https://github.com/Celtoman/astro-telekom/issues/20) ✅ | Admin входит в общий Astro check; отдельный CRM-workspace удален 9 сентября 2026 года |
| TD-19 | [#21](https://github.com/Celtoman/astro-telekom/issues/21) ✅ | Устаревший tracked JS рядом с TS в `apps/api/src` — закрыто 7 сентября 2026 |
| TD-20 | [#22](https://github.com/Celtoman/astro-telekom/issues/22) ✅ | Открытые вопросы получили стабильные `OQ-*` ID, закрытые пункты удалены и добавлены roadmap-ссылки |
| TD-26 | [#41](https://github.com/Celtoman/astro-telekom/issues/41) ✅ | GitHub Actions обновлены на Node 24 majors: checkout/setup-node v7, pnpm/action-setup v6 |
| TD-29 | [#44](https://github.com/Celtoman/astro-telekom/issues/44) ✅ | README и живой документ покрытия синхронизированы с актуальным тестовым baseline |
| TD-32 | [#47](https://github.com/Celtoman/astro-telekom/issues/47) ✅ | Карта admin routes синхронизирована с рабочими `/tariffs`, `/cities` и `/leads` |
| TD-34 | [#52](https://github.com/Celtoman/astro-telekom/issues/52) ✅ | Точный baseline оставлен только в `TEST_COVERAGE.md`, а regression-тест запрещает новые дубли |
| TD-35 | [#53](https://github.com/Celtoman/astro-telekom/issues/53) ✅ | Build-time catalog API отделен в server-only `SITE_DATA_API_URL` от публичного browser `PUBLIC_API_URL` |
| TD-36 | [#54](https://github.com/Celtoman/astro-telekom/issues/54) ✅ | Production build требует внешний HTTPS `PUBLIC_API_URL` с нормализованным path `/api/v1` |
| TD-37 | [#56](https://github.com/Celtoman/astro-telekom/issues/56) ✅ | Coolify-native routing, TLS, Basic Auth, same-origin API и `www` redirect подтверждены live smoke-тестом |
| TD-38 | [#57](https://github.com/Celtoman/astro-telekom/issues/57) ✅ | Coolify adapter подтвержден реальным polling rehearsal до `finished` на точном deployment commit |
| TD-39 | [#58](https://github.com/Celtoman/astro-telekom/issues/58) ✅ | Все Dockerfile кешируют `pnpm install` по root/workspace manifests и lockfile; source-only rebuild подтвержден 9 сентября 2026 года |
| TD-40 | [#60](https://github.com/Celtoman/astro-telekom/issues/60) ✅ | Coolify API token удален из build-time Compose interpolation и передается worker только через runtime `.env` |
| TD-43 | [#63](https://github.com/Celtoman/astro-telekom/issues/63) ✅ | Filtered runtime, общий API/seed image и кешированный migration path сократили повторный live deployment до 85 секунд |
| TD-50 | [#70](https://github.com/Celtoman/astro-telekom/issues/70) ✅ | Release readiness документы и Task #31 синхронизированы с live test-контуром и актуальными блокерами |
| TD-53 | [#73](https://github.com/Celtoman/astro-telekom/issues/73) ✅ | `decisions.md` синхронизирован с финальными ответами Q89 и Q118 |
| TD-75 | [#97](https://github.com/Celtoman/astro-telekom/issues/97) 🟢 | Текущие Radix-примитивы admin расходятся с новым обязательным React Aria-референсом |
| TD-76 | [#98](https://github.com/Celtoman/astro-telekom/issues/98) 🟢 | Astro выдает ложные `formId` hints для inline-скрипта `AddressForm` |
| TD-80 | [#102](https://github.com/Celtoman/astro-telekom/issues/102) 🟢 | Локальный TypeScript seed вызывает `MODULE_TYPELESS_PACKAGE_JSON` и повторный ESM parse |
| TD-84 | [#107](https://github.com/Celtoman/astro-telekom/issues/107) ✅ | Ручное число Task issues удалено; milestone читается из GitHub, возврат фиксированного baseline блокирует тест |
| TD-102 | [#131](https://github.com/Celtoman/astro-telekom/issues/131) ✅ | Живые документы согласованы с 20 миграциями, а исторические production-проверки явно привязаны к exact SHA |
| TD-103 | [#132](https://github.com/Celtoman/astro-telekom/issues/132) ✅ | `packages/database` описан как делегат Prisma CLI, единственный client output — `apps/api/generated` |
| TD-63 | [#83](https://github.com/Celtoman/astro-telekom/issues/83) ✅ | `docs/worker.md` синхронизирован с фактическим routing и retry-поведением |
| TD-70 | [#90](https://github.com/Celtoman/astro-telekom/issues/90) ✅ | DTO ограничивает query официальным максимумом DaData 300 символов |

## Невыполненные, но согласованные возможности

Это не дефекты уже реализованного поведения, а обязательные для следующего релиза направления: полноценный preview и публикации, массовые SEO-операции, история тарифов, предложения редиректов из найденных 404, медиа-библиотека, аналитика, переменные, географическая навигация, управление учетными записями администраторов, интеграционный контракт Tarifnik и юридически утвержденные правила PII. Их порядок и критерии приема — в исполнимых Task issues, см. [docs/task-management.md](task-management.md).
