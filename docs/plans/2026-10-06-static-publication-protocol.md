# Протокол CMS-публикации без deployment приложения

Работа ведётся в [#238](https://github.com/Celtoman/astro-telekom/issues/238) по разрешению владельца «Делай». Уточнения владельца: HTML автономен при отказе API; контент, города, тарифы и SEO публикуются вручную из CMS; дизайн и программная логика выпускаются отдельным deployment; расписания исключены. Этот документ описывает выбранный технический протокол и отдельно фиксирует границу реализации.

## Проверенная причина

Прежний `publish-static.sh` переключает symlink и удаляет предыдущую сборку до терминального ответа Coolify. SQL-подтверждение публикации выполняется позже. Отказ между этими действиями оставляет HTML нового снимка, public API прежнего снимка и недоступные прежние assets. Изолированное воспроизведение находится в [#234](https://github.com/Celtoman/astro-telekom/issues/234#issuecomment-6001544064). Изменять рабочие данные и запрашивать SQL на каждом HTML-запросе для устранения этого разрыва не требуется.

## Один источник фактически обслуживаемой версии

Активная конфигурация Caddy одновременно содержит:

- корень HTML конкретного неизменяемого артефакта;
- маршруты редиректов того же снимка;
- идентификатор публикации и закрытый token, которым Caddy заменяет клиентские заголовки при проксировании в API;
- идентичность renderer, hash каталога и manifest.

Одна полная запись `/config/` с `If-Match` меняет эти данные вместе. Устаревший writer получает HTTP 412. При отказе загрузки сохраняется прежняя конфигурация. Caddy сохраняет собственную конфигурацию для `--resume`; отдельный symlink или SQL-указатель не определяют, какой HTML реально выдаётся. Протокол использует [документированную атомарность Caddy](https://caddyserver.com/docs/api), дополнительно проверенную на используемом образе `caddy:2.11.4-alpine`.

Control API Caddy в конечном контейнере слушает loopback. Его порт не публикуется и не проксируется наружу. Включена проверка Origin; private controller выполняет запросы с допустимым Origin. Только controller формирует полную конфигурацию. Публичный endpoint состояния должен возвращать разрешённую metadata, а не конфигурацию с закрытым token.

HTML, favicon, CSS, JS и изображения выдаются с диска. При отказе API обычные страницы и assets продолжают открываться; API-функции честно сообщают недоступность.

## Артефакт и подтверждение

Builder использует выпущенный renderer и фиксированные зависимости, запрашивает точный immutable publication ID и выполняет существующие Astro/SEO gates. Команда и окружение сборки задаются кодом, а не данными CMS. Docker socket, новая установка зависимостей на каждую публикацию и загрузка произвольного кода из CMS не нужны.

`releases/<artifactId>` содержит только публичные файлы. Manifest и receipts находятся вне корня сайта. Служебный `redirects.caddy` не копируется в публичный каталог; список редиректов входит в manifest. Manifest перечисляет размер и SHA-256 каждого файла. Изменённый файл, hidden path, symlink или попытка перезаписать артефакт под прежним ID блокируют активацию. Прерванное сохранение после rename дерева и до manifest восстанавливается только после проверки совпадения всех файлов.

Versioned URL `/__publication_assets/<artifactId>/...` сохраняет точную версию assets. На этом этапе старые артефакты не удаляются. Политика retention и безопасная очистка должны защищать активные артефакты и незавершённые операции; текущий proof не подтверждает работу GC.

После записи конфигурации controller читает её обратно и проверяет соответствие sealed manifest. Только фактически обслуживаемая версия получает неизменяемый receipt. Перед заменой B на C сохраняется подтверждение B, в том числе после перезапуска controller. Повтор B возвращает его receipt и не переключает сайт с C обратно на B.

Потеря ответа после записи не является доказательством неуспеха. Controller пытается подтвердить активную конфигурацию. Если запись и чтение недоступны, результат `ActivationUncertainError` запрещает финальное FAILED и продвижение SQL по предположению. Повтор после восстановления читает фактическую версию и сохраняет receipt.

## Разделение контента и кода

CMS-активация допускает только более новую site revision с тем же renderer ID. Она не меняет контейнеры API/admin/worker и не обращается к Coolify deployment.

CODE-активация может изменить renderer, но обязана сохранить publication ID, site revision и hash уже обслуживаемого каталога. Сам deployment не публикует сохранённую рабочую версию CMS. Private `/release-code` принимает exact deployment/commit вместе с renderer hash и nonce текущего controller. Проверяются latest finished deployment и healthy настроенный ресурс; проверка повторяется после Astro build. Старый nonce, другой hash или чужой каталог не разрешают переключение. Durable CODE intent/receipt восстанавливаются без отката к уже сменённой публикации. Закрытый machine-only Nest bridge получает текущий nonce/renderer и передаёт exact deployment/commit controller, сверяя active site/snapshot. Verified legacy adoption подключён в runtime и Coolify Compose; внешний rollout ещё не выполнен.

Новый CMS job ждёт, пока renderer runtime совпадёт с обслуживаемым renderer, возвращая UNCERTAIN вместо финального FAILED. Уже сохранённый старый intent может восстановить активацию прежним выпущенным renderer; exact snapshot eligibility/digest проверяются повторно. CODE ждёт незавершённые более новые CMS intents; доказанно FAILED/CANCELLED snapshot не активируется и не блокирует выпуск кода.

BOOTSTRAP допустим только для явно пустого serving. Неопознанная прежняя конфигурация не считается пустой: переход существующего контура требует отдельного проверенного baseline.

## Фактическое состояние на 6 октября 2026 года

Первый Linux runtime CI на `5d07b00` выявил EACCES при Astro telemetry config для non-root пользователя ([#246](https://github.com/Celtoman/astro-telekom/issues/246)); воспроизведение тем же UID на локальном Docker подтвердило причину. Builder задаёт private XDG config/cache и APPDATA, отключает telemetry; runtime сохраняет неожиданные ошибки с redaction токенов, а fixture выводит безопасные container logs перед cleanup. Redis recovery startup race ([#247](https://github.com/Celtoman/astro-telekom/issues/247)) исправляется ожиданием PONG и немедленным rejection handler, сохраняющим ошибку последующего await. Deployment нового target допускается только после повторного зелёного CI.

Отдельный Docker target `publication-runtime` объединяет Node builder/controller с Caddy. Control API слушает loopback, private controller — 8081 внутри сети; image EXPOSE содержит только public 80. Перезапуск проверяет sealed autosave и возобновляет тот же HTML без API. При выходе Caddy supervisor завершается, позволяя container restart восстановить serving. Неизвестный legacy state блокирует запуск вместо EMPTY bootstrap. Настоящий image rehearsal `scripts/rehearse-publication-runtime.mjs` проверил CODE build из serving A, ручную CMS B без provider-запросов, retry receipt, restart при закрытом API, прежние assets и supervisor. Provider/snapshot HTTP — fixtures, baseline HTML синтетический; Coolify Compose и verified adoption теперь реализованы; действующий внешний baseline перенесён, CODE/CMS подтверждены в приёмке ниже.

Реализованы `static-builder.mjs` и закрытый exact snapshot endpoint. Builder получает конкретный publication ID, проверяет site/revision/catalog SHA-256, фиксирует renderer identity по исходникам, lockfile, Node runtime и разрешённому публичному окружению. Каждая реальная Astro-сборка выполняется в отдельной копии выпущенных исходников с уже установленными зависимостями; private snapshot, cache и промежуточные файлы остаются вне public tree. Native assetsPrefix и `publicAsset()` задают versioned URLs до рендера, поэтому inline CSP-хеши не меняются после сборки. Final-HTML/SEO gate проверяет favicon именно этого артефакта; публичные versioned ссылки проверяются на существование файлов. Реальный тест собирает восемь HTML-страниц из каталога API renderer, но использует HTTP fixture: SQL/worker/controller и внешний save→publish этим этапом не подтверждены.

Локально реализованы модули `apps/web/scripts/publication/artifact-store.mjs`, `serving-config.mjs`, `caddy-activation.mjs` и standalone rehearsal `scripts/rehearse-static-activation.mjs`. Они подключены к worker/API и действующему Coolify Compose; внешний static CODE/CMS pipeline подтверждён на `fbf2fb4` ([приёмка](../research/2026-10-06-static-publication-live-acceptance.md)).

На настоящем Caddy с отдельными контейнерами, сетью и каталогом доказаны:

1. Отвергнутая конфигурация сохраняет HTML A и идентификатор API A.
2. Потеря ответа после успешного commit B подтверждается чтением и даёт SUCCEEDED.
3. Потеря ответа вместе с недоступным чтением даёт неопределённый исход; восстановление подтверждает уже обслуживаемый артефакт, не ложный FAILED.
4. Повтор выполненной операции не переключает сайт назад; устаревший ETag и activation precondition отклоняются.
5. Caddy `--resume` поднимает тот же артефакт из собственной сохранённой конфигурации.
6. Старый JS остаётся доступен; HTML и JS открываются после остановки тестового upstream API.
7. Клиентские publication headers заменяются доверенными; неизвестный URL имеет настоящий HTML 404, query в 301 сохраняется; private manifest не выдаётся.
8. CMS не принимает другой renderer. CODE-активация не принимает другой catalog hash под тем же publication ID.

В этом rehearsal HTML — синтетические fixtures, а upstream API — контролируемый HTTP-сервер. Это доказательство serving-протокола, а не full Astro/PostgreSQL или внешнего save→publish сценария.

Первый Linux CI на `d57baf0` выявил проблему прав тестовой изоляции [#242](https://github.com/Celtoman/astro-telekom/issues/242): root-контейнер создавал закрытый state, и cleanup runner скрывал исходную ошибку. Rehearsal теперь запускает Caddy на Linux с UID/GID владельца временного каталога, хранит config/data в этом каталоге, явно ожидает готовности API fixture и выводит исходную ошибку перед cleanup. Windows не меняет container user. Production Compose этим исправлением не меняется; отдельный зелёный Linux CI остаётся обязательным перед deployment.

## Следующие обязательные шаги

`scripts/rehearse-static-publication.mjs` применяет все миграции к отдельному PostgreSQL, создаёт минимальный реальный каталог и запускает настоящие API controllers/services с machine guard и DTO pipe, Redis/BullMQ worker, exact Astro builder, private controller и Caddy. PATCH CITY_HOME SEO сохраняет HTML A до POST ручной публикации. PostgreSQL trigger отклоняет обновление SitePublication после rebuild write: вся acknowledgment-транзакция откатывается, но Caddy уже обслуживает B и public API выбирает его RUNNING snapshot. Рабочие Site/City=DRAFT и архивный переименованный тариф не меняют подсказки/quote/address FK/цену новой несбытовой заявки; outbox и redirect hitCount действительно записаны в SQL. Coverage/DaData и пользовательская auth-ветка — fixtures, внешней доставки нет. Restart PostgreSQL/controller и повтор BullMQ job подтверждают B без пересборки и без FAILED; повтор callback не откатывает serving. Отдельный невалидный SQL-кандидат без обязательного SEO отклонён настоящей Astro-сборкой, B остаётся активным. Старый asset и HTML доступны после остановки SQL/API. Все ресурсы стенда изолированы; CODE/baseline migration, GC и production Compose этим тестом не доказаны.

Public API serving context реализован opt-in в `serving-publication-context.ts` и подключён глобальным interceptor. Proxy token вычисляется как HMAC-SHA256 от machine token с фиксированным сообщением `serving-publication:v1`; Caddy runtime должен использовать то же значение и заменять клиентские заголовки. API принимает exact ID из доверенного контекста, иначе читает `/active` у controller и проверяет SQL snapshot site/revision/hash. RUNNING snapshot допустим, когда HTML уже активирован, а SQL acknowledgment восстанавливается. Каталог, quote, redirects, адресные подсказки/проверки и новые заявки используют снимок; working статусы не переключают публичную версию. Настоящие Nest/Fastify HTTP-запросы проверяют контекст и параллельную изоляцию, SQL/controller пока fixtures. Сквозной PostgreSQL/Caddy rehearsal описан выше; Coolify wiring и внешний rollout/приёмка подтверждены ниже для #238/#244.

Отдельно реализованы private `PublicationController` и opt-in static worker provider. Controller сохраняет write-once intent с hash до активации, проверяет его и sealed manifest при восстановлении; `/publish` принимает только CMS job identity, CODE использует отдельный `/release-code`, BOOTSTRAP через CMS запрещён. Worker восстанавливает ту же BullMQ job при неопределённом исходе и недоступном SQL acknowledgment. API самостоятельно проверяет durable receipt и SQL catalog digest; rebuild/publication/site acknowledgment теперь одна serializable-транзакция. Исправление processing snapshot и транзакционной границы отслеживается в [#243](https://github.com/Celtoman/astro-telekom/issues/243). Coolify Compose закрепляет static provider для API/worker; прямой prod Compose сохраняет legacy provider. SQL-транзакция проверена настоящим PostgreSQL trigger в сквозном HTTP/Caddy rehearsal; baseline/CODE wiring и внешний rollout подтверждены ниже; retention сохраняет все артефакты без cleanup.

Владелец 6 октября разрешил commit, push, deployment и проверки в рамках этой задачи. Текущий этап review/удаления расписания выпущен на exact SHA `d440ec4`; [внешняя приёмка](../research/2026-10-06-manual-publication-rollout.md) не подтверждает внешний rollout нового pipeline этого плана.

1. Long-running builder с exact snapshot endpoint, собственной immutable renderer identity, native versioned Astro assets и реальным final-HTML gate.
2. Закрытый HTTP controller для build/activation/state/receipt и wiring worker, который сохраняет неопределённый activation outcome для восстановления.
3. API принимает доверенный snapshot контекст от Caddy, а для прямого API-запроса получает active ID у controller; чтение остаётся fail-closed. SQL-статусы publication/rebuild и publishedRevision подтверждаются атомарно после receipt.
4. PostgreSQL/Caddy/volume rehearsal с настоящей Astro-сборкой: ошибка сборки, недоступность SQL после активации, retry/restart, устаревший callback, GC и сохранность прежних assets.
5. Проверенный baseline перехода, CODE-release после финального deployment, профильные документы и полный `pnpm check`.
6. В рамках полученного разрешения — push, CI exact SHA, внешний rollout новой механики и live сохранение → публикация → raw HTML/SEO/assets/API/redirects. Только после этой приёмки закрываются #234/#238.

## Проверенный переход legacy и serving options

Migration preflight сравнивает все действующие HTML с exact published catalog по title/description/canonical/robots/H1, полному body-тексту и ссылкам; digest упорядоченного `{path,size,sha256}` связывает реальные байты с publication/site/revision/catalog и прежним deployment/commit. Runtime допускает current только внутри releases собственного volume, сверяет полный route inventory и digest, запечатывает файлы без пересборки working data и сохраняет immutable private baseline record. Повтор startup проверяет record и manifest без API. Старые unversioned assets получают fallback к baseline по whitelist публичных расширений; private JSON/manifest/Caddy config и HTML туда не входят. Артефакты не удаляются.

Renderer identity включает нормализованный hash serving options (upstream, proxy HMAC token, test-mode и baseline assets root). Прежний autosave сохраняет старый контекст до terminal CODE; затем изменённые options активируются вместе с новым renderer при прежних publication ID/revision/catalog. Non-root image rehearsal проверяет это с ротацией key, upstream и test-mode, ожидающим CMS job и restart при выключенном API. Закрытая Nest-команда проверяет machine-only доступ, active site/snapshot и HTTP DTO; ни публичный UI, ни CMS snapshot не задают renderer nonce/команду сборки.


Полный `catalogDigest` proof вычисляется по machine-only exact SQL snapshot, включая diagnostic fields. Хеш публичной проекции фиксируется отдельно: CitiesController исключает пять диагностических полей. До сверки HTML preflight проверяет identity, full digest и совпадение публичной проекции; readState обязан указывать тот же full digest. Подстановка public response вместо immutable snapshot запрещена (#249).


## Завершённая внешняя приёмка 6 октября

На `fbf2fb4` завершены verified baseline/CODE и две CMS-публикации без нового deployment. Working/published revision 13, тестовый Title восстановлен; raw HTML всех 207 city HOME, root/tariff, старые/versioned assets, catalog на двух origins, quote, canonical 301 и защита проверены. [Точные доказательства и границы](../research/2026-10-06-static-publication-live-acceptance.md). Изложенные выше «следующие шаги» относятся к историческим локальным этапам; согласованный минимальный pipeline завершён. GC не включён: все предыдущие artifacts/assets сохраняются, автоматической cleanup нет.
