# Исправления новостей: выпуск и внешняя проверка

7 ноября 2026. Владелец явно разрешил push и test deployment, запретив публикацию оставшихся реальных черновиков. [#558](https://github.com/Celtoman/astro-telekom/issues/558), реализация [и локальные проверки](2026-11-07-news-batch-and-ui-fixes.md).

## Выпуск

- Код `a09c2c71c9ee524b0232c49d2b8930b99bd010fd` отправлен в master. [Exact CI42362418321](https://github.com/Celtoman/astro-telekom/actions/runs/42362418321) success:1070 pass/0 fail/0 skip, тесты425197ms. Локальный Windows gate ранее1069pass/0fail/1platformskip.
- Проверено приложение `astro-telekom`, UUID `jlrsktdos9yhchkgnrd9f5fj`, repository Celtoman/astro-telekom, master/HEAD. Deploy через Coolify MCP: `hz8jdregiwjcnddzpwdtaxo9`, exact SHA, finished10:16:25UTC, длительность95с, running:healthy. Автоматическая CODE-подготовка не публикует рабочие черновики.
- CODE HTTP200/SUCCEEDED: artifact `f2d976ce32e7a64c0a0d5d8f534bfc15401da6b945579aa7afd977cb398565c5`, renderer `b845c5acd7fce2eee17268b6fb2d26dbe89a5f4e681bddbea43bc8898cc2e7f2`, manifest `02b1b65e651d5e5ddae02b2cc3266fe016998b2350842a4fd75d52597543398e`. В ожидании bridge возвращал202UNCERTAIN, один клиентский запрос завершился timeout. Повторена та же deployment/SHA-команда, без нового deploy или CMS publish; конечный успех и браузерная раздача нового asset prefix подтверждены. Лог Caddy показывает activation10:21:47UTC;95с deployment не выданы за полное время CODE.

## Сохранность

До выпуска в test уже были две опубликованные новости и четыре DRAFT; исторические шесть DRAFT первого T11 не являются актуальным состоянием. До/после совпали IDs, revisions, states и digest content всех6, published representations и категория. Четыре черновика остались revision1 и не опубликованы.

Serving publication `cmw64tfgt001701rpugr5cfkv`, sequence24, base `cmw64k1br001101rp0rgq2erc` и CMS29/29 сохранены. Catalog digest `dec854aa50be45a168541b99f8d4fd680e0bcc08294adb674e0b441db89bd7ea` и полный semantic digest catalog совпали побайтно после JSON-сериализации; routes:207CITY_HOME,207CITY_ADDRESS_CHECK,3805CITY_TARIFF_DETAIL. CODE меняет renderer/artifact, сохраняя snapshot.

## Внешний браузер и HTTP

- До выпуска1440px: gap48px, selector сайта присутствовал. После: список, статья роутера и категория novosti на1440/834/390/320 — во всех12 сочетаниях gap24px, без горизонтального переполнения; padding карточек24/16/16/16.
- Реальные две карточки: обложки загружаются на всех ширинах, одинаковая высота в широком ряду, естественная высота на Mobile. Hover border/background224,35,30 /246,247,249; Pressed198,31,26 /255,234,233; transform none и неизменная верхняя координата. Keyboard focus2px, Enter открывает правильную статью. Пустые/mixed rows проверены локальной контентной матрицей; реальные материалы для неё не изменялись.
- Список/категории/news settings/404 settings на четырёх ширинах:16экранов без site selector, overflow и alert. Навязанный siteId=foreign не вызывает запросов к чужому сайту. Выбор всех4, снятие выбора, выбор2 и один общий batch/review работают; в review обе точные редакции1 и12 affected paths. Modal не переполняется, Escape закрывает. Published строки недоступны для batch выбора. В сценарии пакетного review единственный POST — batch/review; POST publish/save отсутствуют. Последующий штатный preview использовал POST preview. После проверки selection0.
- Прямой редактор существующей опубликованной статьи открывается без site selector. Штатный sandbox preview статьи на1440/834/390/320 также даёт gap24px без overflow; режим карточки показывает padding16px при320 и отключённые ссылки. Поля материала не редактировались.
- HTTP: public/admin без Basic Auth401; авторизованные news/category/обе опубликованные статьи200, все4draft paths404. Sitemap содержит две опубликованные статьи и исключает четыре draft. Контекст editorial API200/точный сайт, test noindex сохранён. Root, canonical /kazan, robots и sitemap доступны. Начальное ожидание /kazan/200 исправлено в QA на канонический /kazan; trailing slash штатно301.
- При UI automation locator.check пытался кликнуть скрытый input React Aria; успешная проверка использует штатный label. В первой метрике media использовался ошибочный селектор; повторная матрица по news-card-media подтвердила обе обложки и одинаковую высоту ряда. Эти ошибки скриптов не выданы за дефекты продукта.

Pageerror в завершённых browser-сценариях отсутствует. Console не объявляется чистой: известный public CSP child-src/frame-src [#280](https://github.com/Celtoman/astro-telekom/issues/280), browser manifest401 [#560](https://github.com/Celtoman/astro-telekom/issues/560), blocked admin inline styles и отдельная антивирусная инъекция [#561](https://github.com/Celtoman/astro-telekom/issues/561). Эти находки зафиксированы отдельно, security policy не ослаблялась.

Фактический внешний batch publish/activation не запускался по запрету владельца. Реальная атомарность/ACK/одинenqueue подтверждены локальным SQL и CI; длительность настоящего batch остаётся [#562](https://github.com/Celtoman/astro-telekom/issues/562). Safari, физический touch и ручной screen reader не проверены. #534 остаётся по приёмке владельца. #555/#556/#557/#559 закрыты push исправления.

Без credentials: журналы и JSON в `.codex-tmp/news-fix-558/`; browser shots `.playwright-mcp/news-fix-test-1440.png` и `news-admin-test-390.png`. Прежние изменения владельца сохранены, в commit отчёта включён только собственный документальный delta.
