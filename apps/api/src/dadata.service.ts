import { Injectable, Logger } from '@nestjs/common';
import { DadataSuggestion } from './coverage.service';
import { readDadataSuggestion } from './coverage.service';

@Injectable()
export class DadataService {
  private readonly logger = new Logger(DadataService.name);

  async suggest(query: string): Promise<DadataSuggestion[]> {
    const endpoint = process.env.DADATA_SUGGEST_API_URL?.trim();
    const token = process.env.DADATA_TOKEN?.trim();
    if (!endpoint || !token) return [];
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
        headers: { authorization: `Token ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), count: 10 }),
      });
      if (!response.ok) throw new Error(`DaData suggest responded ${response.status}`);
      const raw = await response.text();
      let parsed: unknown;
      try { parsed = raw ? JSON.parse(raw) : null; } catch { throw new Error('DaData suggest returned invalid JSON'); }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('DaData suggest returned invalid response');
      const suggestions = (parsed as Record<string, unknown>).suggestions;
      if (!Array.isArray(suggestions)) throw new Error('DaData suggest response has no suggestions array');
      return suggestions.map(readDadataSuggestion).filter((item): item is DadataSuggestion => Boolean(item)).slice(0, 10);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`DaData suggest failed: ${reason}`);
      return [];
    }
  }

  async clean(suggestion: DadataSuggestion): Promise<DadataSuggestion | null> {
    const endpoint = process.env.DADATA_CLEAN_API_URL?.trim();
    const token = process.env.DADATA_TOKEN?.trim();
    const secret = process.env.DADATA_SECRET?.trim();
    if (!endpoint || !token || !secret) return null;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
        headers: { authorization: `Token ${token}`, 'x-secret': secret, 'content-type': 'application/json' },
        body: JSON.stringify([suggestion.value]),
      });
      if (!response.ok) throw new Error(`DaData clean responded ${response.status}`);
      const raw = await response.text();
      let parsed: unknown;
      try { parsed = raw ? JSON.parse(raw) : null; } catch { throw new Error('DaData clean returned invalid JSON'); }
      if (!Array.isArray(parsed) || parsed.length !== 1 || !parsed[0] || typeof parsed[0] !== 'object' || Array.isArray(parsed[0])) {
        throw new Error('DaData clean returned invalid response');
      }
      const cleaned = parsed[0] as Record<string, unknown>;
      const source = typeof cleaned.source === 'string' ? cleaned.source.trim() : '';
      if (!source) throw new Error('DaData clean response has no source');
      return { value: source, unrestricted_value: source, data: cleaned };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`DaData clean failed: ${reason}`);
      return null;
    }
  }
}
