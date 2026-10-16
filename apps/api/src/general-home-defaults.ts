import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GENERAL_HOME_BLOCK_TYPES, type GeneralHomeBlock, type GeneralHomeDataByType } from './general-home-model';
import { validateGeneralHomeBlock } from './general-home';

const initial = JSON.parse(readFileSync(join(__dirname, 'assets/general-home-v1.json'), 'utf8')) as GeneralHomeDataByType;
if (Object.keys(initial).length !== GENERAL_HOME_BLOCK_TYPES.length || Object.keys(initial).some(key => !(GENERAL_HOME_BLOCK_TYPES as readonly string[]).includes(key))) {
  throw new Error('Initial HOME content must contain exactly the nine approved block types.');
}
for (const type of GENERAL_HOME_BLOCK_TYPES) validateGeneralHomeBlock(type, initial[type], true);

/** Initial owner-approved content only. FAQ intentionally needs real content before publication. */
export function generalHomeDefaultBlocks(): GeneralHomeBlock[] {
  return GENERAL_HOME_BLOCK_TYPES.map(blockType => ({ blockType, data: structuredClone(initial[blockType]) })) as GeneralHomeBlock[];
}
