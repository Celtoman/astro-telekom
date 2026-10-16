import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeConnectionHelp } from '../apps/web/src/lib/general-home-help.mjs';

class Node extends EventTarget {
  dataset = {}; hidden = false; disabled = false; value = ''; checked = false; textContent = ''; nodes = new Map();
  querySelector(selector) { return this.nodes.get(selector) ?? null; }
  querySelectorAll(selector) { return this.nodes.get(selector) || []; }
  setAttribute(name, value) { this[name] = value; }
  focus() { document.activeElement = this; }
}
test('embedded consultation preserves consent and phone through failure, blocks double submit and retries one submission', async t => {
  const previous = Object.fromEntries(['document', 'location', 'fetch'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => { for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  const document = new Node(), form = new Node(), phone = new Node(), consent = new Node(), submit = new Node(), label = new Node(), error = new Node(), phoneError = new Node(), success = new Node(), wrapper = new Node();
  document.referrer = ''; document.nodes.set('[data-home-callback-form]', [form]);
  form.dataset = { apiUrl: 'https://fixture.invalid/api/v1', siteSlug: 'fixture', consentVersion: 'lead-form-v1-2026-09-22' };
  form.elements = { phone, consent, website: new Node() }; form.parentElement = wrapper;
  form.nodes.set('[type=submit]', submit); submit.nodes.set('span', label); label.textContent = 'Заказать звонок';
  form.nodes.set('[data-home-callback-error]', error); form.nodes.set('[data-home-phone-error]', phoneError); wrapper.nodes.set('[data-home-callback-success]', success);
  success.hidden = error.hidden = phoneError.hidden = true;
  const requests = []; let finishFirst;
  Object.assign(globalThis, { document, location: { href: 'https://fixture.invalid/' }, fetch: async (_url, options) => {
    requests.push(JSON.parse(options.body));
    if (requests.length === 1) return new Promise(resolve => { finishFirst = () => resolve({ ok: false, json: async () => ({ message: 'Временная ошибка' }) }); });
    return { ok: true, json: async () => ({ id: 'fixture-receipt' }) };
  } });
  const settle = () => new Promise(resolve => setImmediate(resolve));
  initializeConnectionHelp(document); assert.equal(submit.disabled, true); assert.equal(consent.checked, false);
  phone.value = '+7 (800) 123-45-67'; phone.dispatchEvent(new Event('input')); assert.equal(submit.disabled, true); assert.equal(phoneError.hidden, false);
  phone.value = '+7 (999) 123-45-67'; phone.dispatchEvent(new Event('input')); consent.checked = true; consent.dispatchEvent(new Event('change')); assert.equal(submit.disabled, false);
  form.dispatchEvent(new Event('submit', { cancelable: true })); form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.equal(requests.length, 1); assert.equal(phone.disabled, true); assert.equal(success.hidden, true);
  finishFirst(); await settle(); assert.equal(error.hidden, false); assert.equal(document.activeElement, error); assert.equal(phone.value, '+7 (999) 123-45-67'); assert.equal(consent.checked, true); assert.equal(phone.disabled, false);
  form.dispatchEvent(new Event('submit', { cancelable: true })); await settle();
  assert.equal(requests.length, 2); assert.equal(requests[0].submissionKey, requests[1].submissionKey); assert.equal(requests[0].phone, '79991234567');
  for (const payload of requests) { assert.equal(payload.reasonCode, 'callback_consultation'); assert.equal(payload.formName, 'home-connection-help'); assert.equal(payload.consentAccepted, true); assert.equal(payload.citySlug, undefined); assert.equal(payload.addressCheckId, undefined); assert.equal(payload.comment, undefined); }
  assert.equal(form.hidden, true); assert.equal(success.hidden, false); assert.equal(document.activeElement, success);
});
