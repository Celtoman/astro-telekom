import { projectCityHomeBlocks } from './tariff-collection-model';
import { BadRequestException, Injectable } from '@nestjs/common';
import { validateCityHomeBlocks } from './block-validation';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface CityReadinessInput {
  name?: string | null;
  slug?: string | null;
  nameGenitive?: string | null;
  namePrepositional?: string | null;
  regionId?: string | null;
  officeState?: 'HAS_OFFICE' | 'NO_OFFICE' | null;
  officeAddress?: string | null;
  officeHours?: string | null;
  subscriberProfileKey?: string | null;
  publishedTariffCount: number;
  homeTemplateReady: boolean;
}

export interface CityReadiness {
  ready: boolean;
  blockers: string[];
  warnings: string[];
}

const present = (value: unknown) => typeof value === 'string' && Boolean(value.trim());

export function evaluateCityReadiness(city: CityReadinessInput): CityReadiness {
  const blockers: string[] = [];
  if (!present(city.regionId)) blockers.push('Не выбран регион');
  if (!present(city.name)) blockers.push('Не заполнено название города');
  if (!present(city.nameGenitive)) blockers.push('Не заполнена форма названия в родительном падеже');
  if (!present(city.namePrepositional)) blockers.push('Не заполнена форма названия в предложном падеже');
  if (!present(city.slug) || !SLUG_PATTERN.test(city.slug || '')) blockers.push('Slug города имеет неверный формат');
  if (city.officeState !== 'HAS_OFFICE' && city.officeState !== 'NO_OFFICE') blockers.push('Не указано наличие офиса');
  if (city.officeState === 'HAS_OFFICE' && !present(city.officeAddress)) blockers.push('Не заполнен адрес офиса');
  if (city.officeState === 'HAS_OFFICE' && !present(city.officeHours)) blockers.push('Не заполнен режим работы офиса');
  if (city.officeState === 'NO_OFFICE' && (present(city.officeAddress) || present(city.officeHours))) blockers.push('Для состояния «офиса нет» адрес и режим работы должны быть пустыми');
  if (!city.homeTemplateReady) blockers.push('Городская HOME не собирается по утвержденному шаблону');
  if (city.publishedTariffCount < 1) blockers.push('Нет опубликованных тарифов');
  return {
    ready: blockers.length === 0,
    blockers,
    warnings: present(city.subscriberProfileKey) ? [] : ['Не выбран профиль проверки абонента'],
  };
}

export function cityHomeTemplateReady(cityName: string, pages: Array<{ type: string; slug: string; status: string; blocks?: unknown[]; template?: { status: string; blocks: unknown[] } | null }>): boolean {
  const homes = pages.filter((page) => page.type === 'HOME' && page.status === 'PUBLISHED' && page.slug === '');
  if (homes.length !== 1) return false;
  try {
    if (homes[0].template?.status && homes[0].template.status !== 'PUBLISHED') return false;
    const blocks = homes[0].template?.blocks || projectCityHomeBlocks((homes[0].blocks || []) as any[]);
    validateCityHomeBlocks(blocks, cityName);
    return true;
  } catch {
    return false;
  }
}

@Injectable()
export class CityReadinessService {
  assertPublishable(readiness: CityReadiness, confirmMissingSubscriberProfile: boolean): void {
    if (!readiness.ready) throw new BadRequestException(`Город не готов к публикации: ${readiness.blockers.join('; ')}`);
    if (readiness.warnings.length && !confirmMissingSubscriberProfile) {
      throw new BadRequestException('Профиль проверки абонента не выбран. Подтвердите публикацию без профиля отдельно');
    }
  }
}
