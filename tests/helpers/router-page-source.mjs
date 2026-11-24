import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { SiteCatalogService } = require('../../apps/api/dist/site-catalog.service.js');
const { speedTestSource } = require('./speed-test-source.cjs');
const content = require('../../apps/api/src/assets/router-page-v1.json');

export function siteRouterCatalog(includeRouter = true) {
  const source = speedTestSource();
  if (includeRouter) {
    const type = 'EQUIPMENT_ROUTER';
    source.globalPages.push({
      id: 'page-router', siteId: source.site.id, type, cityId: null, slug: 'wifi-router',
      title: 'Wi-Fi-роутеры Дом.ру', status: 'PUBLISHED', blocks: [], content: structuredClone(content),
    });
    source.seoTemplates.push({
      id: 'seo-router', kind: type, titleTemplate: 'Wi-Fi-роутеры Дом.ру',
      descriptionTemplate: 'Сравните роутеры Wave, Wave Plus и Mesh-систему по характеристикам и стоимости.',
      indexState: 'INDEX',
    });
  }
  return new SiteCatalogService({}).renderSource(source);
}
