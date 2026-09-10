import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface DomruAddressLocation {
  city?: unknown;
  settlement?: unknown;
  region?: unknown;
}

export interface ExtractedDomruLocation {
  locality: string;
  region: string;
  source: 'city' | 'settlement' | 'region';
}

export interface DomruContractProfile {
  city: string;
  region: string;
  origin: string;
  providerId: string;
  referer: string;
  fallbackUsed: boolean;
}

interface ParsedProfile extends Omit<DomruContractProfile, 'fallbackUsed'> {
  fallback: string;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeDomruLocality(value: unknown): string {
  return text(value)
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/gu, 'е')
    .replace(/^(?:г|город|п|поселок|посёлок|с|село|рп|д|деревня)\s+/u, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function normalizeDomruRegion(value: unknown): string {
  const typeWords = new Set(['республика', 'респ', 'область', 'обл', 'край', 'автономный', 'автономная', 'округ', 'ао', 'город']);
  return normalizeDomruLocality(value)
    .split(/\s+/u)
    .filter((part) => part && part !== '-' && !typeWords.has(part))
    .join(' ');
}

function isFederalRegion(region: string): boolean {
  const normalized = normalizeDomruLocality(region);
  return normalized.includes('москва') || normalized.includes('санкт-петербург') || normalized === 'спб';
}

export function extractDomruLocation(data: DomruAddressLocation): ExtractedDomruLocation | null {
  const city = text(data.city);
  const settlement = text(data.settlement);
  const region = text(data.region);
  if (city) return { locality: city, region, source: 'city' };
  if (region && isFederalRegion(region)) return { locality: region, region, source: 'region' };
  if (settlement) return { locality: settlement, region, source: 'settlement' };
  if (region) return { locality: region, region, source: 'region' };
  return null;
}

function profileSignature(profile: ParsedProfile): string {
  return `${profile.origin}|${profile.providerId}|${profile.referer}`;
}

function publicProfile(profile: ParsedProfile, fallbackUsed: boolean): DomruContractProfile {
  return {
    city: profile.city,
    region: profile.region,
    origin: profile.origin,
    providerId: profile.providerId,
    referer: profile.referer,
    fallbackUsed,
  };
}

export class DomruProfileCatalog {
  readonly rowCount: number;
  readonly profileCount: number;
  readonly fallbackCount: number;
  private readonly byLocation = new Map<string, ParsedProfile>();
  private readonly byLocality = new Map<string, ParsedProfile[]>();
  private readonly fallbackByRegion = new Map<string, ParsedProfile>();

  constructor(source: string) {
    const lines = source.replace(/^\uFEFF/u, '').split(/\r?\n/u).filter((line) => line.trim());
    if (lines.shift()?.trim().toLowerCase() !== 'city;region;origin;providerid;referer;fallback') {
      throw new Error('Dom.ru profile catalog has an invalid header');
    }
    this.rowCount = lines.length;
    for (const [index, line] of lines.entries()) {
      const columns = line.split(';').map((column) => column.trim());
      if (columns.length !== 6) throw new Error(`Dom.ru profile catalog row ${index + 2} has an invalid column count`);
      const [city, region, origin, providerId, referer, fallback] = columns;
      if (!city || !region || !origin || !providerId || !referer) {
        throw new Error(`Dom.ru profile catalog row ${index + 2} is incomplete`);
      }
      try {
        if (new URL(origin).protocol !== 'https:' || new URL(referer).protocol !== 'https:') throw new Error('HTTPS required');
      } catch {
        throw new Error(`Dom.ru profile catalog row ${index + 2} has an invalid URL`);
      }
      const profile: ParsedProfile = { city, region, origin, providerId, referer, fallback };
      const localityKey = normalizeDomruLocality(city);
      const regionKey = normalizeDomruRegion(region);
      const locationKey = `${regionKey}|${localityKey}`;
      const existing = this.byLocation.get(locationKey);
      if (existing) {
        if (profileSignature(existing) !== profileSignature(profile)) {
          throw new Error(`Dom.ru profile catalog has conflicting duplicate ${city}, ${region}`);
        }
      } else {
        this.byLocation.set(locationKey, profile);
        const localityProfiles = this.byLocality.get(localityKey) || [];
        localityProfiles.push(profile);
        this.byLocality.set(localityKey, localityProfiles);
      }
      if (fallback) {
        const fallbackKey = normalizeDomruRegion(fallback);
        const existingFallback = this.fallbackByRegion.get(fallbackKey);
        if (existingFallback && profileSignature(existingFallback) !== profileSignature(profile)) {
          throw new Error(`Dom.ru profile catalog has conflicting fallback ${fallback}`);
        }
        this.fallbackByRegion.set(fallbackKey, profile);
      }
    }
    this.profileCount = this.byLocation.size;
    this.fallbackCount = this.fallbackByRegion.size;
  }

  resolve(data: DomruAddressLocation): DomruContractProfile | null {
    const location = extractDomruLocation(data);
    if (!location) return null;
    const localityKey = normalizeDomruLocality(location.locality);
    const regionKey = normalizeDomruRegion(location.region);
    if (regionKey) {
      const exact = this.byLocation.get(`${regionKey}|${localityKey}`);
      if (exact) return publicProfile(exact, false);
    }
    const localityProfiles = this.byLocality.get(localityKey) || [];
    const signatures = new Set(localityProfiles.map(profileSignature));
    if ((!regionKey && signatures.size === 1) || (regionKey && localityProfiles.length === 1 && normalizeDomruRegion(localityProfiles[0].region) === regionKey)) {
      return publicProfile(localityProfiles[0], false);
    }
    const fallback = regionKey ? this.fallbackByRegion.get(regionKey) : undefined;
    return fallback ? publicProfile(fallback, true) : null;
  }
}

const catalogPath = join(__dirname, 'assets', 'domru-city-profiles.csv');
export const defaultDomruProfileCatalog = new DomruProfileCatalog(readFileSync(catalogPath, 'utf8'));
