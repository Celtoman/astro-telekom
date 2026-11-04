const fs = require('node:fs');
const { quoteTariffConfiguration: quote, configurationSnapshot, quoteFingerprint } = require('../../../../apps/api/dist/tariff-configuration.service.js');
const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const withheld = JSON.parse(fs.readFileSync(__dirname+'/../2026-11-04-tariff-contract-implementation/withheld-unverified.json', 'utf8'));
const cases = new Map(), cities = new Set(), groups = new Set();
function add(t, selection = {}, negative = false) {
  const path = '/'+t.citySlug+'/'+t.slug;
  const item = { path, endpoint: '/api/v1/public/sites/domru-site/cities/'+t.citySlug+'/tariffs/'+t.slug+'/quote', selection };
  if (negative) Object.assign(item, { expectedStatus: 400, expectedError: 'нельзя выбрать' });
  else {
    const q = quote(t, selection);
    item.expected = { ...q, fingerprint: quoteFingerprint(configurationSnapshot(q)) };
  }
  cases.set(path+'|'+JSON.stringify(selection), item);
}
const withheldIds = new Set((Array.isArray(withheld) ? withheld : withheld.rows).map(t => t.id));
for (const t of input.published) {
  const q = quote(t), a = t.attributes || {};
  if (!cities.has(t.citySlug)) { add(t); cities.add(t.citySlug); }
  const group = JSON.stringify([t.serviceType, q.choices.equipment.map(e => [e.code, e.options.map(o => o.code)]), q.choices.services.map(s => s.code), a.srv_ont_status, a.ont_buyout_price == null ? 'unknown' : a.ont_buyout_price === 0 ? 'zero' : 'paid', t.promoPrice != null, t.connectionFee == null ? 'unknown' : Number(t.connectionFee) === 0 ? 'free' : 'paid']);
  if (!groups.has(group)) {
    groups.add(group); add(t);
    for (const e of q.choices.equipment) for (const o of e.options) add(t, { [e.code]: o.code });
    if (q.choices.services.length) add(t, { services: q.choices.services.map(s => s.code) });
    add(t, { ...Object.fromEntries(q.choices.equipment.map(e => [e.code, e.options.at(-1).code])), services: q.choices.services.map(s => s.code) });
    if (!q.choices.equipment.some(e => e.code === 'tvbox')) add(t, { tvbox: 'BUYOUT' }, true);
  }
  if (a.tvbox_available && a.tvbox_buyout_price > 0 && a.tvbox_installment_price == null) add(t, { tvbox: 'BUYOUT' });
  if (a.srv_ont_status === 'INCLUDED' || a.srv_ont_status === -1) add(t);
  if (withheldIds.has(t.id)) add(t, { tvbox: 'BUYOUT' }, true);
}
fs.writeFileSync(process.argv[3], JSON.stringify([...cases.values()], null, 2)+'\n');
console.log(JSON.stringify({ cases: cases.size, cities: cities.size, shapes: groups.size, negative: [...cases.values()].filter(c => c.expectedStatus === 400).length }));
