import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const manifest = JSON.parse(readFileSync(resolve(__dirname, '../../../package.json'), 'utf8')) as { version?: unknown };

if (typeof manifest.version !== 'string' || !manifest.version.trim()) {
  throw new Error('Root package version is missing');
}

export const APP_VERSION = manifest.version;
