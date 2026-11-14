# Task 4 — DONE: SPEED_TEST CMS

Рабочая копия: `C:/Users/Александр/.codex/worktrees/astro-speedtest-601/astro-telekom`. Дата: 14 ноября 2026.

## Изменения

- Новые `apps/admin/src/components/SpeedTestPageApp.tsx`, `apps/admin/src/lib/speed-test-editor.mjs`, `apps/admin/src/pages/templates/speed-test.astro`.
- Форма по принятому `OfficialSitePageApp`: восемь групп (H1, шесть разделов, FAQ); все 90 фиксированных native текстовых полей выведены из API-схемы, версия исключена. FAQ из API (шесть исходных ответов) можно добавлять, удалять и перемещать; прочие карточки фиксированы. Labels, Input/Textarea, limits, aria-invalid и точный focus. Телефоны/график остаются общими настройками.
- Guarded PATCH с `expectedWorkingRevision`; рабочая/опубликованная ревизии сайта видимы; сохранение и публикация различимы. Неполный draft разрешён backend. Ошибки сохранения, включая 409/сеть, не заменяют content. Dirty hook и подтверждение сброса при смене сайта/refresh; 401 ведёт в login.
- SITE VariableInsertionPicker активен для всех текстовых полей и FAQ, вставляет в selection и возвращает caret. `variable-registry.ts` получает точные `Page.content.*`/FAQ wildcard paths из `SPEED_TEST_PAGE_SCHEMA` через существующий recursive walker; только SITE scopes, прежние allowedFields сохранены. Schema import не создаёт runtime-cycle (model импортирует GeneralHomeFieldRule только как type).
- Интеграция `AdminWorkspace.tsx`, `PageTemplatesApp.tsx`, `SeoTemplatesApp.tsx`, `admin-workspace-routes.mjs`: lazy screen, persistent Astro route, карточка, собственный Kind/label и SEO link. Preview ведёт на канонический путь, общий renderer/disabled runtime из Task 3 не переписывался.
- `publication-issue-presentation.mjs`, `preview-content-issue.mjs`, `block-passport-presentation.mjs`: только валидные editable recovery paths; отдельная группа SPEED_TEST и переход в его редактор.
- Новые `tests/speed-test-admin.test.mjs`, дополнительный registry test в `tests/variable-registry.test.cjs`; обновлены только соответствующие записи `docs/TEST_COVERAGE.md`.

## Проверки

PowerShell PATH перед командами:

```powershell
$env:PATH = 'C:/Users/Александр/.codex/worktrees/astro-speedtest-601/astro-telekom/.codex-tmp/bin;C:/Users/Александр/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin;' + $env:PATH
```

- `pnpm.cmd --filter @provider/api run build` — PASS, выполнено перед dist-based registry tests.
- `pnpm.cmd --filter @provider/api lint` — PASS.
- `node --test tests/speed-test-admin.test.mjs tests/variable-registry.test.cjs tests/publication-issue-presentation.test.mjs tests/preview-content-issue.test.mjs tests/admin-block-passports-ui.test.mjs` — **23 PASS, 0 fail, 0 skip**. Проверка полей обходит реальный default content, а не дублирует shape literal; проверяются текстовые mutation/selection, все recovery URLs, SITE-only allowedFields и прежние paths, паспорта и UI-source контракт.
- `pnpm.cmd --filter @provider/admin lint` — **0 errors / 0 warnings / 2 existing hints**. Первый прогон обнаружил отсутствующую типизацию recursive JS return; JSDoc return исправлен и итоговый lint зелёный.
- `pnpm.cmd --filter @provider/admin build` — PASS, **31 page**, включая `/templates/speed-test/index.html`; обычный build без синтетического PUBLIC_API_URL. Есть штатные Shiki/CSP и chunk-size warnings.
- `git diff --check` — PASS (только штатные CRLF warnings generated files). В изменённых строках TEST_COVERAGE новых Markdown-ссылок нет.

## Границы

Браузер/IAB, fixture и сервисы не запускались/не менялись. После моего обычного admin build контроллер отдельно пересобирает bundle с `PUBLIC_API_URL=http://127.0.0.1:4933/api/v1` и выполняет actual bundled UI QA. Source-contract tests не являются доказательством браузерных save/error/dirty взаимодействий. Full gate, commit/push/deploy/publication не выполнялись. Backend модель/endpoint и frontend композиция/стили Task 2/3 не переписаны; backend затронут только разрешённой picker registry интеграцией. README/current-state и общие release docs ведёт контроллер. Новых несогласованных продуктовых идей или посторонних проблем не обнаружено.


## Коррекция интеграционного inventory после full gate контроллера

В `tests/browser-security.test.mjs` в точный ожидаемый список admin HTML добавлен только `templates/speed-test/index.html` (31 маршрут). Последующий существующий цикл CSP уже проходит по всем `htmlFiles`, поэтому новая страница теперь входит в те же hash/source/style/script/connect проверки. CSP assertions не изменены. Во время активного full gate контроллера сборки и тесты не запускались, admin dist не перезаписывался; повторную проверку выполняет контроллер после завершения текущего gate.
