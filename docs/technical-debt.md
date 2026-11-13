# Технический долг — индекс

Дата последнего обновления индекса: 7 ноября 2026 года. **Полное описание каждой проблемы (доказательство, влияние, следующее действие) живёт в GitHub Issue, не здесь** — эта таблица дублировала текст до 8 сентября 2026, что и было источником рассинхронизации; теперь она только индекс. Как устроена вся система — [docs/task-management.md](task-management.md).

Приоритеты: P0 — блокирует безопасный запуск или ведет к недостоверным данным; P1 — нарушает ключевой путь первого релиза; P2 — существенно ограничивает эксплуатацию; P3 — улучшение качества и поддерживаемости.

**Статус ведётся в GitHub Issues** (репозиторий `Celtoman/astro-telekom`, label `tech-debt` + приоритет). 🟢 — open, ✅ — closed. Актуально на момент чтения этой таблицы issue может отличаться от статуса ниже — сверяться по ссылке, не по этому файлу, если нужен текущий статус.

## Принятые исторические ограничения, 7 ноября 2026

| ID | Issue | Суть |
| --- | --- | --- |
| TD-175 | [#350](https://github.com/Celtoman/astro-telekom/issues/350) ✅ | Историческое сравнение Movix не подтверждено; ограничение принято, дальнейшее восстановление отменено владельцем |

## Живые данные тарифов, 4 ноября 2026

Локальный проверочный контур: [TD-213 / #496](https://github.com/Celtoman/astro-telekom/issues/496) 🟢 — intermittent timeout ожидания Automatic CODE в полном Windows/Docker gate; отдельный runtime rehearsal проходит, причина не установлена.

| ID | Issue | Суть |
| --- | --- | --- |
| TD-211 | [#491](https://github.com/Celtoman/astro-telekom/issues/491) ✅ | 1470 интернет-тарифов предлагают выкуп ТВ-приставки за0 ₽ без отдельного признака доступности |
| TD-212 | [#492](https://github.com/Celtoman/astro-telekom/issues/492) ✅ | Отдельную разовую оплату ONT4900 ₽ нужно учитывать в итоге подключения |

## Визуальная сверка ADDRESS, 4 ноября 2026

| ID | Issue | Суть |
| --- | --- | --- |
| TD-207 | [#487](https://github.com/Celtoman/astro-telekom/issues/487) ✅ | Накопленные отступы ADDRESS в Screens и коде расходятся с ритмом HOME/CITY_HOME |
| TD-208 | [#488](https://github.com/Celtoman/astro-telekom/issues/488) ✅ | Глобальное ограничение H1 до780px вызывает лишний перенос на Desktop |
| TD-209 | [#493](https://github.com/Celtoman/astro-telekom/issues/493) ✅ | TEMP-сценарий объединён с открытой [#455](https://github.com/Celtoman/astro-telekom/issues/455); закрыт как дубликат, не как исправление capacity |

## Контракт кинотеатров тарифа, 3 ноября 2026

| ID | Issue | Суть |
| --- | --- | --- |
| TD-206 | [#468](https://github.com/Celtoman/astro-telekom/issues/468) ✅ | Подпись кинотеатров нужно привести к согласованному списку доступных подписок без альтернатив |

## Текущая миграция CITY_HOME

| ID | Issue | Суть |
| --- | --- | --- |
| TD-203 | [#444](https://github.com/Celtoman/astro-telekom/issues/444) ✅ | Пограничный journal не восстановлен; утрата принята, дальнейшее восстановление отменено владельцем |
| TD-202 | [#442](https://github.com/Celtoman/astro-telekom/issues/442) ✅ | CRLF shell helper из Windows ломает Linux Docker rehearsal |
| TD-201 | [#441](https://github.com/Celtoman/astro-telekom/issues/441) 🟢 | Docker rehearsals оставляют анонимные PostgreSQL volumes |
| TD-200 | [#438](https://github.com/Celtoman/astro-telekom/issues/438) ✅ | Неограниченное накопление publication HTML заполняет диск; архивная очистка — [#440](https://github.com/Celtoman/astro-telekom/issues/440) |
| TD-199 | [#433](https://github.com/Celtoman/astro-telekom/issues/433) ✅ | SVG и mobile стрелка исправлены; внешняя проверка [#435](https://github.com/Celtoman/astro-telekom/issues/435) завершена 7 ноября 2026 |
| TD-198 | [#430](https://github.com/Celtoman/astro-telekom/issues/430) 🟢 | Диагностировать нехватку памяти Windows при полном gate |
| TD-192 | [#420](https://github.com/Celtoman/astro-telekom/issues/420) ✅ | Поле над шапкой ошибочно перенесено из макета |
| TD-193 | [#423](https://github.com/Celtoman/astro-telekom/issues/423) ✅ | Первый кадр каталога меняет список после JS-инициализации |
| TD-194 | [#424](https://github.com/Celtoman/astro-telekom/issues/424) ✅ | Иконка телевидения в Hero не совпадает со Screens |
| TD-195 | [#425](https://github.com/Celtoman/astro-telekom/issues/425) ✅ | Вертикальный ритм мобильного футера отличается от Screens |
| TD-196 | [#426](https://github.com/Celtoman/astro-telekom/issues/426) 🟢 | Принятый Screens хранит дефектные иконки Movix |
| TD-197 | [#427](https://github.com/Celtoman/astro-telekom/issues/427) 🟢 | Коллизия исторического BLK-0032 между файлами |
| TD-180 | [#402](https://github.com/Celtoman/astro-telekom/issues/402) ✅ | Миграция0062 сохраняет владельческие подписи HOME в общих фактах |
| TD-181 | [#404](https://github.com/Celtoman/astro-telekom/issues/404) ✅ | Стабильный порядок блоков в audit/content revisions CMS |
| TD-182 | [#405](https://github.com/Celtoman/astro-telekom/issues/405) ✅ | Исправлены CITY overflow/tie/CSP assets, recovery links, callback context и preview CTA |
| TD-183 | [#406](https://github.com/Celtoman/astro-telekom/issues/406) ✅ | Guard baseline различает тесты и исторические Figma occurrences |
| TD-191 | [#417](https://github.com/Celtoman/astro-telekom/issues/417) 🟢 | Диагностировать Windows EPERM в admin CSP build-тесте |
| TD-190 | [#415](https://github.com/Celtoman/astro-telekom/issues/415) ✅ | Ограничить ширину fieldset конфигуратора на320 |
| TD-187 | [#411](https://github.com/Celtoman/astro-telekom/issues/411) ✅ | Стабилизировать первый кадр общей шапки и оболочку страниц |
| TD-188 | [#412](https://github.com/Celtoman/astro-telekom/issues/412) ✅ | Убрать внутреннюю вертикальную прокрутку сравнения |
| TD-189 | [#413](https://github.com/Celtoman/astro-telekom/issues/413) ✅ | Восстановить цельные подложки и центрированные SVG Movix |
| TD-186 | [#410](https://github.com/Celtoman/astro-telekom/issues/410) ✅ | Длинный H1 юридического документа переполняет общую страницу на320 |
| TD-185 | [#408](https://github.com/Celtoman/astro-telekom/issues/408) ✅ | Привести вёрстку городской страницы к принятой Screens на D/T/M/320 без изменения CMS |
| TD-184 | [#407](https://github.com/Celtoman/astro-telekom/issues/407) ✅ | Повторный расчёт городских агрегатов устранён; полный snapshot24 опубликован и подтверждён serving receipt |

## P0

| ID | Issue | Суть |
| --- | --- | --- |
| TD-01 | [#1](https://github.com/Celtoman/astro-telekom/issues/1) ✅ | Test-double синхронизирован с контроллером, добавлены сценарии дубликатов; release gate зеленый |
| TD-02 | [#2](https://github.com/Celtoman/astro-telekom/issues/2) ✅ | HMAC-ссылка заменена серверным одноразовым token с TTL, отзывом и admin UI |
| TD-03 | [#3](https://github.com/Celtoman/astro-telekom/issues/3) ✅ | Demo-data требуют явного флага; policy и final HTML защищены тестами [#4](https://github.com/Celtoman/astro-telekom/issues/4) |
| TD-96 | [#121](https://github.com/Celtoman/astro-telekom/issues/121) ✅ | Публичные формы восстановлены после CSP-регресса; исполняемый код собирается first-party bundle, а final HTML проверяет каждый оставшийся inline hash |
| TD-100 | [#129](https://github.com/Celtoman/astro-telekom/issues/129) ✅ | Legacy hero CTA с конечным слэшем нормализован идемпотентной data migration до строгой runtime-публикации |
| TD-101 | [#130](https://github.com/Celtoman/astro-telekom/issues/130) ✅ | Production HOME/INTERNET Казани сохраняют неполный legacy PageBlock snapshot вместо нового прототипа |
| TD-115 | [#145](https://github.com/Celtoman/astro-telekom/issues/145) ✅ | Встроенный backup-контур отменен как ненужный: владелец использует внешнее решение вне репозитория |
| TD-129 | [#211](https://github.com/Celtoman/astro-telekom/issues/211) ✅ | API bootstrap восстановлен после выпадения `SitemapService` из Nest providers; startup и readiness проверены |

## P1

| ID | Issue | Суть |
| --- | --- | --- |
| TD-167 | [#264](https://github.com/Celtoman/astro-telekom/issues/264) ✅ | Совместимость служебных тарифных блоков; структурированные блок/поле/причина и переход к редактору |
| #235 | [#235](https://github.com/Celtoman/astro-telekom/issues/235) ✅ | Общие tariffView/heroFacts/legal и публичные CSS/assets; состав preview сверяется с Astro HTML |
| #258 | [#258](https://github.com/Celtoman/astro-telekom/issues/258) ✅ | Точечные security dependency updates; audit без advisory entries, regression middleware/deepmerge |
| TD-163 | [#259](https://github.com/Celtoman/astro-telekom/issues/259) ✅ | Origin/absolute request targets используют один специализированный rate-limit classifier |
| TD-145 | [#240](https://github.com/Celtoman/astro-telekom/issues/240) ✅ | Атомарный seed текущей schema; свежая PostgreSQL, preflight и сохранность повторного запуска проверены |
| TD-150 | [#246](https://github.com/Celtoman/astro-telekom/issues/246) ✅ | Non-root runtime: private Astro config и redacted диагностика; повтор Linux CI обязателен |
| TD-146 | [#242](https://github.com/Celtoman/astro-telekom/issues/242) ✅ | Caddy fixture использует Linux runner UID/GID; CI прошёл без пропусков |
| TD-147 | [#243](https://github.com/Celtoman/astro-telekom/issues/243) ✅ | Повторные перезапуски удерживают processing snapshot; SQL acknowledgment атомарен, полный gate прошёл |
| TD-148 | [#244](https://github.com/Celtoman/astro-telekom/issues/244) ✅ | Serving snapshot context, SQL/Caddy negative cases и внешний catalog/quote подтверждены; Coolify wiring включён |
| TD-153 | [#249](https://github.com/Celtoman/astro-telekom/issues/249) ✅ | Migration proof связывает полный immutable snapshot; baseline/CODE подтверждены на внешнем runtime |
| TD-154 | [#250](https://github.com/Celtoman/astro-telekom/issues/250) ✅ | Bounded transaction budget устранил отказ подготовки полного snapshot; две внешние CMS-публикации успешны |
| TD-157 | [#234](https://github.com/Celtoman/astro-telekom/issues/234) ✅ | Атомарный static serving и durable recovery сохраняют согласованный snapshot и прежние assets |
| TD-158 | [#239](https://github.com/Celtoman/astro-telekom/issues/239) ✅ | Глобальное действие/review публикации доступны; responsive browser и реальный cookie save→publish подтверждены |
| TD-04 | [#5](https://github.com/Celtoman/astro-telekom/issues/5) ✅ | Базовый public catalog и multi-city static paths; текущая Release 1 policy дополнительно ограничивает маршруты |
| TD-05 | [#6](https://github.com/Celtoman/astro-telekom/issues/6) ✅ | Persistent rebuild-job: dedupe, BullMQ retry/backoff, API-статус и финальный результат provider |
| TD-06 | [#7](https://github.com/Celtoman/astro-telekom/issues/7) ✅ | Full-snapshot import атомарно удаляет отсутствующие тарифы, требует подтверждения warnings и создает redirects при ручной смене URL |
| TD-07 | [#8](https://github.com/Celtoman/astro-telekom/issues/8) ✅ | Redirect CRUD, conflict/one-hop validation, build-generated Caddy routing, runtime HTTP 301 и hit tracking |
| TD-08 | [#9](https://github.com/Celtoman/astro-telekom/issues/9) ✅ | Demo UI заменен реальными экранами тарифов, городов и заявок по [docs/admin-design-system.md](admin-design-system.md) |
| TD-09 | [#10](https://github.com/Celtoman/astro-telekom/issues/10) ✅ | Реализованы HttpOnly-cookie login/me/logout и auth-gated React shell; browser service-token удален |
| TD-10 | [#11](https://github.com/Celtoman/astro-telekom/issues/11) ✅ | Защищенный release configuration gate блокирует готовность при пустых Contract/Tarifnik/coverage/email/rebuild variables без раскрытия значений |
| TD-117 | [#148](https://github.com/Celtoman/astro-telekom/issues/148) ✅ | Отдельные страницы 3 859 опубликованных тарифов возвращены в Release 1 и подтверждены exact-SHA live smoke |
| TD-118 | [#150](https://github.com/Celtoman/astro-telekom/issues/150) ✅ | `0032` удалила 206 legacy `HOME`, чистый snapshot ревизии 3 опубликован через strict web-build; live catalog имеет ровно одну каноническую HOME для 207 городов |
| TD-120 | [#202](https://github.com/Celtoman/astro-telekom/issues/202) ✅ | Forward-only `0039` восстанавливает revision trail без изменения historical snapshot; exact-SHA rollout и live no-op уже восстановленного сайта подтверждены |
| TD-121 | [#203](https://github.com/Celtoman/astro-telekom/issues/203) ✅ | Публичная форма и API принимают только полный мобильный номер `+7 (9XX) XXX-XX-XX` и отклоняют неполный ввод без повторного добавления `7` |
| TD-122 | [#204](https://github.com/Celtoman/astro-telekom/issues/204) ✅ | Повторный EMAIL fallback сохраняется под номером текущего delivery cycle без конфликта уникального индекса |
| TD-123 | [#205](https://github.com/Celtoman/astro-telekom/issues/205) ✅ | Сбой БД после принятого EMAIL fallback оставляет наблюдаемый неопределённый исход и явное операторское восстановление |
| TD-124 | [#206](https://github.com/Celtoman/astro-telekom/issues/206) ✅ | Валидное `OPTIONAL` видеонаблюдение без цены блокирует сборку тарифа вместо невыбираемого состояния «стоимость уточняется» |
| TD-125 | [#207](https://github.com/Celtoman/astro-telekom/issues/207) ✅ | Quote опубликованного тарифа должен принимать канонические целые цены, сериализованные Prisma Decimal как строки |
| TD-127 | [#209](https://github.com/Celtoman/astro-telekom/issues/209) ✅ | Повтор заявки с прежним `submissionKey` возвращает сохраненный лид после смены публикации или архивации без повторной доставки |
| TD-128 | [#210](https://github.com/Celtoman/astro-telekom/issues/210) ✅ | Принятый Tarifnik lead при сбое записи БД может ошибочно перейти в failed/fallback вместо неопределённого результата |
| TD-134 | [#217](https://github.com/Celtoman/astro-telekom/issues/217) ✅ | Тарифный import принимает тот же slug региона, что city import; live preview 3 805 строк прошёл без ошибок |
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
| TD-116 | [#56](https://github.com/Celtoman/astro-telekom/issues/56) ✅ | Coolify-native routing, TLS, Basic Auth, same-origin API и `www` redirect подтверждены live smoke-тестом |
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
| TD-104 | [#133](https://github.com/Celtoman/astro-telekom/issues/133) ✅ | Public build, sitemap, ссылки и redirects ограничены каноническим составом Release 1 |
| TD-105 | [#134](https://github.com/Celtoman/astro-telekom/issues/134) ✅ | `Page` поддерживает пять обязательных общих страниц сайта Release 1 |
| TD-106 | [#135](https://github.com/Celtoman/astro-telekom/issues/135) ✅ | Импорт публикует полный каталог городов с одной канонической HOME на город |
| TD-107 | [#137](https://github.com/Celtoman/astro-telekom/issues/137) ✅ | Seed заполняет предложный и родительный падежи Казани для корректных локальных заголовков |
| TD-108 | [#138](https://github.com/Celtoman/astro-telekom/issues/138) ✅ | Согласованный корневой favicon подключён ко всем HTML-страницам и проверяется при сборке |
| TD-109 | [#139](https://github.com/Celtoman/astro-telekom/issues/139) ✅ | Городская HOME Release 1 выводит полный тарифный snapshot без legacy-фильтра и лимита |
| TD-110 | [#140](https://github.com/Celtoman/astro-telekom/issues/140) ✅ | `pull_policy: never` запрещает Coolify 4.3.19 скачивать локальный API image для `bootstrap-seed`; exact-SHA deployment подтвержден |
| TD-111 | [#141](https://github.com/Celtoman/astro-telekom/issues/141) ✅ | Public Caddy отдает общую noindex-404 с HTTP 404; exact-SHA live-smoke подтвержден |
| TD-112 | [#142](https://github.com/Celtoman/astro-telekom/issues/142) ✅ | Все опубликованные city HOME используют каноническую композицию из семи блоков; импорт, API и web защищают единый контракт |
| TD-113 | [#143](https://github.com/Celtoman/astro-telekom/issues/143) ✅ | `/goroda-obsluzhivaniya` выводит региональный каталог, поиск, переход к проверке покрытия и FAQ вместо плоской сетки |

## P2

| ID | Issue | Суть |
| --- | --- | --- |
| TD-176 | [#353](https://github.com/Celtoman/astro-telekom/issues/353) 🟢 | Нет раздельного учёта вызовов DaData; доля приложения в общем суточном расходе не установлена |
| TD-171 | [#270](https://github.com/Celtoman/astro-telekom/issues/270) ✅ | Повторное открытие разделов админки снова ждёт внешние запросы; остаётся заметная пауза |
| TD-172 | [#272](https://github.com/Celtoman/astro-telekom/issues/272) ✅ | После успешного сохранения города остаётся ложное предупреждение о несохранённых изменениях |
| TD-173 | [#273](https://github.com/Celtoman/astro-telekom/issues/273) 🟢 | Ошибка сохранения города отображается за открытым модальным редактором |
| TD-174 | [#276](https://github.com/Celtoman/astro-telekom/issues/276) ✅ | Адресное действие шапки на общей главной ведёт к локальному якорю вместо городской проверки |
| TD-168 | [#266](https://github.com/Celtoman/astro-telekom/issues/266) ✅ | Bounded publication budget для review/preview подтверждён конкурентными live200 на полном каталоге |
| TD-169 | [#267](https://github.com/Celtoman/astro-telekom/issues/267) ✅ | CITY_HOME тарифные карточки расходятся с визуальными параметрами актуального Figma B04 |
| TD-165 | [#262](https://github.com/Celtoman/astro-telekom/issues/262) ✅ | Control GET/POST не переносят pooled соединения через Caddy reload; readback и UNCERTAIN сохраняются |
| #236 | [#236](https://github.com/Celtoman/astro-telekom/issues/236) ✅ | Direct Compose использует migration target; реальный Docker/PG rehearsal и идемпотентность |
| TD-149 | [#245](https://github.com/Celtoman/astro-telekom/issues/245) ✅ | Private publication fixtures исключены из Docker context; image rehearsal прошёл |
| TD-151 | [#247](https://github.com/Celtoman/astro-telekom/issues/247) ✅ | Redis rehearsal ожидает PONG и сразу обрабатывает ранний reject без сокрытия failure |
| TD-152 | [#248](https://github.com/Celtoman/astro-telekom/issues/248) ✅ | CODE identity учитывает закрытые serving options; non-root image proof подтверждает смену контекста после terminal deployment |
| TD-156 | [#252](https://github.com/Celtoman/astro-telekom/issues/252) ✅ | SQL rehearsal должен подтверждать реальную попытку acknowledgment перед проверкой rollback |
| TD-143 | [#229](https://github.com/Celtoman/astro-telekom/issues/229) ✅ | Описание публичной формы синхронизировано с действующим адресным сценарием API и канона |
| TD-144 | [#230](https://github.com/Celtoman/astro-telekom/issues/230) ✅ | DRAFT-паспорта Header, Hero 1b и городского Hero V3 описывают внедрённые источники, варианты и поведение |
| TD-136 | [#221](https://github.com/Celtoman/astro-telekom/issues/221) ✅ | Карточки ТВ и Интернет + ТВ передавали форме тип услуги INTERNET из-за устаревших кодов `service_grid` |
| TD-139 | [#224](https://github.com/Celtoman/astro-telekom/issues/224) ✅ | Пакетная проверка связей сократила live-предпросмотр 25 архивных тарифов с 14–18 до 6,8–7,3 секунды без изменения блокировок |
| TD-140 | [#225](https://github.com/Celtoman/astro-telekom/issues/225) ✅ | Поиск по внутреннему `Tariff.id` добавлен в каталог тарифов |
| TD-141 | [#226](https://github.com/Celtoman/astro-telekom/issues/226) ✅ | Миграция подстановок и рабочий индекс читают авторитетный `PageTemplate` городской HOME после C2 |
| TD-135 | [#220](https://github.com/Celtoman/astro-telekom/issues/220) ✅ | Цепочка Coolify proxy → Caddy → API не подтверждает исходный IP клиента для атрибуции заявки |
| TD-130 | [#213](https://github.com/Celtoman/astro-telekom/issues/213) ✅ | Каталог переменных индексирует исходные SEO/OG-шаблоны и отмечает неполноту старых снимков |
| TD-11 | [#13](https://github.com/Celtoman/astro-telekom/issues/13) ✅ | Нет аудита, версий, schedule публикации, корзины, rollback |
| TD-12 | [#14](https://github.com/Celtoman/astro-telekom/issues/14) ✅ | Вложенные `content` и SEO разрешаются рекурсивно по явному контракту; массивы, скалярные значения и `null` заменяются атомарно |
| TD-13 | [#15](https://github.com/Celtoman/astro-telekom/issues/15) ✅ | `PageBlock` поддерживает семь строго валидируемых типов, а Astro рендерит полный минимальный набор |
| TD-14 | [#16](https://github.com/Celtoman/astro-telekom/issues/16) ✅ | Public DTO/rate limit/honeypot и 180-дневный policy-driven purge реализованы; legal scope вынесен в [#144](https://github.com/Celtoman/astro-telekom/issues/144) |
| TD-114 | [#147](https://github.com/Celtoman/astro-telekom/issues/147) ✅ | На момент закрытия живые документы и technical-debt index были синхронизированы с тогдашними 26 миграциями, post-deploy evidence и Issue states |
| TD-80 | [#102](https://github.com/Celtoman/astro-telekom/issues/102) ✅ | Локальная seed-команда собирает и запускает production CommonJS entrypoint; два прогона на чистой PostgreSQL 18 идемпотентны |
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
| TD-132 | [#215](https://github.com/Celtoman/astro-telekom/issues/215) ✅ | Ручной редактор тарифа отклоняет некорректные коды в `promoText` до сохранения |
| TD-133 | [#216](https://github.com/Celtoman/astro-telekom/issues/216) ✅ | SEO/OG-редактор отклоняет некорректные коды в четырёх текстовых полях до сохранения |

## P3

| ID | Issue | Суть |
| --- | --- | --- |
| TD-170 | [#269](https://github.com/Celtoman/astro-telekom/issues/269) 🟢 | Dev-конфигуратор: ошибка JSX runtime после параллельных production-сборок; отдельная production-сборка исправна |
| TD-166 | [#263](https://github.com/Celtoman/astro-telekom/issues/263) ✅ | Publication/architecture синхронизированы с подтверждёнными rollout и direct migration target |
| TD-164 | [#261](https://github.com/Celtoman/astro-telekom/issues/261) ✅ | API contract ссылается на выполненную внешнюю приёмку private static controller |
| #237 | [#237](https://github.com/Celtoman/astro-telekom/issues/237) ✅ | Действующие документы и CMS/variables Issues синхронизированы; исторические планы отделены |
| TD-155 | [#251](https://github.com/Celtoman/astro-telekom/issues/251) 🟢 | Windows Docker CLI иногда не читает context meta.json из-за блокировки другим процессом |
| TD-159 | [#253](https://github.com/Celtoman/astro-telekom/issues/253) ✅ | Caddy restart rehearsal использует новые HTTP-соединения и повторно занимает прежние порты |
| TD-160 | [#254](https://github.com/Celtoman/astro-telekom/issues/254) ✅ | Устаревшие утверждения architecture о provider, приёмке static и React Aria требуют синхронизации |
| TD-161 | [#255](https://github.com/Celtoman/astro-telekom/issues/255) ✅ | В публикации отсутствовали фактические этапы, счётчики и оценка времени |
| TD-162 | [#257](https://github.com/Celtoman/astro-telekom/issues/257) ✅ | CMS после ручного deployment бесконечно ожидала согласования renderer |
| TD-137 | [#222](https://github.com/Celtoman/astro-telekom/issues/222) ✅ | Городской renderer выводит сохранённый `tariff_grid.title` в H2 |
| TD-142 | [#227](https://github.com/Celtoman/astro-telekom/issues/227) ✅ | Паспорта городской HOME называют действующий `PageTemplateBlock.data` авторитетным источником |
| TD-138 | [#223](https://github.com/Celtoman/astro-telekom/issues/223) ✅ | Статус миграции `0054` в текущем состоянии и admin-документе синхронизирован с подтверждённым rollout |
| TD-126 | [#208](https://github.com/Celtoman/astro-telekom/issues/208) ✅ | Read-only публичный POST quote отвечает HTTP 200 после локального и live smoke |
| TD-18 | [#20](https://github.com/Celtoman/astro-telekom/issues/20) ✅ | Admin входит в общий Astro check; отдельный CRM-workspace удален 9 сентября 2026 года |
| TD-19 | [#21](https://github.com/Celtoman/astro-telekom/issues/21) ✅ | Устаревший tracked JS рядом с TS в `apps/api/src` — закрыто 7 сентября 2026 |
| TD-20 | [#22](https://github.com/Celtoman/astro-telekom/issues/22) ✅ | Открытые вопросы получили стабильные `OQ-*` ID, закрытые пункты удалены и добавлены roadmap-ссылки |
| TD-26 | [#41](https://github.com/Celtoman/astro-telekom/issues/41) ✅ | GitHub Actions обновлены на Node 24 majors: checkout/setup-node v7, pnpm/action-setup v6 |
| TD-29 | [#44](https://github.com/Celtoman/astro-telekom/issues/44) ✅ | README и живой документ покрытия синхронизированы с актуальным тестовым baseline |
| TD-32 | [#47](https://github.com/Celtoman/astro-telekom/issues/47) ✅ | Карта admin routes синхронизирована с рабочими `/tariffs`, `/cities` и `/leads` |
| TD-34 | [#52](https://github.com/Celtoman/astro-telekom/issues/52) ✅ | Точный baseline оставлен только в `TEST_COVERAGE.md`, а regression-тест запрещает новые дубли |
| TD-35 | [#53](https://github.com/Celtoman/astro-telekom/issues/53) ✅ | Build-time catalog API отделен в server-only `SITE_DATA_API_URL` от публичного browser `PUBLIC_API_URL` |
| TD-36 | [#54](https://github.com/Celtoman/astro-telekom/issues/54) ✅ | Production build требует внешний HTTPS `PUBLIC_API_URL` с нормализованным path `/api/v1` |
| TD-38 | [#57](https://github.com/Celtoman/astro-telekom/issues/57) ✅ | Coolify adapter подтвержден реальным polling rehearsal до `finished` на точном deployment commit |
| TD-39 | [#58](https://github.com/Celtoman/astro-telekom/issues/58) ✅ | Все Dockerfile кешируют `pnpm install` по root/workspace manifests и lockfile; source-only rebuild подтвержден 9 сентября 2026 года |
| TD-40 | [#60](https://github.com/Celtoman/astro-telekom/issues/60) ✅ | Coolify API token удален из build-time Compose interpolation и передается worker только через runtime `.env` |
| TD-43 | [#63](https://github.com/Celtoman/astro-telekom/issues/63) ✅ | Filtered runtime, общий API/seed image и кешированный migration path сократили повторный live deployment до 85 секунд |
| TD-50 | [#70](https://github.com/Celtoman/astro-telekom/issues/70) ✅ | Release readiness документы и Task #31 синхронизированы с live test-контуром и актуальными блокерами |
| TD-53 | [#73](https://github.com/Celtoman/astro-telekom/issues/73) ✅ | `decisions.md` синхронизирован с финальными ответами Q89 и Q118 |
| TD-75 | [#97](https://github.com/Celtoman/astro-telekom/issues/97) ✅ | Admin-примитивы переведены на React Aria, `radix-ui` удалён, CI прошёл |
| TD-76 | [#98](https://github.com/Celtoman/astro-telekom/issues/98) ✅ | Актуальный Astro check обрабатывает inline `formId` без warnings и hints |
| TD-84 | [#107](https://github.com/Celtoman/astro-telekom/issues/107) ✅ | Ручное число Task issues удалено; milestone читается из GitHub, возврат фиксированного baseline блокирует тест |
| TD-102 | [#131](https://github.com/Celtoman/astro-telekom/issues/131) ✅ | Живые документы согласованы с 20 миграциями, а исторические production-проверки явно привязаны к exact SHA |
| TD-103 | [#132](https://github.com/Celtoman/astro-telekom/issues/132) ✅ | `packages/database` описан как делегат Prisma CLI, единственный client output — `apps/api/generated` |
| TD-119 | [#153](https://github.com/Celtoman/astro-telekom/issues/153) ✅ | Живые документы синхронизируются с 33 локальными миграциями, внешним контуром до `0032`, tariff detail и owner-only решением о трафике |
| TD-63 | [#83](https://github.com/Celtoman/astro-telekom/issues/83) ✅ | `docs/worker.md` синхронизирован с фактическим routing и retry-поведением |
| TD-70 | [#90](https://github.com/Celtoman/astro-telekom/issues/90) ✅ | DTO ограничивает query официальным максимумом DaData 300 символов |
| TD-131 | [#214](https://github.com/Celtoman/astro-telekom/issues/214) ✅ | Каталог кодов указывает все четыре допустимых SEO/OG-текстовых поля, исключая URL изображения |
| TD-215 | [#513](https://github.com/Celtoman/astro-telekom/issues/513) ✅ | High advisories Sharp/Vite/Zod/Undici требуют совместимых точечных обновлений и повторной проверки |
| TD-216 | [#515](https://github.com/Celtoman/astro-telekom/issues/515) ✅ | Закрыт как дубликат; полный остаток dependency advisories перенесён в #570 |
| TD-217 | [#516](https://github.com/Celtoman/astro-telekom/issues/516) ✅ | Automatic CODE в isolated non-root runtime не завершает gate ACCOUNT; требуется диагностика причины |
| TD-218 | [#517](https://github.com/Celtoman/astro-telekom/issues/517) 🟢 | Привязать abort Node test к остановке owned runtime fixture и гарантированному cleanup |
| TD-219 | [#521](https://github.com/Celtoman/astro-telekom/issues/521) ✅ | Стабилизировать составной CDP-прогон смены wheel/touch/reset; production-дефект не подтверждён |

## Находки review внедрения ADDRESS

| Issue | Статус | Кратко |
| --- | --- | --- |
| [#481](https://github.com/Celtoman/astro-telekom/issues/481) | CLOSED | Отмена импорта с HOME и ADDRESS; regression и повторный review пройдены. |
| [#483](https://github.com/Celtoman/astro-telekom/issues/483) | CLOSED | Пустой FAQ в ADDRESS preview; regression и повторный review пройдены. |

## Редакционный API, 6 ноября 2026

| ID | Issue | Суть |
| --- | --- | --- |
| TD-220 | [#538](https://github.com/Celtoman/astro-telekom/issues/538) ✅ | ID новости защищены от коллизий со служебными маршрутами API |

| TD-221 | [#539](https://github.com/Celtoman/astro-telekom/issues/539) ✅ | Повторная публикация восстанавливает подтверждённые исторические301 |

| TD-223 | [#541](https://github.com/Celtoman/astro-telekom/issues/541) ✅ | Review показывает прежние canonical/aliases и итог301/404 |

| TD-224 | [#542](https://github.com/Celtoman/astro-telekom/issues/542) ✅ | История восстанавливает текст с явным выбором категории после переноса |

| TD-225 | [#543](https://github.com/Celtoman/astro-telekom/issues/543) ✅ | CATEGORY PUBLISH защищён от serving-but-unacknowledged retirement |

| TD-222 | [#540](https://github.com/Celtoman/astro-telekom/issues/540) ✅ | Предпросмотр выбирает сохранённую сущность по ID/kind при коллизии слага |
| TD-226 | [#544](https://github.com/Celtoman/astro-telekom/issues/544) ✅ | Узкая пагинация разделяет номера и ряд действий справа |

| TD-227 | [#545](https://github.com/Celtoman/astro-telekom/issues/545) ✅ | Неподдержанные дети WordPress-списка требуют проверки вместо потери текста |

| TD-228 | [#546](https://github.com/Celtoman/astro-telekom/issues/546) ✅ | Проверяемый backup/restore редакционных оригиналов и рабочих редакций перед внешним переносом |

| TD-229 | [#547](https://github.com/Celtoman/astro-telekom/issues/547) ✅ | Backup proof привязан к фактическому API origin своего ресурса |

| TD-230 | [#548](https://github.com/Celtoman/astro-telekom/issues/548) ✅ | Scratch preflight учитывает пиковые DB/media копии и запас диска |

| TD-231 | [#549](https://github.com/Celtoman/astro-telekom/issues/549) ✅ | Неудачная очистка isolated restore fixture запрещает успешный proof |

| TD-232 | [#550](https://github.com/Celtoman/astro-telekom/issues/550) ✅ | Restore fixture ждёт окончательный TCP server PostgreSQL после bootstrap |

| TD-233 | [#551](https://github.com/Celtoman/astro-telekom/issues/551) ✅ | Русская сетевая ошибка редактора без дублирования и старого alert после retry |

| TD-234 | [#552](https://github.com/Celtoman/astro-telekom/issues/552) ✅ | Seed fixture ждёт окончательную TCP-готовность перед миграцией |

| TD-235 | [#553](https://github.com/Celtoman/astro-telekom/issues/553) 🟢 | Исследовать длительную подготовку исходников Coolify до Docker-сборки |
| TD-236 | [#554](https://github.com/Celtoman/astro-telekom/issues/554) ✅ | Backup SQL fixture использует короткий system temp вместо Windows MAX_PATH |

## Исправления новостей после аудита, 7 ноября 2026

| ID | Issue | Суть |
| --- | --- | --- |
| TD-237 | [#555](https://github.com/Celtoman/astro-telekom/issues/555) ✅ | Двойной отступ новостей; исправлен и проверен в test по #558 |
| TD-238 | [#556](https://github.com/Celtoman/astro-telekom/issues/556) ✅ | Состояния и необязательные обложки карточек; исправлено и проверено в test по #558 |
| TD-239 | [#557](https://github.com/Celtoman/astro-telekom/issues/557) ✅ | Лишний выбор сайта в редакционной админке; исправлено и проверено в test по #558 |
| TD-240 | [#559](https://github.com/Celtoman/astro-telekom/issues/559) ✅ | Guard числа тестов ошибочно трактует serving baseline и ревизии CMS |
| TD-241 | [#560](https://github.com/Celtoman/astro-telekom/issues/560) ✅ | Browser manifest fetch получает401 при Basic Auth в test |
| TD-242 | [#561](https://github.com/Celtoman/astro-telekom/issues/561) ✅ | Разобрать blocked runtime inline styles admin при CSP |

| TD-243 | [#563](https://github.com/Celtoman/astro-telekom/issues/563) ✅ | Astro transition:animate генерирует CSS без разрешённого CSP-хеша; план #564 |
| TD-244 | [#565](https://github.com/Celtoman/astro-telekom/issues/565) ✅ | Пакет не принимал опубликованные новости с рабочими правками CHANGED |
| TD-245 | [#567](https://github.com/Celtoman/astro-telekom/issues/567) 🟢 | Локальный ACCOUNT seed P2028 при параллельном gate; изоляция и concurrency2 проходят |
| TD-246 | [#568](https://github.com/Celtoman/astro-telekom/issues/568) ✅ | Повтор анонса над обложкой дублирует первый абзац новости; план #569 |
| TD-247 | [#570](https://github.com/Celtoman/astro-telekom/issues/570) 🟢 | Разобрать оставшиеся low/moderate advisory текущего dependency baseline |
| TD-248 | [#571](https://github.com/Celtoman/astro-telekom/issues/571) 🟢 | Отдельный asset-set protocol и production HTML reuse после native probe |
| TD-249 | [#573](https://github.com/Celtoman/astro-telekom/issues/573) ✅ | Runner options после file patterns игнорировались Node; исправлен launcher |
| TD-250 | [#574](https://github.com/Celtoman/astro-telekom/issues/574) ✅ | Восстановить явные owner-only/P3 формулировки readiness docs |
| TD-251 | [#575](https://github.com/Celtoman/astro-telekom/issues/575) ✅ | LF shell-скриптов в Windows export и Linux Docker rehearsal |

| TD-252 | [#572](https://github.com/Celtoman/astro-telekom/issues/572) ✅ | Сверены живые документы, ссылки и учёт статусов без изменения кода и страниц |

| TD-254 | [#597](https://github.com/Celtoman/astro-telekom/issues/597) ✅ | Унифицировать BLK-0016 на всех страницах и добавить реализованные маршруты |
