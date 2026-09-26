# Target Platform Implementation Plan

> Исторический исполнимый план: порядок работ и статусы ниже зафиксированы на указанные даты. Текущую реализацию сверять с [current-state.md](../current-state.md), механические статусы и чекбоксы — с GitHub Issues.

**Goal:** Быстрее получить рабочую Release 1-версию с полным публичным путем «города и тарифы → импорт → тарифная страница и расчет → заявка → атомарная публикация», не задерживая запуск полным CMS и эксплуатационными улучшениями следующих этапов.

**Architecture:** GitHub Issues являются единственным механическим источником статуса. Этот документ фиксирует последовательность, зависимости и границу Release 1; точные scope, файлы, миграции, тесты и критерии приемки находятся в атомарных task issues. Реализация продолжает существующую модель `workingRevision → SitePublication → SiteRebuild`; legacy-источники удаляются только отдельными задачами после доказанной миграции.

**Tech Stack:** Astro 7, React, Tailwind/shadcn, NestJS 12, Fastify 5, Prisma 7, PostgreSQL 18, BullMQ/Redis, Node test runner, Docker/Coolify.

---

## Состояние исполнения на 24 сентября 2026 года

План ниже сохраняет исходную последовательность и обоснование. Статусы в этом разделе и таблице backlog — срез на 24 сентября, а не замена живого состояния Issues; доказательства того периода отдельно сопоставлены в [аудите решений и модели](../research/2026-09-24-decision-implementation-reconciliation.md). Позднейшие результаты, включая синтетическую заявку 25 сентября и завершение T5, L1, C2 и S4, приведены в [current-state.md](../current-state.md). После выполнения первых волн:

- #158, #160, #161 и #162 закрыты; `0034`–`0036` применены на внешнем test-контуре, publication ревизии 4 успешна;
- T1–T4 (#172–#175), T6–T8 (#176–#178) и F1–F2 (#170–#171) закрыты; родители #157 и #163 также закрыты;
- `0037`–`0039` развернуты exact-SHA deployment `41odv3auf5vez3nknm0z2gcj` на `96df68594f9955edd7bc7090db03046acae7ea27`;
- #202 закрыта после зеленого CI, успешного one-shot migrate и live no-op уже восстановленного Site на publication ревизии 5;
- L2–L5 и L7 (#182–#185, #187), V1–V2 (#188–#189) и S1–S3 (#197–#199) закрыты после реализации; V3/#190 выполнена частично и остается открытой;
- P1/#179 реализована: all-URL report прошел локальный PostgreSQL 18 rehearsal, CI и exact-SHA rollout `tuszecyovtkywimzjebxajwo`; 24 сентября внешний preflight `cmufiu1dl001q01uf4a33hqdb` проверил 4 018 URL без issues;
- L6/#186 и риск основного канала delivery #210 закрыты после исправлений, CI и exact-SHA rollout на внешнем test-контуре; реальная доставка остается отдельной live-проверкой;
- внешний генератор [Celtoman/tarifs#1](https://github.com/Celtoman/tarifs/issues/1) закрыт коммитом [`b9a51ed`](https://github.com/Celtoman/tarifs/commit/b9a51ed83fd3ab9e05c5e84a93aff54ba8d05bd2): 37 колонок и отчет покрытия 104 полей проверены на реальном исходнике; задача остается вне scope #163.
- Платформенная приемка [#218](https://github.com/Celtoman/astro-telekom/issues/218) закрыта: XLSX с 3 805 тарифами дал 0 ошибок/предупреждений, был применён как полный snapshot, publication ревизии 7 и exact-SHA Coolify deployment `nsrkgjikko7ftp8tchbbkryi` завершились успешно; live каталог содержит 207 городов и 4 018 маршрутов.

Старые формулировки «локально», «ожидает CI» и «незавершенный diff» в историческом порядке волн не являются текущим статусом. SEO/OG-шаблоны вошли в успешный опубликованный snapshot ревизии 7: live public API вернул `seoByPath` и `ogTitle` для `/`. Следующие рабочие правки снова потребуют отдельной публикации. На дату этого среза сквозная синтетическая заявка не выполнялась; её последующая приёмка описана в [отчёте от 25 сентября](../research/2026-09-25-release-one-synthetic-lead-acceptance.md).

## Подтвержденные решения владельца от 2026-09-21

1. Release 1 планируется по кратчайшему пути к рабочей публичной версии, а не по попытке одновременно реализовать весь целевой контракт.
2. Работа над внешним генератором вынесена в [Celtoman/tarifs#1](https://github.com/Celtoman/tarifs/issues/1) и является dependency платформенного тарифного импорта.
3. Тарифный diff был разложен по T1–T3 и завершен атомарно; #172–#174 и parent #163 закрыты. Внешний генератор остается за границей #163.
4. До появления финальных дизайнов C1 создает только явно помеченный черновой реестр паспортов. Финальное утверждение остается заблокировано `OPEN-005`.
5. [#144](https://github.com/Celtoman/astro-telekom/issues/144) отложена до отдельного явного запроса владельца. Она остается открытой P3, но не является gate или dependency технической реализации формы.
6. Для lead pipeline подтвержден строгий short-circuit: сначала классификация причины и комментария, затем DaData Phone только для применимой ветки, затем subscriber check, решение и delivery.

## Источники и иерархия

При конфликте использовать порядок:

1. позднее прямое решение владельца;
2. [product-contract.md](../product-contract.md);
3. [product decisions recovery register](../research/2026-09-16-product-decisions-recovery-register.md);
4. [current-state.md](../current-state.md) — только факт реализации;
5. код — доказательство факта, но не продуктового решения.

Стабильные идентификаторы решений: `CORE`, `CMS`, `SEO`, `CITY`, `TAR`, `FORM`, `LEAD`, `ADMIN`. Повторяющиеся Q-номера не используются как основной ключ.

Отмененные решения `TAR-009` и `TAR-073` не входят в backlog. Поле `show_on_site` не должно вернуться под другим именем.

## Граница Release 1

### Входит

- применение уже реализованных foundation-срезов идентичности, телефонов и городов;
- канонический 37-колоночный тарифный XLSX и платформенный full-snapshot импорт;
- минимально достаточный каталог тарифов для проверки и исправления данных;
- публичная тарифная страница, конфигуратор и immutable configuration snapshot заявки;
- трехрезультатная адресная модалка и положительная ветка отправки заявки;
- all-URL validation report, блокирующий публикацию некорректного snapshot;
- полный gate, migration rehearsal и exact-SHA test deployment.

### Не задерживает Release 1

- полная сессионная атрибуция #154;
- расширенная background-классификация и DaData Phone #156;
- глобальный shell indicator #161;
- расширенный purge/slug lifecycle T5;
- admin preview программного тарифного шаблона T9;
- полный каталог переменных V1–V3;
- CMS и паспорта C1–C6;
- SEO-admin и миграция override S1–S4;
- representative preview diagnostics P2.

Это не отмена задач: незавершённые пункты остаются backlog после получения рабочей версии. T9 выполнена позже и по-прежнему не входит в обязательный состав Release 1.

## Milestone Release 1

Фактический состав всегда проверяется через GitHub milestone. Актуализированный состав включает как открытые, так и уже закрытые элементы Release 1:

| Срез | Issue | Причина включения |
| --- | --- | --- |
| R1: единая идентичность Дом.ру | [#162](https://github.com/Celtoman/astro-telekom/issues/162) | Закрыто; внешний rollout подтвержден |
| R2: глобальные телефоны | [#158](https://github.com/Celtoman/astro-telekom/issues/158) | Закрыто; внешний rollout подтвержден |
| R3: канонический каталог городов | [#160](https://github.com/Celtoman/astro-telekom/issues/160) | Закрыто; внешний rollout подтвержден |
| F1: три результата адресной проверки | [#170](https://github.com/Celtoman/astro-telekom/issues/170) | Основной публичный flow |
| F2: положительная ветка заявки | [#171](https://github.com/Celtoman/astro-telekom/issues/171) | Конверсионное завершение flow |
| T1: parser XLSX | [#172](https://github.com/Celtoman/astro-telekom/issues/172) | Канонический вход каталога |
| T2: identity и URL | [#173](https://github.com/Celtoman/astro-telekom/issues/173) | Запрещает скрытые дубли и смену URL |
| T3: snapshot archive/undo | [#174](https://github.com/Celtoman/astro-telekom/issues/174) | Безопасный полный импорт |
| T4: каталог и редактор | [#175](https://github.com/Celtoman/astro-telekom/issues/175) | Минимальная эксплуатация данных |
| T6: renderer страницы тарифа | [#176](https://github.com/Celtoman/astro-telekom/issues/176) | Публичная тарифная URL-страница |
| T7: конфигуратор | [#177](https://github.com/Celtoman/astro-telekom/issues/177) | Расчет выбранной комплектации |
| T8: configuration snapshot | [#178](https://github.com/Celtoman/astro-telekom/issues/178) | Доказуемая заявка |
| P1: all-URL validation report | [#179](https://github.com/Celtoman/astro-telekom/issues/179) | Атомарная безопасная публикация |
| D1: repair legacy publication revision | [#202](https://github.com/Celtoman/astro-telekom/issues/202) | Закрыто; exact-SHA rollout подтвержден |

Родительская [#157](https://github.com/Celtoman/astro-telekom/issues/157) закрыта. Внешняя [Celtoman/tarifs#1](https://github.com/Celtoman/tarifs/issues/1) не может входить в milestone другого репозитория; её результат принят платформой в отдельной закрытой задаче [#218](https://github.com/Celtoman/astro-telekom/issues/218).

## Критический путь — исходная последовательность и остаток на 24 сентября

Ниже сохранена исходная последовательность зависимостей. R1–R3, D1, T1–T4, T6–T8, F1–F2, внешний генератор и платформенная приемка XLSX закрыты. Release 1 опубликован на защищённом test-контуре; следующие шаги относятся к открытому backlog и отдельной проверке реальной заявки/операционного допуска владельцем. Исправления #186 и #210 перечислены в [актуальной сверке](../research/2026-09-24-decision-implementation-reconciliation.md).

```text
R1 #162 ─┐
R2 #158 ─┼─> foundation rollout подтвержден
R3 #160 ─┘
        ↓
D1 #202 → безопасный upgrade существующего publication snapshot

Celtoman/tarifs#1
        ↓
T1 #172 → T2 #173 → T3 #174 → T4 #175  (закрыты)
                                  ↓
                               T6 #176 → T7 #177 ─┐
                                                  ├→ T8 #178
F1 #170 ─────────────────────────→ F2 #171 ───────┘
                                                  ↓
                                               P1 #179
                                                  ↓
             full gate + migration rehearsal
                                                  ↓
                  exact-SHA test deploy
```

В исходном плане F1 допускалась параллельно с T6–T7, а T8 зависела от F2 и T7. Эти задачи завершены; P1 прошла локальные проверки, CI и exact-SHA rollout. #202 устранена и проверена exact-SHA rollout.

## Порядок исполнения Release 1

### Волна 0. Зафиксировать foundation rollout — выполнено

1. Проверить точные SHA `3842d5c`, `0e3ee43`, `027bf97` и отсутствие смешения с незакоммиченным тарифным diff.
2. Подготовить согласованный exact-SHA deployment миграций `0034`, `0035`, `0036`.
3. Не закрывать #162, #158 и #160 до внешнего применения, общей публикации и live smoke.

### Волна 1. Завершить внешний XLSX — выполнено

Исполнить [Celtoman/tarifs#1](https://github.com/Celtoman/tarifs/issues/1):

- прочитать все фактические файлы `D:\01 vibecode\Tarifs\Input`;
- сравнить все исходные столбцы с output;
- присвоить каждому столбцу статус `transferred`, `transformed`, `audit-only` или `intentional exclusion`;
- остановить output, если ранее пустой неподдерживаемый столбец получил содержательные значения;
- доказать баланс строк и отсутствие silent loss;
- получить канонический XLSX из 37 колонок.

Проверено 24 сентября: 1 818 исходных строк = 1 175 активных + 109 ТВ + 534 исключенных; после размножения 3 805 строк, 37 колонок, 0 новых содержательных полей и неизвестных услуг. Отчет отражает 1 147 активных строк с намеренно исключенными камерами. Код генератора прошел 57 тестов; [issue закрыта](https://github.com/Celtoman/tarifs/issues/1). Полученный XLSX затем принят платформой, применён и опубликован в рамках [#218](https://github.com/Celtoman/astro-telekom/issues/218).

### Волна 2. Разложить незавершенный тарифный diff — выполнено

Перед реализацией:

1. Снять read-only inventory текущего diff по файлам и hunks.
2. Сопоставить каждый hunk с T1, T2 или T3.
3. Не использовать `git reset --hard`, `git checkout --`, очистку `.codex-tmp` или потерю незакоммиченных изменений.
4. Завершать и stage-ить только один атомарный срез за раз.
5. Для каждого среза сначала добавить failing tests, затем реализацию и профильные документы; проверки выполнять по действующим [правилам AGENTS.md](../../AGENTS.md#тестирование-и-проверки). На момент составления плана полный gate предполагался для каждого среза.

Последовательность: T1 [#172](https://github.com/Celtoman/astro-telekom/issues/172) → T2 [#173](https://github.com/Celtoman/astro-telekom/issues/173) → T3 [#174](https://github.com/Celtoman/astro-telekom/issues/174).

### Волна 3. Минимальная эксплуатация и публичный renderer

1. T4 [#175](https://github.com/Celtoman/astro-telekom/issues/175) дает оператору поиск, фильтры, quick card и shared manual/import validator.
2. T6 [#176](https://github.com/Celtoman/astro-telekom/issues/176) переводит публичную страницу на типизированные данные и фиксированный порядок блоков.
3. Dangerous purge и расширенный slug lifecycle остаются в T5 [#180](https://github.com/Celtoman/astro-telekom/issues/180) после Release 1.

### Волна 4. Конфигуратор и форма

1. T7 [#177](https://github.com/Celtoman/astro-telekom/issues/177) реализует чистый calculator и UI без скрытых платежей.
2. F1 [#170](https://github.com/Celtoman/astro-telekom/issues/170) фиксирует typed result DTO и accessible modal states.
3. F2 [#171](https://github.com/Celtoman/astro-telekom/issues/171) соединяет положительный результат с телефоном и базовым сохранением заявки.
4. T8 [#178](https://github.com/Celtoman/astro-telekom/issues/178) после F2 и T7 сохраняет неизменяемый снимок комплектации.

### Волна 5. Publication gate

P1 [#179](https://github.com/Celtoman/astro-telekom/issues/179) должен:

- проверять все затронутые URL одного snapshot;
- считать ошибки и предупреждения по единому severity registry;
- отменять публикацию целиком при одной блокирующей ошибке;
- сохранять app version, автора, время, URL count, ошибки, предупреждения и итог;
- оставлять предыдущую опубликованную версию доступной при неуспехе.

### Волна 6. Приемка Release 1

Перед итоговой приемкой Release 1 выполнить полный локальный gate одной командой; он уже включает сборку API до тестов:

```powershell
pnpm check
```

После успешного локального gate:

1. migration rehearsal на production-like копии;
2. exact-SHA test deployment;
3. smoke городского каталога, tariff import preview/apply, тарифной страницы, calculator, трех результатов формы и сохраненной заявки;
4. проверка route inventory, sitemap и publication report;
5. только после этого закрытие release issues;
6. push/deploy — только по отдельному разрешению владельца.

## Полный атомарный backlog

| ID | Решения | Issue | Release 1 | Статус на 24 сентября 2026 года; после этой даты смотреть Issue |
| --- | --- | --- | --- | --- |
| R1 | `ADMIN-004–005` | #162 | Да | закрыто; rollout подтвержден |
| R2 | `ADMIN-001`, `008`, `010`, `013`, `037`, `042` | #158 | Да | закрыто; rollout подтвержден |
| R3 | `CITY-003–006`, `008–010`, `012–018`, `020–023` | #160 | Да | закрыто; rollout подтвержден |
| R4 | `ADMIN-003` | #161 | Нет | issue закрыта |
| EXT1 | `TAR-044–096` | Celtoman/tarifs#1 | Dependency | issue закрыта; output 3 805 × 37 и покрытие 104/104 подтверждены; платформенный apply и публикация ревизии 7 приняты в #218 |
| T1 | тарифный value contract | #172 | Да | реализовано, issue закрыта |
| T2 | `TAR-042–043`, `080–086` | #173 | Да | реализовано, issue закрыта; rollout `0037` подтвержден |
| T3 | `TAR-001–004`, `014`, `019`, `083` | #174 | Да | реализовано, issue закрыта; rollout `0038` подтвержден |
| T4 | tariff catalog/editor contract | #175 | Да | реализовано, issue закрыта |
| T5 | tariff archive/slug lifecycle | #180 | Нет | частично: фильтры архива, slug/301 и публичное исключение архива есть; массовая очистка с учётом связей открыта |
| T6 | typed tariff renderer | #176 | Да | реализовано, issue закрыта; rollout и live HTML подтверждены |
| T7 | tariff calculator/configurator | #177 | Да | реализовано, issue закрыта; live quote проверен |
| T8 | `TAR-034` | #178 | Да | реализовано, issue закрыта; live quote проверен без создания заявки |
| T9 | `CMS-024–028`, `030`, `032–034` | #181 | Нет | реализовано: карточка шаблона, рабочий/опубликованный preview, diff, калькулятор, device modes и code/data status; локальный gate, CI 36010495904 и Coolify deployment `s4gzkael3wfiplepsgj5syku` на `7d7995c` прошли, защищённые UI/API и отсутствие изменения ревизий после quote проверены |
| F1 | `FORM-001–015` | #170 | Да | реализовано, issue закрыта; внешний safe smoke проверен |
| F2 | `FORM-016–023`, `LEAD-014` | #171 | Да | реализовано, issue закрыта; live submit заявки не выполнялся |
| L1 | `LEAD-001–006`, `011` | #154 | Нет | частично |
| L2 | reason registry/short-circuit | #182 | Нет | реализовано, issue закрыта |
| L3 | comment analyzer | #183 | Нет | реализовано, issue закрыта |
| L4 | DaData Phone | #184 | Нет | реализовано, issue закрыта; rollout подтверждён |
| L5 | durable orchestrator | #185 | Нет | реализовано, issue закрыта; rollout подтверждён |
| L6 | lead deduplication | #186 | Нет | исправлено, issue закрыта; телефон за 24 часа имеет приоритет, адресный дубль требует явно совпадающего помещения |
| L7 | admin evidence/retry | #187 | Нет | issue закрыта; внешний rollout отдельно от механического статуса |
| V1 | variable registry/parser/resolver | #188 | Нет | реализовано, issue закрыта |
| V2 | variable catalog/context preview | #189 | Нет | реализовано, issue закрыта |
| V3 | usage/insertion/deprecation | #190 | Нет | частично: текущие SEO/OG и promo insertion есть; будущие Page/Block editors и deprecation открыты |
| C1 | `CMS-038–049` | #191 | Нет | черновой реестр подготовлен, финальное утверждение ждёт дизайна и `OPEN-005` |
| C2 | `CORE-005`, `CMS-001–018`, `CITY-024` | #192 | Нет | шаблон и backfill 207 HOME развернуты; полный публичный каталог эквивалентен, CI и exact-SHA smoke прошли; issue закрыта |
| C3 | main-page editors | #193 | Нет | не начато |
| C4 | functional-page editors | #194 | Нет | не начато |
| C5 | legal document editor | #195 | Нет | не начато |
| C6 | legacy content cleanup | #196 | Нет | не начато |
| S1 | SEO core templates | #197 | Нет | реализовано в рабочем контуре, issue закрыта |
| S2 | Open Graph | #198 | Нет | реализовано в рабочем контуре, issue закрыта |
| S3 | noindex/sitemap | #199 | Нет | реализовано в рабочем контуре, issue закрыта |
| S4 | local SEO cleanup | #200 | Нет | не начато |
| P1 | `CORE-006`, `CMS-014`, `036–037`, `ADMIN-043` | #179 | Да | реализовано: отчет и migration `0050`, CI и exact-SHA rollout; issue закрыта |
| P2 | `CMS-029`, `031`, `035` | #201 | Нет | закрыто: шесть реальных сценариев, структурная диагностика и подсветка, общий renderer в preflight; локальный gate 569/569, CI 36017713767 и Coolify API deployment `i318nsifmcz836g4hszpugbs` на `08a73cf` прошли; live API показал пять покрытых сценариев и предупреждение для отсутствующей минимальной комплектации |
| D1 | publication revision repair | #202 | Да | закрыто; `0039`, CI, exact-SHA rollout и live smoke подтверждены |

## Родительские программы

| Родитель | Native sub-issues |
| --- | --- |
| #156 lead pipeline | #182–#187 |
| #157 address modal | #170–#171 |
| #163 canonical tariff import (закрыт) | #172–#174 (3/3 закрыты) |
| #164 tariff admin | #175, #180 |
| #165 tariff page | #176–#178, #181 |
| #166 variables | #188–#190 |
| #167 CMS | #191–#196 |
| #168 SEO | #197–#200 |
| #169 publication validation (закрыт) | #179, #201 (2/2 закрыты) |

## Правила исполнения каждого атомарного issue

1. До изменения кода перечитать решения и проверить живое состояние issue/dependencies.
2. Сначала добавить или уточнить failing tests.
3. При изменении Prisma создать отдельную migration, выполнить `pnpm db:generate` и `pnpm db:validate`.
4. При изменении `apps/api/src` пересобрать API до запуска тестов.
5. Обновить профильные документы в том же коммите, но не описывать целевое поведение как уже реализованное до проверки.
6. Выполнить проверки по действующим [правилам AGENTS.md](../../AGENTS.md#тестирование-и-проверки); полный gate обязателен для рискованных изменений и перед push кода.
7. Commit должен закрывать только фактически завершенный атомарный issue.
8. Не закрывать родителя, пока открыта хотя бы одна его обязательная sub-issue.
9. Не выполнять push или deploy без отдельного разрешения.

## Документация по доменам

| Домен | Обязательные документы при изменении поведения |
| --- | --- |
| Тарифы | `data-model.md`, `api-contracts.md`, `current-state.md`, `TEST_COVERAGE.md` |
| Public web/forms | `site-structure.md`, `web-design-system.md`, `api-contracts.md`, `TEST_COVERAGE.md` |
| Admin | `admin-design-system.md`, `api-contracts.md`, `current-state.md` |
| Lead pipeline | `architecture.md`, `worker.md`, `data-model.md`, `api-contracts.md`, `TEST_COVERAGE.md` |
| CMS/variables/SEO | `architecture.md`, `site-structure.md`, `data-model.md`, профильный design doc, `TEST_COVERAGE.md` |
| Deployment/publication | `deployment.md`, `architecture.md`, `current-state.md`, `TEST_COVERAGE.md` |

`docs/TEST_COVERAGE.md` обновляется только по фактическому полному запуску. Числа из старых issue-комментариев не считаются актуальным baseline без нового gate.

## Критерий завершения Release 1

Release 1 технически подготовлен к решению владельца о запуске, когда:

1. миграции `0034–0036` и новые release migrations прошли rehearsal и exact-SHA test deployment;
2. канонический XLSX имеет 37 колонок и полный coverage report;
3. importer детерминированно создает, обновляет и архивирует тарифы;
4. опубликованные city/tariff URL соответствуют inventory;
5. tariff renderer и calculator проходят утвержденные сценарии;
6. заявка сохраняет immutable configuration snapshot;
7. все три результата адресной проверки доступны и проверены;
8. publication report проверяет весь затронутый snapshot и fail-closed сохраняет прежнюю публикацию;
9. полный обязательный gate зеленый;
10. GitHub milestone отражает фактические open/closed статусы, а `current-state.md` описывает только проверенный результат.

Решение о допуске реального трафика принимает только владелец.
