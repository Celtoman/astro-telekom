# Исправления оболочки, каталога и выпуск legal

Дата29.10.2026. Разрешённый [план](../plans/2026-10-29-city-shell-release.md), задача [#429](https://github.com/Celtoman/astro-telekom/issues/429). Локальные и внешние проверки завершены; точные данные выпуска приведены ниже.

## Изменения и причины

- #420: body больше не имеет верхнего24px padding. Отдельный зазор шапка → контент и прежнее нижнее поле сохранены.
- #423: `prepareTariffCollection` общий для parser-time и module-time. Доверенный head bootstrap включает CSS-защиту незавершённой коллекции; inline initializer после полного блока применяет URL-категорию, CMS initialCount, счётчик, состояния и обработчики, затем показывает блок. Повторный модульный вызов идемпотентен и не сворачивает раскрытый список. Без JavaScript флага нет и все карточки остаются доступными. Исходные22 не вспыхивают перед12/8. CSP содержит хеши реальных сериализованных скриптов, данные CMS в код не интерполируются.
- #424: точные SVG-экспорты Screens television-simple-duotone22px: Desktop/Mobile синий, Tablet основной цвет. Используются публичным Hero и sandbox preview. Экспорт — чтение, Figma не изменялась.
- #425: основной мобильный ряд ссылок имеет32px без лишнего12px gap; служебные ссылки и legal сохраняют44px. Footer390 уменьшился1236→1080px,3201276→1120px. Отличие от макетных1102px объясняется ранее согласованным составом меню; скрытые пункты не возвращались.
- #421: в тот же выпуск входит ранее проверенный BLK-0034, три действующих legal URL, sidebar Desktop и native contents на меньших размерах. Действующие юридические тексты сохранены.

## Локальная проверка

Новый immutable fixture124 маршрута,6 городов и22 тарифа Казани. Cold1440/834/390/320: default, INTERNET и INTERNET_TV с якорем; модули задерживались1200ms. Во всех12 случаях первый видимый блок уже prepared, правильный список и геометрия сохраняются, CLS0. Дополнительно проверены реальные переходы через шапку/меню и логотип HOME→CITY→HOME, стабильные header/footer и нужный номер с первого кадра; no-JS показывает полный каталог. Сравнение по-прежнему без scrollY, документ без overflow, TV22px.

Legal повторно прошёл15 случаев1440/834/768/390/320, три документа320 без JS и два sandbox preview. Профильный запуск16/16; независимый review Critical0/Important0, включая проверку фактических CSP-hashes собранного HTML. Web Astro check без errors/warnings.

Первый полный gate остановился на Windows `Fatal process out of memory: Zone` в параллельном lint. Свободная физическая память была менее1GB; настройки ОС/чужие процессы не менялись. Собственные preview/browser процессы завершены, полный `pnpm check` повторён в процессе с CPU affinity2, без пропуска команд/тестов. Исходная ресурсная проблема остаётся в открытом [#430](https://github.com/Celtoman/astro-telekom/issues/430); успешный повтор не считается её исправлением. Повторный полный gate прошёл870/870,0fail/0skip. Внешний выпуск завершён и подтверждён последующими живыми проверками.


[Локальный cold-прогон](evidence/2026-10-29-city-shell-release/local-browser.json), [реальные переходы](evidence/2026-10-29-city-shell-release/local-navigation.json), [legal и preview](evidence/2026-10-29-city-shell-release/local-legal.json), [экспорт TV](evidence/2026-10-29-city-shell-release/tv-source.json), [снимок до изменений](evidence/2026-10-29-city-shell-release/before.json), [проверки](evidence/2026-10-29-city-shell-release/checks.json).


## Выпуск и живая проверка

Код `024c7364c9ad1f190c5dd51e9915d11b9bbea88b` (включает legal48ea5363), [CI](https://github.com/Celtoman/astro-telekom/actions/runs/40879051830) — success. Coolify MCP deployment `nchfmmjqdv4tymjilfdldvo4` — finished с этим SHA, приложение running:healthy. CODE HTTP200/SUCCEEDED, serving artifact `b870d08bc3bdbb83d05b735f26ff3bb2a155adc517688e19b6e3783541d7d223`, renderer `5995b3a0c8244927dfb17a5c48a346de82914accb88697744571bce4eae2d803`. [Машинная квитанция](evidence/2026-10-29-city-shell-release/release.json).

| Ширина | Cold default/query/hash | CLS | Шапка y | Footer px |
| --- | --- | --- | --- | --- |
| 1440 | 3/3, первый видимый список стабильный | 0 | 0 | 563 |
| 834 | 3/3, первый видимый список стабильный | 0 | 0 | 683 |
| 390 | 3/3, первый видимый список стабильный | 0 | 0 | 1080 |
| 320 | 3/3, первый видимый список стабильный | 0 | 0 | 1120 |

Реальные переходы HOME→CITY→HOME прошли на всех четырёх ширинах: одинаковая внутренняя геометрия шапки и футера, корректный телефон с первого видимого кадра. Все TV22px загружены из нового artifact; Tablet использует тёмный источник, Desktop/Mobile — синий. Сравнение не имеет вертикальной прокрутки; overflow документа отсутствует. Без JS каталог остаётся полным.

Три legal-страницы:15/15 комбинаций размеров,3/3 без JS320,2/2 sandbox preview. Тексты сравнены с исходной живой версией; native оглавление, клавиатура и якоря работают. Функциональный smoke каталога/сравнения/FAQ/ссылок/форм без отправки прошёл; pageErrors пуст. Известное CSP-предупреждение #280 не выдаётся за новое исправление.

Рабочая/опубликованная ревизии24, публикация `cmvs82yuw000101o52i6ams8d`, полный public digest `42af8c9d2be5ab0e2f7043241f3a1946039ccf3806af8a9d4c8c121f178ec858`, тарифный digest и catalogDigest сохранены;207городов/3805тарифов. CMS save/publish и отправка заявок не выполнялись, Figma и библиотека не менялись. #426/#427 и ресурсная #430 остаются открытыми. Проверка подтверждает технический результат test-контура, решение о реальном трафике принимает владелец.

[Живой cold-прогон и переходы](evidence/2026-10-29-city-shell-release/live-browser.json), [legal](evidence/2026-10-29-city-shell-release/live-legal.json), [функциональный smoke](evidence/2026-10-29-city-shell-release/live-functional/public-browser.json), [сохранность CMS](evidence/2026-10-29-city-shell-release/preserved.json).
