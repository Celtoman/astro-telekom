# Модель данных текущего прототипа

Источник правды: `prisma/schema.prisma` и семнадцать применимых миграций. Этот документ различает существующие таблицы от объектов, которые фигурируют только в продуктовом плане.

## Сущности контента и географии

| Сущность | Реальные ключевые поля | Связи и статус |
| --- | --- | --- |
| `Provider` | `name`, unique `slug`, `legalData`, `settings` | Имеет sites и tariffs. |
| `Site` | `providerId`, `name`, unique `slug`, `domain`, `settings`, `status` | Имеет regions, cities, pages, leads, checks, redirects, city imports и rebuild status. |
| `Region` | `siteId`, `name`, `slug`, `phone`, `content` | Unique `(siteId, slug)`, содержит cities. |
| `City` | site/region, names in three cases, legacy/office fields, `status`, `phone`, `seo`, `content` | Unique `(siteId, slug)`, имеет pages, tariffs, leads, checks, redirects. |
| `Page` | site/city, `type`, `title`, `slug`, `status`, `seo`, `content` | Unique `(cityId, slug)`, имеет ordered blocks. |
| `PageBlock` | `blockType`, `position`, `visible`, JSON `data`, optional `source` | Cascade delete с page. API разрешает `hero`, `rich_text`, `tariff_grid`, `service_grid`, `feature_grid`, `steps` и `faq`; `position` задает порядок visible-блоков. |

`PublishStatus` принимает `DRAFT`, `PUBLISHED`, `ARCHIVED`. В модели нет даты публикации, расписания, версии, preview token, автора изменения или корзины.

JSON `data` не является произвольным хранилищем. API применяет закрытый discriminated contract по `blockType`: hero содержит заголовок, текст и опциональные eyebrow/CTA; rich text — заголовок и текст; tariff grid — заголовок и опциональные фильтр услуги, лимит 1–12 и тип страницы для ссылки на полный каталог; service grid — заголовок и ссылки по допустимому типу опубликованной страницы; feature grid и steps — заголовок и массив пар «заголовок + текст»; FAQ — заголовок и массив пар «вопрос + ответ». Неизвестные ключи, raw HTML, пустые обязательные строки, превышение лимитов и небезопасные CTA отклоняются. Массивы ограничены по числу элементов. При PATCH новое `data` валидируется как полная замена контракта вместе с сохраненным `blockType`, а не как свободный частичный JSON; условная запись блокирует конкурентную смену discriminator. Public catalog повторно валидирует сохраненный JSON и требует ровно один видимый hero у непустой блочной страницы.

Форма заявки остается отдельным системным компонентом публичной страницы и в `PageBlock` не моделируется. Для страниц с блоками именно их упорядоченный набор определяет контентную структуру; fallback-шаблон применяется только при отсутствии блоков. Внутренние `hero.data.ctaHref` хранятся без завершающего слэша; migration `0018_page_block_cta_paths` идемпотентно нормализует legacy-значения до применения строгой runtime-валидации. Migration `0019_kazan_page_block_snapshots` точечно доводит существующие HOME/INTERNET страницы Казани до канонического набора прототипов: обновляет только распознанные legacy hero/tariff блоки и добавляет отсутствующие позиции без удаления других записей. Это не добавляет версии, audit trail, schedule, rollback или глубокое наследование: соответствующие направления [#13](https://github.com/Celtoman/astro-telekom/issues/13) и [#14](https://github.com/Celtoman/astro-telekom/issues/14) отложены.

## Тарифы и импорты

`Tariff` хранит provider/city, name, slug, service type, standard/promo price, speed, promo text, nullable connection fee, availability, external/identity keys, source, attributes, seo и publication status. Нулевой `connectionFee` означает бесплатное подключение, положительный — его стоимость, а `NULL` — отсутствие публичной строки. Source-specific поля не дублируются в верхнем уровне: единый реестр `TARIFF_ATTRIBUTE_FIELDS` нормализует строки, числа, integers, booleans и статусы услуг для import и ручного PATCH; пустые значения не сохраняются, неизвестные непустые ключи отклоняются. `attributes.show_on_site` — сохраненная рекомендация исходного файла, независимая от `status`. Ограничения: unique `(cityId, slug)` и `(cityId, identityKey)`; identity key для ручной правки и импорта одинаков — `cityId:slug:serviceType`, а публичный slug остается уникальным в городе независимо от типа услуги.

Миграция `0016_admin_list_pagination_indexes` добавляет составные индексы `Tariff(updatedAt, id)` и `Lead(createdAt, id)` для стабильного keyset/cursor обхода административных журналов. Фильтр статуса заявок использует существующий `Lead(status, createdAt)`, а тарифные city/service/status-фильтры — `Tariff(cityId, serviceType, status)`. Подстроковый `q` остается bounded-поиском по текущему каталогу и не подменяется неутвержденным полнотекстовым индексом.

`TariffImportRun` и `CityImportRun` сохраняют метаданные файла, счетчики, JSON report, `VALIDATED`/`APPLIED`/`FAILED` и время apply. Tariff report содержит нормализованные candidates и preview diff полного provider snapshot; apply с transaction timeout 120 секунд атомарно удаляет отсутствующие в snapshot тарифы. City report имеет явную версию и хранит номер строки, normalized candidate, snapshot найденного города и field-level diff; report прежней версии требует повторной валидации. Apply требует полный `create/update/skip` map, сверяет snapshot и переводит run в `APPLIED` в одной serializable-транзакции, поэтому конкурентное изменение или повторный параллельный apply не перезаписывает данные, а уже примененный импорт не маскируется статусом `FAILED` при отдельном сбое постановки rebuild. Опциональная связь исторической заявки с удаленным тарифом сбрасывается в `NULL`, сама заявка сохраняется. Сырые файлы не сохраняются. Нет таблицы tariff history, import line history, version snapshot или rollback.

## Проверки и заявки

| Сущность | Назначение |
| --- | --- |
| `AddressCheck` | Фактический нормализованный адрес, object type, status, raw provider response и site/city/page source-контекст. `cityId` обозначает город страницы и не ограничивает географию адреса. |
| `Lead` | Контакты, фактический адрес, allowlisted и bounded UTM, URL/form/device/visited pages с лимитом 16 KB JSON, address/contract results, processing status, external lead data, operator status. `cityId` обозначает город страницы-источника. |
| `LeadDeliveryAttempt` | Каждый queue/API/email attempt, idempotency key, payload/response/error, next retry time. |
| `LeadNotification` | Одна persistent outbox/status-запись обычного оповещения на лид: revision, attempts, transport, безопасный error code/HTTP status и provider message ID без копии телефона, адреса или текста письма. |
| `LeadActivityEvent` | События браузера до формы: allowlisted оболочка `type/data`, до 100 событий и 64 KB JSON суммарно; `data` ограничен 4 KB, 20 ключами и глубиной. |
| `LeadStatusHistory` | Операторские переходы NEW/IN_PROGRESS/CALL_LATER/CONNECTED/REJECTED. |
| `LeadAccessToken` | SHA-256 hash одноразовой fallback-ссылки, срок действия, отметки использования и отзыва; связан ровно с одной заявкой и удаляется каскадно. |

`LeadProcessingStatus` отделяет delivery flow от операторского `LeadStatus`. Помимо технических/доставочных исходов, миграция `0013_lead_provider_outcomes` добавляет две однозначные причины непередачи: `PROVIDER_NOT_AVAILABLE_NOT_SENT` (провайдеры есть, Дом.ру среди них нет) и `NO_PROVIDERS_NOT_SENT` (Tarifnik вернул пустой список). Они не подменяются ручной проверкой, потому что отрицательный ответ уже однозначен. Миграция `0014_delivery_queue_status` добавляет `DELIVERY_QUEUE_ERROR` и канал `QUEUE`, чтобы сбой producer не оставался ложным `PENDING` и был виден отдельно от ответа Tarifnik/email.

Миграция `0015_lead_notification_outbox` добавляет `LeadNotification` и статусы `PENDING/QUEUED/RUNNING/RETRYING/SUCCEEDED/FAILED`. Запись создается в одной транзакции с `Lead`; revision отделяет ручные циклы, а persisted attempts сохраняют общий лимит после потери Redis. Каждый queue job имеет revision+attempt в ID и удаляется после terminal BullMQ outcome. Свежий `RUNNING` защищен lease, ручной retry — compare-and-swap. Доставка имеет at-least-once семантику, а idempotency header `lead-notification-<leadId>-revision-<revision>` снижает риск дубля внутри автоматических попыток и не блокирует новый ручной цикл.

Согласованная маршрутизация требует хранить отдельно исходные ответы проверок, нормализованное решение и реальные delivery attempts. Отсутствие Дом.ру, подтвержденный действующий абонент и неоднозначный ответ API — разные причины непередачи. API Dom.ru вызывается после обнаружения хотя бы одного провайдера; только успешный ответ ожидаемой структуры с явным `contacts: []` означает `NOT_FOUND`, но delivery дополнительно требует наличия Дом.ру. Отсутствие или неверный тип `contacts` является ошибкой контракта и должно приводить к `MANUAL_CHECK_API`. Для видимой проверки подключения `AddressCheck` может существовать без `Lead`; лид появляется только после найденного Дом.ру и ввода телефона.

Для retention не добавлена отдельная policy-таблица: юридически утвержденный срок приходит только из обязательной production-переменной `PII_RETENTION_DAYS`. Миграция `0012_pii_retention_indexes` добавила индексы по времени; `0016` расширяет индекс `Lead.createdAt` полем `id`, сохраняя тот же ведущий столбец для purge-запроса. `AddressCheck.createdAt` остается отдельным индексом. Bounded hard-delete старого `Lead` каскадно удаляет history, delivery attempts, notification evidence, activity и access tokens; свежие duplicates предварительно отвязываются, старый `AddressCheck` удаляется только без оставшихся ссылок. Это исключает частичную «анонимизацию», при которой PII мог бы остаться в JSON.

## Доступ и технические записи

`User` содержит email, `passwordHash`, name, active и timestamps. Ролевой модели нет: любая активная учетная запись имеет единый уровень доступа администратора. `Session` хранит не raw token, а его SHA-256 hash и expiry. При reset password или deactivate API удаляет sessions пользователя. `LeadAccessToken` также хранит только hash: raw token существует лишь в одноразовой email-ссылке и не возвращается административными CRM routes.

`Redirect` хранит site/city, no-slash source/target path, status, `hitCount`, `lastHitAt`, опциональный `managedTariffId` и timestamps. `managedTariffId` — provenance автоматического правила без foreign key: это позволяет сохранить redirect history после удаления тарифа. Только управляемое тарифом правило синхронизирует status с его публикацией; совместимое ручное правило не захватывается. Admin API создает, изменяет и архивирует записи; published-правило проходит проверку конфликтов, существования цели и запрета цепочек. Во время Astro build опубликованные записи превращаются в точные Caddy matchers, а runtime resolver повторно проверяет published site/redirect, атомарно учитывает переход и отдает HTTP 301. Удаление реализовано как `ARCHIVED`, общей корзины/версий и предложений из 404 пока нет.

`SiteRebuild` — одна актуальная outbox/status-запись на `dedupeKey` сайта. Она хранит affected paths, последнюю причину, `requestedRevision`, `processingRevision`, `publishedRevision`, число попыток, ошибку и финальный ответ deployment provider. Ревизия считается опубликованной только при статусе `SUCCEEDED`; новая мутация во время активной сборки увеличивает requested revision и создает следующий job после завершения текущего.

## Реальное наследование

Public city endpoint применяет shallow merge в таком порядке:

```text
Provider.settings.content -> Site.settings.content -> Region.content -> City.content -> Page.content
```

Значение deeper level заменяет значение того же top-level key. Для SEO endpoint объединяет City `seo` с Page или Tariff `seo`. Блоки, nested JSON values, templates и источник поля не наследуются автоматически. Полная модель «шаблон -> сайт -> регион -> город -> страница -> тариф» остается продуктовой целью, а не текущей реализацией.

## Чего в модели нет

Нет сущностей для media library, page template/version, scheduled publication, audit action, analytics aggregates, SEO validation, variable registry, category/collection, equipment, channel package, review, persisted legal retention policy и provider integration profile. Retention mechanism существует, но конкретный срок остается внешним legal decision. Перед добавлением новых сущностей нужно утвердить их interface и ownership, а не использовать неструктурированный JSON как постоянную замену.
