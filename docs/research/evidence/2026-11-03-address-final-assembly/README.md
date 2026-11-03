# Доказательства итоговой сборки ADDRESS

3 ноября 2026. Задача #476, Figma-only. [Итоговый отчёт](../../2026-11-03-address-final-assembly-applied.md).

## Приоритет итоговых проверок

- `source-verified.json` — четыре оставшиеся страницы, два неизменных CURRENT-оригинала, отсутствие локальных служебных коллекций.
- `final-quality-static.json` — итоговые D/T/M/320: десять секций, FAQ и цены, отсутствие потерянных masters/текстовых переполнений.
- `faq-verified.json` — интерактивные контроллеры: все шесть пар, 12 строк Open/Closed в каждом из 16 состояний. Его поле hiddenReferenceMatches получено без раскрытия скрытых descendants и не является итоговой проверкой скрытого экземпляра.
- `faq-hidden-verified.json` — отдельное правильное чтение скрытых ссылочных экземпляров с skipInvisibleInstanceChildren=false; шесть пар сохранены во всех 16 состояниях.
- `profiles-final.json` — исходные секции и области действий в 16 состояниях после всех изменений: changed=[] для каждого. Положение корня исключено из профиля намеренно; внутреннее оформление, тексты, actions/bindings проверяются.
- `post-legal-graph.json` — финальное полное чтение реакций, включая скрытых descendants: 6622 источника, 436 существующих NODE-целей, отсутствие null-целей; совпадение юридических зон со строками текста во всех 16 состояниях.
- `legal-alignment-before.json`, `legal-alignment-applied.json` — прежний сдвиг областей согласия и его точечное исправление. IDs, размеры и actions сохранены.

`graph-verified.json`, `predelete-graph.json`, `graph-final-scope.json` — чтения с разным охватом обхода дерева. Их счётчики/hash не следует сравнивать с полным финальным чтением как равные выборки. До удаления source проверены 36 URL и 76 используемых переменных; `links-applied.json` сохраняет точные переназначения. `variable-consumers.json` и `variables-removed.json` фиксируют проверку отсутствия потребителей удаляемой коллекции.

`final-quality-prototype.json` содержит две особенности первоначального общего проверяющего скрипта: FAQ искался по имени статического корня, хотя в прототипе он представлен контроллером независимых строк; восемь старых текстовых line boxes галочки ✓ на 1 px выше 20 px-контейнера. FAQ перепроверен отдельными правильными обходами выше. Сами штрихи галочек визуально не обрезаны в Present Desktop/320 (`present-*-consultation-ready.png`); это не восемь новых дефектов после добавления преимуществ. Новых правок общего мастера для этого не делалось.

## Визуальная проверка

Свежие `final-desktop.png`, `final-tablet.png`, `final-mobile.png`, `final-320.png` и `source-cover.png` просмотрены. `source-cleaned-ui.png` показывает четыре страницы в панели Figma.

`present-desktop-available.png`, `present-desktop-retry.png`, `present-desktop-success.png` подтверждают демонстрационный FLOW2. `present-desktop-consultation-legal.png`, `present-320-consultation-legal.png` — юридические зоны после исправления. `present-desktop-consultation-ready.png`, `present-320-consultation-ready.png` — готовность нижней формы. `present-desktop-faq-two-open.png`, `present-320-faq-two-open.png` — независимое раскрытие двух FAQ. `present-320-benefits-last.png` — достижимость последней карточки горизонтальной ленты.

Остальные JSON сохраняют исходную инвентаризацию, резервные профили и протокол применения. Резервная .fig-копия и checkpoint-версии описаны в итоговом отчёте; бинарная копия не добавлялась в репозиторий. Настройки плеера не менялись; реальные формы и API не вызывались.
