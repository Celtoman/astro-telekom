import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sendCallbackRequest } from '../apps/web/src/lib/callback-request.mjs';

test('callback adapter sends only a manual consultation and requires an API receipt', async t => {
  const oldFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = oldFetch; });
  const requests = [];
  globalThis.fetch = async (url, options) => { requests.push({ url, options, body: JSON.parse(options.body) }); return { ok: true, json: async () => ({ id: 'receipt' }) }; };
  const payload = { siteSlug: 'site', phone: '79991234567', submissionKey: 'fixed-key', consentVersion: 'lead-form-v1-2026-09-22', consentAccepted: true, formName: 'home-connection-help', website: '', session: {}, timeOnSiteSeconds: 0 };
  assert.deepEqual(await sendCallbackRequest('https://api.example.test/api/v1', payload), { id: 'receipt' });
  assert.equal(requests[0].url, 'https://api.example.test/api/v1/leads');
  assert.equal(requests[0].body.reasonCode, 'callback_consultation');
  assert.equal(requests[0].body.addressCheckId, undefined);
  assert.equal(requests[0].body.citySlug, undefined);
  assert.equal(requests[0].body.submissionKey, 'fixed-key');
  assert.equal(requests[0].options.signal instanceof AbortSignal, true);
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ accepted: true }) });
  await assert.rejects(sendCallbackRequest('https://api.example.test/api/v1', payload), /Не удалось сохранить заявку/);
  globalThis.fetch = async () => ({ ok: false, json: async () => ({ message: ['Временная ошибка'] }) });
  await assert.rejects(sendCallbackRequest('https://api.example.test/api/v1', payload), /Временная ошибка/);
});
