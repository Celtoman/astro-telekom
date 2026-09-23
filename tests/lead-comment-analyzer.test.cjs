const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const { analyzeLeadComment, LEAD_COMMENT_RULES_VERSION } = require('../apps/api/dist/lead-comment-analyzer.js');

test('comment analyzer skips absent comments and is deterministic for a fixed version', () => {
  assert.equal(analyzeLeadComment(undefined, 'new_connection'), null);
  assert.equal(analyzeLeadComment('   ', 'new_connection'), null);
  const first = analyzeLeadComment('Нужно подключить интернет, но списали деньги', 'new_connection');
  assert.equal(LEAD_COMMENT_RULES_VERSION, 1);
  assert.deepEqual(first, analyzeLeadComment('Нужно подключить интернет, но списали деньги', 'new_connection'));
  assert.equal(first.outcome, 'MANUAL_REVIEW');
  assert.deepEqual(first.evidence.map(({ category, fragment }) => [category, fragment]), [
    ['new_connection', 'подключить интернет'],
    ['billing', 'списали деньги'],
  ]);
  assert.match(first.explanation, /противореч/i);
});

test('all six approved categories report exact evidence fragments', () => {
  const cases = [
    ['Не работает интернет', 'technical_problem'],
    ['Неверное начисление', 'billing'],
    ['Хочу расторгнуть договор', 'cancellation'],
    ['Пишу жалобу', 'complaint'],
    ['У нас переезд', 'relocation'],
    ['Нужно подключить интернет', 'new_connection'],
  ];
  for (const [comment, category] of cases) {
    const result = analyzeLeadComment(comment, 'other');
    assert.equal(result.category, category);
    assert.equal(result.evidence[0].fragment, comment.slice(result.evidence[0].start, result.evidence[0].end));
  }
});

test('rules honor word boundaries, negations and approved neutral vocabulary', () => {
  for (const comment of ['Нужна цена тарифа и скорость', 'Это не жалоба', 'Не хочу отключить интернет', 'переподключительный вопрос']) {
    assert.deepEqual(analyzeLeadComment(comment, 'new_connection').evidence, []);
  }
  assert.equal(analyzeLeadComment('Не работает интернет', 'new_connection').category, 'technical_problem');
});

test('reason matrix distinguishes matching, conflicting and missing structured reasons', () => {
  assert.equal(analyzeLeadComment('Вопрос по оплате', 'billing').outcome, 'CLEAR');
  assert.equal(analyzeLeadComment('Вопрос по оплате', 'new_connection').outcome, 'MANUAL_REVIEW');
  assert.equal(analyzeLeadComment('Вопрос по оплате', undefined).outcome, 'MANUAL_REVIEW');
  assert.equal(analyzeLeadComment('Хочу подключить интернет', 'billing').outcome, 'MANUAL_REVIEW');
  assert.equal(analyzeLeadComment('Жалоба на качество связи', 'existing_subscriber_support').outcome, 'WARNING');
  assert.equal(analyzeLeadComment('Хочу подключить интернет', 'new_connection').outcome, 'CLEAR');
});

test('comment snapshot migration is additive and keeps old leads nullable', () => {
  const root = join(__dirname, '..');
  const schema = readFileSync(join(root, 'prisma', 'schema.prisma'), 'utf8');
  const migration = readFileSync(join(root, 'prisma', 'migrations', '0044_lead_comment_analysis', 'migration.sql'), 'utf8');
  for (const field of ['comment', 'commentAnalysisVersion', 'commentAnalysisOutcome', 'commentAnalysisCategory', 'commentAnalysisEvidence', 'commentAnalysisExplanation']) {
    assert.match(schema, new RegExp(`${field}\\s+(?:String|Int|Json)\\?`));
    assert.match(migration, new RegExp(`ADD COLUMN "${field}"`));
  }
  assert.doesNotMatch(migration, /\bUPDATE\s+"Lead"\b/i);
});

test('public DTO bounds optional customer comments and rejects non-strings', async () => {
  require('../apps/api/dist/public-leads.controller.js');
  const { CreateLeadDto } = require('../apps/api/dist/public.dto.js');
  const { createGlobalValidationPipe } = require('../apps/api/dist/security-options.js');
  const pipe = createGlobalValidationPipe();
  const metadata = { type: 'body', metatype: CreateLeadDto, data: undefined };
  const body = { citySlug: 'kazan', phone: '+79000000000', submissionKey: '11111111-1111-4111-8111-111111111111', consentVersion: 'lead-form-v1-2026-09-22' };
  assert.equal((await pipe.transform({ ...body, comment: 'Помогите с оплатой' }, metadata)).comment, 'Помогите с оплатой');
  await assert.rejects(pipe.transform({ ...body, comment: 'x'.repeat(2001) }, metadata), (error) => error.getStatus() === 400);
  await assert.rejects(pipe.transform({ ...body, comment: 42 }, metadata), (error) => error.getStatus() === 400);
});
