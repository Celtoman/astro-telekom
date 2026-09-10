# Модель данных текущего прототипа

Источник правды: `prisma/schema.prisma` и двенадцать применимых миграций. Этот документ различает существующие таблицы от объектов, которые фигурируют только в продуктовом плане.

## Сущности контента и географии

| Сущность | Реальные ключевые поля | Связи и статус |
| --- | --- | --- |
| `Provider` | `name`, unique `slug`, `legalData`, `settings` | Имеет sites и tariffs. |
| `Site` | `providerId`, `name`, unique `slug`, `domain`, `settings`, `status` | Имеет regions, cities, pages, leads, checks, redirects, city imports и rebuild status. |
| `Region` | `siteId`, `name`, `slug`, `phone`, `content` | Unique `(siteId, slug)`, содержит cities. |
| `City` | site/region, names in three cases, legacy/office fields, `status`, `phone`, `seo`, `content` | Unique `(siteId, slug)`, имеет pages, tariffs, leads, checks, redirects. |
| `Page` | site/city, `type`, `title`, `slug`, `status`, `seo`, `content` | Unique `(cityId, slug)`, имеет ordered blocks. |
| `PageBlock` | `blockType`, `position`, `visible`, JSON `data`, optional `source` | Cascade delete с page. API разрешает hero, rich_text и tariff_grid. |

`PublishStatus` принимает `DRAFT`, `PUBLISHED`, `ARCHIVED`. В модели нет даты публикации, расписания, версии, preview token, автора изменения или корзины.

## Тарифы и импорты

`Tariff` хранит provider/city, name, slug, service type, standard/promo price, speed, promo text, connection fee, availability, external/identity keys, source, attributes, seo и publication status. Source-specific поля полного описания и количества TV-каналов не дублируются в верхнем уровне: importer сохраняет их в JSON `attributes` под стабильными ключами `opisanie_tarifa` (string), `tv_channels_total` и `tv_channels_hd` (number); пустые значения не сохраняются. Ограничения: unique `(cityId, slug)` и `(cityId, identityKey)` — следовательно, один `post_title_lat` не может повторяться в городе даже у разных service type.

`TariffImportRun` и `CityImportRun` сохраняют метаданные файла, счетчики, JSON report, `VALIDATED`/`APPLIED`/`FAILED` и время apply. Tariff report содержит нормализованные candidates и preview diff полного provider snapshot; apply с transaction timeout 120 секунд атомарно удаляет отсутствующие в snapshot тарифы. Опциональная связь исторической заявки с удаленным тарифом сбрасывается в `NULL`, сама заявка сохраняется. Сырые файлы не сохраняются. Нет таблицы tariff history, import line history, version snapshot или rollback.

## Проверки и заявки

| Сущность | Назначение |
| --- | --- |
| `AddressCheck` | Адрес, object type, status, raw provider response, site/city/page context. |
| `Lead` | Контакты, адрес, UTM, URL/form/device/visited pages, address/contract results, processing status, external lead data, operator status. |
| `LeadDeliveryAttempt` | Каждый API/email attempt, idempotency key, payload/response/error, next retry time. |
| `LeadActivityEvent` | События браузера до формы. |
| `LeadStatusHistory` | Операторские переходы NEW/IN_PROGRESS/CALL_LATER/CONNECTED/REJECTED. |
| `LeadAccessToken` | SHA-256 hash одноразовой fallback-ссылки, срок действия, отметки использования и отзыва; связан ровно с одной заявкой и удаляется каскадно. |

`LeadProcessingStatus` отделяет delivery flow от операторского `LeadStatus`. Это реализованная и важная граница: delivery не должна заменять CRM-статус.

Согласованная маршрутизация требует хранить отдельно исходные ответы проверок, нормализованное решение и реальные delivery attempts. Отсутствие Дом.ру, подтвержденный действующий абонент и неоднозначный ответ API — разные причины непередачи. API Dom.ru вызывается после обнаружения хотя бы одного провайдера; только успешный ответ ожидаемой структуры с явным `contacts: []` означает `NOT_FOUND`, но delivery дополнительно требует наличия Дом.ру. Отсутствие или неверный тип `contacts` является ошибкой контракта и должно приводить к `MANUAL_CHECK_API`. Для видимой проверки подключения `AddressCheck` может существовать без `Lead`; лид появляется только после найденного Дом.ру и ввода телефона.

Для retention не добавлена отдельная policy-таблица: юридически утвержденный срок приходит только из обязательной production-переменной `PII_RETENTION_DAYS`. Миграция `0012_pii_retention_indexes` индексирует `Lead.createdAt` и `AddressCheck.createdAt`. Bounded hard-delete старого `Lead` каскадно удаляет history, delivery attempts, activity и access tokens; свежие duplicates предварительно отвязываются, старый `AddressCheck` удаляется только без оставшихся ссылок. Это исключает частичную «анонимизацию», при которой PII мог бы остаться в JSON.

## Доступ и технические записи

`User` содержит email, `passwordHash`, name, active и timestamps. Ролевой модели нет: любая активная учетная запись имеет единый уровень доступа администратора. `Session` хранит не raw token, а его SHA-256 hash и expiry. При reset password или deactivate API удаляет sessions пользователя. `LeadAccessToken` также хранит только hash: raw token существует лишь в одноразовой email-ссылке и не возвращается административными CRM routes.

`Redirect` хранит site/city, source/target path, status, `hitCount`, `lastHitAt` и timestamps. Admin API создает, изменяет и архивирует записи; published-правило проходит проверку конфликтов, существования цели и запрета цепочек. Во время Astro build опубликованные записи превращаются в точные Caddy matchers, а runtime resolver повторно проверяет published site/redirect, атомарно учитывает переход и отдает HTTP 301. Удаление реализовано как `ARCHIVED`, общей корзины/версий и предложений из 404 пока нет.

`SiteRebuild` — одна актуальная outbox/status-запись на `dedupeKey` сайта. Она хранит affected paths, последнюю причину, `requestedRevision`, `processingRevision`, `publishedRevision`, число попыток, ошибку и финальный ответ deployment provider. Ревизия считается опубликованной только при статусе `SUCCEEDED`; новая мутация во время активной сборки увеличивает requested revision и создает следующий job после завершения текущего.

## Реальное наследование

Public city endpoint применяет shallow merge в таком порядке:

```text
Provider.settings.content -> Site.settings.content -> Region.content -> City.content -> Page.content
```

Значение deeper level заменяет значение того же top-level key. Для SEO endpoint объединяет City `seo` с Page или Tariff `seo`. Блоки, nested JSON values, templates и источник поля не наследуются автоматически. Полная модель «шаблон -> сайт -> регион -> город -> страница -> тариф» остается продуктовой целью, а не текущей реализацией.

## Чего в модели нет

Нет сущностей для media library, page template/version, scheduled publication, audit action, notification delivery, analytics aggregates, SEO validation, variable registry, category/collection, equipment, channel package, review, persisted legal retention policy и provider integration profile. Retention mechanism существует, но конкретный срок остается внешним legal decision. Перед добавлением новых сущностей нужно утвердить их interface и ownership, а не использовать неструктурированный JSON как постоянную замену.
