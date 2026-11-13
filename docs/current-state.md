# Текущее состояние проекта

7 ноября 2026, #580: политика publication retention выпущена на a761d6c; exact-SHA CI и Coolify deployment успешны, CODE SUCCEEDED с сохранением publication/catalog и CMS29/29. Первая очистка завершена:17старых версий, около14,62ГиБ освобождено в publication volume, восемь версий защищены, кандидатов0. На21:53МСК свободно25,53ГиБ, занято66,99% диска. Timer/path enabled/active: ежечасно в :30 UTC с задержкой до пяти минут и по новым receipts. По указанию владельца дополнительные ручные проверки прекращены; встроенный archive/restore gate сохранён. [Результат и границы](research/2026-11-07-publication-retention-budget.md).

7 ноября 2026, #562/#569: реализованы удаление повторного анонса статьи, Node22.23.4/Astro7.4.7, bounded file I/O, объединённые HTML/asset checks и подробные workTimings. Полный локальный gate и exact-SHA Linux CI пройдены; test-выпуск bc2ac7f завершён, контур healthy, CODE SUCCEEDED. Живые страницы, карточки, preview и админка проверены на четырёх ширинах; реальные статьи, редакции и опубликованные снимки сохранены. Native incremental проверен изолированно, production сохраняет оптимизированный full build; изменение asset-set protocol вынесено в #571 по резервному варианту плана. Реальные статьи/рабочие правки не публиковать. [Проверки и выпуск](research/2026-11-07-news-performance-implementation.md).

Сверка исходников и GitHub — **7 ноября 2026**. Статус — **прототип с защищённым внешним test-контуром**. Только владелец определяет готовность к реальному трафику.

Документ описывает реализованное поведение и известные ограничения. Целевой замысел хранится в [product-contract.md](product-contract.md) и [decisions.md](decisions.md), порядок работы — в [release-plan.md](release-plan.md). Open/closed задач проверяется в [GitHub Issues](https://github.com/Celtoman/astro-telekom/issues). Датированные CI, SHA, revisions и deployment IDs принадлежат [протоколам](research/README.md), а не постоянной сводке состояния.

## Реализовано и остаётся

| Область | Реализовано | Ограничения и отдельный остаток |
| --- | --- | --- |
| Инфраструктура | pnpm monorepo, статические web/admin, NestJS/Fastify API, PostgreSQL/Redis и BullMQ worker. В production Compose миграции — one-shot перед API; readiness проверяет зависимости. CI выполняет `pnpm check`. | Защищённый test-контур и локальные/изолированные проверки не являются автоматическим допуском реального трафика. Полный прямой production stack не объявляется проверенным по одному migration rehearsal. |
| Схема и bootstrap | Единственная схема `prisma/schema.prisma`, миграции `prisma/migrations`, клиент только `apps/api/generated`. В дереве на дату сверки 70 каталогов миграций, последняя — `0070_editorial_redirect_approval`. Seed атомарно создаёт отсутствующие начальные данные и сохраняет существующий контент/credentials. | Число файлов не доказывает применение всех миграций на конкретной внешней БД. Seed требует `ADMIN_EMAIL`/`ADMIN_PASSWORD`, не создаёт публикацию и не заменяет штатную миграцию действующего контура. |
| Доступ и защита | HttpOnly-cookie admin session, отдельные machine/worker границы, login/public DTO validation, honeypot, rate limit и CORS. Test-контур закрыт Basic Auth и noindex. В коде CSP использует точные hashes; manifest задаёт credentials policy. | Нет scoped service accounts и полного Agent diagnostics API ([#34](https://github.com/Celtoman/astro-telekom/issues/34)). Остатки dependency advisories ведутся в [#570](https://github.com/Celtoman/astro-telekom/issues/570); старый audit без advisories не считается текущей гарантией. |
| Города и тарифы | Канонический городской XLSX, серверные каталоги/поиск, create/edit/archive/restore, slug и 301. Тарифный импорт — строгий full-snapshot с validate/apply, business identity и guarded undo; редактор и конфигурация цен/оборудования работают. | Полный перенос нового дизайна тарифной страницы остаётся отдельным этапом; работающий detail не подтверждает завершение этого переноса. Общие функциональные редакторы и безопасный legal-editor остаются отдельным CMS scope. |
| Главные страницы и CMS | Полная управляемая HOME, CITY_HOME 3 с фиксированной композицией, каталогом/фильтрами/сравнением, отдельными текстами и общими фактами/телефонами/графиками/футером. Есть read-only реестр паспортов и специализированные редакторы. | Реестр объединяет несколько типов блоков; его размер и готовность каждого редактора берутся из кода/админки. В HOME ранее разрешены временные демо-FAQ; это не подтверждённые реальные условия. |
| ADDRESS и ACCOUNT | Городской ADDRESS с source-контекстом, CMS и preview; ACCOUNT — информационный гид партнёра с ограниченным редактором, иллюстрациями и FAQ. Оба внедрены в test-контуре. | Собственная абонентская авторизация в ACCOUNT не реализуется: вход/управление договором выполняются у провайдера. Отсутствующие назначения его ссылок учтены в #348. |
| Новости и 404 | Отдельная редакционная модель, ограниченный редактор, изображения/кадрирование, autosave/recovery/history, категории, SEO/social, независимые настройки списка и 404, общие public/preview renderers. Пакет допускает выбранные DRAFT и CHANGED. | Неподготовленный материал блокирует выбранный набор целиком; неизменённые PUBLISHED и WITHDRAWN недоступны для пакета. Владельческая/редакционная приёмка — [#534](https://github.com/Celtoman/astro-telekom/issues/534), замер настоящего batch — [#562](https://github.com/Celtoman/astro-telekom/issues/562). Внешний выпуск CSP/batch-коррекций подтверждён в [#564](https://github.com/Celtoman/astro-telekom/issues/564). |
| Preview и админка | Каталоги, импорты, заявки, redirects, audit, корзина и publication progress работают через API. Persistent React-root, ограниченный кэш с revalidation и защита несохранённых форм реализованы. Preview использует рабочий каталог и общие public renderers/styles/assets. | Preview — безопасный неинтерактивный документ: формы, ссылки, поиск и расчёт не выполняются. Он не заменяет E2E сайта. Ошибка сохранения города за модалкой остаётся в [#273](https://github.com/Celtoman/astro-telekom/issues/273); общей медиатеки и универсального per-entity rollback нет. |
| SEO и подстановки | Типизированные SEO/OG-шаблоны, проверка всех URL перед публикацией, post-build SEO gate, sitemap/noindex. Новости имеют отдельные редакционные SEO/social и графы Article/NewsArticle, CollectionPage, BreadcrumbList и ItemList поверх базового WebPage. Есть typed registry переменных, usage, вставка и guarded migration API. | Product/FAQ-разметка тарифов и FAQ-блоков не реализована. V3 остаётся частичной: интеграция/миграция новых разрешённых полей и реальная согласованная пара замены — [#190](https://github.com/Celtoman/astro-telekom/issues/190). |
| Адрес и заявки | Глобальные DaData suggest/clean, мягкое IPLocate-ранжирование, фактический город/регион адреса и Tarifnik address/check. FLOW1 принимает обращение/выбранный тариф; FLOW2 проверяет адрес. Лид сохраняет source, согласие, конфигурацию и evidence, затем проходит фоновую проверку и доставку. | Source-город не ограничивает поиск адреса. Недоступная интеграция даёт ошибку/ручной маршрут, а не ложное покрытие или доставку. Раздельный учёт расхода DaData — [#353](https://github.com/Celtoman/astro-telekom/issues/353). |
| Worker и PII | Очереди решений/доставки/оповещений/rebuild, reconciler и policy-driven purge через worker-only HTTP API. Согласованный срок сырых заявок — 180 дней; выполнение purge требует валидной конфигурации. | Только API работает с PostgreSQL. Без Redis rebuild остаётся PENDING, локальный fallback заявок не является durable production-очередью. Исторический tariff-import listener не участвует в текущем штатном импорте. |
| Эксплуатация и архивы | Публикационные артефакты имеют receipts/recovery; GC старого HTML защищает действующие/rollback/недавние версии и требует внешний архив с readback/restore. Для редакционных DB/media реализован отдельный backup/restore-контур. | Это не универсальный backup всей платформы. Утраченный пограничный journal 30 октября не восстановлен: потеряно около 11 ч 44 мин внутри требовавшихся 30 суток. Владелец 7 ноября принял это ограничение; [#443](https://github.com/Celtoman/astro-telekom/issues/443)/[#444](https://github.com/Celtoman/astro-telekom/issues/444) закрыты, дальнейшее восстановление отменено. |

## Публичные маршруты

Static output строится из точного inventory опубликованного снимка. В текущем коде поддержаны:

- `/`, `/{location}` и `/{location}/{tariffSlug}` опубликованных городов/тарифов;
- городской `/{location}/proverka-podklyucheniya-k-domru-po-adresu`, если снимок поддерживает ADDRESS;
- пять обязательных общих страниц на действующих URL: `/goroda-obsluzhivaniya`, `/karta-pokrytiya-provaydera`, `/politika-konfidencialnosti`, `/soglasie-na-obrabotku-personalnyh-dannyh`, `/politika-obrabotki-faylov-kuki`;
- опциональный для исторических снимков `/lichnyy-kabinet-dom-ru`;
- `/news`, опубликованные статьи/категории и path-пагинация; недоступные материалы и номера страниц сохраняют 404;
- системные robots, XML sitemap, redirects и общий ответ 404 для неизвестных URL.

Три городские категории не создают отдельные посадочные: действующая навигация использует фильтры CITY_HOME. Общий справочник городов реализован; страница покрытия пока содержит список городов и адресную проверку, а не географическую карту.

Исходный inventory `N + T + 6`, варианты с ADDRESS/ACCOUNT и редакционными маршрутами относятся к разным версиям снимков. Одну старую формулу нельзя применять ко всем текущим и историческим публикациям. Источники: [route policy](../apps/api/src/public-route-policy.ts), [news projection](../apps/api/src/news-projection.ts), [структура сайта](site-structure.md).

Свежая датированная сверка недостающих страниц, четырёх переходов URL существующих функций и зависимостей ACCOUNT — в [#348 и её плане](plans/2026-10-16-missing-pages-analysis-plan.md). Это справочный остаток. По правилу владельца задачи по страницам начинаются только по его отдельным поручениям.

## Контракт данных и публикации

Сохранение в админке меняет рабочие данные, ревизию и audit, но не обслуживаемый HTML. Есть два разных процесса:

1. **Общая CMS-публикация** проверяет рабочий каталог сайта, фиксирует immutable snapshot и запускает его сборку/активацию.
2. **Редакционная публикация** выпускает явно выбранные изменения статьи, категории, настроек списка/404 или пакета материалов поверх serving baseline. Она сохраняет точные revisions, зависимости, CAS и operation recovery; посторонние рабочие правки не захватываются.

В Coolify контент собирает private static controller, активация Caddy атомарна и не требует redeploy приложений. Успех подтверждается durable receipt и SQL acknowledgment; неопределённый исход сохраняет ту же rebuild job для восстановления. Выпуск кода пересобирает уже обслуживаемый снимок новым renderer и не публикует рабочие черновики. Публикации по расписанию нет. Подробный контракт — [publication.md](publication.md).

Общие legacy-страницы ещё используют Provider → Site → Page content resolution; CITY_HOME использует общий PageTemplate. Удаление deep merge требует доказанной миграции непустых данных и эквивалентности ([#196](https://github.com/Celtoman/astro-telekom/issues/196)).

## Проверки и окружение

Точный состав и числовой baseline тестов ведутся только в [TEST_COVERAGE.md](TEST_COVERAGE.md). Зелёный demo build доказывает сборку кода; наличие env — конфигурацию, а не фактическую работу внешнего сервиса. Browser E2E, HTTP smoke, SQL rehearsal и Figma-приёмка имеют разные границы доказательств.

Локальные Windows/Docker-сбои и ограничения ресурсов остаются отдельными записями, включая [#455](https://github.com/Celtoman/astro-telekom/issues/455), [#496](https://github.com/Celtoman/astro-telekom/issues/496), [#517](https://github.com/Celtoman/astro-telekom/issues/517) и [#567](https://github.com/Celtoman/astro-telekom/issues/567). Успешный повтор проверки не считается установленным исправлением их причин.

Синтетическая доставка в Tarifnik и email ранее подтверждена отдельным [протоколом](research/2026-09-25-release-one-synthetic-lead-acceptance.md). Production campaign Tarifnik не меняется агентом без отдельного решения. Дополнительная legal-проверка [#144](https://github.com/Celtoman/astro-telekom/issues/144) оставлена владельцем как P3 вне milestone Release 1 и не является автоматическим gate допуска трафика.

Окружение/секреты и процедура агента с Coolify — [deployment.md](deployment.md); API — [api-contracts.md](api-contracts.md); worker — [worker.md](worker.md). В этой документационной сверке полный gate, build/deployment и внешняя приёмка не выполнялись; профильные документационные guards проверены отдельно.

## Исторические протоколы

7 ноября 2026 года владелец принял организационную работу [#349](https://github.com/Celtoman/astro-telekom/issues/349) с историческим исключением [#350](https://github.com/Celtoman/astro-telekom/issues/350). Полное сравнение Movix Review 1592:565 с прежним деревом слоёв и prototype reactions не подтверждено. Обе задачи закрыты; дальнейшее восстановление отменено владельцем.

Ниже — доказательства на дату операции. Старые SHA, snapshot IDs, объём каталога и количество черновиков не являются постоянным состоянием живого контура.

| Область | Протокол |
| --- | --- |
| Общая HOME | [Полная интеграция и внешний выпуск 16 октября](research/2026-10-16-general-home-external-acceptance.md) |
| CITY_HOME | [Внедрение 28 октября](research/2026-10-28-city-home-live-acceptance.md), [сверка со Screens](research/2026-10-28-city-screens-layout-acceptance.md) |
| Общая оболочка и legal | [Стабильность публичной оболочки](research/2026-10-29-public-shell-stability.md), [выпуск исправлений и legal-блока](research/2026-10-29-city-shell-release.md) |
| Города обслуживания | [Выпуск и выравнивание справочника 3 ноября](research/2026-11-03-cities-directory-alignment.md) |
| ADDRESS | [Внедрение 4 ноября](research/2026-11-04-address-page-implementation.md), [отступы и H1](research/2026-11-04-address-page-spacing.md) |
| Тарифные условия | [Три согласованные коррекции 4 ноября](research/2026-11-04-tariff-contract-release.md) |
| ACCOUNT | [Выпуск 5 ноября](research/2026-11-05-account-test-release.md), [мобильный QA](research/2026-11-05-account-mobile-scroll.md) |
| Новости и 404 | [Первый внешний выпуск](research/2026-11-07-news-external-release.md), [карточки и пакетный review](research/2026-11-07-news-fix-test-release.md) |
| CSP/manifest и CHANGED-пакет | [Внешний выпуск и границы проверки](research/2026-11-07-csp-manifest-and-changed-batch.md); [#564](https://github.com/Celtoman/astro-telekom/issues/564) закрыта, реальная batch-активация остаётся в [#562](https://github.com/Celtoman/astro-telekom/issues/562) |
| Иконки шапки | [Внешняя адресная проверка 7 ноября](research/2026-11-07-issues-352-493-435-reconciliation.md) |
| Публикационные архивы | [Внедрение и restore-проверки](research/2026-10-29-publication-retention.md), [runbook](runbooks/publication-retention.md) |
| Инцидент journal | [Очистка 30 октября и невосстановленная утрата](research/2026-10-30-vps-cleanup.md) |

Полный индекс — [research/README.md](research/README.md). При расхождении датированных документов текущие технические утверждения сверяются с owning кодом и актуальным issue; статус Figma не переносится автоматически на код, публикацию или владельческую приёмку сайта.

## OFFICIAL_SITE — 13 ноября2026

Реализованы модель OFFICIAL_SITE, рабочая инициализация0071/0072, guarded CMS-редактор, optional global route, единый runtime/preview, семь immutable изображений и полный GLOBAL FLOW2. Страница активирована в защищённом test-контуре; CI/deployment/CODE/CMS успешны. Четыре ширины и все мобильные области прокрутки проверены во встроенном браузере. Внешняя визуальная проверка CMS ограничена его Basic Auth; редактор/API и preview проверены локально, рабочее содержимое и публикация сверены через HTTP. Принятый Screens и «Плюсы и минусы» сохранены. Неподтверждённые коммерческие сведения разрешены владельцем только для защищённого test; публичная актуализация отдельно. [Результат и ограничения](research/2026-11-13-official-site-code-and-test.md).

Согласованные владельцем правки OFFICIAL_SITE (Hero2, тексты/alt, корпоративный телефон, внешние интервалы24px) выпущены в защищённый test: код35446c5, CI1107pass, CODE и CMS32/32/rebuild35 SUCCEEDED. Четыре фактические ширины и18native scrolling cases проверены в Codex IAB; каталог и защищённые области сохранены. [Область и проверки](research/2026-11-13-official-site-owner-fixes.md).


### Сквозной футер: согласованная правка13 ноября2026

В коде public/preview используется один BLK-0016 с тремя группами и13 пунктами при полном inventory, включая ACCOUNT, NEWS, OFFICIAL_SITE и COVERAGE. Page-specific профиль OFFICIAL_SITE удалён, ссылки отсутствующих страниц отфильтрованы по snapshot routes. Figma: исходные три варианта обновлены, 34 активных Screens экземпляра сохранили связи и остальные блоки. Контакты/CTA/legal сохранены. Внешний CODE99404968 подтверждён SUCCEEDED, exact-SHA CI зелёный;9страниц прошли36проверок четырёх ширин и12реальных переходов в Codex IAB. CMS32/32 и каталог сохранены, normalised asset scope comparison подтвердил неизменность header/main. [Протокол](research/2026-11-13-shared-footer.md). Это техническая приёмка защищённого test, не решение о публичном запуске.
