# BLK-0035: внешний выпуск справочника городов

3 ноября 2026. Задача [#453](https://github.com/Celtoman/astro-telekom/issues/453), реализация [#452](https://github.com/Celtoman/astro-telekom/issues/452). Выпуск подтверждён в защищённом test-контуре: exact-SHA CI, finished deployment, healthy application, CODE receipt и внешние браузерные проверки.

## Идентичность выпуска

| Проверка | Подтверждённый результат |
| --- | --- |
| Код | `59f64d2c71ba6dcfa13ede0f7f254e5c3785c775` |
| CI | [41597918122](https://github.com/Celtoman/astro-telekom/actions/runs/41597918122), success; полный `pnpm check`, без падений и пропусков |
| Coolify | `astro-telekom`, `jlrsktdos9yhchkgnrd9f5fj`, ветка `master` |
| Deployment | `xx7z6zqmndr159thaxa1zwoe`, finished, exact SHA, `running:healthy` |
| CODE | HTTP 200, `SUCCEEDED`; sealed receipt совпал с фактически обслуживаемым artifact |
| Artifact | `fec0db1dfd7ed1d87a513c82f84fc42985b02e0b9916d79b07d62d1db8fa6953` |
| Renderer | `be552d4ea704994d31706fcdfac950c1f45370111dd2f4867488962fd3448ec3` |

[Deployment](evidence/2026-11-03-cities-directory-release/deployment.json), [CODE receipt](evidence/2026-11-03-cities-directory-release/code.json), [проверки](evidence/2026-11-03-cities-directory-release/validation.json).

Runtime-код совпадает с merge-коммитом `a8afdfdf`: BLK-0035 (`582f8a70`) объединён с upstream до `25fd8724`. Архивная retention и эксплуатационные изменения сохранены. Номер находки бюджета архивов перенесён на PF-155, чтобы сохранить PF-148 справочника городов. В выбранный SHA входит docs-only исправление формата canonical Baseline (#456); тест не ослаблялся.

## Внешняя приёмка

Проверка выполнена в Chrome на реальном опубликованном каталоге:

- Девять ширин: 1440, 834, 390, 320, 340, 360, 375, 768 и 1000. Колонки 4/3/2/1, компактный текст на 320, поле высотой 48 px; горизонтального переполнения нет.
- Поиск города и региона, регистр, пробелы, ё/е, динамические счётчики, длинный запрос, пустая выдача, очистка через Tab/Enter и возврат фокуса. Область очистки 44×44 px.
- Клавиатурный переход в `/kazan` и smoke общей HOME: по одному H1, действующая общая оболочка. На самой CITIES также один H1.
- Без JavaScript на 1440 и 320 доступны все 207 городских ссылок, поле поиска отключено.
- Реальный `/preview` в admin на 1440/834/390: общий блок, 207 городов, изображения загружены, sandbox пустой, ссылки и поиск неактивны.
- Оба SVG совпали с принятыми файлами побайтно и загружаются из нового versioned artifact. Без Basic Auth public и admin возвращают 401; `noindex, nofollow` сохранён. Ошибок public JS нет.

[Измерения и действия](evidence/2026-11-03-cities-directory-release/browser.json), [assets и защита](evidence/2026-11-03-cities-directory-release/assets.json), [Desktop](evidence/2026-11-03-cities-directory-release/public-1440.png), [320](evidence/2026-11-03-cities-directory-release/public-320.png), [preview 834](evidence/2026-11-03-cities-directory-release/preview-834.png), [пустая выдача 320](evidence/2026-11-03-cities-directory-release/empty-320.png). Внешние снимки Desktop и 320 просмотрены визуально.

## Сохранность содержимого

Publication `cmvs82yuw000101o52i6ams8d`, рабочая/опубликованная ревизии 24/24, 207 городов и 3805 тарифов сохранены. Полный public digest, tariff digest и sealed catalog digest совпали до/после. Новый CMS snapshot не создавался. CODE сменил только renderer/artifact; прежний artifact — `a1f5c0f0e0cda0b7c77d56473cf9ccd2d133156ea1d79e6c80495604d83169a3`.

Публичная проекция рабочего каталога, включая прежний `CITIES.content.text`, полностью совпала с сохранённым каталогом до деплоя. Из сравнения исключены пять диагностических полей preview, отсутствующих в public response. Сырой working hash непригоден для этой проверки: `variableSources.resolvedAt` меняется при каждом GET. Два повторных чтения рабочего API различались только этой меткой времени. [Доказательства сохранности и точные digests](evidence/2026-11-03-cities-directory-release/preservation.json).

## Локальные проверки и границы

Штатный полный Windows `pnpm check` завершился с кодом 0. Платформенный symlink skip отдельно покрыт обоими Linux retention suites без пропусков; Python flock также проверен. Неудачный полный Docker Desktop runner и первый красный CI не принимались как подтверждение. [Единственный актуальный baseline](../TEST_COVERAGE.md), причины отклонённых попыток и профильный guard — в validation evidence выше. Временная нехватка места текущего выпуска устранена (#455); общие #430/#442 остаются отдельными задачами.

Все 10 прежних пользовательских документов восстановлены вне release-коммитов; добавленные/удалённые строки сверены с исходным stash. Более новая дата индекса technical-debt сохранена из upstream. Пользовательские untracked-файлы не включались в выпуск.

Figma, библиотека, CMS-контент и тарифы не редактировались; реальные заявки не отправлялись. Новых несогласованных продуктовых находок нет. Физические устройства, Safari/Firefox, озвучивание скринридером и мобильная экранная клавиатура не проверены. Решение о реальном трафике остаётся у владельца.

README проверен: команды запуска, состав репозитория и границы публикации сохраняют силу. Актуальный статус блока внесён в [current-state](../current-state.md); первоначальная локальная приёмка хранится [отдельно](2026-11-02-cities-directory-implementation.md).
