import type { LegalSection } from '../data/legal-pages';
import { homeHtml } from './general-home-render.ts';

interface LegalDocumentOptions {
  title: string;
  introduction?: string;
  sections: LegalSection[];
  interactive?: boolean;
  asset?: (path: string) => string;
}

/** The public page and the script-free CMS preview share one legal composition. */
export function renderLegalDocument(options: LegalDocumentOptions): string {
  const content = options.sections.map((section, index) => ({ ...section, id: `legal-section-${index + 1}` }));
  const toc = content.filter(section => section.title.trim());
  const noun = new Intl.PluralRules('ru').select(toc.length);
  const count = `${toc.length} ${noun === 'one' ? 'раздел' : noun === 'few' ? 'раздела' : 'разделов'}`;
  const anchor = (target: string, label: string, className = '') => `<a${className ? ` class="${className}"` : ''}${options.interactive === false ? ' aria-disabled="true"' : ` href="#${target}"`}>${homeHtml(label)}</a>`;
  const caption = `<span class="legal-toc-caption"><strong>Содержание</strong><span>${count}</span></span>`;
  const links = () => `<ol class="legal-toc-links">${toc.map(section => `<li>${anchor(section.id, section.title)}</li>`).join('')}</ol>`;
  const caret = (direction: string) => `<img class="legal-caret-${direction}" src="${homeHtml((options.asset ?? (path => path))(`/images/legal/caret-${direction}.svg`))}" width="24" height="24" alt="">`;

  return `<article class="legal-document" data-legal-document-block="BLK-0034" aria-labelledby="legal-document-title"><div class="legal-document-container"><h1 id="legal-document-title" tabindex="-1">${homeHtml(options.title)}</h1><div class="legal-document-layout${toc.length ? ' legal-document-with-toc' : ''}">${toc.length ? `<details class="legal-toc-mobile"><summary>${caption}${caret('down')}${caret('up')}</summary><nav aria-label="Содержание документа">${links()}</nav></details>` : ''}<div class="legal-document-copy">${options.introduction ? `<p class="legal-document-introduction">${homeHtml(options.introduction)}</p>` : ''}${content.map(section => `<section id="${section.id}" tabindex="-1">${section.title ? `<h2>${homeHtml(section.title)}</h2>` : ''}<div class="legal-paragraphs">${section.paragraphs.map(paragraph => `<p>${homeHtml(paragraph)}</p>`).join('')}</div></section>`).join('')}${anchor('legal-document-title', 'К началу документа', 'legal-back-top')}</div>${toc.length ? `<nav class="legal-toc-sidebar" aria-label="Содержание документа">${caption}${links()}</nav>` : ''}</div></div></article>`;
}
