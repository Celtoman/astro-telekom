# Сквозная приёмка синтетической заявки на защищённом test-контуре

Дата: 25 сентября 2026 года (МСК). Задача: [#219](https://github.com/Celtoman/astro-telekom/issues/219). Проверялся один основной путь Release 1 на `tv-internet-dom.ru` и `admin.tv-internet-dom.ru`, оба под Basic Auth. Данные телефона, пароль, API-ключи и внешний `appeal_id` не приведены.

## Предусловия

- Локальный и удалённый `master` указывали на `738d768617106d7b6c94fd4fe42b8d7d6634731b`; [CI 36020161920](https://github.com/Celtoman/astro-telekom/actions/runs/36020161920) прошёл. Coolify deployment `mfssjp7rejrdni7iuq9vwe35` для этого SHA завершился `finished` 24 сентября в 15:33:07 UTC, ресурс имел статус `running:healthy`.
- Защищённые public/admin маршруты и `/api/v1/health/ready` отвечали HTTP 200. Admin `/admin/readiness` вернул `configured` по coverage, contract, Tarifnik, fallback email, rebuild и PII retention.
- У сайта `domru-site` рабочая и опубликованная ревизии равнялись 7; последняя публикация `cmufiu2ik001r01ufdxel4o3a` имела статус `SUCCEEDED`.
- Coolify runtime Environment Variables содержали `TARIFNIK_UTM_CAMPAIGN=test`. По [проверенному внешнему контракту](2026-09-10-priority-0-external-contracts.md) обращения с этой меткой не обрабатываются кол-центром. Пользователь разрешил выбрать тестовый мобильный номер; его значение не сохранено в документации.

## Публичный путь и сохранённый результат

1. DaData предложила адрес без квартиры `г Казань, ул Восстания, д 101`. `POST /api/v1/address-checks` вернул HTTP 201, `type=business`, `outcome=TARGET_AVAILABLE`, `checkId=cmug1copf000601o29l6mwjvd`. Другие два публичных адреса до этого дали `NO_PROVIDERS` и для заявки не использовались.
2. `POST /api/v1/public/sites/domru-site/cities/kazan/tariffs/giga-300/quote` вернул HTTP 201, выбор без оборудования и дополнительных услуг, fingerprint `b23b6d2ee80b2470c1f8078ddd0d4f70d2d8e3fca947ea0c2884a59705b88f80`.
3. Один `POST /api/v1/leads` с теми же `addressCheckId`, тарифом, `selection`/`fingerprint`, `reasonCode=new_connection`, `consentVersion=lead-form-v1-2026-09-22` и новым `submissionKey` вернул HTTP 201, `id=cmug1dtms000701o2tfkitb6a`, `status=NEW`, `subscriberMode=false`. Payload совпадал по обязательным и маршрутизирующим полям с `apps/web/src/lib/address-check-client.mjs`; запрос был сделан напрямую к публичному same-origin API.
4. Защищённый `GET /api/v1/crm/leads/cmug1dtms000701o2tfkitb6a` вернул HTTP 200: `AddressCheck.status=AVAILABLE`, версию согласия и совпадающий fingerprint комплектации, `reasonCode=new_connection`, три decision events (`PHONE_CHECK`, `SUBSCRIBER_CHECK`, `ROUTE_DECISION`), `phoneCheckStatus=PASSED`, `contractResult.status=NOT_FOUND`. Внутренний `duplicateOfId=null`.
5. Лид создан 24 сентября в 21:21:03.556 UTC и обновлён в 21:21:04.638 UTC до `processingStatus=DELIVERED`. Сохранена ровно одна попытка канала `API`: `attemptNumber=1`, `status=SUCCEEDED`. Записанный request содержал `utm_campaign=test`. Записанный ответ Tarifnik — `result=created_duplicate` и непустой `appeal_id`; `externalLeadId` присутствует. Это внешний дедупликационный ответ, а не дубль нашей записи.
6. Обычное уведомление имеет `status=SUCCEEDED`, `errorCode=null`. Дополнительных delivery-attempt и email fallback у лида нет. Повторную отправку с тем же ключом не выполняли.

## Границы вывода

Проверены публичные HTTP API, реальные фоновые решения, сохранение в PostgreSQL и ответ внешнего Tarifnik на конкретном deployed SHA. Интерактивный browser E2E (клики, отображение второго шага и экрана успеха) не выполнялся. Ответ `created_duplicate` подтверждает принятие обращения внешним sandbox-контрактом, но не создание новой уникальной записи у Tarifnik. Реальный production campaign, снятие Basic Auth, юридические реквизиты и допуск реального трафика остаются отдельными решениями владельца.
