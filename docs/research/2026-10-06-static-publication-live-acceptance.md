# Ручная CMS-публикация без redeploy: внешняя приёмка

6 октября 2026 года, защищённый test-контур `tv-internet-dom.ru` и `admin.tv-internet-dom.ru`. Это техническая приёмка публикации, не решение о допуске реального трафика.

## Выпущенный код

Exact SHA `fbf2fb4ac0f7fbcbf5472b2ccb60a3cae06f3e9e`, [CI 37399613800](https://github.com/Celtoman/astro-telekom/actions/runs/37399613800) — success. Локальный `pnpm check` прошёл без failed/skipped; точный baseline находится в [TEST_COVERAGE](../TEST_COVERAGE.md). Coolify deployment `nettow4sjfw8mlk0auytvbcs` — finished на этом SHA, ресурс healthy, seed и auto-deploy выключены.

Предыдущий переход legacy volume на `eb56d7c` проверен по всем HTML: [baseline и исправление full snapshot proof](2026-10-06-static-migration-preflight.md). CODE-release после terminal deployment сохранённой publication `cmufiu2ik001r01ufdxel4o3a` / revision 7 сохранил полный catalog digest и рабочую ревизию; черновики CMS не опубликовались. Receipt — SUCCEEDED, artifact `3b5c0b566a0b27fe5df1a2359b03a49831a030b038f4b47c0f6281ef86bce958`.

## Сохранение и публикация

Cookie-auth PATCH CITY_HOME Title сохранил временную подпись «— проверка публикации»: working revision 11→12, published revision 7 неизменна. Публичный catalog digest и raw HTML Title остались прежними. Свежий общий review прошёл проверку всех 4 018 URL и сообщил, что публикуется весь сохранённый снимок сайта.

Ручной cookie-auth POST с `expectedWorkingRevision=12` создал publication `cmuw0m1hm000201qlkrzhfgn2`, rebuild `cmtw6dpwj015g01o0ho99ow05`. Worker/controller выполнили Astro build/SEO gate и Caddy activation. SQL publication/rebuild — SUCCEEDED, published revision 12; public catalog и raw HTML используют тот же снимок. Проверка закончена 2026-10-06T01:47:05.868Z.

На всех 207 городских HOME новая подпись появилась в Title. Дополнительно проверены `/` и `/kazan/giga-300`: Title/Description совпадают с `seoByPath`, canonical правильный, один H1, защита test `noindex, nofollow` сохранена. HTTP 404 содержит HTML. Versioned assets доступны, 24 versioned CSS/JS прежних сборок дополнительно сохраняют исходные hashes; 21 старых unversioned assets сохраняют размер и SHA-256.

Для проверки использован временный Title; guarded восстановление изменило только собственную правку при неизменной ожидаемой ревизии и значениях. Оно сохранило working revision 13; повторная ручная публикация `cmuw0r852000901ql5di9i99g` завершилась SUCCEEDED с published revision 13. Подпись удалена, исходный Title-шаблон восстановлен. Повторены те же 209 raw HTML/SEO проверки, 404 и старые/new assets. Проверка закончена 2026-10-06T01:50:12.807Z.

Обе CMS-публикации завершились при одном и том же Coolify deployment `nettow4sjfw8mlk0auytvbcs`; нового deployment между сохранением, публикациями и восстановлением не было. API/admin/worker не перевыкладывались. Все сохранённые изменения сайта до smoke вошли в общий снимок; чужие рабочие поля при восстановлении не перезаписывались.

## Границы доказательств

Проверен реальный cookie/API/SQL acknowledgment/raw HTML/assets путь; SQL-статусы прочитаны через admin API, прямой SQL-аудит внешней БД не выполнялся. UI review и responsive/keyboard/stale/error состояния ранее проверены browser smoke на контролируемых ответах; внешний интерактивный browser E2E не выполнен. API/SQL в действующем контуре ради outage-теста не отключались: автономность HTML/assets, отказ кандидата, lost reply, restart, stale writer/callback и восстановление после SQL rollback подтверждены изолированными настоящими SQL/HTTP/Astro/Caddy и non-root Docker image rehearsals. Старые artifacts/assets сохраняются без автоматической очистки.

При первом ручном POST полный каталог не укладывался в default Prisma transaction budget: [#250](https://github.com/Celtoman/astro-telekom/issues/250). Исправление использует bounded 60-секундную Serializable-транзакцию; real PostgreSQL regression проверяет capture более 5 секунд, stale revision, PENDING/FAILED retry и прежний publishedRevision. Внешний повтор после rollout завершился, что и проверено выше.


Финальный smoke через HTTP подтвердил healthy resource, working/published revision 13, exact private snapshot и совпадение его публичной проекции с catalog на обоих origins. Поддельные publication headers не изменяют снимок. Quote giga-300 соответствует опубликованному тарифу; canonical 301 сохраняет query. Anonymous site/admin требуют Basic Auth, exact snapshot — machine token; прежний POST schedule отвечает 404. Нового deployment нет, auto-deploy и seed выключены.
