# Task 4 — независимое ревью

Дата: 2026-11-14. Режим: read-only проверяемого кода; изменён только этот отчёт. Источники: task-4-brief.md, task-4-report.md, task-4-diff.txt и текущий код worktree.

**Spec: PASS. Quality: CLEAN.** Подтверждённых новых дефектов и регрессий, требующих исправления в рамках Task 4, не обнаружено.

## Сверка требований

- Все 90 фиксированных текстовых полей выводятся из `SPEED_TEST_PAGE_SCHEMA`; версия исключена, структура карточек не редактируется. FAQ поддерживает добавление, удаление, перемещение и текстовые поля. Основание: `apps/admin/src/lib/speed-test-editor.mjs:8–16`, `apps/admin/src/components/SpeedTestPageApp.tsx:99–111`, независимый обход реального default content в focused tests.
- Для каждого native text/FAQ поля picker получает точный `Page.content.*` путь. Подстановка заменяет selection и возвращает caret. SITE-расширение registry выводится из схемы, не содержит дубликатов и не распространяет новые native paths на CITY/TARIFF. Основание: `SpeedTestPageApp.tsx:79–85,101–107`, `speed-test-editor.mjs:24`, `apps/api/src/variable-registry.ts:32–39,90–94`. Runtime-cycle не возникает: зависимость модели от `general-home-model` — `import type`, а сам `general-home-model.ts` не импортирует registry во время исполнения.
- PATCH использует `expectedWorkingRevision`; только успешный ответ заменяет локальный content/baseline. 409 и сетевые ошибки оставляют введённый content. Поля и смена сайта заблокированы при сохранении. Refresh/смена сайта требуют подтверждения потери dirty-ввода; общий `useUnsavedChanges` защищает навигацию и beforeunload. 401 направляется в login. Основание: `SpeedTestPageApp.tsx:29–35,44–52,63–70,88–98` и существующие `useUnsavedChanges.ts` / `admin-navigation-guards.mjs`.
- Рабочая и опубликованная ревизии показаны; сохранение и публикация разграничены. URL preview/SEO содержит канонический маршрут/явный `SPEED_TEST`. Recovery принимает только editable schema paths, фокусирует реальные DOM controls, для пустого FAQ предусмотрен focus target коллекции. Паспортам добавлены собственная группа, предметные labels и существующий редактор. Основание: `SpeedTestPageApp.tsx:53–61,96–97,110`, `publication-issue-presentation.mjs`, `preview-content-issue.mjs`, `block-passport-presentation.mjs:21,27,54,57`.
- Экран использует принятые AdminShell/Card/Field/Input/Alert/Button и общий picker/guard. Новых зависимостей, отдельной CSS-системы, управления дизайном или widget URL не добавлено; native textarea/select повторяют существующий редактор OfficialSitePageApp и документированный admin-паттерн.

## Проверки и границы

На bundled Node 24 + `.codex-tmp/bin` повторно выполнена команда:

```text
node --test tests/speed-test-admin.test.mjs tests/variable-registry.test.cjs tests/publication-issue-presentation.test.mjs tests/preview-content-issue.test.mjs tests/admin-block-passports-ui.test.mjs
```

Результат: **23 PASS, 0 FAIL, 0 SKIP**. Профильный `git diff --check` — PASS. Node выдал MODULE_TYPELESS_PACKAGE_JSON для существующей схемы загрузки source TS; это не ошибка тестов и не основание менять тип модуля API.

Браузер, серверы, сборка admin/full gate не запускались; QA bundle контроллера не перезаписывался. Backend Task 2 и public composition Task 3 рассмотрены только как граничные контракты. Этот PASS относится к независимой сверке кода/спецификации и focused tests; фактические bundle-взаимодействия и визуальная приёмка остаются отдельным browser QA контроллера.

## Findings

Нет. Следовательно, записи с priority/path/line для исправления отсутствуют. Старые участки вне Task 4 и новые продуктовые требования в findings не включались.
