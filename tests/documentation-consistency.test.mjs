import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

test('live deployment documents name the current migration head and actual Release 1 routes', () => {
  const migrations = readdirSync(join(root, 'prisma', 'migrations'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{4}_/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const latestMigration = migrations.at(-1);
  const deployment = read('docs/deployment.md');
  const baseline = read('docs/technology-baseline.md');

  for (const document of [deployment, baseline]) {
    assert.match(document, new RegExp(`${migrations.length} [^\\n]*миграц`));
    assert.match(document, new RegExp(latestMigration));
  }
  assert.match(baseline, /N \+ T \+ 6/);
  assert.match(baseline, /\[city\]\/\[slug\][^\n]*тариф/);
});

test('readiness docs preserve owner authority and keep low-priority legal review outside Release 1 gates', () => {
  const agents = read('AGENTS.md');
  const decisions = read('docs/decisions.md');
  const currentState = read('docs/current-state.md');
  const releasePlan = read('docs/release-plan.md');
  const findings = read('docs/product-findings.md');
  const deployment = read('docs/deployment.md');
  const migrationRunbook = read('docs/runbooks/release-one-data-migration.md');

  for (const document of [agents, decisions, currentState, releasePlan, deployment, migrationRunbook]) {
    assert.ok(
      /решение о готовности[^\n]*трафик[^\n]*только владелец/i.test(document)
        || /только владелец[^\n]*(?:решает|определяет)[^\n]*трафик/i.test(document),
      'документ должен явно сохранять решение о трафике за владельцем',
    );
  }
  assert.match(decisions, /#31[^\n]*не является[^\n]*gate/);
  assert.match(releasePlan, /#144[^\n]*P3[^\n]*вне milestone Release 1[^\n]*не является[^\n]*условием/i);
  assert.match(findings, /PF-016[^]*?#144[^\n]*P3[^\n]*не является[^\n]*gate/i);
  assert.doesNotMatch(deployment, /реальн(?:ый|ого) прием (?:лидов|заявок)[^\n]*(?:не включать|запрещен)/i);
  assert.doesNotMatch(migrationRunbook, /до реального трафика[^\n]*(?:восстановить|обязательно|необходимо)/i);
});
