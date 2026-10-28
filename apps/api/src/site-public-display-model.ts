/** Pure settings contract shared by API, static renderer and sandbox preview. */
export const SITE_PUBLIC_DISPLAY_VERSION = '1.0.0';
export const HOME_BENEFIT_SPEED_FACT = 'До 1 Гбит/с';
export interface SitePublicDisplay {
  version: typeof SITE_PUBLIC_DISPLAY_VERSION;
  connectionHours: string;
  supportHours: string;
  onlineApplicationsHours: string;
  callbackWithinMinutes: number;
  technologyFact: string;
  wifiFact: string;
  movixFact: string;
  applicationFact: string;
  footerLegalText: string;
  footerCtaText: string;
}
export const SITE_PUBLIC_DISPLAY_LIMITS = Object.freeze({ connectionHours: 120, supportHours: 120, onlineApplicationsHours: 120,
  technologyFact: 200, wifiFact: 200, movixFact: 200, applicationFact: 200, footerLegalText: 5000, footerCtaText: 80 });
export function sitePublicDisplayDefaults(): SitePublicDisplay {
  return {
    version: SITE_PUBLIC_DISPLAY_VERSION,
    connectionHours: 'Ежедневно с 8:00 до 22:00', supportHours: 'Круглосуточно', onlineApplicationsHours: 'Круглосуточно', callbackWithinMinutes: 15,
    technologyFact: 'FTTB и GPON', wifiFact: 'До 50–100 устройств', movixFact: '100 000+ фильмов и сериалов', applicationFact: 'Заявка онлайн',
    footerLegalText: '© 2020–2026 tarify-dom.ru — сайт ИП Кочергина Александра Андреевича (ИНН 165038398334, ОГРНИП 323169000159136) и не относится к официальным ресурсам Дом.ру. Официальный сайт: dom.ru.',
    footerCtaText: 'Оставить заявку',
  };
}
export class SiteDisplayError extends Error {
  readonly field: string;
  readonly reason: string;
  constructor(field: string, reason: string, message: string) { super(message); this.name = 'SiteDisplayError'; this.field = field; this.reason = reason; }
}
export function assertSitePublicDisplay(raw: unknown): asserts raw is SitePublicDisplay {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) {
    throw new SiteDisplayError('publicDisplay', 'TYPE', 'Нужен объект общих настроек сайта.');
  }
  const value = raw as Record<string, unknown>;
  const unknown = Object.keys(value).find(key => !['version', 'callbackWithinMinutes', ...Object.keys(SITE_PUBLIC_DISPLAY_LIMITS)].includes(key));
  if (unknown) throw new SiteDisplayError(unknown, 'UNKNOWN_FIELD', 'Неизвестное или системное поле общих настроек.');
  if (value.version !== SITE_PUBLIC_DISPLAY_VERSION) throw new SiteDisplayError('version', 'VERSION', 'Неизвестная версия общих настроек сайта.');
  for (const [field, limit] of Object.entries(SITE_PUBLIC_DISPLAY_LIMITS)) {
    const text = value[field];
    if (typeof text !== 'string') throw new SiteDisplayError(field, 'TYPE', 'Поле отсутствует или имеет неверный формат. Нужен текст.');
    if (text.length > limit) throw new SiteDisplayError(field, 'TOO_LONG', `Введено ${text.length} символов; допустимо не более ${limit}. Сократите текст.`);
    if (/[<>\u0000-\u0008{}\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw new SiteDisplayError(field, 'UNSAFE_TEXT', 'В общих значениях используйте обычный текст без подстановок и служебных символов.');
    if (!text.trim()) throw new SiteDisplayError(field, 'REQUIRED', 'Заполните общее значение сайта.');
    if (['connectionHours', 'supportHours', 'onlineApplicationsHours'].includes(field) && /[\r\n]|https?:\/\/|www\./i.test(text)) {
      throw new SiteDisplayError(field, 'UNSAFE_TEXT', 'Укажите график одной строкой без ссылок.');
    }
  }
  if (!Number.isSafeInteger(value.callbackWithinMinutes) || Number(value.callbackWithinMinutes) < 1 || Number(value.callbackWithinMinutes) > 1440) {
    throw new SiteDisplayError('callbackWithinMinutes', 'RANGE', 'Укажите целое число минут от 1 до 1440.');
  }
}
