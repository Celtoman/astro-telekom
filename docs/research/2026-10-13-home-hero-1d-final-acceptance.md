# HOME Hero 1d: итоговая приёмка

Дата: 13 октября 2026 года. Задача [#277](https://github.com/Celtoman/astro-telekom/issues/277), регрессия [#281](https://github.com/Celtoman/astro-telekom/issues/281). Это техническая приёмка защищённого test-контура, не решение о готовности к реальному трафику.

## Итоговый контракт и локальные проверки

Москва определяется по единственной опубликованной записи каталога, её canonical slug не фиксируется кодом. В живом каталоге URL — `/moscow`; URL текущего города имеет приоритет над sessionStorage, сохранённый ручной выбор — над исходной Москвой. Неоднозначная/отсутствующая Москва не заменяется произвольным первым городом.

Уточнение владельца: выбор результата, быстрого города или O01 сразу открывает CITY_HOME. ID сохраняется до закрытия вкладки, Selected показывает его при возврате на `/`; подпись «Найти город» и восемь полей CMS сохраняются. Очистка запроса сохраняет ранее выбранный город навигации. Без JavaScript остаются реальные href.

Figma: [Hero 1d](https://www.figma.com/design/PiSCXYR88uqqcS6tKVfd8T?node-id=1163-64), специализированный [O01 / Search Clear](https://www.figma.com/design/PiSCXYR88uqqcS6tKVfd8T?node-id=1330-4556). Геометрия существующей Icon/Close масштабирована до 16 px; область нажатия 44×44 px. Search Clear подключён к семейству O01 / City Search, девять видимых инстансов Hero имеют те же размеры. Callback Close и закрытие FLOW не менялись. SVG экспортирован из изменённого компонента; визуально проверен Hero Results.

Регрессионная реальная Astro-сборка с production slug `moscow` сначала падала на отсутствующем `/moscow#tariffs`, после исправления проверяет оба исходных href. Полный `pnpm check`: 745 passed, 0 failed/cancelled/skipped. Локальный Chromium на текущем Astro с синтетическим каталогом подтвердил все шесть состояний, прямой выбор мышью/клавиатурой/быстрым городом/O01, сохранение ID, адресный target, 16 px внутри 44×44 px, размеры 320/390/834/1440 без overflow и JS page errors. Это отдельная локальная проверка, не external E2E.

## Внешний контур

Исходный кодовый выпуск `d5887c1a6d3a078d8b78ab564ea0b481061e95b1`: CI 38390312385 success, Coolify deployment `sar29udf3srrfuzft8mnnwnu` finished/healthy. HOME working-only миграция изменила ревизию 20→21, обслуживаемая 20 сохранялась до CMS-публикации. CMS-публикация `cmv6o4jfp000101nwmg9d5exe` ревизии 21 завершилась SUCCEEDED; публичные API/HTML возвращают HOME 2.0.0, 207 городов/4018 маршрутов. Digest CITY_HOME и SEO сохранены, старые versioned assets доступны.

Корректировка #281 и нового поведения пока ожидает разрешённого exact-SHA CODE deployment после зелёного CI. Новая CMS-публикация не нужна: поля/контент и рабочая ревизия 21 сохраняются. Полная внешняя browser-приёмка и закрытие #277 выполняются после активации нового renderer.

## Диагностика нагрузки

После перезагрузки владельцем все шесть компонентов healthy, restart=0/OOM=false; migrate/bootstrap-seed exited 0. Прямой SSH использовал существующий known_hosts по IP владельца, RejectPolicy и проверку hostname, без обхода host trust. Web CPU около 0%, anon снизился со 107 до 87 MiB; file cache около 2.11 GiB объясняет показатель Docker около 2.06 GiB. API моментальный пик 21% в следующем снимке стал 0%. На сервере доступно около 4.3 GiB RAM. Эти снимки не доказывают причину прежнего перегруза или отсутствие любых будущих утечек.

Отдельные открытые находки: [#266](https://github.com/Celtoman/astro-telekom/issues/266) — review HTTP 500 под параллельной нагрузкой; [#280](https://github.com/Celtoman/astro-telekom/issues/280) — прежние CSP warnings; [#282](https://github.com/Celtoman/astro-telekom/issues/282) — host vm.overcommit_memory=0. Redis persistence сейчас ok; эти изменения не включаются в Hero.
