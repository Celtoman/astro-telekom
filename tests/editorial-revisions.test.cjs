const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EditorialStoreService } = require('../apps/api/dist/editorial-store.service.js');
const { editorialDigest } = require('../apps/api/dist/editorial-revisions.js');
const { newsDraft } = require('../apps/api/dist/news-types.js');

const scope = { siteId: 'site', kind: 'ARTICLE', entityId: 'article' };
const { siteId, kind, entityId } = scope;
const draft = newsDraft();

function revision(number, { checkpoint = false, published = false, ...overrides } = {}) {
  return {
    ...scope,
    id: `${overrides.siteId ?? siteId}-${overrides.kind ?? kind}-${overrides.entityId ?? entityId}-${number}`,
    revision: number,
    snapshot: { ...draft, title: `Редакция ${number}` },
    createdAt: new Date(),
    publishedAt: published ? new Date() : null,
    checkpoint,
    ...overrides,
  };
}

function publicationItem(revision, status, overrides = {}) {
  return { ...scope, revision, status, ...overrides };
}

function storeFixture(history, publicationItems = []) {
  let rows = [...history];
  const matchesScope = (row, where) =>
    row.siteId === where.siteId && row.kind === where.kind && row.entityId === where.entityId;
  const latest = rows.filter(row => matchesScope(row, scope)).at(-1);
  let article = { id: entityId, siteId, revision: latest.revision, content: latest.snapshot, updatedAt: new Date() };
  const deletions = [];
  const protectedCandidates = [];
  let metadataChecks = 0;

  function matchesDeletion(row, where) {
    assert.equal(where.publishedAt, null);
    assert.ok(Array.isArray(where.revision.notIn));
    return matchesScope(row, where) && row.publishedAt === null && !where.revision.notIn.includes(row.revision);
  }

  const reads = {
    site: { findUnique: async () => ({ id: siteId }) },
    newsArticle: { findFirst: async () => article },
  };
  const tx = {
    ...reads,
    newsArticle: {
      ...reads.newsArticle,
      update: async ({ where, data }) => {
        assert.deepEqual(where, { id: entityId, revision: article.revision });
        article = { ...article, ...data };
        return article;
      },
    },
    editorialRevision: {
      findFirst: async ({ where, select, orderBy }) => {
        if (where.checkpoint === true) {
          assert.deepEqual(select, { createdAt: true });
          assert.deepEqual(where, { ...scope, checkpoint: true });
          assert.deepEqual(orderBy, { revision: 'desc' });
          const last = rows.filter(row => matchesScope(row, where) && row.checkpoint).at(-1);
          return last ? { createdAt: last.createdAt } : null;
        }
        assert.deepEqual(select, { id: true });
        assert.equal(orderBy, undefined);
        metadataChecks++;
        protectedCandidates.push(where.revision.notIn);
        const candidate = rows.find(row => matchesDeletion(row, where));
        return candidate ? { id: candidate.id } : null;
      },
      findMany: async ({ where, select, orderBy, take }) => {
        assert.deepEqual(where, { ...scope, publishedAt: null, checkpoint: true });
        assert.deepEqual(select, { revision: true });
        assert.deepEqual(orderBy, { revision: 'desc' });
        assert.equal(take, 20);
        return rows.filter(row => matchesScope(row, where) && row.publishedAt === null && row.checkpoint)
          .sort((a, b) => b.revision - a.revision)
          .slice(0, take)
          .map(row => ({ revision: row.revision }));
      },
      create: async ({ data }) => {
        const next = revision(data.revision, data);
        rows.push(next);
        return next;
      },
      updateMany: async ({ where, data }) => {
        assert.deepEqual(where, { ...scope, revision: article.revision, checkpoint: false });
        assert.deepEqual(data, { checkpoint: true });
        rows = rows.map(row => matchesScope(row, where) && row.revision === where.revision ? { ...row, ...data } : row);
      },
      deleteMany: async ({ where }) => {
        deletions.push(rows.filter(row => matchesDeletion(row, where)).map(row => row.revision));
        rows = rows.filter(row => !matchesDeletion(row, where));
      },
    },
    editorialPublicationItem: {
      findMany: async ({ where, select }) => {
        assert.deepEqual(where, { kind, entityId, publication: { siteId, status: { in: ['PENDING', 'RUNNING'] } } });
        assert.deepEqual(select, { revision: true });
        return publicationItems.filter(item => matchesScope(item, scope) && where.publication.status.in.includes(item.status))
          .map(item => ({ revision: item.revision }));
      },
    },
  };
  const store = new EditorialStoreService({
    ...reads,
    editorialRevision: {
      findUnique: async ({ where }) => {
        const key = where.siteId_kind_entityId_revision;
        return rows.find(row => matchesScope(row, key) && row.revision === key.revision);
      },
    },
    newsCategory: { findMany: async () => [] },
    $transaction: async (operation, options) => {
      assert.deepEqual(options, { isolationLevel: 'Serializable' });
      return operation(tx);
    },
  });
  return {
    store,
    deletions,
    protectedCandidates,
    get metadataChecks() { return metadataChecks; },
    rowsFor: (where = scope) => rows.filter(row => matchesScope(row, where)),
  };
}

test('autosave keeps the published, working, latest twenty unpublished checkpoints and active publication revisions', async () => {
  const otherSite = { ...scope, siteId: 'another-site' };
  const otherKind = { ...scope, kind: 'CATEGORY' };
  const otherEntity = { ...scope, entityId: 'another-article' };
  const history = Array.from({ length: 32 }, (_, index) => {
    const number = index + 1;
    return revision(number, { checkpoint: number >= 2 && number <= 30, published: [1, 29, 31].includes(number) });
  });
  const fixture = storeFixture([
    ...history,
    revision(2, otherSite), revision(2, otherKind), revision(2, otherEntity),
  ], [
    publicationItem(2, 'PENDING'), publicationItem(3, 'RUNNING'),
    publicationItem(4, 'FAILED'), publicationItem(5, 'SUCCEEDED'),
    publicationItem(6, 'PENDING', otherSite), publicationItem(7, 'RUNNING', otherKind),
    publicationItem(8, 'PENDING', otherEntity), publicationItem(30, 'PENDING'),
  ]);

  const saved = await fixture.store.save(siteId, kind, entityId, 32, { ...draft, title: 'Автосохранение' });
  assert.equal(saved.revision, 33);
  assert.deepEqual(fixture.rowsFor().map(row => row.revision), [1, 2, 3, ...Array.from({ length: 22 }, (_, i) => i + 10), 33]);
  assert.deepEqual(fixture.deletions, [[4, 5, 6, 7, 8, 9, 32]]);
  assert.equal(fixture.protectedCandidates[0].filter(number => number === 30).length, 1);
  for (const scope of [otherSite, otherKind, otherEntity]) assert.deepEqual(fixture.rowsFor(scope).map(row => row.revision), [2]);

  const restored = await fixture.store.restore(siteId, kind, entityId, 1, 33, 'editor');
  assert.equal(restored.revision, 34);
  assert.deepEqual(restored.content, history[0].snapshot);
  assert.deepEqual(fixture.deletions, [[4, 5, 6, 7, 8, 9, 32], [10, 33]]);
  assert.equal(fixture.rowsFor().at(-1).checkpoint, true);
  assert.equal(fixture.rowsFor().at(-1).actorId, 'editor');
  assert.deepEqual((await fixture.store.revision(siteId, kind, entityId, 1)).content, history[0].snapshot);
});

test('autosave and a no-op checkpoint skip DELETE when every revision is protected', async () => {
  const fixture = storeFixture([revision(1, { checkpoint: true })]);
  const content = { ...draft, title: 'Новая редакция' };

  const saved = await fixture.store.save(siteId, kind, entityId, 1, content);
  assert.equal(saved.revision, 2);
  assert.equal(fixture.rowsFor().at(-1).checkpoint, false);
  assert.equal(fixture.metadataChecks, 1);
  assert.deepEqual(fixture.deletions, []);

  const checkpoint = await fixture.store.save(siteId, kind, entityId, 2, content, undefined, true);
  assert.equal(checkpoint.revision, 2);
  assert.deepEqual(fixture.rowsFor().map(row => [row.revision, row.checkpoint]), [[1, true], [2, true]]);
  assert.equal(fixture.metadataChecks, 2);
  assert.deepEqual(fixture.deletions, []);
});

test('revision digest is independent of object insertion order but changes with authored content', () => {
  assert.equal(editorialDigest({ title: 'A', seo: { title: 'B', description: 'C' } }), editorialDigest({ seo: { description: 'C', title: 'B' }, title: 'A' }));
  assert.notEqual(editorialDigest({ title: 'A' }), editorialDigest({ title: 'B' }));
});
