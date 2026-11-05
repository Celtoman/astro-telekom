# ACCOUNT — выпуск кода в защищённый test-контур

5 ноября 2026. Задача [#511](https://github.com/Celtoman/astro-telekom/issues/511). Владелец разрешил push/test-deployment, затем отдельно согласовал показанный CMS diff. Публикация `cmw3yhh28000101tlbxw5phzk` активна: **SUCCEEDED,29/29, неопубликованных изменений нет**. [Страница](https://tv-internet-dom.ru/lichnyy-kabinet-dom-ru) и [редактор](https://admin.tv-internet-dom.ru/templates/account) доступны в защищённом test-контуре. Публичный запуск не выполнялся.

## Проверенная цепочка

- В `master` отправлены согласованные 15 коммитов. Исполняемый SHA: `c2982c7267edc202cb695d6065ae9a98c5255b4f`.
- [CI 42091512557](https://github.com/Celtoman/astro-telekom/actions/runs/42091512557): `success`, 957 passed / 0 failed / 0 skipped, Ubuntu / Node22.23.2. Это фактический workflow, а не Windows-результат локальной проверки.
- Coolify MCP: приложение `jlrsktdos9yhchkgnrd9f5fj`, репозиторий `Celtoman/astro-telekom`, ветка `master`, Auto Deploy выключен. Запущен один deployment `jl6yim4jydguraakgkccy3s9`; `finished` 19:35:47 UTC, точный SHA совпал, приложение `running:healthy`.
- CODE того же deployment/SHA подтверждён `SUCCEEDED`, receipt сохранён. Artifact `c91416093bcaf27574182e7a50d98b03f09c33c3b2d3dada1fca1a7f0636abca`, renderer `af133e9d8d65fca1d7f56754c192a32438909f7f9adb00325dd13c42196fd9d1`. Publication `cmw2jk1nr000401p3r0xykg4b`, ревизия28 и catalogDigest `63e70c3b9d35afe8f2a506a512e979f18c77f0f954b6dd071c26e294eb4880bf` совпали с baseline. Первые503 во время запуска runtime сменились202, затем получен durable receipt; другой deployment не создавался. Промежуточные202 сами по себе успехом не считались.

## Полный состав согласованной CMS-активации

До активации: рабочая ревизия28→29, опубликованная28. Review содержал ровно одну CREATE: глобальная страница `account_page_e2124e97458f4ccc6280a94b4e435b08`, `/lichnyy-kabinet-dom-ru`, источник `migration:0067:account`. У страницы есть начальная SEO-запись; старые SEO/страницы не менялись.

| Область | Состав |
| --- | --- |
| Контент | Принятая композиция:13 CODE-блоков и4 сквозных использования; H1,4 абзаца вступления, ссылка `https://dom.ru/user/login`,14 фиксированных иллюстраций,6 исходных FAQ |
| Редактирование | Одна форма `/templates/account`: H1/вступление/loginUrl,14 src/alt,13 caption; FAQ CRUD/порядок. SEO в существующем редакторе. У appScreen подписи нет |
| В коде | Инструкции, условия, суммы, сроки, порядок и оформление секций |
| SEO title / OG title | Личный кабинет Дом.ру — вход и инструкции |
| Description / OG description | Как войти в личный кабинет Дом.ру, восстановить доступ, оплатить услуги и пользоваться приложением. |
| SEO | indexState INDEX в данных; protected test всё равно отдаёт `noindex, nofollow`. OG image: `/images/home-connection-equipment.webp` |
| Производные данные | Ровно+1 маршрут,4225→4226. Две новые SITE-variable usages CONNECTION_PHONE/SUPPORT_PHONE только в FAQ ACCOUNT; resolvedAt пересчитывается при preview |

Live ACCOUNT content совпал с [CODE defaults](../../apps/api/src/assets/account-page-v1.json). Review validation PASSED, проверено4226 путей, issues=[]; это проверка preview, ещё не внешнего ACCOUNT artifact.

Сравнение полных каталогов с исключением новой страницы/маршрута/SEO и двух новых variable usages подтверждает неизменность остального. Site/контакты,207 городов,3805 тарифов, прежние global pages/SEO/routes, redirects, HOME и sitemap configuration сохранены. Публичная проекция совпадает по своему SHA256; immutable catalogDigest сравнен отдельно и тоже не изменился. Не смешивать эти два digest.

## Внешние проверки

Авторизованные `/`, `/kazan`, адресная страница Казани, `/robots.txt`, `/sitemap.xml` возвращают200. Неавторизованные root/robots/sitemap —401; на обоих состояниях `noindex, nofollow`. `/templates/account` доступен как admin shell под Basic Auth и имеет `noindex, nofollow, noarchive`; проверка shell не является авторизованной пользовательской проверкой редактора.

До CMS-активации ACCOUNT возвращал404: CODE прежнего serving snapshot28 не добавил неопубликованную страницу. После активации —200, правильные title/canonical, ровно одна H1, тот же test noindex. Sitemap содержит4226 уникальных URL, ACCOUNT ровно один раз.

HTTP HEAD всех4225 прежних маршрутов: после повторной проверки каждый200, оставшихся ошибок0. В первом проходе78 запросов завершились сетевым fetch failed; все78 повторились успешно. Исходные сбои сохранены вместе с retry; точная причина сетевых обрывов не устанавливалась. Это проверка HTTP-доступности, не всех пользовательских функций4225 страниц.

Живые изображения14/14 возвращают200, полностью декодируются в браузере и совпадают SHA256 с Figma-оригиналами; все под immutable prefix artifact и Cache-Control immutable. На1440/834/390/320 PASS: нет общего горизонтального overflow,14 images/6FAQ/однаH1, подписи слева, без caption мокапа и повторной нумерации в заголовках; на1440 чипы в один ряд и совпали высоты Business/уровни картинок расторжения. Просмотрены screenshots Desktop/Mobile. Все4 адаптива прошли keyboard FAQ, pageErrors=[]. Браузер Edge/Chromium156.0.4314.58, Windows, viewport height900.

На390/320 в отдельных естественных touch-контекстах пройдены5 лент/18 карточек: нативными свайпами до последней/обратно к первой, затем вертикальный жест по той же ленте; keyboard ArrowRight, все11hash/Back/прямой hash URL, без переключающих кнопок. Отдельные non-touch контексты обоих размеров подтвердили wheel/trackpad до края/обратно, вертикальную прокрутку над лентой и ArrowRight. Контент,11anchors и native FAQ доступны без JavaScript. Это CDP/браузерная эмуляция, не физический Android/iOS.

Локальные controlled FLOW/synthetic CMS описаны в [отчёте реализации](2026-11-05-account-implementation.md). Реальные заявки не отправлялись; live save форм не заменяется синтетическими проверками. Физические iOS/Android, NVDA/VoiceOver и реальные пользовательские сессии не выдаются за проверенные.

Составной CDP-прогон wheel→touch→программный reset дважды пропустил вертикальный жест. Изолированные сценарии того же menu rail прошли; увеличение пауз не доказало причину. Для пользовательского сценария отдельно проверяются естественные свайпы до последней/обратно к первой карточке и вертикальная прокрутка без смешивания устройств/reset. CSS по неподтверждённой гипотезе не менялся. Исходные failures и диагностика сохранены; воспроизводимость harness вынесена в [#521](https://github.com/Celtoman/astro-telekom/issues/521). На момент первичной проверки это был открытый QA-нюанс, а не подтверждённый production-регресс и не физический touch PASS. Позднее в тот же день #521 закрыт после контролей reset/no-reset и460 успешных проверок; [отдельный протокол](2026-11-05-account-mobile-scroll.md) сохраняет ограничения эмуляции и не меняет публичный CSS.

## Подтверждение CMS и границы приёмки

Непосредственно перед POST повторно прочитан review:29/28, ровно одна CREATE того же ACCOUNT, validation PASSED/issues=[]. Штатный publish вызван один раз с `expectedWorkingRevision=29`; validation `cmw3yhdzl000001tlwesdcfzc`, publication `cmw3yhh28000101tlbxw5phzk`, rebuild revision25. Подтверждён durable receipt SUCCEEDED и SQL publishedRevision29,29/29/remainingChanges0. Rebuild завершён с первой попытки в19:50:42 UTC,274s; повторного deployment/CMS POST не было.

CMS artifact `ae106d4e0ae6cafae1ffe9c439ad3ee255ed52000c1067355e88b4b90bcea205`, renderer совпал с CODE `af133e9d8d65fca1d7f56754c192a32438909f7f9adb00325dd13c42196fd9d1`; catalogDigest `2508436475c59651ea8a894f054addbdf317d9c43a1055d0b930f6261c573f8a` совпал с frozen snapshot29. Published content редактора совпадает с working content. Публичная проекция после активации закономерно получила другой digest: изменились только globalPages/routes/seoByPath ACCOUNT. С исключением новой страницы проекция идентична прежней;207 городов/3805 тарифов/контакты/редиректы сохранены.

Недостающие `/official-site-domru`, `/faq`, `/proverit-skorost-interneta`, `/{location}/tehpodderzhka` не реализованы. Реальные заявки, внешние входы/платежи/расторжения, звонки и установка приложений не выполнялись. Публичный запуск не проводился.

Доказательства: [baseline](evidence/2026-11-05-account-test-release/before.json), [CI](evidence/2026-11-05-account-test-release/ci.json), [deployment](evidence/2026-11-05-account-test-release/deployment.json), [CODE receipt](evidence/2026-11-05-account-test-release/code-receipt.json), [review](evidence/2026-11-05-account-test-release/cms-review.json), [diff](evidence/2026-11-05-account-test-release/cms-diff.json), [CMS receipt](evidence/2026-11-05-account-test-release/cms-receipt.json), [SQL state](evidence/2026-11-05-account-test-release/cms-state.json), [после активации](evidence/2026-11-05-account-test-release/after.json), [4225 URL и retry](evidence/2026-11-05-account-test-release/live-routes.json), [SEO](evidence/2026-11-05-account-test-release/account-live-seo.json), [sitemap](evidence/2026-11-05-account-test-release/sitemap.json), [14 assets](evidence/2026-11-05-account-test-release/browser/assets.json), [браузер/touch](evidence/2026-11-05-account-test-release/browser/live-browser.json), [wheel/keyboard](evidence/2026-11-05-account-test-release/browser/wheel-keyboard.json), [без JS](evidence/2026-11-05-account-test-release/browser/no-js.json), [диагностика жестов](evidence/2026-11-05-account-test-release/browser/gesture-diagnostic.json). Секреты и credentials в артефакты не записывались.
