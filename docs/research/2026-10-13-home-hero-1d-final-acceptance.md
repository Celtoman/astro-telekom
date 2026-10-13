# HOME Hero 1d: итоговая приёмка

Дата: 13 октября 2026 года. Задача [#277](https://github.com/Celtoman/astro-telekom/issues/277), регрессия [#281](https://github.com/Celtoman/astro-telekom/issues/281). Это техническая приёмка защищённого test-контура, не решение о готовности к реальному трафику.

## Итоговый контракт и локальные проверки

Москва определяется по единственной опубликованной записи каталога, её canonical slug не фиксируется кодом. В живом каталоге URL — `/moscow`; URL текущего города имеет приоритет над sessionStorage, сохранённый ручной выбор — над исходной Москвой. Неоднозначная/отсутствующая Москва не заменяется произвольным первым городом.

Уточнение владельца: выбор результата, быстрого города или O01 сразу открывает CITY_HOME. ID сохраняется до закрытия вкладки, Selected показывает его при возврате на `/`; подпись «Найти город» и восемь полей CMS сохраняются. Очистка запроса сохраняет ранее выбранный город навигации. Без JavaScript остаются реальные href.

Figma: [Hero 1d](https://www.figma.com/design/PiSCXYR88uqqcS6tKVfd8T?node-id=1163-64), специализированный [O01 / Search Clear](https://www.figma.com/design/PiSCXYR88uqqcS6tKVfd8T?node-id=1330-4556). Геометрия существующей Icon/Close масштабирована до 16 px; область нажатия 44×44 px. Search Clear подключён к семейству O01 / City Search, девять видимых инстансов Hero имеют те же размеры. Callback Close и закрытие FLOW не менялись. SVG экспортирован из изменённого компонента; визуально проверен Hero Results.

Регрессионная реальная Astro-сборка с production slug `moscow` сначала падала на отсутствующем `/moscow#tariffs`, после исправления проверяет оба исходных href. Полный `pnpm check`: 745 passed, 0 failed/cancelled/skipped. Локальный Chromium на текущем Astro с синтетическим каталогом подтвердил все шесть состояний, прямой выбор мышью/клавиатурой/быстрым городом/O01, сохранение ID, адресный target, 16 px внутри 44×44 px, размеры 320/390/834/1440 без overflow и JS page errors. Это отдельная локальная проверка, не external E2E.

## Внешний контур

Исходный кодовый выпуск `d5887c1a6d3a078d8b78ab564ea0b481061e95b1`: CI 38390312385 success, Coolify deployment `sar29udf3srrfuzft8mnnwnu` finished/healthy. HOME working-only миграция изменила ревизию 20→21, обслуживаемая 20 сохранялась до CMS-публикации. CMS-публикация `cmv6o4jfp000101nwmg9d5exe` ревизии 21 завершилась SUCCEEDED; публичные API/HTML возвращают HOME 2.0.0, 207 городов/4018 маршрутов. Digest CITY_HOME и SEO сохранены, старые versioned assets доступны.

Финальный code commit: `1c34c52182afab05d42cbda10ebf6ff66837f8ed`. [CI 38405371393](https://github.com/Celtoman/astro-telekom/actions/runs/38405371393) success, 745 passed / 0 failed. Coolify deployment `0o2bln7oweal9jjdo1enlsce` finished/running:healthy. Active artifact `41cd513379551bdfd8757cecc5089f1724a4e0367766f968b56a86868d09710f`, renderer `02afdef67b8c8d144f9dd8752ed8a54d7ab367834d21b10af1ba059884ec015b` совпадает с released renderer контейнера; SOURCE_COMMIT совпадает с exact SHA.

CODE сохранил publication ID `cmv6o4jfp000101nwmg9d5exe`, catalog digest и working/published 21. HOME 2.0.0, 207 городов/4018 маршрутов; CITY_HOME/SEO digest и предыдущие assets сохранены. Последовательный publication-review — PASSED, changes=0. Повторная CMS-публикация не выполнялась. Применение 0060 дополнительно подтверждено read-only SQL: finished=true, rolled_back_at=null.

Внешний Chromium подтвердил Default/Focus/InputError/NoResults/Results/Selected, исходные `/moscow#tariffs` и `/moscow#address-check` с реальным адресным target. Выбор результата мышью/клавиатурой, быстрого города и записи O01 сразу открывает CITY_HOME; возврат сохраняет ID, очистка запроса сохраняет city context, CTA остаётся «Найти город». Search Clear — знак 16×16, цель 44×44 в Hero и O01. На 320/390/834/1440 px нет overflow; SVG загружены, JS page errors отсутствуют. Без JS поиск отключён, реальные городские href доступны.

Browser использовал готовность DOMContentLoaded, enabled controls и document.fonts.ready. Одна попытка ожидания общего load достигла 30 секунд; окончательная функциональная приёмка не является проверкой завершения всех внешних сетевых ресурсов. Реальные заявки и доставки не создавались.

Снимки внешнего контура: [desktop](evidence/2026-10-13-home-hero-1d-external/desktop.png), [результаты поиска](evidence/2026-10-13-home-hero-1d-external/desktop-results.png), [834](evidence/2026-10-13-home-hero-1d-external/834.png), [390](evidence/2026-10-13-home-hero-1d-external/390.png), [320](evidence/2026-10-13-home-hero-1d-external/320.png). [Структурированная приёмка](evidence/2026-10-13-home-hero-1d-external/acceptance.json).

## Диагностика нагрузки

После перезагрузки владельцем все шесть компонентов healthy, restart=0/OOM=false; migrate/bootstrap-seed exited 0. Прямой SSH использовал существующий known_hosts по IP владельца, RejectPolicy и проверку hostname, без обхода host trust. Web CPU около 0%, anon снизился со 107 до 87 MiB; file cache около 2.11 GiB объясняет показатель Docker около 2.06 GiB. API моментальный пик 21% в следующем снимке стал 0%. На сервере доступно около 4.3 GiB RAM. Эти снимки не доказывают причину прежнего перегруза или отсутствие любых будущих утечек.

Отдельные открытые находки: [#266](https://github.com/Celtoman/astro-telekom/issues/266) — review HTTP 500 под параллельной нагрузкой; [#280](https://github.com/Celtoman/astro-telekom/issues/280) — прежние CSP warnings; [#282](https://github.com/Celtoman/astro-telekom/issues/282) — host vm.overcommit_memory=0. Redis persistence сейчас ok; эти изменения не включаются в Hero.


После финального CODE и browser smoke повторный снимок всех 6 компонентов: healthy/restart=0/OOM=false. Web CPU 0.04%, Docker memory 1.513 GiB, anon около 104 MiB; API CPU 0.24%. Доступно около 4.6 GiB RAM, Redis rdb_last_bgsave_status=ok, consecutive_failures=0. Рост кеша во время сборки не трактуется как утечка памяти процессов.
