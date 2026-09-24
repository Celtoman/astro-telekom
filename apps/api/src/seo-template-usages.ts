import type { VariableUsage } from './catalog-variables';
import { listVariableDefinitions } from './variable-registry';

interface AuthoredSeoTemplate {
  id: string;
  kind: string;
  titleTemplate: string;
  descriptionTemplate: string;
  ogTitleTemplate?: string | null;
  ogDescriptionTemplate?: string | null;
}

const knownCodes = new Set<string>(listVariableDefinitions().map((definition) => definition.code));
const fields = ['titleTemplate', 'descriptionTemplate', 'ogTitleTemplate', 'ogDescriptionTemplate'] as const;

export function collectSeoTemplateUsages(templates: AuthoredSeoTemplate[]): VariableUsage[] {
  const usages: VariableUsage[] = [];
  for (const template of templates) {
    for (const field of fields) {
      const text = template[field];
      if (typeof text !== 'string') continue;
      const seenCodes = new Set<string>();
      for (const match of text.matchAll(/\{([A-Z][A-Z0-9_]*)\}/g)) {
        if (!knownCodes.has(match[1]) || seenCodes.has(match[1])) continue;
        seenCodes.add(match[1]);
        usages.push({
          code: match[1], path: `seoTemplates[${template.kind}].${field}`, template: text,
          entityType: 'SEO_TEMPLATE', entityId: template.id, pageType: template.kind,
          editorHref: `/seo/templates?kind=${encodeURIComponent(template.kind)}`,
        });
      }
    }
  }
  return usages;
}
