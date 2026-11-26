# Выпуск кода astro-telekom через GHCR

Код хранится в `Celtoman/astro-telekom`. GitHub Actions собирает из одного проверенного коммита пять образов и публикует их в приватном GitHub Container Registry (`ghcr.io`). Рабочее приложение `astro-telekom` в Coolify читает `docker-compose.coolify.yml` из приватного `Celtoman/astro-telekom-release` и запускает готовые образы. Coolify может повторно скачать малый репозиторий для чтения Compose. Исходники монорепозитория скачивает GitHub Actions.

Push в `master` запускает проверки CI. Сборка образов, push Compose и deployment выполняются отдельно. GitHub Auto Deploy выключен. `pnpm release` готовит версию, changelog и тег, а push тега запускает GitHub Release. Код на сервер выпускается по процедуре ниже. [Правила коммита и push](../../AGENTS.md), [процедура Coolify MCP](../deployment.md#работа-агента-с-coolify-через-mcp).

## Как связаны SHA

| Идентификатор | Где сверять |
| --- | --- |
| SHA кода | Проверенный коммит `master`. Указан в `release.json` (`source`), в `x-astro-release.source-commit` и `APP_SOURCE_COMMIT` в Compose, в OCI-метке `org.opencontainers.image.revision` каждого образа. |
| SHA workflow | `head_sha` запуска `ghcr-release.yml`. Удостоверяет версию подписывающего workflow. Аттестация отдельно связывает каждый digest с фактически собранным `source_sha` и хешем его Git-дерева. |
| SHA Compose | Полный коммит репозитория `astro-telekom-release`. Закрепляется в `git_commit_sha` Coolify. Это `commit` в deployment и runtime `SOURCE_COMMIT`, который использует проверка CODE. |
| Digest образа | Ссылка вида `ghcr.io/celtoman/astro-telekom-release-web@sha256:…`. Compose и `release.json` должны указывать один и тот же digest для каждой роли. |

Пара `deployment UUID` и SHA Compose идентифицирует выпуск для CODE. Связь с SHA кода подтверждается манифестом выпуска и OCI-метками запущенных образов. При ручном `/release-code` передавать SHA Compose из этого deployment. [Контракт публикации](../publication.md#разделение-контента-и-кода).

## 1. Подготовить коммит и дождаться CI

1. Выполнить проверки по области изменения из [AGENTS.md](../../AGENTS.md). Для push кода или конфигурации в `master` нужен зелёный `pnpm check` на итоговом состоянии. Для push только документации действует документированный профильный gate.
2. Сделать Conventional Commit, проверив состав staging и `git diff --cached --check`. Push в `master` выполняется после явного разрешения. Если локальный `master` разошёлся с `origin/master`, сначала сверить и согласовать состав коммитов для push. Force push не использовать.
3. Взять полный SHA разрешённого выпуска из `master` и дождаться успешного push-прогона `ci.yml` именно для него. Сохранить ссылку на CI. Для сверки можно использовать `gh run list --workflow ci.yml --branch master --commit <source-sha> --event push` и `gh run view <ci-run-id>`.

## 2. Собрать и опубликовать образы

1. Запустить ручной workflow GHCR из master. Передать полный SHA коммита, который уже получил успешный push CI в master. Workflow проверяет SHA, результат CI и хеш дерева до запуска сборок. Рабочая ветка остаётся одна.

   ```bash
   gh workflow run ghcr-release.yml --repo Celtoman/astro-telekom --ref master -f source_sha=<полный-sha>
   ```
2. Собрать `linux/amd64` из Dockerfiles выбранного SHA. Для каждой роли проверить target и согласованные публичные build args по исходному Compose и текущему контуру. Ниже роли первого выпуска.

   | Сервис Compose | Пакет `ghcr.io/celtoman/astro-telekom-release-…` | Dockerfile / target |
   | --- | --- | --- |
   | `migrate` | `migration` | `apps/api/Dockerfile`, `migration` |
   | `api`, `bootstrap-seed` | `api` | `apps/api/Dockerfile`, `runtime` |
   | `worker` | `worker` | `services/worker/Dockerfile`, target по умолчанию |
   | `web` | `web` | `apps/web/Dockerfile`, `publication-runtime` |
   | `admin` | `admin` | `apps/admin/Dockerfile`, target по умолчанию |

3. `build-images` читает исходники с `contents: read` и передаёт зашифрованные архивы через артефакты GitHub Actions. `publish-images` получает `packages: write`, загружает архивы из того же запуска, проверяет платформу и метку исходного SHA, публикует образы и получает digest из GHCR. Внешние Actions в CI и релизных workflows закреплены по полным SHA. В проверенном выпуске `admin` собирался с `PUBLIC_API_URL=https://admin.tv-internet-dom.ru/api/v1` и пустыми `PUBLIC_PROVIDER_ID` и `PUBLIC_SITE_ID`.
4. Для передачи приватных образов через публичный репозиторий в Actions нужен открытый сертификат `GHCR_ARTIFACT_ENCRYPTION_CERT` и соответствующий закрытый ключ в секрете `GHCR_ARTIFACT_DECRYPTION_KEY` окружения `ghcr-release`. Для окружения разрешена только ветка `master`. При ротации дождаться завершения текущих запусков, заменить оба значения и проверить новый запуск. Зашифрованные архивы хранятся один день. Секреты среды выполнения хранятся в Coolify, который читает GHCR отдельной учётной записью. Убедиться, что все пакеты остались приватными.
5. `attest-images` подписывает каждый digest с помощью OIDC GitHub Actions и Sigstore. Подписанные аттестации хранятся в репозитории кода в GitHub Artifact Attestations. У job есть `id-token: write` и `attestations: write`. Образы остаются в приватном GHCR.
6. Дождаться успеха пяти сборок, пяти публикаций и пяти подписаний. Скачать `release-identity-*` через `gh run download <image-run-id> --pattern 'release-identity-*' --dir <output-dir>`. Проверить `role`, `sourceSha` и `image` в каждом `identity.json`, затем с сервера Coolify проверить доступ ко всем точным digest.

## 3. Опубликовать Compose выпуска

1. Взять `docker-compose.coolify.yml` из точного SHA кода. Заменить `build` ссылками `image: …@sha256:…` по файлам `identity.json`. `bootstrap-seed` и `serving-projection-warmer` используют тот же образ, что `api`. Убрать у этих ролей `pull_policy: never`, предназначенный для локально собранного образа. На рабочем контуре оставить `RUN_BOOTSTRAP_SEED=false`. Закрепить текущие PostgreSQL и Redis по их digest, если обновление этих сервисов отдельно не согласовано.
2. Сохранить имена сервисов и томов, сети, mounts, labels, runtime-переменные, healthchecks и зависимости. Добавить `x-astro-release.source-commit` и `APP_SOURCE_COMMIT` для сервисов из GHCR. Оставить `SOURCE_COMMIT` Coolify. Проверить Compose и запустить изолированный прогон с отдельными томами при изменении конфигурации запуска или миграций.
3. В `release.json` записать `source`, `composeSha256` (SHA-256 UTF-8 текста Compose с LF после удаления внешних пробелов и переводов строк), `imageBuildRun` и `images` со ссылками по digest для всех сервисов. Сверить отсутствие секретов.
4. Перед коммитом и push нового Compose из checkout репозитория кода запустить проверку. На машине должны быть настроены GitHub CLI и Docker с доступом к чтению приватных образов GHCR. Команда читает `release.json` и соседний `docker-compose.coolify.yml`, сверяет digest и исходный SHA каждого сервиса, проверяет подписи всех пяти образов, разрешённый подписывающий workflow на `master`, SHA собранного кода, Git-дерево и номер запуска сборки. Продолжать выпуск только после успеха команды. Предыдущие закреплённые выпуски доступны для отката по процедуре ниже. [Проверка аттестаций с GitHub CLI](https://cli.github.com/manual/gh_attestation_verify).

   ```bash
   node scripts/verify-ghcr-release.mjs <путь-к-репозиторию-выпуска>/release.json
   ```

5. Закоммитить Compose и манифест в отдельной ветке `release-<short-source-sha>` репозитория выпуска. После разрешённого push сверить полный SHA ветки через GitHub и через `list_github_branches` существующего GitHub App `astro-domru`. Сохранить предыдущую ветку и SHA выпуска для отката.

## 4. Запустить deployment и проверить публикацию

1. Через Coolify MCP прочитать рабочее приложение и последние deployment. Сверить UUID ресурса, домены, destination, предыдущие координаты Git и health. Убедиться, что нет параллельного deployment или незавершённой активации публикации. Сохранить для сравнения текущие image digests, точки подключения, имена и идентификаторы томов, ID и ревизию активной публикации, digest каталога, активный HTML-артефакт и статус публикации в API. Проверить доступность точки восстановления БД и media по [runbook backup](editorial-backup.md). Для миграций проверить совместимость предыдущих образов с новой схемой.
   Перед скачиванием образов проверить доступное место на файловой системе Docker и в `/publication` web-контейнера. Если меняется renderer, после распаковки новых слоёв CODE потребует минимум 8 ГиБ доступного пространства в `/publication`. При общей файловой системе сверить уникальные слои пяти точных манифестов с локальным хранилищем Docker. Размеры в манифестах относятся к сжатым данным. Для распаковки и снимков файловой системы нужен дополнительный запас. Нехватку места устранить по отдельному операционному поручению с сохранением текущих образов, комплекта отката и томов. [Наблюдение #651](https://github.com/Celtoman/astro-telekom/issues/651).
2. Обновить **тот же** ресурс через `manage_application` с `action=update`. Указать `git_repository=Celtoman/astro-telekom-release`, `git_branch=release-<short-source-sha>` и `git_commit_sha=<full-compose-sha>`. Путь `/docker-compose.coolify.yml`, UUID, домены, сети, тайные переменные и тома сохраняются. Прочитать настройки обратно и вызвать `deploy` по UUID приложения. Записать UUID deployment и дождаться его `finished`. При потере ответа сначала проверить историю по UUID ресурса.
3. Подтвердить `running:healthy`, успешные `migrate` и отключённый `bootstrap-seed`. Для `serving-projection-warmer` проверить ожидаемый статус и подтверждение прогрева по [порядку включения](../deployment.md#автоматическая-подготовка-проекций-опубликованных-каталогов). Сверить SHA в deployment с SHA Compose, фактически скачанные digests с `release.json`, OCI revision и `APP_SOURCE_COMMIT` с SHA кода. Убедиться, что все четыре прежних тома подключены в тех же местах. Это тома PostgreSQL, Redis, editorial media и web publication.
4. Сверить активный снимок через private publication controller и состояние публикации в API. ID, ревизия и digest уже обслуживаемого каталога должны сохраниться. При том же renderer ID должен сохраниться и HTML-артефакт. При изменении renderer дождаться подтверждённого CODE с тем же снимком. Для выпуска кода отдельную CMS-публикацию не запускать.
   Если Coolify уже показывает `finished` и `running:healthy`, а `/active.rendererId` ещё отличается от `/renderer.rendererId`, зафиксировать состояние CODE отдельно. Сверить доступные байты в `/publication`, exact SHA Compose и UUID последнего завершённого deployment, наличие активной сборки и квитанции. Перед штатным повтором CODE исключить незавершённую CMS-активацию. Порог 8 ГиБ действует и для повтора. Счётчики и идентификаторы достаточно сохранять без содержимого каталога и значений токенов.
   Автоматическая проверка пишет в журнал web-сервиса событие `publication.code.reconciliation`, когда меняется состояние ошибки или её категория. `INSUFFICIENT_BUILD_SPACE` указывает на порог диска, `RECONCILIATION_FAILED` — на другую ошибку. `READY` означает, что после ошибки обслуживаемый renderer достиг целевого идентификатора. Одинаковые повторы не дублируют запись. Итоговую готовность подтверждают точная квитанция и readback снимка.
5. Проверить HTTPS, главную страницу, изменённые маршруты, админку и `/api/v1/health/ready`. В защищённом контуре ожидаются `200` с Basic Auth и `401` без него. Сохранить длительность стадий, оба SHA, digest каждого образа и deployment UUID, результат сверки томов и снимка. Для диагностики зависания сопоставлять начало импорта Compose, начало и завершение GHCR pull, замену контейнеров и готовность web. Сетевая передача слоёв происходит по отсутствующим digest, поэтому доля pull зависит от содержимого кэша Docker. История исследования в [#553](https://github.com/Celtoman/astro-telekom/issues/553).

## Откат

- При ошибке или зависании сперва установить состояние своего deployment и выяснить, началась ли замена контейнеров. Убедиться, что deployment завершён либо безопасно отменён до замены. Если прежние контейнеры продолжают работать, вернуть прежние координаты Git через MCP и проверить, что прежний стек здоров.
- Если контейнеры заменены, вернуть сохранённый репозиторий, ветку и точный SHA прежнего работавшего Compose, проверить доступ к старым digest и запустить deployment того же ресурса. Для первого перехода был проверен резервный вариант со старым Compose и локальными образами, которые можно запустить без registry. Использовать его только при сохранённом комплекте и после сверки исходного UUID, image IDs, сетей и всех томов. Сценарий в обе стороны проверен на временном приложении. [Протокол репетиции](https://github.com/Celtoman/astro-telekom/issues/553#issuecomment-6970953470).
- При несовместимой миграции руководствоваться планом восстановления этой миграции и проверенным backup. Переустановка образов сама по себе не меняет версию схемы. Тома не удалять. После отката повторить проверку health, образов, четырёх томов, активного снимка и внешнего HTTP.

## Первый рабочий выпуск

18 ноября 2026 года `astro-telekom` переведён на GHCR с сохранением SHA кода `bf230692f719ae60700b8da6364beb90f4bda5b8`. Coolify deployment `omyqucqbttqhrqfpyt1sheh0` занял 3 минуты 8 секунд. При замене контейнеров наблюдался временный `503`. После операции шесть постоянных сервисов стали healthy, все четыре прежних тома и HTML-артефакт публикации `cmwksjwbj000801p5xf2gqcx5` ревизии 34 сохранились, внешний HTTP прошёл проверку. Откат на рабочем приложении не понадобился. [CI кода](https://github.com/Celtoman/astro-telekom/actions/runs/44149309068), [сборка образов](https://github.com/Celtoman/astro-telekom/actions/runs/44251611357), [закреплённый Compose](https://github.com/Celtoman/astro-telekom-release/tree/e6f1fb64a5b0714425c53f63f43745fbae56d76f).
