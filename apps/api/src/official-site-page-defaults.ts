import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { OfficialSitePageContent } from './official-site-page-model';
import { validateOfficialSitePage } from './official-site-page';

export function officialSitePageDefaults(): OfficialSitePageContent {
  const content = JSON.parse(readFileSync(join(__dirname, 'assets/official-site-page-v1.json'), 'utf8')) as OfficialSitePageContent;
  validateOfficialSitePage(content);
  return content;
}
