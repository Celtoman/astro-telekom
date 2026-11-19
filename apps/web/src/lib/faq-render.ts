import type { FaqAnswer, FaqPageContent, FaqParagraph } from '../../../api/src/faq-page-model.ts';
import { faqHref } from '../../../api/src/faq-page-model.ts';
import { renderBreadcrumbs } from './breadcrumb-render.ts';
import { homeHtml, type HomeRenderOptions } from './general-home-render.ts';
import { renderCityContacts } from './city-home-render.ts';

const escape = homeHtml;

export function faqGroups(content: FaqPageContent) {
  return content.groups.map(group => ({
    ...group, items: content.items.filter(item => item.groupId === group.id),
  })).filter(group => group.items.length);
}

export function renderFaqAnswer(answer: FaqAnswer, options: { interactive?: boolean; canonical?: URL } = {}): string {
  const paragraph = (p: FaqParagraph) => '<p>' + (p.content ?? []).map(run => {
    let html = escape(run.text);
    if (run.marks?.some(mark => mark.type === 'bold')) html = '<strong>' + html + '</strong>';
    const href = run.marks?.find(mark => mark.type === 'link')?.attrs?.href;
    if (faqHref(href)) {
      if (options.interactive === false) return '<span class="faq-inactive-link">' + html + '</span>';
      const resolved = options.canonical && (href.startsWith('/') || href.startsWith('#')) ? new URL(href, options.canonical).href : href;
      return '<a href="' + escape(resolved) + '">' + html + '</a>';
    }
    return html;
  }).join('') + '</p>';
  return answer.content.map(block => {
    if (block.type === 'paragraph') return paragraph(block);
    const tag = block.type === 'orderedList' ? 'ol' : 'ul';
    return '<' + tag + '>' + block.content.map(item => '<li>' + item.content.map(paragraph).join('') + '</li>').join('') + '</' + tag + '>';
  }).join('');
}

export function renderFaqPage(content: FaqPageContent, site: Parameters<typeof renderCityContacts>[1], options: HomeRenderOptions = {}) {
  const groups = faqGroups(content);
  const asset = options.asset ?? (value => value);
  const icon = (name: string) => `<img width="20" height="20" alt="" src="${escape(asset('/images/general-home/' + name + '.svg'))}">`;
  const breadcrumbs = renderBreadcrumbs([{ title: 'Главная', ...(options.interactive !== false ? { href: '/' } : {}) }, { title: content.h1, mobileHidden: true }]);
  const navigation = groups.map(group => `<li><a href="#group-${escape(group.id)}">${escape(group.title)}</a></li>`).join('');
  const sections = groups.map((group, groupIndex) => `<section class="faq-topic" id="group-${escape(group.id)}" aria-labelledby="title-${escape(group.id)}" tabindex="-1">
    <h2 id="title-${escape(group.id)}">${escape(group.title)}</h2>
    <div class="faq-questions">${group.items.map((item, itemIndex) => `<details id="question-${escape(item.id)}" class="faq-question"${groupIndex === 0 && itemIndex === 0 ? ' open' : ''}>
      <summary><span>${escape(item.question)}</span><span class="faq-indicator" aria-hidden="true"><img class="faq-plus" width="20" height="20" alt="" src="${escape(asset('/images/figma/faq-question-plus.svg'))}"><span class="faq-minus">${icon('faq-minus')}</span></span></summary>
      <div class="faq-answer">${renderFaqAnswer(item.answer, options)}<a href="#question-${escape(item.id)}" class="faq-permalink">Ссылка на вопрос</a></div>
    </details>`).join('')}</div>
  </section>`).join('');
  return `<div class="faq-page" data-faq-page>
    <header class="faq-intro">${breadcrumbs}<h1>${escape(content.h1)}</h1><p>${escape(content.intro)}</p></header>
    <div class="faq-grid"><nav class="faq-index" aria-label="Темы вопросов"><details data-faq-topics open><summary>Темы вопросов <span class="faq-indicator" aria-hidden="true"><img class="faq-plus" width="20" height="20" alt="" src="${escape(asset('/images/figma/faq-question-plus.svg'))}"><span class="faq-minus">${icon('faq-minus')}</span></span></summary><ul>${navigation}</ul></details></nav><div class="faq-topics">${sections}</div></div>
    ${renderCityContacts(content.contacts, site, options)}
  </div>`;
}

export function faqStructuredData(content: FaqPageContent, origin: URL) {
  const canonical = new URL('/faq', origin);
  const breadcrumbs = canonical.href + '#breadcrumbs';
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'FAQPage', '@id': canonical.href, url: canonical.href, name: content.h1,
        description: content.intro, inLanguage: 'ru-RU', breadcrumb: { '@id': breadcrumbs },
        mainEntity: faqGroups(content).flatMap(group => group.items.map(item => ({
          '@type': 'Question', '@id': canonical.href + '#question-' + item.id, name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: renderFaqAnswer(item.answer, { canonical }) },
        }))),
      },
      {
        '@type': 'BreadcrumbList', '@id': breadcrumbs, itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Главная', item: new URL('/', origin).href },
          { '@type': 'ListItem', position: 2, name: content.h1, item: canonical.href },
        ],
      },
    ],
  };
}
