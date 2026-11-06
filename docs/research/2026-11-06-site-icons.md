# Иконки публичного сайта — 6 ноября 2026

По поручению владельца и [#537](https://github.com/Celtoman/astro-telekom/issues/537) расширен выбранный вариант 1 с tarify-dom.ru. Это локальная реализация; публикация во внешний контур отдельная.

## Основания

- [Google Search Central](https://developers.google.com/search/docs/appearance/favicon-in-search): квадратная иконка, рекомендуемый размер больше 48 пикселей, стабильный URL и доступность для обхода. PNG 96 удовлетворяет размеру; пригодность живого сайта для обхода зависит от его режима доступа. Тестовый контур с авторизацией/noindex этим изменением не открывается.
- [HTML rel=icon](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel#icon): браузер выбирает подходящую иконку по type/sizes; несколько форматов допустимы. Число link-тегов само по себе не означает конфликт. Используется один согласованный рисунок, а не два разных знака из старого WordPress head.
- [Apple Web Clip](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html): Apple Touch Icon задаётся отдельно. Выбран PNG 180×180.
- [Web manifest](https://web.dev/learn/pwa/web-app-manifest): PNG 192/512 для устройств; для maskable важный знак должен помещаться в центральную окружность радиусом 40% ширины. [WebKit](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/) также рекомендует непрозрачную full-bleed иконку для адаптации системной формы.

Манифест здесь задаёт имя/значки/режим открытия. Не добавляются service worker, offline-режим, системные splash-скриншоты, Apple standalone-теги или старые Windows tile-теги. Наличие манифеста само по себе не доказывает готовность PWA или поведение всех платформ.

## Файлы и подключение

| Файл | Размер | Назначение |
| --- | --- | --- |
| `apps/web/public/favicon.ico` | 16/32/48 в одном контейнере | Fallback и вкладки браузеров |
| `apps/web/public/favicon-96x96.png` | 96×96 | Современные браузеры и стабильная иконка для поиска |
| `apps/web/public/apple-touch-icon.png` | 180×180 | Apple Web Clip, непрозрачный RGB PNG |
| `apps/web/public/web-app-manifest-192x192.png` | 192×192 | Значок устройства, `purpose: any` |
| `apps/web/public/web-app-manifest-512x512.png` | 512×512 | Крупный значок, `purpose: any maskable` |
| `apps/web/src/pages/site.webmanifest.ts` | JSON endpoint при статической сборке | Имя из опубликованного каталога, `lang: ru`, корневые id/start_url/scope, `display: browser` |

Все обычные страницы и 404 наследуют общий head из BaseLayout. MIME и реальные sizes заданы явно; дополнительных rel=shortcut icon и SVG-копии нет.

PNG 96 и `/site.webmanifest` имеют стабильные адреса. Caddy читает их из активного release и требует перепроверку кеша (`no-cache`), включая режим с legacy asset baseline. Для манифеста явно задан `application/manifest+json; charset=utf-8`.

ICO и Apple в head, а также PNG внутри манифеста используют publicAsset: при публикации ссылки содержат artifactId. Поэтому ранее выданный манифест продолжает ссылаться на свои изображения после следующей активации; годовой immutable-кеш этих изображений сохраняется. Для браузеров, самостоятельно запрашивающих `/favicon.ico` и `/apple-touch-icon.png`, корневые адреса также выдают активную версию с перепроверкой кеша. Пользовательский запуск из манифеста всегда ведёт на `/`, а не в каталог артефакта.

## Происхождение и обработка

Все пять исходных изображений взяты из `https://tarify-dom.ru/wp-content/uploads/fbrfg/` с соответствующими именами файлов. ICO и PNG 96 скопированы без преобразования. Мобильные PNG 180/192/512 экспортированы средствами уже установленного sharp на непрозрачном фоне `#ff2d28` с PNG compressionLevel 9. Размеры и белый знак не менялись; исходные PNG имели прозрачные углы и полупрозрачные края. SVG не используется: он содержит растровый PNG и не даёт преимущества векторного исходника.

Для 512 максимальное расстояние белых пикселей знака от центра составляет около 35,8% ширины, меньше safe-zone радиуса 40%. Тест контролирует непрозрачность, наличие знака и safe zone для мобильных размеров; это не заменяет реальную установку ярлыков на устройствах.

## Проверки

`verify-site-icons.mjs`, вызываемый общим SEO gate, проверяет ICO directory/payload bounds и размеры, декодирование PNG и реальные размеры, непрозрачность мобильных файлов, содержимое/режим запуска манифеста и принадлежность ссылок текущему artifactId. Общий verifier требует ровно согласованный набор icon/Apple/manifest без дублей на всех HTML, включая 404, и ищет loopback-утечки также в манифесте.

Регрессии покрывают некорректные размеры/типы/ссылки, отсутствующие и повреждённые файлы, прозрачный Apple PNG, лишние link-теги, смешение двух artifactId и неверные launch URLs. Реальный Astro builder проверяет материализованный манифест. Docker/Caddy rehearsal проверяет MIME/cache, переключение значков вместе с публикацией, неизменность предыдущих versioned assets и приоритет активных discovery-файлов перед legacy fallback.

Полный `pnpm check` обязателен из-за изменения SEO gate и serving config. Локальный Chromium smoke подтверждает HTTP/декодирование/манифест; физические iOS/Android и Safari требуют отдельной проверки.
