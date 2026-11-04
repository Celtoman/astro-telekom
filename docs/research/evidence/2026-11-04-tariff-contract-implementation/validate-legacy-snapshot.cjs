const fs = require('node:fs');
const { tariffView } = require('../../../../apps/api/dist/tariff-view.js');
const { quoteTariffConfiguration: quote } = require('../../../../apps/api/dist/tariff-configuration.service.js');
const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const result = { checked: 0, availableTvbox: 0, unconfirmedFreeOffers: 0, errors: [] };
for (const tariff of input.published) {
  try {
    const view = tariffView(tariff), q = quote(tariff);
    result.checked++;
    result.availableTvbox += Number(view.equipment.some(e => e.code === 'tvbox'));
    result.unconfirmedFreeOffers += Number(q.choices.equipment.some(e => e.code === 'tvbox'
      && e.options.some(o => o.code === 'BUYOUT' && o.oneTimeAmount === 0)));
  } catch (e) {
    result.errors.push({ id: tariff.id, error: e.message });
  }
}
fs.writeFileSync(process.argv[3], JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
if (result.errors.length || result.unconfirmedFreeOffers) process.exitCode = 1;
