import { assertSitePublicDisplay, sitePublicDisplayDefaults, type SitePublicDisplay } from '../../../api/src/site-public-display-model.ts';

/** Accusative follows «за»; genitive follows «в течение». */
export function callbackMinutesLabel(value = sitePublicDisplayDefaults().callbackWithinMinutes, grammaticalCase: 'accusative' | 'genitive' = 'accusative'): string {
  const remainder = value % 100;
  const singular = !(remainder >= 11 && remainder <= 14) && value % 10 === 1;
  const word = grammaticalCase === 'genitive' ? singular ? 'минуты' : 'минут'
    : remainder >= 11 && remainder <= 14 ? 'минут' : singular ? 'минуту' : value % 10 >= 2 && value % 10 <= 4 ? 'минуты' : 'минут';
  return `${value} ${word}`;
}

/** CODE releases can rebuild an immutable catalog created before centralized settings. */
export function publicDisplayForCatalog(site: { publicDisplay?: unknown }, home?: { blocks: Array<{ blockType: string; data: any }> } | null): SitePublicDisplay {
  if (Object.hasOwn(site, 'publicDisplay')) {
    assertSitePublicDisplay(site.publicDisplay);
    return structuredClone(site.publicDisplay);
  }
  const result = sitePublicDisplayDefaults();
  const items = home?.blocks.find(block => block.blockType === 'home.benefits')?.data.items;
  for (const [key, field] of Object.entries({ fiber: 'technologyFact', wifi6: 'wifiFact', movix: 'movixFact', connection: 'applicationFact' }) as Array<[string, 'technologyFact' | 'wifiFact' | 'movixFact' | 'applicationFact']>) {
    const text = items?.[key]?.factText;
    if (typeof text === 'string' && text.trim()) result[field] = text;
  }
  assertSitePublicDisplay(result);
  return result;
}
