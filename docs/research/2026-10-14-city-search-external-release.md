# Единый компактный поиск города: внешний выпуск

Дата: 14 октября 2026 года. Статус: EXTERNAL_VERIFIED. Владелец поручил push и деплой локально принятой коррекции Hero/O01 из task [#293](https://github.com/Celtoman/astro-telekom/issues/293).

Выпущен код `aeb3fa2c2cdd0826f8a918c2616431de9a8c72cb`. Перед push полный `pnpm check`: 749/749 без падений. [CI 38539183113](https://github.com/Celtoman/astro-telekom/actions/runs/38539183113) завершился success для того же SHA. Coolify deployment `vs3wtwycuhjggkob1w4z7kwc` — finished, exact commit совпал, приложение running:healthy.

После окончания deployment внешний API кратковременно отдавал 503. Затем предыдущая главная снова отвечала, пока CODE подготавливал новый статический артефакт; повторная команда подтверждения с теми же deployment ID/SHA возвращала 202 UNCERTAIN. Выпуск принят только после активации нового артефакта и HTTP 200 SUCCEEDED от CODE bridge в 09:18:37 UTC. Повторный deployment и CMS-публикация не запускались.

Новый артефакт: `37db84531693e39f31ce1270afa636a7ad851fb43e2f14d777c7ec35e8164023`. Сохранились рабочая/опубликованная ревизии 21, publication ID `cmv6o4jfp000101nwmg9d5exe`, полный digest публичного каталога, SEO и 207 городов. Внешний Search Clear SVG точно совпал с исходным экспортом Figma; узлов региональных подписей в HTML нет. Без Basic Auth сайт продолжает возвращать 401.

Интерактивная проверка использовала встроенный браузер через локальный прокси только для GET/HEAD: страницы, скрипты и ресурсы получены с `https://tv-internet-dom.ru`, артефакт в браузере совпал с прямым HTTP-readback. Прямой вход встроенного браузера через Basic Auth не поддержался; localhost здесь транспорт внешних ответов, не локальная сборка или fixture. Проверка не доказывает прямую браузерную аутентификацию внешнего origin; её защита подтверждена отдельным HTTP-readback.

- Hero и O01: одинаковые города, порядок и выделение для «Саратов», «сар», «Саратовская», «нижний  нов» и отсутствующего запроса. Точный город первый, региональный поиск сохранился без подписи региона.
- 1440/834/390/320 px: строки 48 px, прозрачная очистка 44×44 px, иконка 16×16 px, горизонтального overflow нет.
- Мышь сразу открыла `/samara` из Hero и `/kazan` из O01. Стрелка/Enter Hero открыли `/saratov`; Enter O01 — `/kazan`.
- Очистка возвращает фокус, скрывает результаты Hero или возвращает все 207 записей O01, сохраняя выбранный город.
- После возврата красноватый Selected имеет #FFEAE9/#FE312C без галочки. Ошибок/предупреждений в журнале браузера нет.

Доказательства в [папке выпуска](evidence/2026-10-14-city-search-external-release/): [локальный gate](evidence/2026-10-14-city-search-external-release/local-gate.json), [CI](evidence/2026-10-14-city-search-external-release/ci.json), [deployment](evidence/2026-10-14-city-search-external-release/deployment.json), [CODE receipt](evidence/2026-10-14-city-search-external-release/code-receipt.json), [HTTP](evidence/2026-10-14-city-search-external-release/http-proof.json), [браузер](evidence/2026-10-14-city-search-external-release/browser-proof.json), [Hero](evidence/2026-10-14-city-search-external-release/hero-mobile.jpg), [O01](evidence/2026-10-14-city-search-external-release/modal-mobile.jpg). Публикация remote Figma library не входила в выпуск. CPU/RAM контейнеров этой проверкой не измерялись.
