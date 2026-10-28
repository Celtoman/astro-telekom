import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { renderConnectionSteps, renderMovix, renderBenefits, renderConnectionHelp } from '../apps/web/src/lib/general-home-render.ts';
const require = createRequire(import.meta.url);
const { cityHomeDefaultBlocks } = require('../apps/api/dist/city-home-defaults.js');
test('shared city actions use callback, hide the deferred Movix link and omit unknown benefit badge', () => {
  const defaults = cityHomeDefaultBlocks();
  const block = type => defaults.find(b => b.blockType === type).data;
  const steps = renderConnectionSteps(block('city.connection_steps'), { phone: '8 800 333 44 55', phoneHref: 'tel:88003334455' });
  assert.match(steps, /data-callback-trigger/); assert.doesNotMatch(steps, /data-address-dialog-trigger/);
  assert.doesNotMatch(renderMovix(block('city.movix'), { tariffHref: '/kazan#tariffs' }), /home-movix-details|href="\/movix"/);
  const benefits = block('city.benefits');
  assert.doesNotMatch(renderBenefits(benefits), /home-benefit-fact/);
  assert.match(renderConnectionHelp(block('city.help'), { phone: '8 800 333 44 55', phoneHref: 'tel:88003334455', apiUrl: "https://partner.example/api/v1", siteSlug: "site", callbackWithinMinutes: 20 }), /в течение 20 минут/);
});
