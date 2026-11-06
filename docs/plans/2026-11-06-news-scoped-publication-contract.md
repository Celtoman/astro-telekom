# T1: идентичность редакционного выпуска

Статус: IMPLEMENTATION CONTRACT, задача#534. Продуктовое разрешение получено6ноября2026; этот документ уточняет технический способ, не расширяя Q1–Q25.

- `SitePublication.siteRevision` остаётся provenance legacy-source; scoped release не продвигает `Site.publishedRevision`.
- Новое `releaseSequence` — отдельный DB-generated Int sequence для порядка выпусков. Backfill упорядочен по createdAt/id; существующие JSON snapshots и их hashes не меняются.
- `scopeKey=legacy` сохраняет legacy dedup по captured workingRevision. Редакционная операция имеет собственный scopeKey/idempotency key. Уникальный Prisma selector `siteId_siteRevision` расширяется scopeKey; старые default-операции используют `legacy`.
- Новый `basePublicationId` фиксирует фактический serving baseline; captured source и change digest доступны для review. Все fallback latest readers сортируют по releaseSequence; explicit publication reads остаются поID.
- Editorial drafts имеют собственные entity revisions и не повышают legacy workingRevision при каждом autosave. Они не попадают в обычный legacy capture. Ledger выбранных revisions и serving snapshot определяют публичное состояние.
- Успех редакционного выпуска подтверждает только захваченные item revisions. Если рабочая revision уже выросла, она остаётся неопубликованной. Legacy acknowledgment использует прежний siteRevision только для legacy scope.
- Новый legacy release и CODE сохраняют фактически опубликованный editorial source. Операции review/activate сериализуются на сайт; смена baseline требует повторной проверки, а не потери уже выпущенного результата.
- Для category reassignment меняются только categoryId опубликованных редакций; body/cover чужого draft не включаются. При необходимости создаются отдельные canonical revision snapshots для live patch и сохранённого draft.

Барьер до внешнего выпуска: новая schema на PostgreSQL18, старые revision/receipt suites, scopedA при draftB/тарифах, competing releases, edit-during-publish, CODE старого snapshot и uncertain activation recovery должны пройти проверки. Изменение schema без этих доказательств не считается готовой публикацией.
