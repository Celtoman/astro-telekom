# Target Platform Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Быстрее получить рабочую Release 1-версию с полным публичным путем «города и тарифы → импорт → тарифная страница и расчет → заявка → атомарная публикация», не задерживая запуск полным CMS и эксплуатационными улучшениями следующих этапов.

**Architecture:** GitHub Issues являются единственным механическим источником статуса. Этот документ фиксирует последовательность, зависимости и границу Release 1; точные scope, файлы, миграции, тесты и критерии приемки находятся в атомарных task issues. Реализация продолжает существующую модель `workingRevision → SitePublication → SiteRebuild`; legacy-источники удаляются только отдельными задачами после доказанной миграции.

**Tech Stack:** Astro 7, React, Tailwind/shadcn, NestJS 12, Fastify 5, Prisma 7, PostgreSQL 18, BullMQ/Redis, Node test runner, Docker/Coolify.

---

## Подтвержденные решения владельца от 2026-09-21

1. Release 1 планируется по кратчайшему пути к рабочей публичной версии, а не по попытке одновременно реализовать весь целевой контракт.
2. Работа над внешним генератором вынесена в [Celtoman/tarifs#1](https://github.com/Celtoman/tarifs/issues/1) и является dependency платформенного тарифного импорта.
3. Незавершенный тарифный diff сохраняется и раскладывается по T1–T3; его нельзя продолжать или коммитить как одну неделимую #163.
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

Это не отмена этих задач. Они остаются открытым backlog после получения рабочей версии.

## Milestone Release 1

Фактический состав всегда проверяется через GitHub milestone. На момент фиксации план включает:

| Срез | Issue | Причина включения |
| --- | --- | --- |
| R1: единая идентичность Дом.ру | [#162](https://github.com/Celtoman/astro-telekom/issues/162) | Уже реализовано локально; нужен rollout |
| R2: глобальные телефоны | [#158](https://github.com/Celtoman/astro-telekom/issues/158) | Обязательные контакты и readiness |
| R3: канонический каталог городов | [#160](https://github.com/Celtoman/astro-telekom/issues/160) | Основа городских URL и tariff relation |
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

Родительская [#157](https://github.com/Celtoman/astro-telekom/issues/157) также остается в milestone. Внешняя [Celtoman/tarifs#1](https://github.com/Celtoman/tarifs/issues/1) не может входить в milestone другого репозитория, но является явной release dependency.

## Критический путь

```text
R1 #162 ─┐
R2 #158 ─┼─> foundation готов к test rollout
R3 #160 ─┘

Celtoman/tarifs#1
        ↓
T1 #172 → T2 #173 → T3 #174 → T4 #175
        ↓                         ↓
      T6 #176 → T7 #177 → T8 #178
                         ↓
F1 #170 ───────────────→ F2 #171
                         ↓
                      P1 #179
                         ↓
             full gate + migration rehearsal
                         ↓
                  exact-SHA test deploy
```

F1 можно выполнять параллельно с T1–T7. F2 завершается после согласования DTO T8. P1 интегрируется последним, когда доменные validators уже существуют.

## Порядок исполнения Release 1

### Волна 0. Зафиксировать foundation rollout

1. Проверить точные SHA `3842d5c`, `0e3ee43`, `027bf97` и отсутствие смешения с незакоммиченным тарифным diff.
2. Подготовить согласованный exact-SHA deployment миграций `0034`, `0035`, `0036`.
3. Не закрывать #162, #158 и #160 до внешнего применения, общей публикации и live smoke.

### Волна 1. Завершить внешний XLSX

Исполнить [Celtoman/tarifs#1](https://github.com/Celtoman/tarifs/issues/1):

- прочитать все фактические файлы `D:\01 vibecode\Tarifs\Input`;
- сравнить все исходные столбцы с output;
- присвоить каждому столбцу статус `transferred`, `transformed`, `audit-only` или `intentional exclusion`;
- остановить output, если ранее пустой неподдерживаемый столбец получил содержательные значения;
- доказать баланс строк и отсутствие silent loss;
- получить канонический XLSX из 37 колонок.

### Волна 2. Разложить незавершенный тарифный diff

Перед реализацией:

1. Снять read-only inventory текущего diff по файлам и hunks.
2. Сопоставить каждый hunk с T1, T2 или T3.
3. Не использовать `git reset --hard`, `git checkout --`, очистку `.codex-tmp` или потерю незакоммиченных изменений.
4. Завершать и stage-ить только один атомарный срез за раз.
5. Для каждого среза сначала добавить failing tests, затем реализацию, профильные документы и полный gate.

Последовательность: T1 [#172](https://github.com/Celtoman/astro-telekom/issues/172) → T2 [#173](https://github.com/Celtoman/astro-telekom/issues/173) → T3 [#174](https://github.com/Celtoman/astro-telekom/issues/174).

### Волна 3. Минимальная эксплуатация и публичный renderer

1. T4 [#175](https://github.com/Celtoman/astro-telekom/issues/175) дает оператору поиск, фильтры, quick card и shared manual/import validator.
2. T6 [#176](https://github.com/Celtoman/astro-telekom/issues/176) переводит публичную страницу на типизированные данные и фиксированный порядок блоков.
3. Dangerous purge и расширенный slug lifecycle остаются в T5 [#180](https://github.com/Celtoman/astro-telekom/issues/180) после Release 1.

### Волна 4. Конфигуратор и форма

1. T7 [#177](https://github.com/Celtoman/astro-telekom/issues/177) реализует чистый calculator и UI без скрытых платежей.
2. T8 [#178](https://github.com/Celtoman/astro-telekom/issues/178) сохраняет неизменяемый снимок комплектации.
3. F1 [#170](https://github.com/Celtoman/astro-telekom/issues/170) фиксирует typed result DTO и accessible modal states.
4. F2 [#171](https://github.com/Celtoman/astro-telekom/issues/171) соединяет положительный результат с телефоном, T8 snapshot и сохранением заявки.

### Волна 5. Publication gate

P1 [#179](https://github.com/Celtoman/astro-telekom/issues/179) должен:

- проверять все затронутые URL одного snapshot;
- считать ошибки и предупреждения по единому severity registry;
- отменять публикацию целиком при одной блокирующей ошибке;
- сохранять app version, автора, время, URL count, ошибки, предупреждения и итог;
- оставлять предыдущую опубликованную версию доступной при неуспехе.

### Волна 6. Приемка Release 1

Обязательный порядок локальных проверок:

```powershell
pnpm lint
pnpm db:validate
$env:ALLOW_DEMO_DATA='true'; pnpm build
pnpm --filter @provider/api run build
node --test tests/*.test.cjs tests/*.test.mjs
```

После успешного локального gate:

1. migration rehearsal на production-like копии;
2. exact-SHA test deployment;
3. smoke городского каталога, tariff import preview/apply, тарифной страницы, calculator, трех результатов формы и сохраненной заявки;
4. проверка route inventory, sitemap и publication report;
5. только после этого закрытие release issues;
6. push/deploy — только по отдельному разрешению владельца.

## Полный атомарный backlog

| ID | Решения | Issue | Release 1 | Статус на момент планирования |
| --- | --- | --- | --- | --- |
| R1 | `ADMIN-004–005` | #162 | Да | локальный commit, rollout не выполнен |
| R2 | `ADMIN-001`, `008`, `010`, `013`, `037`, `042` | #158 | Да | локальный commit, rollout не выполнен |
| R3 | `CITY-003–006`, `008–010`, `012–018`, `020–023` | #160 | Да | локальный commit, rollout не выполнен |
| R4 | `ADMIN-003` | #161 | Нет | не начато |
| EXT1 | `TAR-044–096` | Celtoman/tarifs#1 | Dependency | не начато в `main` генератора |
| T1 | тарифный value contract | #172 | Да | реализовано, issue закрыта |
| T2 | `TAR-042–043`, `080–086` | #173 | Да | реализовано, ожидает rollout |
| T3 | `TAR-001–004`, `014`, `019`, `083` | #174 | Да | реализовано, ожидает rollout |
| T4 | tariff catalog/editor contract | #175 | Да | частично |
| T5 | tariff archive/slug lifecycle | #180 | Нет | не начато |
| T6 | typed tariff renderer | #176 | Да | foundation существует |
| T7 | tariff calculator/configurator | #177 | Да | не начато |
| T8 | `TAR-034` | #178 | Да | не начато |
| T9 | `CMS-024–037` | #181 | Нет | не начато |
| F1 | `FORM-001–015` | #170 | Да | foundation существует |
| F2 | `FORM-016–023`, `LEAD-014` | #171 | Да | частично |
| L1 | `LEAD-001–006`, `011` | #154 | Нет | частично |
| L2 | reason registry/short-circuit | #182 | Нет | не начато |
| L3 | comment analyzer | #183 | Нет | не начато |
| L4 | DaData Phone | #184 | Нет | не начато |
| L5 | durable orchestrator | #185 | Нет | foundation частичный |
| L6 | lead deduplication | #186 | Нет | не начато |
| L7 | admin evidence/retry | #187 | Нет | не начато |
| V1 | variable registry/parser/resolver | #188 | Нет | foundation только для телефонов |
| V2 | variable catalog/context preview | #189 | Нет | не начато |
| V3 | usage/insertion/deprecation | #190 | Нет | не начато |
| C1 | `CMS-038–049` | #191 | Нет | draft-only, `OPEN-005` |
| C2 | `CORE-005`, `CMS-001–018`, `CITY-024` | #192 | Нет | не начато |
| C3 | main-page editors | #193 | Нет | не начато |
| C4 | functional-page editors | #194 | Нет | не начато |
| C5 | legal document editor | #195 | Нет | не начато |
| C6 | legacy content cleanup | #196 | Нет | не начато |
| S1 | SEO core templates | #197 | Нет | не начато |
| S2 | Open Graph | #198 | Нет | не начато |
| S3 | noindex/sitemap | #199 | Нет | foundation частичный |
| S4 | local SEO cleanup | #200 | Нет | не начато |
| P1 | `CORE-006`, `CMS-014`, `036–037`, `ADMIN-043` | #179 | Да | foundation частичный |
| P2 | `CMS-029–035` | #201 | Нет | не начато |

## Родительские программы

| Родитель | Native sub-issues |
| --- | --- |
| #156 lead pipeline | #182–#187 |
| #157 address modal | #170–#171 |
| #163 canonical tariff import | #172–#174 |
| #164 tariff admin | #175, #180 |
| #165 tariff page | #176–#178, #181 |
| #166 variables | #188–#190 |
| #167 CMS | #191–#196 |
| #168 SEO | #197–#200 |
| #169 publication validation | #179, #201 |

## Правила исполнения каждого атомарного issue

1. До изменения кода перечитать решения и проверить живое состояние issue/dependencies.
2. Сначала добавить или уточнить failing tests.
3. При изменении Prisma создать отдельную migration, выполнить `pnpm db:generate` и `pnpm db:validate`.
4. При изменении `apps/api/src` пересобрать API до запуска тестов.
5. Обновить профильные документы в том же коммите, но не описывать целевое поведение как уже реализованное до проверки.
6. Выполнить полный обязательный gate.
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
