import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ADDRESS_PAGE_BLOCK_ORDER, type AddressPageBlock, type AddressPageDataByType } from './address-page-model';
import { validateAddressPageComposition } from './address-page';

const content = JSON.parse(readFileSync(join(__dirname, 'assets/address-page-v1.json'), 'utf8')) as AddressPageDataByType;
/** Accepted Screens copy is seeded once; every call returns independent editable data. */
export function addressPageDefaultBlocks(): AddressPageBlock[] {
  const blocks = ADDRESS_PAGE_BLOCK_ORDER.map(blockType => ({ blockType, data: structuredClone(content[blockType]) })) as AddressPageBlock[];
  validateAddressPageComposition(blocks); return blocks;
}
