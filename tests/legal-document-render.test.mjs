import test from 'node:test';
import assert from 'node:assert/strict';
import { renderLegalDocument } from '../apps/web/src/lib/legal-document-render.ts';
import { legalSections } from '../apps/web/src/data/legal-pages.ts';

test('legal contents and headings share stable anchors, including duplicate and untitled CMS sections', () => {
  const sections = [
    { title: '1. Общие положения', paragraphs: ['Первый абзац.\nВторая строка.'] },
    { title: '', paragraphs: ['Дополнение без заголовка.'] },
    { title: '1. Общие положения', paragraphs: ['Другой раздел с тем же названием.'] },
  ];
  const result = renderLegalDocument({ title: 'Документ', sections });
  assert.equal((result.match(/<h1\b/g) || []).length, 1);
  assert.equal((result.match(/<h2>/g) || []).length, 2);
  assert.equal((result.match(/href="#legal-section-1"/g) || []).length, 2);
  assert.equal((result.match(/href="#legal-section-3"/g) || []).length, 2);
  assert.doesNotMatch(result, /href="#legal-section-2"/);
  assert.match(result, /2 раздела/);
  for (const section of sections) for (const paragraph of section.paragraphs) assert.ok(result.includes(`<p>${paragraph}</p>`));
  assert.match(result, /<details class="legal-toc-mobile"><summary>/);
  assert.match(result, /href="#legal-document-title">К началу документа/);
});

test('all versioned legal documents retain their complete source paragraphs and unbounded section counts', () => {
  const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  for (const type of ['PRIVACY', 'PERSONAL_DATA_CONSENT', 'COOKIE_POLICY']) {
    const sections = legalSections(type, 'partner.example.test');
    const result = renderLegalDocument({ title: type, sections });
    for (const section of sections) {
      assert.ok(result.includes(`<h2>${escape(section.title)}</h2>`));
      for (const paragraph of section.paragraphs) assert.ok(result.includes(`<p>${escape(paragraph)}</p>`));
    }
  }
  const sections = Array.from({ length: 13 }, (_, index) => ({ title: `Раздел ${index + 1}`, paragraphs: [`Текст ${index + 1}`] }));
  assert.match(renderLegalDocument({ title: 'Дополненный документ', sections }), /id="legal-section-13"/);
});

test('legal CMS preview escapes content and assets, preserves native details and disables navigation', () => {
  const result = renderLegalDocument({ title: '<script>alert(1)</script>', introduction: 'Вводный & текст', sections: [{ title: '<img src=x>', paragraphs: ['<button onclick="alert(1)">Текст</button>'] }], interactive: false, asset: path => '/preview' + path });
  assert.doesNotMatch(result, /<script|<button|\shref=|<[^>]+\sonclick=/);
  assert.match(result, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(result, /Вводный &amp; текст/);
  assert.match(result, /<a aria-disabled="true">/);
  assert.match(result, /src="\/preview\/images\/legal\/caret-down.svg" width="24" height="24"/);
  assert.match(result, /<details class="legal-toc-mobile">/);
  const empty = renderLegalDocument({ title: 'Короткий документ', introduction: 'Полный текст.', sections: [] });
  assert.doesNotMatch(empty, /<details|<nav/);
  assert.match(empty, /<p class="legal-document-introduction">Полный текст\.<\/p>/);
});
