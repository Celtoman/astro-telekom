import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateSupportPage } from './support-page';
import type { SupportPageContent } from './support-page-model';

export function supportPageDefaults(): SupportPageContent {
  const content = JSON.parse(readFileSync(join(__dirname, 'assets/support-page-v1.json'), 'utf8')) as SupportPageContent;
  validateSupportPage(content);
  return content;
}
