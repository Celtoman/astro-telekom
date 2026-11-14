# Task 2 — SPEED_TEST backend: выполнено

Рабочая копия: C:/Users/Александр/.codex/worktrees/astro-speedtest-601/astro-telekom. Другой checkout не изменялся. Без commit/push, внешнего seed, публикации и deploy.

## Итоговый контракт для renderer/CMS

- PageType/SeoTemplateKind: SPEED_TEST, optional site-global Page, cityId=null, canonical slug proverit-skorost-interneta, version1.0.0.
- apps/api/src/speed-test-page-model.ts: SpeedTestPageContent, SpeedTestTextCard, SPEED_TEST_PAGE_SLUG/VERSION/SCHEMA/SECTION_LABELS, speedTestEditableField(path), speedTestFieldLabel(path).
- Модель совпадает с brief: hero.h1; preparation.title/intro/methods.{cable,wifi}.{title,body}/comparison.{title,body}/stepsTitle/steps.{connection,downloads,devices,vpn,browser,conditions}.{title,body}; metrics.title/intro/items.{download,upload,ping,jitter}.{title,body}/units.{title,body,formula,note}; tasks.title/intro/items.{video,calls,games,files}.{title,body,value,caption}; factors.title/intro/items.{wifi,equipment,traffic,server}.{title,body}/note; diagnosis.title/intro/items.{wifi,cable,website}.{title,body,condition}; support.title/intro/cardTitle/audience/freeCallText/scopeText/prepareTitle/items.{contract,results,problem}.{title,body}; faq.title/items[].{question,answer}.
- apps/api/src/speed-test-page.ts: validateSpeedTestPage(raw,draft=false) возвращает missingFields; assertSpeedTestPage(raw,draft=false); normalizeSpeedTestPage(raw,draft=false) валидирует и возвращает независимую копию. Нормализация не меняет принятый текст.
- speedTestPageDefaults() из speed-test-page-defaults.ts читает assets/speed-test-page-v1.json и валидирует свежую независимую копию.
- Все смысловые карточки — fixed object keys. FAQ draft0–50, publication1–50, исходные6 FAQ из MD. Все native text fields допускают только SITE-переменные (version запрещает переменные). HTML/служебные символы, неизвестные ключи/версии/переменные/контексты отклоняются.
- Строгие schema/editableField исключают version, phones/hours, colors/icons/layout/widgetURL/scripts из CMS. Контакты/графики — Site/publicDisplay. Согласованные literal тексты всех6разделов и оговорки jitter/1000МБ сохранены; phone/hours из help.values намеренно не продублированы.
- Endpoint по уточнению контроллера: GET/PATCH /admin/sites/:siteId/speed-test (brief.siteSlug был неточен). Guard AdminTokenGuard.
- GET: content,pageId,status,workingRevision,publishedRevision,published,publishedAvailable,missingFields,system.{connectionPhone,supportPhone}. Published часть exact serving source; при его недоступности working доступен, publishedAvailable=false/publishedRevision=null.
- PATCH только {expectedWorkingRevision,content}; Serializable, одна PAGE working revision с actor/source admin:speed-test, P2034/stale409. Возвращает content,page,pageId,status,missingFields,workingRevision. Save не публикует и не изменяет publishedRevision.

## Изменённые файлы

Новые:
- apps/api/src/{speed-test-page-model.ts,speed-test-page.ts,speed-test-page-defaults.ts,speed-test-page-passports.ts,admin-speed-test.controller.ts,assets/speed-test-page-v1.json}.
- prisma/migrations/{0073_speed_test_kind,0074_speed_test_page}/migration.sql.
- tests/{speed-test-contract.test.cjs,speed-test-api.test.cjs,speed-test-data.test.cjs}.
- scripts/rehearse-speed-test.mjs.

Интеграция:
- prisma/schema.prisma и apps/api/generated (единственный клиент; содержательная разница enum/schema+schema hash; runtime-файлы местами имеют только line-ending status, без реального diff).
- apps/api/src/{module.ts,admin-pages.controller.ts,public-route-policy.ts,account-public-source.ts,serving-publication-context.ts,public-leads.controller.ts,site-catalog.service.ts,catalog-variables.ts,working-variable-usages.service.ts,publication-validation.ts,publication-change-summary.ts,seed.ts,block-passports.ts}.
- tests/block-passports.test.cjs.
- scripts/rehearse-account-page.mjs и scripts/rehearse-official-site.mjs.
- docs/{TEST_COVERAGE.md,api-contracts.md,data-model.md,publication.md}.

## Red / green и проверки

Применён навык superpowers:test-driven-development. Первые новые контракт/API tests созданы до production code. После baseline API build Node24 команда node --test tests/speed-test-contract.test.cjs tests/speed-test-api.test.cjs упала на отсутствующих speed-test-page-defaults/admin-speed-test.controller (ожидаемый RED).

После реализации:
- pnpm db:generate — PASS; pnpm db:validate — PASS. Второго packages/database/generated нет.
- pnpm --filter @provider/api lint — PASS.
- pnpm --filter @provider/api run build — PASS (повтор после итоговых source правок).
- Финальный node --test tests/speed-test-contract.test.cjs tests/speed-test-api.test.cjs tests/block-passports.test.cjs tests/publication-validation.test.cjs tests/seo-templates.test.cjs tests/account-page-api.test.cjs tests/official-site-api.test.cjs tests/official-site-contract.test.cjs — 61 pass /0fail /0skip.
- Локальный PostgreSQL прогон: node --test tests/speed-test-contract.test.cjs tests/speed-test-api.test.cjs tests/speed-test-data.test.cjs tests/block-passports.test.cjs tests/official-site-contract.test.cjs tests/official-site-api.test.cjs tests/official-site-data.test.cjs tests/account-page-data.test.cjs — 37 pass /0fail /0skip на том состоянии, до добавления дополнительных unit cases. Все3реальные isolated PostgreSQL rehearsals успешны; SPEED_TEST fresh seed/migration/idempotence/authored preservation/provider isolation/atomic save/3URL-collision rollback/immutable publication проверены.
- Затем новые дополнительные unit cases включены в61-pass финальный прогон. Source изменения после DB прогона только нейтральные сообщения об общей странице и generic-writer error, логика SQL не менялась.
- git diff --check — PASS (только штатные CRLF warnings generated файлов).
- Все локальные markdown links в4изменённых docs проверены — PASS;19 variable definitions подтверждены кодом.

Для Node24 в PowerShell использовался PATH с .codex-tmp/bin перед runtime node/bin; глобальный pnpm.ps1 иначе закрепляетNode22. .codex-tmp/bin/pnpm.cmd подготовлен контроллером.

## Решение для исторических rehearsals

Исторические migrations0067/0072 неизменны. Старый ACCOUNT rehearsal уже подставлял текущий pg_get_constraintdef глобального scope при replay backfill; его assertion теперь проверяет SPEED_TEST. OFFICIAL_SITE rehearsal адаптирован тем же способом: только в тестовой строке воспроизведения исходный ADD CONSTRAINT заменяется текущим определением, сохраняя новую страницу/constraint; прочие шаги/данные старой миграции проверяются как раньше. Это позволяет тестировать исторический backfill на актуальной схеме без удаления более новых Page или production skip-флагов. Обе проверки реально прошли.

## Границы и следующий этап

Frontend/admin/CSP не изменялись. README/current-state/site-structure и общую сводку выпуска обновляет контроллер после интеграции renderer/CMS. Полный pnpm check, итоговый review, commit/push/release — контроллер; я их не запускал. Внешняя миграция, CMS и публикация не выполнялись.

Паспорта SPEED_TEST привязаны к согласованным Screens1238:867/879/891/903 (parent frame каждой ширины; конкретные дочерние IDs не выдуманы). Backend registry помечает8контрактов READY в ожидании интеграции последующих задач этого же принятого плана; перед завершением всей работы проверить согласованность actual renderer/editor.

Новых несогласованных продуктовых идей или посторонних проблем не обнаружено. Новый route остаётся опциональным, старые снимки не расширяются.

## Integration fix после первого full gate — seed rehearsal

Контроллер сообщил об ожидаемом RED в scripts/rehearse-seed.mjs: устаревшие assertions11routes/11SEO после добавления SPEED_TEST. Production seed и каталог уже корректно выдавали новую страницу; production source не менялся.

Исправлены только scripts/rehearse-seed.mjs, актуальный seed-абзац docs/deployment.md и текущее описание seed coverage в docs/TEST_COVERAGE.md. Assertions теперь ожидают12routes/12SEO с явным разложением root+5required globals+ACCOUNT/OFFICIAL_SITE/SPEED_TEST+cityHOME+ADDRESS+synthetic tariff. Добавлены отдельные проверки единственной SPEED_TEST global Page, siteId, cityId=null, PUBLISHED, canonical slug, literal defaults в working source и rendered catalog, точного GLOBAL_PAGE route и собственного SEO template/seoByPath. Датированные исторические счётчики документов не менялись.

Профильная проверка Node24.22.1 с ранее подготовленным PATH/shim:

`node --test tests/seed.test.cjs` — PASS:1pass/0fail/0skip; testcase36099.0786ms, полный runner36294.7489ms, exit0. Test действительно выполняет scripts/rehearse-seed.mjs на собственном случайно именованном временном Docker PostgreSQL18, всю актуальную цепочку migrations, compiled seed, preflight, повтор с byte-equivalent сохранением snapshot/credentials, сохранность owner edits/imported catalog и atomic rollback. Успешное завершение подтверждает все новые SPEED_TEST assertions.

`node --check scripts/rehearse-seed.mjs` — PASS; `git diff --check -- scripts/rehearse-seed.mjs docs/deployment.md docs/TEST_COVERAGE.md` — PASS. Полный gate не запускался; commit/push/deploy/subagents не выполнялись.
