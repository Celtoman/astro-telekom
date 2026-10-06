# План реализации целевой платформы

Действующий план, сверка 6 октября 2026 года. Точное целевое ТЗ — [product-contract.md](../product-contract.md), реализованные возможности — [current-state.md](../current-state.md), следующая очередь — [release-plan.md](../release-plan.md). GitHub Issues являются единственным механическим источником статуса. Планы 7 и 14 сентября сохранены в docs/archive/plans.

## Текущее состояние и ближайшая очередь

Тарифный импорт/редактор/renderer/конфигуратор, адресные формы, lead pipeline/атрибуция, переменные V1–V2, SEO/OG S1–S4 и all-URL preflight реализованы; связанные атомарные Issues закрыты. CMS C2 использует общий CITY_HOME template, C1 подготовила реестр 18 паспортов. Два первых экрана утверждены и имеют специализированные редакторы; остальные паспорта DRAFT. V3 реализована частично, CMS C3–C6 не завершена.

Согласованная очередь #237 → #235 → #240 завершена; после неё выполнены #258/#236 и доступный Hero usage slice #190 (#261). Текущая согласованная работа — #259/#260; оставшаяся часть #190 открыта. Документация и preview завершены; seed прошёл свежую PostgreSQL, повторный запуск и publication preflight. Остаток целевой CMS перечислен ниже. Это не объявление о готовности к трафику: только владелец определяет готовность к реальному трафику.

## Оставшиеся задачи целевой CMS

| Задача | Уже есть | Остаток и зависимость |
| --- | --- | --- |
| V3/#190 | Usage, вставка в SEO/promo/Hero, guarded migration API. | Переходы к editors и интеграция будущих CMS-полей; реальная migration только при согласованной DEPRECATING → ACTIVE паре. Сейчас все 11 кодов ACTIVE. |
| C3/#193 | HOME/CITY_HOME Hero editor, draft/validation/audit, 0056 migration, версия паспорта в snapshot. | Остальные блоки и отдельный режим структуры/impact confirmation. Зависит от утверждения паспортов остальных блоков; read-only внешний rollout двух Hero подтверждён, внешний save/browser E2E отдельно не выполнен. |
| C4/#194 | Общие функциональные страницы и их программная логика. | Allowlisted текстовые редакторы coverage/cities; фиксированные карта/поиск/список; нужны согласованные контракты. |
| C5/#195 | Три публичные legal-страницы. | Constrained document editor, допустимые переменные, audit/preview/publication validation. Юридическая оценка #144 остаётся отдельно. |
| C6/#196 | Общие templates и удалённые legacy SEO-колонки. | Inventory/mapping всех непустых content, equivalence, rollback proof и только затем destructive cleanup. Зависит от полной миграции C2–C5. |

Родительские #166 и #167 агрегируют дочерние задачи и не являются дополнительными единицами работы. Direct Compose #236, Windows Docker-инцидент #251 и diagnostics API #34 имеют собственные границы и не входят автоматически в эту CMS-последовательность. Предложения изменить P1/P2 из аудита ещё не применены.

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


## Полный атомарный backlog

| ID | Решения | Issue | Release 1 | Статус на 6 октября 2026 года; live-статус смотреть в Issue |
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
| T5 | tariff archive/slug lifecycle | #180 | Нет | завершено: archive/slug/301 и guarded purge; issue закрыта |
| T6 | typed tariff renderer | #176 | Да | реализовано, issue закрыта; rollout и live HTML подтверждены |
| T7 | tariff calculator/configurator | #177 | Да | реализовано, issue закрыта; live quote проверен |
| T8 | `TAR-034` | #178 | Да | реализовано, issue закрыта; live quote проверен без создания заявки |
| T9 | `CMS-024–028`, `030`, `032–034` | #181 | Нет | реализовано: карточка шаблона, рабочий/опубликованный preview, diff, калькулятор, device modes и code/data status; локальный gate, CI 36010495904 и Coolify deployment `s4gzkael3wfiplepsgj5syku` на `7d7995c` прошли, защищённые UI/API и отсутствие изменения ревизий после quote проверены |
| F1 | `FORM-001–015` | #170 | Да | реализовано, issue закрыта; внешний safe smoke проверен |
| F2 | `FORM-016–023`, `LEAD-014` | #171 | Да | реализовано, issue закрыта; live submit заявки не выполнялся |
| L1 | `LEAD-001–006`, `011` | #154 | Нет | реализована атрибуция; issue закрыта, приёмка 25 сентября |
| L2 | reason registry/short-circuit | #182 | Нет | реализовано, issue закрыта |
| L3 | comment analyzer | #183 | Нет | реализовано, issue закрыта |
| L4 | DaData Phone | #184 | Нет | реализовано, issue закрыта; rollout подтверждён |
| L5 | durable orchestrator | #185 | Нет | реализовано, issue закрыта; rollout подтверждён |
| L6 | lead deduplication | #186 | Нет | исправлено, issue закрыта; телефон за 24 часа имеет приоритет, адресный дубль требует явно совпадающего помещения |
| L7 | admin evidence/retry | #187 | Нет | issue закрыта; внешний rollout отдельно от механического статуса |
| V1 | variable registry/parser/resolver | #188 | Нет | реализовано, issue закрыта |
| V2 | variable catalog/context preview | #189 | Нет | реализовано, issue закрыта |
| V3 | usage/insertion/deprecation | #190 | Нет | частично: usage, SEO/promo/Hero insertion и guarded migration API есть; editor links/будущие поля и реальная согласованная пара замены остаются |
| C1 | `CMS-038–049` | #191 | Нет | issue закрыта в scope реестра; два Hero APPROVED/1.0.0 и READY, остальные 16 DRAFT |
| C2 | `CORE-005`, `CMS-001–018`, `CITY-024` | #192 | Нет | шаблон и backfill 207 HOME развернуты; полный публичный каталог эквивалентен, CI и exact-SHA smoke прошли; issue закрыта |
| C3 | main-page editors | #193 | Нет | частично: два Hero editor/validation/migration/preview реализованы; остальные блоки и режим структуры остаются |
| C4 | functional-page editors | #194 | Нет | не начато |
| C5 | legal document editor | #195 | Нет | не начато |
| C6 | legacy content cleanup | #196 | Нет | не начато |
| S1 | SEO core templates | #197 | Нет | реализовано в рабочем контуре, issue закрыта |
| S2 | Open Graph | #198 | Нет | реализовано в рабочем контуре, issue закрыта |
| S3 | noindex/sitemap | #199 | Нет | реализовано в рабочем контуре, issue закрыта |
| S4 | local SEO cleanup | #200 | Нет | завершено: migration 0054 удаляет пустые legacy SEO; issue закрыта |
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
