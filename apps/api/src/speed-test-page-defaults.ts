import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SpeedTestPageContent } from './speed-test-page-model';
import { validateSpeedTestPage } from './speed-test-page';

export function speedTestPageDefaults(): SpeedTestPageContent {
  const content = JSON.parse(readFileSync(join(__dirname, 'assets/speed-test-page-v1.json'), 'utf8')) as SpeedTestPageContent;
  validateSpeedTestPage(content);
  return content;
}
