# Новости и404: внешний технический выпуск7 ноября 2026

Статус: EXTERNAL TECHNICAL CHECKED; приёмка владельца остаётся открытой в [#534](https://github.com/Celtoman/astro-telekom/issues/534). Работа выполнена по [принятому плану](../plans/2026-11-06-news-and-404-integration.md). Защищённый test-контур сохраняет Basic Auth и общий noindex; готовность к реальному трафику определяет владелец.

## Код и точный выпуск

- SHA: d5a12f0f99b6092e20511b7e7ca14cc22f7f64e3; CI [42309035496](https://github.com/Celtoman/astro-telekom/actions/runs/42309035496) success.
- Локальный финальный pnpm check:1061pass/0fail/1skip; frozen tree b2daa5cf521d01ced62262a326d294204faafb8c. Исходник проверен до metadata-only обновлений; [T10](2026-11-07-news-integration-qa.md).
- Coolify rnk6abcw28mihjtmhnhgnnz5: 2026-11-06T23:17:04.000000Z→2026-11-06T23:21:02.000000Z,238с; фактический SHA совпал, finished/running:healthy. Второй deployment не запускался.
- CODE SUCCEEDED: artifact 0b6cc4815bbda4a3065a0e1b390931da9bac999adbedf7dfc4d154abf0000880, renderer aafa38e63d2fd5fe0c668ac3b468150b39eeae5e3cc83f08a15f9e6b0eb85c1b; исходные publication cmw3yhh28000101tlbxw5phzk, catalog2508436475c59651ea8a894f054addbdf317d9c43a1055d0b930f6261c573f8a и legacy 29/29 сохранены.

## Независимые публикации и данные

NEWS_SETTINGS revision 1 → cmw5lviqp000j01rpmpfapyzh, releaseSequence 21, SUCCEEDED. NOT_FOUND revision 1 → cmw5m0q3v000q01rp7d7yz8zs, releaseSequence 22, SUCCEEDED. Review включал только выбранный scope; все6 articles сохранили content digests/revision 1 и состояние DRAFT. Первичная проверка остановила несоответствие виртуальнойR0 и уже сохранённойR1; история из одной редакции и точные digests подтвердили исходные defaults. Чужие тексты не перезаписывались.

Итоговый SQL-подтверждённый artifact c0fbcfc447e68feb767e968c28ca52b324f2fdf59fc5af3ce8503ce89be991f8; renderer aafa38e63d2fd5fe0c668ac3b468150b39eeae5e3cc83f08a15f9e6b0eb85c1b; manifest 29c8db82b838f187895e28c0f2137d0523c4f9b4c1606db146685cbea4dc9b6b; catalog b37953a129ed70a8fb5ce4635a7624727854ebba40b469734ecc563e9304abe3; basePublicationId cmw5lviqp000j01rpmpfapyzh. Общие CMS working/published29/29 остались прежними. Состав207 городов/3805 тарифов, legacy routes, SEO и контент совпали. После исключения editorial/news routes/news SEO/двух news aliases и только variableSources.resolvedAt общий legacy digest e42477f32b6249fea273b19d0fa162d0dddae0924286807c78ee95baaa3f399f. resolvedAt обновился с 2026-11-05T19:45:50.770Z до 2026-11-06T23:32:33.152Z; YEAR остался2026, остальные значения совпали. Полный digest нового catalog закономерно отличается.

## Перенос материалов

Источник10 записей исчерпан:6 новостей перенесены,4 акции исключены. Слаги и исходные даты сохранены, авторы не выдуманы,6 обложек загружены;0failed/0readbackFailed. После импорта исходная публикация и29/29 не изменились. Стабильный внешний повтор после завершения scoped выпусков:0imported/6skipped/0failed, unchangedPublication=true. Предыдущий повтор совпал с отдельно запущенной публикацией404 и корректно вернул unchangedPublication=false; он не засчитан за проверку стабильности.

Реальные статьи, категория и их301 не публиковались. У двух материалов требуют проверки абсолютные старые ссылки https://tarify-dom.ru/official-site-domru и https://tarify-dom.ru/movix. До содержательной приёмки владельцем выпуск запрещён; демонстрационные материалы на внешний сайт не добавлялись.

## Внешние HTTP-проверки

281проверок PASS: корень,5 общих страниц,207 CITY_HOME через HEAD, примеры CITY_ADDRESS_CHECK/CITY_TARIFF_DETAIL, admin/news/category/settings/404 и их JS/CSS. /news200: empty state,0 карточек,без пагинации; canonical и OG, CollectionPage+пустой ItemList+BreadcrumbList. HOME news скрыт при0 публикаций. Все6 статей, пустая категория, page2/invalid/unknown/media missing дают настоящий404 с принятым шаблоном. /novosti и /news/page/1 дают301 одним шагом на /news, query сохранён. /akcii-domru404. Sitemap содержит /news и исключает drafts/category/page2.

6 cover previews200 image/webp/private,no-store с owner cookie и401 без него. Соответствующие public draft assets404. Без Basic Auth public/admin401; global test-noindex сохранён. Внешние заявки/уведомления не отправлялись. Работа HTML/CSS без API, настоящая статья/категория/page2 с13 синтетическими публикациями, keyboard/recovery и4 адаптива подтверждены локальным [T10](2026-11-07-news-integration-qa.md), а не выданы за опубликованные внешние статьи.

## Настоящий серверный backup/restore

Exact-source helper/PHP/service/timer установлены с SHA256 readback. Credentials существующего private S3 остались внутри Coolify. Первый backup до импорта:9c45c69af9e545e474ce6fd6e256936a509473da4132543dffbf35a93569ddfb,29,717,840B,0assets/24editorial records. После переноса: ca3cdfba61c3f9b3c4fcb7be2d01942504b8e6ae8e60e48a304552621d9b2e2b,35852456B, проверен 2026-11-06T23:38:06.867963+00:00; 6 assets / 38 files / 12 editorial references / 40 editorial records.

Оба комплекта полностью скачаны из S3, проверены по manifest/hash и восстановлены в отдельных PostgreSQL 18 с network=none/tmpfs. Проверены текущие/исторические ссылки; fixtures удалены. Production DB не восстанавливалась. Таймер enabled/active ежедневно 00:45 UTC с jitter до 5 минут; первый автоматический запуск ещё не наблюдался. Новая схема не удаляет S3 objects и не меняет publication-retention. [Runbook](../runbooks/editorial-backup.md), [#546](https://github.com/Celtoman/astro-telekom/issues/546).

## Открытые границы

Владелец ещё принимает внешний UI и содержание 6 drafts. Light theme, настоящий browser zoom 200/400, физический touch и ручной screen reader не проверены; эмуляция viewport/AX/keyboard их не заменяет. Поэтому #534 остаётся открытым по приёмке, технический выпуск не объявлен полным owner acceptance. Прямой SQL readback migration ledger не выполнялся. Архив Figma не изменён. Из исходных 3229 пользовательских путей согласованные документы плана/двух исследований новостей и редакционное уточнение publication.md вошли в реализацию; остальные 3225 путей остались вне коммитов. Исходники приложений и staging после завершения чистые.

Долгие deployments вынесены в [#553](https://github.com/Celtoman/astro-telekom/issues/553): измерена фаза подготовки исходников, точная причина и ускорение не выполнены. Текущий deployment 3 мин 58 с; CMS publication/CODE учитываются отдельно. [Измерения](2026-11-07-deployment-timing-check.md).
