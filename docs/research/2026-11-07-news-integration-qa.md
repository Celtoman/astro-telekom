# T10: сквозная проверка новостей и 404

**Обновление T11,7 ноября 2026:** внешний код/settings/404 выпущены;6 статей остаются DRAFT. 281 HTTP-проверка, стабильный повтор импорта0imported/6skipped и серверный S3 DB/media restore PASS. Ниже сохранена датированная локальная проверка этапа; актуальные внешние identities и ограничения — [в T11](2026-11-07-news-external-release.md).

Статус: LOCAL CHECKED / COMBINED GATE:1061pass/0fail/1skip. [#534](https://github.com/Celtoman/astro-telekom/issues/534). Проверка кода не заменяет решение о готовности к реальному трафику или приёмку владельца.

## Подтверждено локально

| Область | Доказательство |
| --- | --- |
| Backend isolation, revisions, review, history, redirects | T4 full1004pass и SQL rehearsals; T6 full1038pass, реальный transfer/restore SQL, serving-but-unacknowledged barrier и approved aliases |
| Принятые public C/A/404, HOME news и preview | T7–T8 full1048pass, immutable Astro сборка13материалов; entityId/kind, private media, safe JSON-LD, OpenGraph/canonical/sitemap |
| Настоящий HTTP | `scripts/qa/news-artifact-http.mjs`: sealed artifact e07debfc, Caddy2.11.4 и production createServingConfig. Список, статья, категория, страница2 и главная200. Неизвестные/некорректные номера, пустая категория и отсутствующее изображение404. Slash301 сохраняет query. API специально недоступен(502), HTML/CSS продолжают200; CSS immutable, test-noindex сохранён |
| Импорт | Свежие WordPress totals/exhaustion:10получено,6новостей/6обложек в локальных drafts,4акции исключены. Readback полного content/media,0ошибок. Повтор0imported/6skipped, revisions52:50 и publicationId не изменились. SQL: site isolation, source/slug409, ручные правки, archive и media-failure rollback |
| Backup | Pure archive tests: missing/corruption/duplicate/traversal/foreign media, origin, scratch и cleanup failure. Реальный PostgreSQL18 rehearsal создаёт статью/историю и media asset с производными, делает dump/bundle, восстанавливает network=none PostgreSQL и сверяет ссылки/hash. ПрофильPASS34.3с; внешний backup ещё не применён |
| Сбой сохранения и recovery | Во встроенном Chromium API остановлен, изменён заголовок синтетической статьи. Ошибка не стирает текст. После перехода и возврата показана локальная копия; восстановлена и сохранена после возврата API. Исходный тестовый заголовок возвращён. Реальные6материалов не редактировались |
| Понятная ошибка и retry | [#551](https://github.com/Celtoman/astro-telekom/issues/551): русские сетевые сообщения, HTTP409/validation сохранены. Повторный browser-тест: один русский alert, текст на месте; retry после возврата API даёт0alerts без старой ошибки |
| Responsive/keyboard | T5/T6 и T7/T8 фиксируют1440/834/390/320. Статья834 и шапка720px; на320 root scrollWidth=clientWidth305.404 во всех4ширинах. Пагинация320: номера/действия отдельными рядами справа,44px; Enter открывает правильную страницу. Preview Escape возвращает фокус; savedR7/crop отображён |

## Надёжность gate

T9 frozen a0c1a70d дал1056pass/1fail/1skip: единственный отказ старого seed fixture на migrate deploy с общим Schema engine error. Найдено socket-ready ожидание перед TCP migration; [#552](https://github.com/Celtoman/astro-telekom/issues/552) переключает probe на TCP. После исправления isolated seed rehearsalPASS22.5с. Конкретный engine error не объявляется доказанным следствием этой гонки. Ожидания/тайм-ауты не ослаблялись. Импорт и T10 проходят один общий финальный pnpm check перед push.

Общий frozen dbb16d9c дал1060pass/1fail/1skip: единственный сбой backup SQL rehearsal во вложенной Windows verification directory. Контрольный probe длиной315символов подтвердил plainFile=false/extendedFile=true. [#554](https://github.com/Celtoman/astro-telekom/issues/554) размещает только временный fixture в системном temp с прежним контролем parent/name и теми же archive/hash/reference assertions; production Linux paths не меняются. Повторный gate использует исправленный fixture.

Admin lint130files:0errors/0warnings/2прежних hints; build29pages. Fixtures принадлежат текущим вызовам; production restore и публикация исходных6новостей не выполнялись. Независимое review backup выявило #547–#550; исправления подтверждены повторным статическим review и pure/SQL проверками. Mount/S3/systemd проверяются отдельно во внешнем контуре.

## Непроверенные границы

Встроенный браузер работает в системной тёмной теме; документированный viewport API не поддерживает color scheme/zoom. Клавиша zoom не изменила ширину и не засчитана за200%/400%. Светлая тема, настоящий zoom, физический touch и ручное чтение screen reader не выдаются за проверенные. AX/semantic labels и keyboard их не заменяют. Exact-SHA deployment, CODE receipt, scoped settings/404, backup/restore после переноса и live readback остаются T11. Содержательную приёмку импортированных материалов выполняет владелец; автоматический publish запрещён.

Окончательный pnpm check r3:1061pass/0fail/1skip,592811ms. Frozen tree b2daa5cf521d01ced62262a326d294204faafb8c; все51staged files совпали с проверенной копией до итоговых doc/status updates. SQL backup повторён именно из frozenr3:PASS22.7с,1asset/8file references/2editorial references. Полный прогон повторно подтвердил этот сценарий и исправленный seed. Read-only внешний preflight: staging mount совпадает, PHPsyntaxPASS, достаточно scratch; настоящего серверного backup/restore ещё не было. Source category62 имеет фактический archive /novosti; alias ведёт на /news только при опубликованном списке. Все исходные6статей остаются только локальными drafts до T11 import и последующей owner content review.
