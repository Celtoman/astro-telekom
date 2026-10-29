# Стабильность загрузки публичных страниц — 29 октября 2026

Владелец разрешил исправление #410, общего каркаса и раннего состояния, таблицы и Movix, проверки, commit/push/deploy в test-контур. Тексты/CMS/Figma/library не менять. Задача #414, sub-issues #410–#413.

Причины: CITY-only padding; поздний subscriber/city context; отдельные swap-загрузки кириллицы/латиницы; отрицательный table margin внутри scroll area; неправильные внутренние координаты SVG Movix.

План: общий24px каркас по Screens; CSP-hashed синхронный bootstrap и parser-time подготовка header/footer до видимости, с сохранением30-дневного режима и серверного fallback без JS/storage. Предзагрузка основных Geist subsets и optional для отсутствия поздней замены шрифта. Перенос длинных H1 без изменения текста. Перенести отрицательный spacing из таблицы наружу. Восстановить существующие полные SVG64/48 и центрированные Phosphor glyphs из3dadca30. Файл Figma содержит тот же дефект SVG: его не редактировать, исправление веб-иконок прямо разрешено владельцем.

Проверить: реальные Astro build/CSP/preview; D/T/M/320/1000; все юридические страницы; все публичные типы страниц; cold/warm, сохранённый/просроченный/недоступный storage, subscriber event, city context, keyboard/focus, horizontal comparison и отсутствие vertical overflow. До/после first-paint traces/CLS и снимки, без настоящих заявок. Независимый review, полный gate, exact-SHA CI/MCP deployment/CODE и live-проверка того же snapshot24. Документировать и закрыть issues после фактического результата.
