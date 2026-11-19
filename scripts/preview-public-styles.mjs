import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const sources = [
  ['support','components/general-home/HomeBlockStyles.astro'],
  ['support','components/general-home/HomeFaq.astro'],
  ['support','components/general-home/AddressOnly.astro'],
  ['support','components/general-home/HomeAddressFormStyles.astro'],
  ['support','components/support/SupportPageStyles.astro'],
  ['officialsite', 'components/general-home/HomeFaq.astro'],
  ['officialsite', 'components/general-home/HomeBlockStyles.astro'],
  ['officialsite', 'components/general-home/AddressOnly.astro'],
  ['officialsite', 'components/general-home/HomeAddressFormStyles.astro'],
  ['news', 'components/news/NewsStyles.astro'],
  ['account', 'components/account/AccountPageStyles.astro'],
  ['account', 'components/general-home/AddressOnly.astro'],
  ['account', 'components/general-home/HomeAddressFormStyles.astro'],
  ['generalhome', 'components/general-home/HomeAddressFormStyles.astro'],
  ['addresspage', 'components/address-page/AddressPageStyles.astro'],
  ['base', 'layouts/BaseLayout.astro'],
  ['header', 'components/SiteHeader.astro'],
  ['hero', 'components/HomeHero.astro'],
  ['generalhero', 'components/GeneralHomeHero.astro'],
  ['generalhome', 'components/general-home/HomeBlockStyles.astro'],
  ['generalhome', 'components/general-home/HomeProviderAbout.astro'],
  ['generalhome', 'components/general-home/HomeBenefits.astro'],
  ['generalhome', 'components/general-home/HomeMorePossibilities.astro'],
  ['generalhome', 'components/general-home/HomeMovix.astro'],
  ['generalhome', 'components/general-home/HomeConnectionSteps.astro'],
  ['generalhome', 'components/general-home/HomeFaq.astro'],
  ['generalhome', 'components/general-home/HomeCityDirectory.astro'],
  ['generalhome', 'components/general-home/HomeConnectionHelp.astro'],
  ['generalhome', 'components/general-home/HomeAddressEntry.astro'],
  ['homeshell', 'components/general-home/HomeShellStyles.astro'],
  ['generalcomposition', 'components/general-home/GeneralHomeComposition.astro'],
  ['citycomposition', 'components/city-home/CityHomeComposition.astro'],
  ['faq', 'components/faq/FaqStyles.astro'],
  ['cityhome', 'components/city-home/CityHomeStyles.astro'],
  ['address', 'components/AddressForm.astro'],
  ['blocks', 'components/BlockRenderer.astro'],
  ['collection', 'components/TariffCollectionStyles.astro'],
  ['tariff', 'components/TariffDetail.astro'],
  ['global', 'components/GlobalPage.astro'],
  ['legal', 'components/LegalDocument.astro'],
  ['cities', 'components/CitiesDirectory.astro'],
  // The page-specific overrides follow the shared blocks, as in the web build.
  ['global', 'components/official-site/OfficialSiteStyles.astro'],
  ['speedtest', 'components/general-home/HomeBlockStyles.astro'],
  ['speedtest', 'components/general-home/HomeFaq.astro'],
  ['speedtest', 'components/general-home/AddressOnly.astro'],
  ['speedtest', 'components/general-home/HomeAddressFormStyles.astro'],
  ['global', 'components/speed-test/SpeedTestStyles.astro'],
].map(([name, path]) => [name, fileURLToPath(new URL(`../apps/web/src/${path}`, import.meta.url))]);
const assetPaths = ['home-hero.png', 'domru-logo.png', 'map-pin.svg', 'chevron-down.svg', 'search.svg', 'headphones.svg', 'phone.svg', 'menu.svg', 'tag.svg', 'wifi.svg', 'tv.svg', 'tag-blue.svg', 'wifi-blue.svg', 'hero-speed.svg', 'hero-speed-blue.svg', 'tv-blue.svg', 'hero-television.svg', 'hero-television-blue.svg', 'shield-check.svg', 'check.svg']
  .map(name => `/images/figma/${name}`).concat(['/images/figma/hero1d-desktop-imglocationicon.svg', ...['desktop', 'tablet', 'mobile'].flatMap(device => [0, 1, 2].map(index => `/images/figma/hero1d-${device}-imgicon${index || ''}.svg`))]);
assetPaths.push(...readdirSync(new URL('../apps/web/public/images/account/v1/', import.meta.url)).filter(name => /^[a-z0-9-]+\.(?:png|svg|webp|jpe?g)$/.test(name)).map(name => `/images/account/v1/${name}`));
// Repository-owned static assets only; CMS never supplies imports or executable paths.
assetPaths.push(...readdirSync(new URL('../apps/web/public/images/general-home/', import.meta.url)).filter(name => /^[a-z0-9-]+\.(?:png|svg)$/.test(name)).map(name => `/images/general-home/${name}`));
assetPaths.push(...readdirSync(new URL('../apps/web/public/images/city-home/', import.meta.url)).filter(name => /^[a-z0-9-]+\.svg$/.test(name)).map(name => `/images/city-home/${name}`));
assetPaths.push(...['available', 'alternatives', 'none', 'retry'].map(name => `/images/address-page/${name}.svg`));
assetPaths.push(...readdirSync(new URL('../apps/web/public/images/news/', import.meta.url)).filter(name => /^[a-z0-9-]+\.svg$/.test(name)).map(name => `/images/news/${name}`));
assetPaths.push(...readdirSync(new URL('../apps/web/public/images/official-site/v1/', import.meta.url)).filter(name => /^[a-z0-9-]+\.png$/.test(name)).map(name => `/images/official-site/v1/${name}`));
assetPaths.push(...readdirSync(new URL('../apps/web/public/images/support/v1/',import.meta.url)).filter(name=>/^[a-z0-9-]+\.(png|jpg|svg)$/.test(name)).map(name=>`/images/support/v1/${name}`));
assetPaths.push('/images/figma/faq-question-plus.svg');
assetPaths.push('/images/legal/caret-down.svg', '/images/legal/caret-up.svg');
assetPaths.push('/images/cities-directory/search.svg', '/images/cities-directory/clear.svg');
assetPaths.push(...readdirSync(new URL('../apps/web/public/images/speed-test/v1/', import.meta.url)).filter(name => /^[a-z0-9-]+\.svg$/.test(name)).map(name => `/images/speed-test/v1/${name}`));

// Only trusted repository CSS is embedded. Catalog data never reaches this loader.
// Native CSS nesting isolates Astro's local selectors from other preview components.
export function readPreviewPublicStyles() {
  const fontRoot = new URL('../apps/admin/node_modules/@fontsource-variable/geist/', import.meta.url);
  const fonts = readFileSync(new URL('wght.css', fontRoot), 'utf8').replace(/font-display: swap;/g, 'font-display: optional;').replace(/url\(\.\/([^)]*)\)/g, (_, path) => `url(data:font/woff2;base64,${readFileSync(new URL(path, fontRoot)).toString('base64')})`);
  return (fonts + sources.map(([name, path]) => {
    const styles = [...readFileSync(path, 'utf8').matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/g)];
    if (!styles.length) throw new Error(`No public styles in ${path}`);
    const css = styles.map((match) => match[1].replace(/:global\(([^)]+)\)/g, '$1')).join('\n');
    return name === 'base' || name === 'global' ? css : `.preview-${name} { ${css} }`;
  }).join('\n')).replace(/\r\n?/g, '\n');
}

export function previewPublicStylesPlugin() {
  const id = 'virtual:preview-public-styles';
  const resolved = `\0${id}`;
  return {
    name: 'preview-public-styles',
    resolveId(source) { if (source === id) return resolved; },
    load(source) {
      if (source !== resolved) return;
      for (const [, path] of sources) this.addWatchFile(path);
      const imports = assetPaths.map((path, index) => {
        const file = fileURLToPath(new URL(`../apps/web/public${path}`, import.meta.url));
        this.addWatchFile(file);
        return `import asset${index} from ${JSON.stringify(`${file}?url`)};`;
      }).join('\n');
      return `${imports}\nexport const assets = {${assetPaths.map((path, index) => `${JSON.stringify(path)}: asset${index}`).join(',')}};\nexport default ${JSON.stringify(readPreviewPublicStyles())};`;
    },
    handleHotUpdate(context) {
      if (!sources.some(([, path]) => path === context.file)) return;
      const module = context.server.moduleGraph.getModuleById(resolved);
      if (module) { context.server.moduleGraph.invalidateModule(module); return [module]; }
    },
  };
}
