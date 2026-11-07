import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createAdminCsp } from '../scripts/browser-security-policy.mjs';

test('admin CSP authorizes the stylesheet actually injected by installed React Aria usePress', () => {
  const adminRequire = createRequire(new URL('../apps/admin/package.json', import.meta.url));
  const ariaRequire = createRequire(adminRequire.resolve('react-aria-components'));
  const source = readFileSync(join(dirname(ariaRequire.resolve('react-aria')), '../private/interactions/usePress.mjs'), 'utf8');
  const attribute = source.match(/const\s+(\S*PRESSABLE_ATTRIBUTE)\s*=\s*['"]([^'"]+)['"]/);
  const template = source.match(/style\.textContent\s*=\s*`([\s\S]*?)`\.trim\(\)/);
  assert.ok(attribute && template, 'Review the installed usePress CSP contract after dependency changes');
  const substitutions = [...template[1].matchAll(/\$\{([^}]+)\}/g)];
  assert.equal(substitutions.length, 1);
  assert.equal(substitutions[0][1], attribute[1]);
  const text = template[1].replace(substitutions[0][0], attribute[2]).trim().replace(/\r\n?/g, '\n');
  const hash = `sha256-${createHash('sha256').update(text).digest('base64')}`;
  const policy = createAdminCsp({ adminUrl: 'https://admin.example.test' });
  assert.ok(policy.styleDirective.hashes?.includes(hash), 'Runtime usePress CSS must be allowed by its exact bytes');
});
