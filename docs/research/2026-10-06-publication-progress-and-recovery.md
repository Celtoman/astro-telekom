# Ход публикации и восстановление после deployment

## Инцидент владельца

На exact deployment `mgyiu8gzhxj5gavtkta7tfft` / `81945d2a72ae1d4d7ff33acd54bc536f57b19dd4` новая CMS-публикация `cmuwdjrdt000401o54cit6e60` (revision 14) с 07:45:54 UTC ожидала CODE release: runtime renderer уже изменился, Caddy продолжал обслуживать revision 13. Worker сохранял ту же job как UNCERTAIN; админка показывала общий RUNNING. Native CODE release согласовал renderer, сохранив snapshot 13; та же job revision 14 завершилась SUCCEEDED в 08:07:14 UTC, около 12 секунд после возобновления. Read-only smoke подтвердил working/published 14, неизменный owner snapshot, Title всех 207 CITY_HOME и доступный versioned asset. Дефект [#257](https://github.com/Celtoman/astro-telekom/issues/257) и визуальная обратная связь [#255](https://github.com/Celtoman/astro-telekom/issues/255) объединены в [#256](https://github.com/Celtoman/astro-telekom/issues/256).

## Реализация

Runtime автоматически согласует CODE для обслуживаемого snapshot по runtime `SOURCE_COMMIT`, latest exact finished deployment и healthy resource. Provider проверяется до и после build; CODE не создаёт deployment и не публикует working revision. Ожидающая CMS job продолжается в прежней serial/durable операции. При недоступном provider сохраняется прежняя выдача и объясняется ожидание; машинный bridge остаётся для восстановления. Coolify документирует runtime [SOURCE_COMMIT](https://coolify.io/docs/applications/configuration/environment-variables); поведение дополнительно сверено с source tag 4.3.23.

PREPARING/BUILDING/CHECKING/ACTIVATING/CONFIRMING и heartbeat сохраняются через machine-only API в существующем JSON; события связаны с publication/revision/runId/sequence и защищены CAS. Счётчики получаются из реального Astro stdout и final HTML checks. Telemetry не подтверждает SQL/activation. ETA требует три сопоставимых успешных запуска того же renderer, исключает recovery/CODE wait и исчезает при превышении истории. UI использует текущую shadcn/React Aria систему, восстанавливается после reload и автоматически повторяет polling после сбоя.

## Проверки и границы

- Профильные behavioral suites проверили попытки, чужие/устаревшие события, регресс, ETA, waiting/UNCERTAIN и terminal success.
- Настоящий non-root Node/Caddy image проверил automatic CODE/context release после finished deployment, неизменный serving snapshot, CMS без provider и restart с выключенным API.
- Настоящий PostgreSQL/Redis/Nest HTTP/Astro/Caddy pipeline проверил сохранение telemetry через HTTP/JSON CAS, CONFIRMING при принудительном SQL rollback, отсутствие ложного publishedRevision и восстановление по receipt.
- Browser smoke на контролируемых API-ответах подтвердил desktop и mobile 390 px, доступный progress indicator, отсутствие горизонтального переполнения, waiting CODE, API outage/recovery, успех, reload и подробности шапки. Это проверка UI, не внешний browser E2E.
- Полный `pnpm check` прошёл 675/675 без failures/skips. Повторный gate итогового дерева после коррекции terminal counter также прошёл без failures/skips.
- Внешний rollout новой доработки и автоматический CODE проверены отдельно; результаты приведены ниже. Ранее завершённая [static приёмка](2026-10-06-static-publication-live-acceptance.md) остаётся самостоятельным доказательством прежней версии.

## Завершённая внешняя приёмка

Коммит `215cf652315cc27c2eb0ab20e4594828628237a8` прошёл [Linux CI 37437379411](https://github.com/Celtoman/astro-telekom/actions/runs/37437379411). Deployment `jrvhg2ptfuxelj1cy0egh28s` завершился finished на точном SHA, ресурс running:healthy. Ручной CODE bridge после этого deployment не вызывался: runtime автоматически сменил прежний CMS-артефакт `093250df…` на CODE-артефакт `64649a17…`, сохранив обслуживаемую версию 14. Тестовое сохранение создало working revision 15 и не изменило публичный HTML.

Cookie-auth публикация `cmuwfsnpd000501l648loosqr` / revision 15 прошла SUCCEEDED за 141 секунду для 4 019 HTML, включая служебную 404. API наблюдение сохранило реальные BUILDING/CHECKING счётчики, ACTIVATING/CONFIRMING и серверные timestamps всех пяти этапов. Проверено 207 CITY_HOME Title с тестовым маркером. Затем guarded restore вернул исходный CITY_HOME template владельца; публикация `cmuwfx7x1000c01l6orbddgpt` / revision 16 прошла SUCCEEDED за 117 секунд. Повторно проверены Title всех 207 CITY_HOME, отсутствие маркера и точное совпадение полного `seoByPath` с исходной версией 14: SHA-256 `9426c0806c3bef8175f2202c4578cea7b4bbb0385eec62cbc097155d59d6c748`.

Обе CMS-публикации завершились на том же deployment, без redeploy приложений; прежний versioned asset доступен. Working/published 16, незавершённой публикации нет. Для нового renderer накоплены два успешных measured запуска, поэтому estimate корректно оставался null: диапазон ETA появится при наличии минимум трёх сопоставимых завершённых запусков. Сохранение/публикация проверены через настоящий cookie-auth HTTP API; browser UI smoke выполнялся локально на контролируемых ответах, внешнего интерактивного browser E2E нет. Длительности — измерения этих двух запусков, не SLA.
