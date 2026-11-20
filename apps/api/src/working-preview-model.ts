import { NotFoundException } from '@nestjs/common';
import type { EditorialSource } from './editorial-publication-model';
import { newsPage, relatedNews, type NewsRoute } from './news-projection';
import { newsMediaUseKey, type MediaUse, type NewsBodyNode } from './news-types';
import { isLegacyPublicRoute, type LegacyPublicRoute, type PublicRoute } from './public-route-policy';

export function prepareWorkingPreviewCatalog(catalog: Record<string, any>) {
  const { site, routes, cities, globalPages, generalHome, homeHero, homeHeroVersion, supportMedia, editorial } = catalog;
  return { site, routes, cities, globalPages, generalHome, homeHero, homeHeroVersion, supportMedia, editorial };
}

function newsForRoute(editorial: EditorialSource, route: NewsRoute): EditorialSource {
  const article = route.kind === 'NEWS_ARTICLE' ? editorial.articles.find(item => item.slug === route.newsSlug) : undefined;
  const cards = article ? [article, ...relatedNews(editorial.articles, article)] : newsPage(editorial, route.page, route.categorySlug)?.articles ?? [];
  const cardIds = new Set(cards.map(item => item.id));
  const mediaKeys = new Set<string>();
  const addMedia = (use: MediaUse | undefined | null, kind: 'cover' | 'body') => {
    if (use) mediaKeys.add(newsMediaUseKey(use, kind));
  };
  const bodyImages = (node: NewsBodyNode) => {
    if (node.type === 'image') addMedia(node.attrs as MediaUse, 'body');
    node.content?.forEach(bodyImages);
  };
  for (const card of cards) addMedia(card.cover, 'cover');
  if (article?.body) bodyImages(article.body);
  return {
    version: editorial.version, settings: editorial.settings, categories: editorial.categories, notFound: null,
    newsEnabled: editorial.newsEnabled,
    articles: editorial.articles.map(item => {
      if (item === article) return item;
      const { id, slug, categoryId, title, publishedDate, summary, cover } = item;
      return { id, slug, categoryId, publishedDate, ...(cardIds.has(id) ? { title, summary, cover } : {}) };
    }),
    media: Object.fromEntries(Object.entries(editorial.media ?? {}).filter(([key]) => mediaKeys.has(key))),
  };
}

const pageTypeForCityRoute: Partial<Record<LegacyPublicRoute['kind'], string>> = {
  CITY_HOME: 'HOME',
  CITY_ADDRESS_CHECK: 'ADDRESS_CHECK',
  CITY_SUPPORT: 'CITY_SUPPORT',
};

function cityForRoute(city: Record<string, any>, route: LegacyPublicRoute) {
  const { id, slug, name, status, nameGenitive, namePrepositional, nameIn, region, pages, tariffs } = city;
  const profile = { id, slug, name, status, nameGenitive, namePrepositional, nameIn, region };
  if (route.citySlug !== slug) return profile;
  if (route.kind === 'CITY_TARIFF_DETAIL') {
    const related = new Set(tariffs.filter((tariff: { slug: string; status?: string }) =>
      (!tariff.status || tariff.status === 'PUBLISHED') && tariff.slug !== route.tariffSlug).slice(0, 3).map((tariff: { slug: string }) => tariff.slug));
    return { ...profile, tariffs: tariffs.filter((tariff: { slug: string }) => tariff.slug === route.tariffSlug || related.has(tariff.slug)) };
  }
  return {
    ...profile, pages: pages.filter((page: { type: string }) => page.type === pageTypeForCityRoute[route.kind]),
    tariffs: route.kind === 'CITY_SUPPORT' ? [] : tariffs,
  };
}

/** Keep renderer dependencies of one URL, plus the navigation flags shared by the sandbox. */
export function workingPreviewPage(catalog: Record<string, any>, path: string) {
  const routes: PublicRoute[] = catalog.routes;
  const route = routes.find(item => item.path === path);
  if (!route) throw new NotFoundException('Маршрут отсутствует в рабочем Release 1 inventory');
  const address = routes.find(item => item.kind === 'CITY_ADDRESS_CHECK');
  const shellRoutes = routes.filter(item => item === route || item === address || item.kind === 'GLOBAL_PAGE' || item.path === '/news');
  const legacy = isLegacyPublicRoute(route);
  const needsDirectory = route.kind === 'HOME' || route.kind === 'CITY_HOME' || route.pageType === 'CITIES' || route.pageType === 'COVERAGE';
  const cities = catalog.cities.filter((city: Record<string, any>) => needsDirectory || city.slug === route.citySlug || city.name?.trim() === 'Москва')
    .map((city: Record<string, any>) => legacy
      ? cityForRoute(city, route)
      : { id: city.id, slug: city.slug, name: city.name, status: city.status, region: city.region });
  return {
    site: catalog.site, routes: shellRoutes, cities,
    globalPages: catalog.globalPages.filter((page: Record<string, any>) => page.type === route.pageType),
    ...(route.kind === 'HOME' ? { generalHome: catalog.generalHome, homeHero: catalog.homeHero, homeHeroVersion: catalog.homeHeroVersion } : {}),
    ...(route.kind === 'CITY_SUPPORT' && catalog.supportMedia ? { supportMedia: catalog.supportMedia } : {}),
    ...(!legacy && catalog.editorial ? { editorial: newsForRoute(catalog.editorial, route) } : {}),
  };
}
