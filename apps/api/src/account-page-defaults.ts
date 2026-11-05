import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AccountPageContent } from './account-page-model';
import { validateAccountPage } from './account-page';

export function accountPageDefaults(): AccountPageContent {
  const content = JSON.parse(readFileSync(join(__dirname, 'assets/account-page-v1.json'), 'utf8')) as AccountPageContent;
  validateAccountPage(content);
  return content;
}
