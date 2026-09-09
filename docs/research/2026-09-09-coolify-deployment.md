# Аудит развертывания в актуальном Coolify

Дата проверки: 2026-09-09. Область: приватный репозиторий `Celtoman/astro-telekom`, Git-based Docker Compose Application, `docker-compose.coolify.yml`, `.env.example` и `docs/deployment.md`. Использованы только официальная документация Coolify и официальный репозиторий `coollabsio/coolify`.

## Короткий вывод

Выбранная схема в целом правильная: один Git-based Docker Compose Application из приватного GitHub-репозитория, публичные домены только у `web` и `admin`, внутренние `api`/PostgreSQL/Redis, named volumes и Basic Auth через Compose labels. Для этого репозитория предпочтительна **GitHub App**, а не Deploy Key: она дает ограниченный доступ к выбранному репозиторию и встроенные push-webhooks. Raw Compose включать не нужно.

Перед первым внешним deploy нужно учесть четыре уточнения актуального Coolify:

1. инструкция ошибочно предлагает домены с `:80`; для контейнера, который слушает порт 80, актуальная форма — `https://tv-internet-dom.ru` и `https://admin.tv-internet-dom.ru` без суффикса;
2. live-проверка уточнила bcrypt contract: `TEST_BASIC_AUTH_USERS` нужно сохранить как Literal с Buildtime и Runtime, а `Escape special characters in labels` выключить; иначе переменная отсутствует при `docker compose build` либо `${...}` превращается в неинтерполируемый `$${...}`;
3. `COOLIFY_API_TOKEN` должен быть отдельной runtime-only переменной Normal view. Compose больше не интерполирует его при разборе, а worker получает token через runtime `.env`;
4. Source-код v4.3.18 должен исключать `restart: "no"`, но реальный resource после двух успешных запусков сервисов становился `exited:unhealthy`. Поэтому `migrate`, `bootstrap-seed` и `web-publish` дополнительно получили официальный Coolify marker `exclude_from_hc: true`; у worker, web и admin добавлены явные healthchecks.

Кроме того, резервное копирование пока не настроено. Новая версия Coolify умеет архивировать application volumes и делает database-aware backup PostgreSQL внутри **Service**, но Git-based Docker Compose создается как **Application** и пока не получает этот интерфейс — официальный feature issue [#7528](https://github.com/coollabsio/coolify/issues/7528) открыт. До приема реальных заявок нужен проверенный `pg_dump` во внешнее хранилище и тест восстановления.

## Какая версия документации и Coolify проверена

Актуальная новая документация находится на `next.coolify.io` и описывает нынешний интерфейс Applications / Configuration / Deployments. На дату проверки последний официальный релиз — [`v4.3.18`](https://github.com/coollabsio/coolify/releases/tag/v4.3.18), опубликованный 8 сентября 2026 года. Для нового сервера следует использовать текущий stable-канал, а перед настройкой записать фактическую версию из интерфейса. Если установлен более старый релиз, сначала обновить Coolify штатным способом и снова проверить release notes.

## Подтвержденные совпадения

| Область | Состояние проекта | Что подтверждает Coolify |
|---|---|---|
| Тип ресурса | Git-based Docker Compose Application | Это отдельный Application с Git source, branch deployments и webhook automation; Compose остается source of truth. [Docker Compose](https://next.coolify.io/docs/applications/builds/docker-compose) |
| Приватный GitHub | Репозиторий приватный, ветка `master` | Поддерживаются GitHub App и Deploy Key. GitHub App предпочтительна для выбора репозитория и встроенных webhooks; Deploy Key дает read-only SSH-доступ одному репозиторию и требует ручного webhook для Auto Deploy. [GitHub App](https://next.coolify.io/docs/applications/sources/github/app), [Deploy Keys](https://next.coolify.io/docs/applications/sources/deploy-keys) |
| Compose path | Base Directory `/`, Compose Location `/docker-compose.coolify.yml` | Coolify объединяет Base Directory и относительный Compose Location. [Docker Compose](https://next.coolify.io/docs/applications/builds/docker-compose) |
| Raw Compose | Выключен | В обычном режиме Coolify генерирует management/proxy labels. Raw mode требует самостоятельно владеть routing/networking и здесь не нужен. [Docker Compose](https://next.coolify.io/docs/applications/builds/docker-compose) |
| Внешняя поверхность | `web` и `admin` имеют `expose: 80`; у `api`, PostgreSQL и Redis нет `ports:` | Coolify рекомендует публиковать HTTP-сервисы через Domains и не использовать host `ports:` для внутренних сервисов. [Docker Compose networking](https://next.coolify.io/docs/applications/builds/docker-compose#compose-networking) |
| Внутренняя сеть | Сервисы обращаются к `api`, `postgres`, `redis` по service name | Coolify создает отдельную сеть ресурса, в которой service names являются hostnames. [Docker Compose networking](https://next.coolify.io/docs/applications/builds/docker-compose#compose-networking) |
| Domains UI | Router labels доменов не захардкожены в Compose | В нормальном Git Compose режиме домены задаются отдельно для каждого сервиса в UI, а Coolify генерирует proxy labels. Собственные router labels нужны только в Raw mode. [General settings](https://next.coolify.io/docs/applications/configuration/general), [Docker Compose labels](https://next.coolify.io/docs/applications/builds/docker-compose#application-labels) |
| Custom middleware | `traefik.http.middlewares.test-basic-auth...` и `coolify.traefik.middlewares=test-basic-auth` заданы у `web`/`admin` | `coolify.traefik.middlewares` — официальный shorthand для добавления middleware в сгенерированную цепочку Compose-router. [Custom Middlewares](https://coolify.io/docs/knowledge-base/proxy/traefik/custom-middlewares) |
| Persistence | `postgres_data`, `redis_data`, `web_publication` — named volumes | Compose file остается source of truth; Coolify показывает такие mounts read-only и сохраняет их при обычном redeploy. [Persistent Storage](https://next.coolify.io/docs/applications/configuration/persistent-storage) |
| PostgreSQL 18 path | `/var/lib/postgresql` | Актуальная документация отдельно указывает этот путь для PostgreSQL 18+, а старый `/var/lib/postgresql/data` — для версий до 18. [Database persistent storage](https://next.coolify.io/docs/databases/configuration/persistent-storage) |
| Порядок запуска | Миграция и публикация связаны через `depends_on` + health/complete conditions | Compose definition управляет health checks и dependencies; межсервисная адресация поддерживается сетью ресурса. [Docker Compose](https://next.coolify.io/docs/applications/builds/docker-compose) |
| One-shot status | `migrate`, `bootstrap-seed` и `web-publish` имеют `restart: "no"` и `exclude_from_hc: true` | Source релиза v4.3.18 предусматривает оба способа исключения. Live resource не применил ожидаемое исключение только по restart policy, поэтому конфигурация фиксирует intent явно. [`CalculatesExcludedStatus.php`](https://github.com/coollabsio/coolify/blob/v4.3.18/app/Traits/CalculatesExcludedStatus.php#L97-L143), [`parsers.php`](https://github.com/coollabsio/coolify/blob/v4.3.18/bootstrap/helpers/parsers.php#L2678-L2691) |
| Required variables | Критичные значения используют `${VAR:?}` | Актуальный Coolify отмечает такие значения required и блокирует deploy, пока поле пустое. [Docker Compose variables](https://next.coolify.io/docs/applications/builds/docker-compose#defaults-and-required-values) |
| Rebuild API | POST `/api/v1/deploy` с JSON `{uuid}` и polling `/api/v1/deployments/{uuid}` | POST официально поддерживается; ответ содержит `resource_uuid` и `deployment_uuid`. Status endpoint возвращает поле `status`. [Deploy API](https://coolify.io/docs/api-reference/api/deployments/deploy-by-tag-or-uuid), [Deployment API](https://coolify.io/docs/api-reference/api/deployments/get-deployment-by-uuid) |
| Status mapping | Worker ожидает `queued`, `in_progress`, `finished`, `failed`, `cancelled-by-user` | Это точные значения enum в source проверенного релиза. [ApplicationDeploymentStatus.php](https://github.com/coollabsio/coolify/blob/v4.3.18/app/Enums/ApplicationDeploymentStatus.php) |
| Первый deploy | Auto Deploy откладывается до ручного rehearsal | Это правильный порядок: первый запуск — Deploy, затем проверка; Auto Deploy можно включить после успешной ручной поставки. [Deployment overview](https://next.coolify.io/docs/applications/deployments/overview), [Automatic Deployments](https://next.coolify.io/docs/applications/deployments/automatic-deployments) |

## Расхождения и риски

### 1. One-shot lifecycle требует явного marker в live v4.3.18

`migrate`, `bootstrap-seed` и `web-publish` завершились с exit code 0, API стал healthy, остальные долгоживущие контейнеры запустились. Несмотря на `restart: "no"`, после двух deployment attempts приложение получило `exited:unhealthy`, а все домены начали отвечать 503. Это live-наблюдение противоречит ожидаемому пути source-кода v4.3.18, который исключает сервис при `restartPolicy === "no"`. [`CalculatesExcludedStatus.php`](https://github.com/coollabsio/coolify/blob/v4.3.18/app/Traits/CalculatesExcludedStatus.php#L97-L143), [`parsers.php`](https://github.com/coollabsio/coolify/blob/v4.3.18/bootstrap/helpers/parsers.php#L2678-L2691)

`exclude_from_hc` — поддерживаемое custom field Coolify, а не поле Docker Compose. Coolify использует его в своей health-агрегации и удаляет перед передачей definition в Docker Compose. [`parsers.php`](https://github.com/coollabsio/coolify/blob/v4.3.18/bootstrap/helpers/parsers.php#L1428-L1436), [`StripCoolifyCustomFieldsTest.php`](https://github.com/coollabsio/coolify/blob/v4.3.18/tests/Unit/StripCoolifyCustomFieldsTest.php)

Следствие для локальной проверки: обычный `docker compose config` на исходном Coolify-файле закономерно отвергает custom field. Проверять нужно deployable definition из Coolify либо локальный поток с удаленными строками `exclude_from_hc`; после такого удаления Compose schema проходит.

Вывод: сохранить `restart: "no"` и `depends_on: condition: service_completed_successfully`, а intent дополнительно закрепить `exclude_from_hc: true`. Для долгоживущих сервисов health должен проверять фактическую функцию: readiness API, Redis PING worker и локальный HTTP Caddy web/admin. Исправление отслеживается в [#62](https://github.com/Celtoman/astro-telekom/issues/62).

### 2. Домены на внутреннем порту 80 записаны по старому шаблону

В исходной инструкции были указаны `https://tv-internet-dom.ru:80` и `https://admin.tv-internet-dom.ru:80`; это исправлено. Новая документация уточняет: если port отсутствует, Coolify направляет запрос на внутренний порт 80; port добавляют только для иного внутреннего порта. [Domains](https://next.coolify.io/docs/core/networking/domains)

Рекомендация:

- Domains for `web`: `https://tv-internet-dom.ru`;
- Domains for `admin`: `https://admin.tv-internet-dom.ru`;
- у остальных сервисов Domains оставить пустым;
- в браузере также не указывать port.

### 3. Basic Auth: Compose должен получить bcrypt verifier на build-фазе

`TEST_BASIC_AUTH_USERS` содержит bcrypt (`username:$2y$...`). `Literal` защищает значение environment variable от внутренней подстановки `$OTHER_VAR`. Coolify запускает `docker compose build --env-file /artifacts/build-time.env`, а Compose интерполирует service labels уже на этом шаге. Поэтому runtime-only variable дает `required variable TEST_BASIC_AUTH_USERS is missing`. Если включить `Escape special characters in labels`, Coolify заранее превращает `${TEST_BASIC_AUTH_USERS...}` в `$${TEST_BASIC_AUTH_USERS...}` и Traefik получает литерал вместо credential. [Environment Variables](https://next.coolify.io/docs/applications/configuration/environment-variables), [Custom Middlewares: Label Escaping](https://coolify.io/docs/knowledge-base/proxy/traefik/custom-middlewares#label-escaping)

Live rehearsal исправил исходную инструкцию. Рабочая конфигурация:

1. создать `TEST_BASIC_AUTH_USERS` в Normal view;
2. включить `Literal`;
3. не включать `Multiline`;
4. включить `Buildtime` и `Runtime`;
5. выключить `Escape special characters in labels` в Compose Application settings;
6. после deploy проверить `401` без credentials и вход с правильным паролем на обоих доменах;
7. в deployable/final labels проверить, что middleware реально включен в HTTPS-router, не публикуя verifier в логах.

`HTTP Basic Authentication` checkbox для standard application здесь не применяется: новая документация прямо говорит, что Docker Compose applications не используют этот single-container control, middleware должен оставаться в Compose. [General settings](https://next.coolify.io/docs/applications/configuration/general)

### 4. Coolify API token отделен от build-time Compose

`COOLIFY_API_TOKEN` нужен только worker во время работы. Из Compose удалена обязательная `${COOLIFY_API_TOKEN:?}`-интерполяция: worker уже подключает `env_file: ${ENV_FILE:-.env}`, а Coolify после build сохраняет полный набор runtime-переменных в `.env` и использует его при `docker compose up`. Поэтому token создается вручную в Normal view с `Runtime Variable=true`, `Build Variable=false` и `Literal=true`. API readiness и worker по-прежнему отклоняют пустой token на runtime-границе. [Build/runtime scope](https://next.coolify.io/docs/applications/configuration/environment-variables), [ApplicationDeploymentJob.php](https://github.com/coollabsio/coolify/blob/v4.3.18/app/Jobs/ApplicationDeploymentJob.php)

Не включать все секреты как build variables: build args могут попадать в image metadata. `Configuration > Advanced > Inject Build Args to Dockerfile` оставить выключенным; необходимые public args уже описаны в `admin.build.args`. [Docker Compose build arguments](https://next.coolify.io/docs/applications/builds/docker-compose#application-build-arguments)

### 5. `.env.example` нельзя вставлять в Coolify без адаптации

В нем локальные `DATABASE_URL`, `REDIS_URL`, `API_URL`, `ADMIN_URL`, `CORS_ORIGINS` и `REBUILD_PROVIDER=webhook`. Простое копирование создаст контейнеры, которые обращаются к собственному `localhost`, либо заблокирует rebuild readiness.

Минимальные production-like значения для тестового контура:

| Переменная | Значение/правило в Coolify |
|---|---|
| `POSTGRES_DB` | `provider_platform` или согласованное имя |
| `POSTGRES_USER` | отдельный непустой пользователь |
| `POSTGRES_PASSWORD` | длинный случайный пароль; Literal; не показывать в логах |
| `DATABASE_URL` | `postgresql://<url-encoded-user>:<url-encoded-password>@postgres:5432/<db>` |
| `REDIS_URL` | `redis://redis:6379` |
| `API_URL` | `http://api:3000` |
| `PUBLIC_DOMAIN` | `tv-internet-dom.ru` |
| `ADMIN_DOMAIN` | `admin.tv-internet-dom.ru` |
| `PUBLIC_SITE_URL` | `https://tv-internet-dom.ru` |
| `PUBLIC_API_URL` | `https://tv-internet-dom.ru/api/v1` для общего runtime; Compose отдельно встраивает same-origin admin URL |
| `ADMIN_URL` | `https://admin.tv-internet-dom.ru` |
| `CORS_ORIGINS` | `https://tv-internet-dom.ru,https://admin.tv-internet-dom.ru` |
| `REBUILD_PROVIDER` | `coolify` |
| `COOLIFY_API_URL` | `https://<публичный-control-plane-host>/api/v1` |
| `COOLIFY_API_TOKEN` | добавить вручную; Runtime=true, Build=false, Literal=true |
| `COOLIFY_RESOURCE_UUID` | использовать предопределенный UUID текущего Application и сверить с `Configuration > General > Details` |
| `RUN_BOOTSTRAP_SEED` | `true` только на первом deploy, затем `false` и повторный deploy |
| `ENV_FILE` | не задавать; оставить ожидаемый Coolify runtime `.env` |

`COOLIFY_RESOURCE_UUID` уже является [предопределенной application variable](https://next.coolify.io/docs/applications/configuration/environment-variables#predefined-application-variables). Ее не нужно создавать, генерировать или переопределять в UI: Coolify передает UUID текущего Application автоматически. Пустая строка в `.env.example` — только локальный template. В Coolify достаточно сверить predefined value с `Configuration > General > Details`; если пользовательская переменная с таким именем уже создана, удалить ее.

Все остальные секреты из `.env.example` (`ADMIN_API_TOKEN`, `SUBSCRIBER_COOKIE_SECRET`, integration keys, admin password) создавать через Normal view и не включать в screenshots/Developer-view экспорт. Для первого инфраструктурного rehearsal внешние интеграции могут оставаться отключенными, но `/api/v1/admin/readiness` тогда честно не будет подтверждать production readiness.

### 6. `finished` — не замена внешнему smoke test

API polling worker корректно считает `finished` terminal success. Но официальный deployment guide после завершения отдельно требует проверить domain, logs, health и пользовательский путь. Значит `SUCCEEDED` в локальном rebuild record доказывает завершение Coolify operation, но не само по себе доступность всех URL и корректность опубликованного HTML. [Deployment overview](https://next.coolify.io/docs/applications/deployments/overview)

На rehearsal обязательно проверить `publishedRevision === requestedRevision`, HTTP status, Basic Auth boundary и содержимое страницы. Автоматический post-deploy public probe можно рассматривать отдельной задачей после живой проверки.

### 7. Backup policy отсутствует

Named volumes переживают обычный redeploy, но не удаление volume, поломку диска, потерю сервера или corruption. [Persistent storage overview](https://next.coolify.io/docs/core/persistent-storage/storage-mounts/overview)

В актуальном Coolify появились scheduled storage backups application volumes с локальным архивом и необязательной копией в S3. Однако документация предупреждает, что архив работающей БД может быть неконсистентным; dashboard пока не восстанавливает такой архив автоматически. [Storage mount backups](https://next.coolify.io/docs/core/persistent-storage/storage-mounts/backups)

Для текущего Git-based Compose PostgreSQL:

- не считать tar-архив `postgres_data` единственной резервной копией;
- организовать application-aware `pg_dump` с проверяемым off-server/S3 результатом;
- выполнить ручной backup и restore в отдельную БД до реальных заявок;
- `web_publication` можно архивировать, но это производный artifact: он восстанавливается новой успешной публикацией;
- Redis содержит очередь и не заменяет PostgreSQL source of truth; его потеря влияет на незавершенные jobs, поэтому recovery поведение также нужно проверить.

В UI Coolify есть engine-aware [Database Backups](https://next.coolify.io/docs/databases/backups) для standalone Database и database component, созданного внутри **Service**. Наш ресурс — другой тип: Git-based Docker Compose **Application**. Открытый официальный issue [#7528](https://github.com/coollabsio/coolify/issues/7528) как раз фиксирует отсутствие нативных database backups для такой Application-модели. Поэтому на v4.3.18 нельзя считать вкладку Service Database Backup доступной для `postgres` из текущего репозитория. Перенос PostgreSQL в standalone Database/Service откроет нативные backup-возможности, но потребует изменения архитектуры Compose и не нужен для первого тестового deploy.

### 8. Rollback ограничен image-слоем

Coolify rollback разворачивает сохраненный старый image, но не откатывает migrations, persistent volumes, environment variables или внешние системы. Доступность rollback зависит от image retention. [Rollbacks](https://next.coolify.io/docs/applications/deployments/rollbacks)

Для этого multi-service Compose предпочтительный откат кода — выбрать предыдущий commit и выполнить обычный Redeploy, чтобы заново отработали migration/publisher зависимости. Это вывод из архитектуры проекта: `web` читает artifact из `web_publication`, поэтому простой rollback только web image не возвращает старую публикацию. Перед schema-changing release миграции должны быть backward-compatible либо иметь отдельный проверенный restore/forward-fix plan.

## Пошаговая инструкция для первого deploy

### Этап 0. Сервер и Coolify

1. Проверить версию Coolify в UI. На дату аудита актуален stable `v4.3.18`; для точного совпадения с инструкцией сначала обновиться до него или более нового stable и прочитать release notes.
2. Проверить, что deployment server имеет достаточные CPU/RAM/disk для одновременной сборки пяти images, PostgreSQL, Redis, API, worker и Coolify. Официальный минимум только для самого Coolify — 2 CPU, 2 GB RAM и 10 GB disk; для builds нужны дополнительные ресурсы. [Self-hosted setup](https://next.coolify.io/docs/start-with-self-hosted)
3. Убедиться, что Server status functional и Proxy running.
4. Открыть inbound TCP 80/443; SSH сохранить. Для прямого доступа к self-hosted dashboard могут требоваться 8000/6001/6002, но после назначения dashboard domain их не следует без необходимости оставлять всему интернету. [Firewall](https://next.coolify.io/docs/core/infrastructure/servers/firewall)
5. Сделать backup самой Coolify instance и отдельно сохранить `/data/coolify/source/.env`/`APP_KEY`; instance backup не включает application volumes или БД. [Coolify instance backup](https://next.coolify.io/docs/core/backup-and-recovery/instance-backup)

### Этап 1. DNS

1. Создать A records `tv-internet-dom.ru` и `admin.tv-internet-dom.ru` на IPv4 deployment server.
2. AAAA создавать только если IPv6 реально настроен и ведет на тот же сервер; Let's Encrypt проверяет оба опубликованных адреса.
3. На время первого certificate issuance не включать внешний proxy/CDN, который мешает HTTP challenge, либо заранее настроить совместимый DNS challenge.
4. Проверить резолв и доступность 80/443 до deploy. [Domains](https://next.coolify.io/docs/core/networking/domains), [Let's Encrypt troubleshooting](https://next.coolify.io/docs/troubleshoot/dns-and-domains/lets-encrypt-not-working)

### Этап 2. GitHub App для приватного репозитория

1. В Coolify открыть `Sources` → `+ Add`.
2. Создать GitHub App source, не включать `System Wide`, если доступ нужен только текущей team.
3. Выбрать `Automated Installation`; endpoint webhook — публичный base URL Coolify без `/webhooks`.
4. Preview Deployments можно выключить: проект придерживается одной `master`-ветки и отдельные preview/stage сейчас не нужны.
5. На GitHub выбрать `Only select repositories` → только `Celtoman/astro-telekom`.
6. Вернуться в Coolify и убедиться, что installation/repository видны.

Deploy Key — запасной вариант: отдельный read-only key для этого repo, SSH clone URL и ручной GitHub webhook для Auto Deploy. Для текущего проекта он дает больше ручной настройки без преимущества. [GitHub App](https://next.coolify.io/docs/applications/sources/github/app), [Deploy Keys](https://next.coolify.io/docs/applications/sources/deploy-keys)

### Этап 3. Создание Application

1. Создать Project, например `astro-telekom`, и единственный Environment, например `test` или `production`; отдельный stage resource не создавать.
2. `+ New` → `Private Repository (with GitHub App)` → выбрать server/source/repository.
3. Branch: `master`.
4. Build Pack: `Docker Compose`.
5. Base Directory: `/`.
6. Docker Compose Location: `/docker-compose.coolify.yml`.
7. `Raw Compose Deployment`: off.
8. `Preserve Repository During Deployment`: не требуется, потому что нет runtime bind mounts на файлы репозитория.
9. `Include Source Commit in Build`: off для сохранения Docker cache.
10. `Inject Build Args to Dockerfile`: off; необходимые public args уже описаны в `admin.build.args`.
11. Auto Deploy: off до завершения двух ручных deploy.

После Save проверить parsed Compose: восемь сервисов (`postgres`, `redis`, `migrate`, `api`, `worker`, `bootstrap-seed`, `web-publish`, `web`) плюс `admin`, три volumes, отсутствие публичных ports у внутренних сервисов. Source Compose редактируется только в Git; UI rendering не становится новым каноном. [Docker Compose](https://next.coolify.io/docs/applications/builds/docker-compose)

### Этап 4. Domains и Basic Auth

1. Domains for `web`: `https://tv-internet-dom.ru`.
2. Domains for `admin`: `https://admin.tv-internet-dom.ru`.
3. Domains для `api`, worker, PostgreSQL, Redis и one-shot services: пусто.
4. Сгенерировать credential локально: `htpasswd -nbB <username> <password>`.
5. В Normal view создать `TEST_BASIC_AUTH_USERS=<username>:<bcrypt>`; включить Literal, Buildtime и Runtime, выключить Multiline.
6. В Advanced выключить `Escape special characters in labels`.
7. Не использовать single-container `HTTP Basic Authentication` switch: для Compose применяется repository-owned middleware label.

### Этап 5. Environment Variables

1. Не вставлять `.env.example` целиком без замены localhost и demo defaults.
2. Сначала заполнить infrastructure/runtime variables из таблицы выше.
3. Создать `ADMIN_API_TOKEN`, `SUBSCRIBER_COOKIE_SECRET`, `ADMIN_PASSWORD`, `POSTGRES_PASSWORD` отдельными длинными случайными значениями.
4. URL-encode database username/password перед включением в `DATABASE_URL`.
5. `RUN_BOOTSTRAP_SEED=true`.
6. `REBUILD_PROVIDER=coolify`.
7. В Coolify `Settings` → `Advanced` включить API Access. При IP allowlist добавить egress IP deployment server; не использовать `0.0.0.0` для production. [API Authorization](https://coolify.io/docs/api-reference/authorization)
8. В `Security` → `API Tokens` создать team-scoped token с ограниченным сроком и минимальными permissions `deploy` + `read`: `deploy` запускает `/deploy`, `read` нужен для polling deployment status. Не выдавать `root`, `write` или `read:sensitive` без отдельной необходимости.
9. В Normal view вручную создать `COOLIFY_API_TOKEN`, включить Runtime и Literal, выключить Build и Multiline; Coolify повторно token не показывает.
10. `COOLIFY_API_URL=https://<coolify-domain>/api/v1`; не использовать domain самого сайта.
11. Не создавать `COOLIFY_RESOURCE_UUID` вручную; сверить автоматически predefined value с Application `Details`.

Перед Deploy убедиться, что `COOLIFY_API_TOKEN` отсутствует в build scope. У всех one-shot services сохранить одновременно `restart: "no"` и `exclude_from_hc: true`, чтобы успешное завершение не ухудшало application health.

### Этап 6. Первый deploy

1. Нажать `Deploy`, не Force Deploy.
2. В Deployments проверить checkout ветки `master` и ожидаемого commit SHA.
3. Следить за последовательностью: healthy PostgreSQL → successful `migrate` → healthy API/Redis → successful `bootstrap-seed` → successful `web-publish` → running `web`; отдельно running worker/admin.
4. Если deploy не завершился, искать первую упавшую команду и logs конкретного сервиса; не удалять resource или volumes.
5. Убедиться, что deployment status `finished`, а общий resource не degraded из-за завершенных one-shot containers.

### Этап 7. Smoke tests первого deploy

Без credentials все запросы должны дать `401`:

```bash
curl -I https://tv-internet-dom.ru/
curl -I https://tv-internet-dom.ru/robots.txt
curl -I https://tv-internet-dom.ru/sitemap.xml
curl -I https://tv-internet-dom.ru/kazan/
curl -I https://tv-internet-dom.ru/api/v1/health/live
curl -I https://admin.tv-internet-dom.ru/login
curl -I https://admin.tv-internet-dom.ru/api/v1/health/live
```

С credentials проверить `200`/ожидаемый redirect и certificate:

```bash
curl -I -u '<user>:<password>' https://tv-internet-dom.ru/
curl -I -u '<user>:<password>' https://admin.tv-internet-dom.ru/login
curl -I -u '<user>:<password>' https://admin.tv-internet-dom.ru/api/v1/health/ready
```

Для admin response проверить `X-Robots-Tag: noindex, nofollow, noarchive`. Проверить browser login, cookie `Secure`, `/tariffs`, `/cities`, `/leads`, публичную форму и same-origin `/api/v1` без второго auth prompt.

### Этап 8. Обязательный повторный deploy

1. Поменять `RUN_BOOTSTRAP_SEED=false`.
2. Нажать обычный Redeploy.
3. Убедиться, что seed выведен как skipped, migrations idempotent, `web-publish` создал новый release и `web_publication/current` переключился.
4. Проверить, что PostgreSQL данные и admin login сохранились.
5. Повторить 401/200/TLS проверки.

Только после этого включить Auto Deploy. С GitHub App ручной webhook создавать не нужно: интеграция получает provider events сама. Push в `master` должен породить новую запись в Deployments. [Automatic Deployments](https://next.coolify.io/docs/applications/deployments/automatic-deployments)

### Этап 9. Rebuild flow через Coolify API

1. Изменить одну тестовую сущность в admin.
2. Запустить публикацию и сохранить локальные `rebuild id`, `requestedRevision`.
3. В API/worker logs убедиться, что POST `/deploy` вернул `deployment_uuid`.
4. В Coolify Deployments найти тот же UUID.
5. Проверить `queued → in_progress → finished`.
6. Убедиться, что локальная запись стала `SUCCEEDED` только после `finished`.
7. Проверить `publishedRevision === requestedRevision` и фактический HTML на public domain.
8. Повторить один controlled failure/timeout test без удаления volumes.

Официальный API endpoint принимает Bearer token и POST body `{ "uuid": "<resource_uuid>" }`, а status endpoint возвращает запись deployment. [Deploy API](https://coolify.io/docs/api-reference/api/deployments/deploy-by-tag-or-uuid), [Get deployment](https://coolify.io/docs/api-reference/api/deployments/get-deployment-by-uuid)

### Этап 10. Backup и rollback rehearsal

1. До реальных лидов настроить ежедневный application-aware PostgreSQL dump во внешнее/S3-хранилище.
2. Запустить backup вручную и проверить non-zero artifact.
3. Восстановить его в отдельную disposable PostgreSQL и открыть данные через приложение/SQL.
4. Для дополнительной защиты можно включить Coolify storage backup `postgres_data` с остановкой использующих volume containers, но не заменять этим `pg_dump`.
5. Зафиксировать image retention в Coolify.
6. Выполнить test rollback к предыдущему commit через Redeploy и проверить web/admin/API.
7. Отдельно проверить forward migration/restore; Coolify image rollback не откатывает БД или volumes. [Storage mount backups](https://next.coolify.io/docs/core/persistent-storage/storage-mounts/backups), [Rollbacks](https://next.coolify.io/docs/applications/deployments/rollbacks)

## Локальная production-подобная проверка текущего Docker-контура

Проверка 9 сентября 2026 года выполнялась в отдельном пустом BuildKit builder с локальным вариантом `docker-compose.coolify.yml`, из которого удалялись только Coolify-specific поля `exclude_from_hc`. Первый вариант уже пропускал сетевую проверку 1112 lockfile-записей через production-only `--trust-lockfile`, но один холодный прогон всё еще завершился transient network timeout через 375,52 с. Причиной оказался недокачанный пакет, а не resolution или проверка lockfile.

Финальный вариант использует общий cache mount `pnpm-store`, workspace filters, один API build dependency tree для build/migration и `scripts/pnpm-install-retry.sh`, который максимум трижды повторяет failed install в уже заполненном store. Полный холодный build завершился за 343,15 с; повторный build того же дерева — за 81,85 с. Во втором прогоне все install/build stages были `CACHED`, сетевой установки не было; основное время занял экспорт готовых образов из изолированного `docker-container` builder.

После сборки полный Compose stack успешно применил 12 migrations, выполнил seed (`Дом.ру`, Казань, 2 тарифа), собрал 10 HTML-файлов, прошел pre-publication SEO gate и атомарно переключил publication symlink. API, worker, web, admin, PostgreSQL и Redis оставались healthy с restart count 0; `migrate`, `bootstrap-seed` и `web-publish` завершились с exit code 0. Same-origin `/api/v1/health/ready` через web/admin вернул 200. После контрольной выдержки тестовые containers/network/volumes, builder и локальный env-файл были удалены без затрагивания других Docker-ресурсов.

Повторная live-проверка обнаружила отдельный дефект [#66](https://github.com/Celtoman/astro-telekom/issues/66), который однократный локальный запуск не покрывал. На первом publisher-run `current` отсутствовал, поэтому `mv -f current.next current` работал. На следующем run `current` уже был symlink на каталог: обычный `mv` следовал ему, переносил временную ссылку внутрь старого release, а cleanup удалял этот release. Coolify завершал deployment как `finished`, после чего web и same-origin API отвечали 503, resource переходил в `restarting:unknown`. В exact `node:22.23.2-alpine` подтверждена поддержка `mv -fT`; `-T` заставляет атомарно заменить сам symlink, не следуя каталогу назначения.

## Итоговая готовность

| Направление | Статус после аудита |
|---|---|
| GitHub private source | Готово по архитектуре; использовать GitHub App |
| Compose build pack/path | Готово |
| Domains | Live DNS/TLS подтверждены: без `:80` |
| Basic Auth | Live подтвержден: `401` без credentials, `200` с credentials; Literal + Buildtime + Runtime, label escaping выключен |
| One-shot lifecycle | Live подтвержден: `restart: "no"` + `exclude_from_hc: true`, resource остается `running:healthy` без рестартов |
| Environment values | Нужна отдельная Coolify-матрица; `.env.example` напрямую не вставлять |
| Coolify API rebuild | Runtime-only token исправлен; нужны token scopes и live rehearsal |
| Persistent volumes | Compose настроен корректно; не является backup |
| Backup | Не готово; нужен `pg_dump` + off-server storage + restore test |
| Rollback | Только code/image path; БД и публикационный volume требуют отдельного плана |
| Production readiness | Не подтверждена до двух ручных deploy, smoke tests, rebuild test и backup restore |

## Основные официальные источники

- [Docker Compose Applications](https://next.coolify.io/docs/applications/builds/docker-compose)
- [GitHub App](https://next.coolify.io/docs/applications/sources/github/app)
- [Deploy Keys](https://next.coolify.io/docs/applications/sources/deploy-keys)
- [Application environment variables](https://next.coolify.io/docs/applications/configuration/environment-variables)
- [Domains](https://next.coolify.io/docs/core/networking/domains)
- [Custom Traefik middlewares](https://coolify.io/docs/knowledge-base/proxy/traefik/custom-middlewares)
- [Basic Auth middleware](https://coolify.io/docs/knowledge-base/proxy/traefik/basic-auth)
- [Deployments](https://next.coolify.io/docs/applications/deployments/overview)
- [Automatic deployments](https://next.coolify.io/docs/applications/deployments/automatic-deployments)
- [API authorization](https://coolify.io/docs/api-reference/authorization)
- [Deploy API](https://coolify.io/docs/api-reference/api/deployments/deploy-by-tag-or-uuid)
- [Deployment status API](https://coolify.io/docs/api-reference/api/deployments/get-deployment-by-uuid)
- [Persistent storage](https://next.coolify.io/docs/core/persistent-storage/storage-mounts/overview)
- [Storage mount backups](https://next.coolify.io/docs/core/persistent-storage/storage-mounts/backups)
- [Database backups for Database/Service resources](https://next.coolify.io/docs/databases/backups)
- [Open request for database backups in Git-based Compose Applications](https://github.com/coollabsio/coolify/issues/7528)
- [Application rollbacks](https://next.coolify.io/docs/applications/deployments/rollbacks)
- [v4.3.18 one-shot status source](https://github.com/coollabsio/coolify/blob/v4.3.18/app/Traits/CalculatesExcludedStatus.php#L97-L143)
- [v4.3.18 Compose parser and custom-field stripping](https://github.com/coollabsio/coolify/blob/v4.3.18/bootstrap/helpers/parsers.php#L2678-L2691)
- [v4.3.18 deployment status enum](https://github.com/coollabsio/coolify/blob/v4.3.18/app/Enums/ApplicationDeploymentStatus.php)
