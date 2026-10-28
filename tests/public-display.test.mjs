import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { sitePublicDisplayDefaults } from '../apps/api/src/site-public-display-model.ts';
const source = new URL('../apps/web/src/lib/public-display.ts', import.meta.url);
const model = existsSync(source) ? await import(source.href) : {};
const display = (...args) => { assert.equal(typeof model.publicDisplayForCatalog, 'function'); return model.publicDisplayForCatalog(...args); };
test('an explicit public display source is validated and copied rather than merged with template copies', () => {
  const value = { ...sitePublicDisplayDefaults(), wifiFact: 'Общий Wi-Fi', callbackWithinMinutes: 20 };
  const result = display({ publicDisplay: value });
  assert.deepEqual(result, value); assert.notEqual(result, value);
  assert.throws(() => display({ publicDisplay: { ...value, version: '99' } }));
  assert.throws(() => display({ publicDisplay: null }));
});
test('legacy CODE rebuild preserves four published owner facts while applying approved shared defaults', () => {
  const facts = { fiber: 'Своя сеть', wifi6: 'Свой Wi-Fi', movix: 'Своя библиотека', connection: 'Своя заявка' };
  const home = { blocks: [{ blockType: 'home.benefits', data: { items: Object.fromEntries(Object.entries(facts).map(([key, factText]) => [key, { factText }])) } }] };
  const result = display({ connectionHours: 'Ежедневно, 24/7' }, home);
  assert.equal(result.technologyFact, facts.fiber); assert.equal(result.wifiFact, facts.wifi6);
  assert.equal(result.movixFact, facts.movix); assert.equal(result.applicationFact, facts.connection);
  assert.equal(result.connectionHours, 'Ежедневно с 8:00 до 22:00');
  assert.deepEqual(display({}), sitePublicDisplayDefaults());
});

test('editable callback delays use natural Russian after both promise constructions', () => {
  for (const [minutes, afterZa, afterWithin] of [[1,'1 минуту','1 минуты'],[2,'2 минуты','2 минут'],[11,'11 минут','11 минут'],[21,'21 минуту','21 минуты']]) {
    assert.equal(model.callbackMinutesLabel(minutes), afterZa);
    assert.equal(model.callbackMinutesLabel(minutes, 'genitive'), afterWithin);
  }
});
