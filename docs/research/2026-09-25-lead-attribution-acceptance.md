# Приёмка атрибуции заявки на защищённом test-контуре

Дата: 25 сентября 2026 года (МСК). Задачи [#154](https://github.com/Celtoman/astro-telekom/issues/154) и [#220](https://github.com/Celtoman/astro-telekom/issues/220).

## Версия и проверки

- Коммит `fcf7db98fbeacd181a6251efdb8f714b9e439d4b` прошёл локальный `pnpm check` и [CI 36065439155](https://github.com/Celtoman/astro-telekom/actions/runs/36065439155). Точное число тестов хранится в [TEST_COVERAGE](../TEST_COVERAGE.md).
- Coolify deployment `vsdngg3vcc8vawgx0ufsqdlw` завершился `finished` 24 сентября в 22:11:39 UTC на том же SHA; ресурс `running:healthy`.
- Без Basic Auth public readiness вернул `401`; с ним — `200` и `status=ok`. Admin login вернул `201`. Историческая заявка `cmug1dtms000701o2tfkitb6a` прочиталась через admin API с `attributionSnapshot=null`, что подтверждает доступность nullable колонки `0051` без переписывания старой записи.

## Синтетическая заявка

Одна помеченная несбытовая заявка `cmug3915w000101mjfqyintla` создана через защищённый `POST /api/v1/leads` с `reasonCode=other`, ответ `201`. В admin detail она имеет `MANUAL_CHECK`, ни одной попытки доставки и `capture=browser_session`. Значения номера телефона, cookie, исходного IP и токенов в документ не записаны.

Снимок сохранил разные first/last UTM (`utm_source=codex` и `utm_campaign=qa`), два уникальных пути (`/`, `/kazan`), время сессии и переданный тестовый User-Agent. Посторонний query-параметр удалён из обоих URL и referrer. Запрос содержал поддельную цепочку `X-Forwarded-For`; сохранённый сервером адрес — валидный внешний IPv4, отличный от обоих подставленных адресов. Это подтверждает очистку proxy-заголовка на проверенном маршруте, но не измеряет все варианты сетевой топологии.

Проверка отправляла payload напрямую через публичный API. Интерактивные клики в браузере, визуальный осмотр нового блока `/leads` и продолжительная проверка 180-дневного удаления здесь не выполнялись; сбор маршрута и отображение покрыты локальными проверками и сборкой.
