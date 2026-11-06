# T3: медиа и ограниченный текстовый редактор

Статус: LOCAL IMPLEMENTATION / CHECKED, задача[#534](https://github.com/Celtoman/astro-telekom/issues/534). Полный gate: 985 pass, 0 fail, 1 skip. Внешний выпуск и проверка интерфейса в составе готового редактора ещё не выполнены.

## Что реализовано

Cookie-protected API `/api/v1/admin/sites/:siteId/news/media`: POST загружает один JPEG/PNG/WebP до10МБ; GET`/:id` возвращает безопасные метаданные, GET`/:id/file` — приватный WebP с`private,no-store` и`nosniff`; POST`/:id/crop` готовит неизменяемые производные contextual crop. Имена загружаемых файлов не используются как пути. Неверная сигнатура/MIME, анимация, повреждённые данные и более24млн пикселей отклоняются. Сайт проверяется до записи, чтение проверяет принадлежность asset.

Оригинал и варианты адресуются SHA-256. Размеры body/cover/social готовятся без увеличения исходника,16:9и40:21 соответственно. Смена crop добавляет вариант, прежние файлы остаются. API не предоставляет удаление: публикации и история не теряют изображения. Доступ к черновым файлам требует сессии; публичное копирование выбранных производных в immutable artifact относится кT4/T7.

В Coolify Compose добавлен постоянный`editorial_media`: API пишет, builder читает read-only. Он должен входить в резервное копирование вместе с БД; наличие volume не является доказательством внешней резервной копии/восстановления. Production требует явный`EDITORIAL_MEDIA_ROOT`; локальный fallback`.local-media` исключён изGit/Docker context.

Подготовлены reusable`EditorialMediaField` и`NewsRichTextEditor` на текущих Field/Input/Button и ReactAria. Подходящего rich-text/media блока в существующем приложении нет; Tiptap — механизм ввода, оформление берётся из действующей admin system. Есть выбор/DropZone/retry/cancel, contextual alt/caption, настройка кадра с клавиатуры. В редакторе доступныH2/H3,bold/italic, списки, цитата, ссылки, изображения,undo/redo. Произвольные шрифты/цвета/HTML отсутствуют. Эти компоненты пока не подключены к пользовательскому news workspace; визуальная/сквозная приёмка остаётсяT5/T10.

Один чистый serializer`news-document.ts` предназначен для публичной страницы и preview: экранирует текст/атрибуты, разрешает HTTPS/внутренние ссылки, разрешает изображения через явный resolver. Сервер отдельно проверяет дерево и обязательный alt для информативных изображений при выпуске. Черновик без alt допустим с указанным недостающим полем.

## Зависимости и проверка

- sharp0.35.5; Fastify multipart10.1.7; Tiptap3.32.3 (MIT). Все manifests и lockfile обновляются вместе, без minimumReleaseAge exclusion. Предварительная попытка10.1.8 была отменена: релиз слишком свежий. Исправление10.1.8 касается temp filenames; этот код не использует saveRequestFiles/tmp filename API ([upstream](https://github.com/fastify/fastify-multipart/releases/tag/v10.1.8)).
- Установка проходит стандартную supply-chain policy; audit high/critical0, остаются ранее зарегистрированные15low/moderate в[#515](https://github.com/Celtoman/astro-telekom/issues/515). Это не полностью чистый audit.
- Профильные проверки охватывают полное декодирование, MIME/signature/pixel/byte limits, safe paths, реальную геометрию, immutable crop, cross-site read, dedup, испорченный файл, HTTP cookie guard/multipart limit/private headers, safe serializer и grammar/alt readiness.
- API build и admin check выполнены; профильный прогон 15/15. Полный gate на отдельной неизменяемой копии: 985 pass, 0 fail, 1 skip; все 26 staged файлов сверены с проверенной копией. Сначала runtime image build превысил 600-секундный budget при передаче 868 МБ контекста/установке/экспорте образа; изолированный повтор 2/2 и последующий полный gate прошли без изменения исходников. Статические/HTTP тесты не заменяют визуальный и клавиатурный проход готового редактора.

Первичные источники: [sharp0.35.5](https://github.com/lovell/sharp/tree/v0.35.5/docs), [Fastify multipart](https://github.com/fastify/fastify-multipart), [Tiptap React](https://tiptap.dev/docs/editor/getting-started/install/react), [ReactAria DropZone](https://react-aria.adobe.com/DropZone), [FileTrigger](https://react-aria.adobe.com/FileTrigger).
