import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { readPreviewWorkspace } from '../apps/admin/src/lib/preview-bootstrap.ts';
import { buildPreviewDocument } from '../apps/admin/src/lib/preview-document.mjs';
import { createPreviewBootstrapFixture, fixtureCookie, fixturePath, fixtureUser } from '../scripts/fixtures/preview-bootstrap-http.mjs';

const root = '/api/v1/admin/sites';
const bootstrap = root + '/preview-bootstrap';
const page = ({ siteId, selected, workingRevision, basePublicationId }) => {
  const query = new URLSearchParams({ path: selected.path, workingRevision });
  if (basePublicationId) query.set('basePublicationId', basePublicationId);
  return root + '/' + siteId + '/preview-page?' + query;
};

test('Preview authenticates before options and reads the selected page with the same stamp', async t => {
  const fixture = await createPreviewBootstrapFixture();
  t.after(fixture.close);
  const { request, trace } = fixture;
  const reply = await request(bootstrap + '?siteId=missing&preferred=%2Fpolitika');
  assert.equal(reply.statusCode, 200);
  assert.equal(reply.headers['cache-control'], 'private, no-store');
  const initial = reply.json();
  assert.deepEqual([initial.user, initial.selectedSiteId, initial.options.siteId], [fixtureUser, 'site-a', 'site-a']);
  assert.deepEqual(trace, ['auth', 'sites', 'options:site-a']);

  const selected = await request(page(initial.options));
  assert.equal(selected.statusCode, 200);
  const { siteId, path, workingRevision, basePublicationId, catalog } = selected.json();
  assert.deepEqual([siteId, path, workingRevision, basePublicationId], ['site-a', fixturePath, 8, 'pub-7']);
  assert.equal(catalog.globalPages[0].content.text, 'Рабочий текст стенда');
  assert.deepEqual(trace, ['auth', 'sites', 'options:site-a', 'auth', 'checked-site', 'capture:site-a', 'render']);

  const options = await request(root + '/site-a/preview-options?preferred=%2Fpolitika');
  assert.deepEqual(initial.options, options.json());
});

test('Preview rejects absent, expired and machine-only sessions before accessing sites', async t => {
  const fixture = await createPreviewBootstrapFixture();
  t.after(fixture.close);
  const previous = process.env.ADMIN_API_TOKEN;
  process.env.ADMIN_API_TOKEN = 'fixture-machine-token';
  t.after(() => {
    if (previous === undefined) delete process.env.ADMIN_API_TOKEN;
    else process.env.ADMIN_API_TOKEN = previous;
  });
  const { request, state, trace } = fixture;
  assert.equal((await request(bootstrap, {})).statusCode, 401);
  assert.equal((await request(bootstrap, { 'x-admin-token': 'fixture-machine-token' })).statusCode, 401);
  assert.deepEqual(trace, []);
  const initial = (await request(bootstrap)).json();
  trace.length = 0;
  state.authorized = false;
  assert.equal((await request(bootstrap, { cookie: fixtureCookie })).statusCode, 401);
  assert.equal((await request(page(initial.options), { cookie: fixtureCookie })).statusCode, 401);
  assert.deepEqual(trace, ['auth', 'auth']);
});

test('Expiry during publication-state invalidates the fixture session for the login check', async t => {
  const fixture = await createPreviewBootstrapFixture();
  t.after(fixture.close);
  const { request, state } = fixture;
  assert.equal((await request(bootstrap)).statusCode, 200);
  state.expireOnPublication = true;
  assert.equal((await request(root + '/site-a/publication-state')).statusCode, 401);
  assert.equal((await request('/api/v1/auth/me')).statusCode, 401);
  assert.equal((await request(bootstrap)).statusCode, 401);
});

test('New Preview opens with the previous API after rollback and only falls back for 404', async t => {
  const fixture = await createPreviewBootstrapFixture();
  t.after(fixture.close);
  fixture.state.sites.push(fixture.otherSite);
  const calls = [];
  const fetchFromFixture = async input => {
    const url = new URL(input);
    calls.push(url.pathname);
    const path = url.pathname === bootstrap ? '/api/v1/no-bootstrap' : url.pathname;
    const reply = await fixture.request(path + url.search);
    return new Response(reply.payload, { status: reply.statusCode });
  };
  const signal = new AbortController().signal;
  const apiUrl = 'http://preview.example.invalid/api/v1';
  const workspace = await readPreviewWorkspace(apiUrl, 'site-b', fixturePath, signal, fetchFromFixture);
  assert.deepEqual(calls, [bootstrap, '/api/v1/auth/me', root]);
  assert.deepEqual([workspace.user, workspace.selectedSiteId, workspace.options], [fixtureUser, 'site-b', null]);

  const options = (await fixture.request(root + '/site-b/preview-options?preferred=%2Fpolitika')).json();
  const selected = await fixture.request(page(options));
  assert.equal(selected.statusCode, 200);
  assert.equal(selected.json().path, fixturePath);

  const noSelection = await readPreviewWorkspace(apiUrl, null, null, signal, fetchFromFixture);
  assert.equal(noSelection.selectedSiteId, null);
  for (const status of [401, 503]) {
    await assert.rejects(readPreviewWorkspace(apiUrl, 'site-b', null, signal, async input => {
      assert.equal(new URL(input).pathname, bootstrap);
      return new Response(null, { status });
    }), { status });
  }
});

test('Preview does not render after a working revision or active base changes', async t => {
  const fixture = await createPreviewBootstrapFixture();
  t.after(fixture.close);
  const { request, state, trace } = fixture;
  const initial = (await request(bootstrap)).json();
  trace.length = 0;
  state.workingRevision = 9;
  assert.equal((await request(page(initial.options))).statusCode, 409);
  assert.deepEqual(trace, ['auth', 'checked-site']);
  trace.length = 0;
  state.workingRevision = 8;
  state.basePublicationId = 'pub-next';
  assert.equal((await request(page(initial.options))).statusCode, 409);
  assert.deepEqual(trace, ['auth', 'checked-site', 'capture:site-a']);
  state.basePublicationId = null;
  const withoutBase = (await request(bootstrap)).json();
  assert.equal(withoutBase.options.basePublicationId, null);
  assert.equal((await request(page(withoutBase.options))).statusCode, 200);
});

test('Preview preserves the site picker, explicit selection, and an options error fallback', async t => {
  const fixture = await createPreviewBootstrapFixture();
  t.after(fixture.close);
  const { request, state, otherSite, trace } = fixture;
  state.sites.push(otherSite);
  const noSelection = (await request(bootstrap + '?siteId=missing')).json();
  assert.equal(noSelection.selectedSiteId, null);
  assert.equal(noSelection.options, null);
  assert.deepEqual(trace, ['auth', 'sites']);
  const selected = (await request(bootstrap + '?siteId=site-b')).json();
  assert.equal(selected.selectedSiteId, 'site-b');
  assert.equal(selected.options.siteId, 'site-b');
  state.failOptions = true;
  const fallback = (await request(bootstrap + '?siteId=site-b')).json();
  assert.equal(fallback.selectedSiteId, 'site-b');
  assert.equal(fallback.sites.length, 2);
  assert.equal(fallback.options, null);
  assert.equal((await request(root + '/site-b/preview-options')).statusCode, 503);
});

test('Preview selection and checked page finish while publication state is held', async t => {
  const fixture = await createPreviewBootstrapFixture({ wireMs: 15 });
  t.after(fixture.close);
  const { request, state, trace } = fixture;
  const started = Promise.withResolvers();
  const release = Promise.withResolvers();
  state.publication = async () => {
    started.resolve();
    await release.promise;
  };
  const publication = request(root + '/site-a/publication-state');
  await started.promise;
  try {
    async function measure(useBootstrap) {
      const began = performance.now();
      const offset = trace.length;
      let options;
      if (useBootstrap) {
        options = (await request(bootstrap)).json().options;
      } else {
        const [session, sites] = await Promise.all([request('/api/v1/auth/me'), request(root + '?summary=true')]);
        assert.deepEqual(session.json().user, fixtureUser);
        options = (await request(root + '/' + sites.json()[0].id + '/preview-options')).json();
      }
      const reply = await request(page(options));
      assert.equal(reply.statusCode, 200);
      const activity = trace.slice(offset);
      assert.equal(activity.filter(phase => phase === 'auth').length, useBootstrap ? 2 : 4);
      assert.equal(activity.filter(phase => phase === 'options:site-a').length, 1);
      assert.ok(activity.indexOf('options:site-a') < activity.indexOf('render'));
      const body = reply.json();
      const document = buildPreviewDocument(body.catalog, body.path);
      assert.match(document, /<title>Политика — предпросмотр<\/title>/);
      assert.match(document, /<main><div class="preview-legal">/);
      return { wallMs: performance.now() - began, body, document };
    }
    const samples = [[], []];
    await Promise.race([
      (async () => {
        for (let index = 0; index < 10; index++) {
          const order = index % 2 ? [1, 0] : [0, 1];
          const observations = [];
          for (const mode of order) {
            observations[mode] = await measure(Boolean(mode));
            samples[mode].push(observations[mode].wallMs);
          }
          assert.deepEqual(observations[0].body, observations[1].body);
          assert.equal(observations[0].document, observations[1].document);
        }
      })(),
      wait(4000, null, { ref: false }).then(() => assert.fail('Preview waited for publication-state')),
    ]);
    assert.equal(trace.filter(phase => phase === 'publication-state').length, 1);
    const quantiles = values => {
      const sorted = [...values].sort((a, b) => a - b);
      return [sorted[4], sorted[9]].map(value => value.toFixed(2)).join('/');
    };
    t.diagnostic(`10 pairs with 15 ms fixture wire delay and publication-state held. p50/p95: ${quantiles(samples[0])} → ${quantiles(samples[1])} ms`);
  } finally {
    release.resolve();
    await publication;
  }
});
